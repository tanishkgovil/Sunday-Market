import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  STARTING_CASH,
  quote,
  balances,
  placeTrade,
  readForecasts,
} from "./market.js";

const snapshot = JSON.parse(
  readFileSync(new URL("./data/market.json", import.meta.url)),
);
const team = {
  symbol: "SEA",
  forecast: {
    wins: 10,
    ties: 0,
    playoffs: 0,
    divisional: 0,
    conference: 0,
    superBowl: 0,
    champion: 0,
  },
};

test("the saved market contains 32 current-season forecasts with valid prices", () => {
  assert.equal(snapshot.teams.length, 32);
  assert.equal(new Set(snapshot.teams.map((t) => t.symbol)).size, 32);
  assert.ok(Number.isFinite(Date.parse(snapshot.updatedAt)));
  for (const t of snapshot.teams)
    assert.ok(Number.isSafeInteger(quote(t).cents) && quote(t).cents > 0);
});

test("payouts add together and a bye earns the Divisional bonus", () => {
  const forecast = { ...team.forecast, wins: 13, playoffs: 1, divisional: 1 };
  assert.equal(quote({ ...team, forecast }).cents, 18_000);
  assert.equal(
    quote({
      ...team,
      forecast: {
        wins: 14,
        ties: 0,
        playoffs: 1,
        divisional: 1,
        conference: 1,
        superBowl: 1,
        champion: 1,
      },
    }).cents,
    39_000,
  );
  assert.equal(
    quote({ ...team, forecast: { ...team.forecast, wins: 8, ties: 1 } }).cents,
    8_500,
  );
});

test("a buy and a partial sale preserve cash, shares, and cost basis after reload", () => {
  const bought = placeTrade([], team, "buy", 3);
  assert.equal(balances(bought).cash, STARTING_CASH - 30_000);
  const higher = { ...team, forecast: { ...team.forecast, wins: 12 } };
  const sold = placeTrade(bought, higher, "sell", 1);
  const saved = balances(JSON.parse(JSON.stringify(sold)));
  assert.equal(saved.cash, 982_000);
  assert.deepEqual(saved.holdings.SEA, { quantity: 2, cost: 20_000 });
  assert.equal(balances(bought).holdings.SEA.quantity, 3);
  assert.equal(
    saved.cash + saved.holdings.SEA.quantity * quote(higher).cents,
    1_006_000,
  );
});

test("invalid or unaffordable orders leave the original portfolio unchanged", () => {
  const trades = placeTrade([], team, "buy", 2);
  const before = JSON.stringify(trades);
  for (const quantity of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => placeTrade(trades, team, "buy", quantity));
  }
  assert.throws(() => placeTrade(trades, team, "buy", 101), /cash/);
  assert.throws(() => placeTrade(trades, team, "sell", 3), /shares/);
  assert.throws(() => placeTrade(trades, team, "other", 1));
  assert.equal(JSON.stringify(trades), before);
});

// Minimal ESPN-shaped input using the same real forecasts as the saved market.
function feed() {
  const fpi = ["numties", "numwins", "numlosses"]; // Deliberately reordered.
  const projections = [
    "probwintitle",
    "projectedl",
    "probmakeconfchamp",
    "probmaketitlegame",
    "probmakeplayoffs",
    "probmakedivplayoffs",
    "projectedw",
  ];
  return {
    currentSeason: { year: snapshot.season },
    requestedSeason: {
      year: snapshot.season,
      type: { week: { number: snapshot.week } },
    },
    lastUpdated: snapshot.updatedAt,
    categories: [
      { name: "fpi", names: fpi },
      { name: "projections", names: projections },
    ],
    teams: snapshot.teams.map((t) => {
      const [wins, losses, ties] = t.record.split("–").map(Number),
        f = t.forecast;
      return {
        team: {
          abbreviation: t.symbol,
          displayName: t.name,
          logos: [{ rel: ["default"], href: t.logo }],
          group: { parent: { abbreviation: t.conference } },
        },
        categories: [
          { name: "fpi", values: [ties, wins, losses] },
          {
            name: "projections",
            values: [
              f.champion * 100,
              17 - f.wins - f.ties,
              f.conference * 100,
              f.superBowl * 100,
              f.playoffs * 100,
              f.divisional * 100,
              f.wins,
            ],
          },
        ],
      };
    }),
  };
}

test("the adapter uses named ESPN columns and preserves its update time", () => {
  const market = readForecasts(feed());
  assert.equal(market.updatedAt, snapshot.updatedAt);
  assert.equal(market.teams.length, 32);
  for (let i = 0; i < 32; i++)
    assert.equal(quote(market.teams[i]).cents, quote(snapshot.teams[i]).cents);
});

test("incomplete, mismatched, or impossible forecasts are rejected", () => {
  const missing = feed();
  missing.teams[0].categories[1].values[0] = null;
  assert.throws(() => readForecasts(missing), /Incomplete/);
  const wrongSeason = feed();
  wrongSeason.currentSeason.year++;
  assert.throws(() => readForecasts(wrongSeason), /season/);
  const bad = feed();
  bad.teams[0].categories[1].values[0] = 110;
  assert.throws(() => readForecasts(bad), /Invalid/);
  const partial = feed();
  partial.teams.pop();
  assert.throws(() => readForecasts(partial), /32/);
});
