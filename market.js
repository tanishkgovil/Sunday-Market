export const FEED =
  "https://site.web.api.espn.com/apis/fitt/v3/sports/football/nfl/powerindex?limit=32";
export const STARTING_CASH = 1_000_000; // All balances and trade prices are integer cents.
export const PAYOUTS = [
  ["Regular-season wins", 10, "wins"],
  ["Regular-season ties", 5, "ties"],
  ["Make playoffs", 30, "playoffs"],
  ["Reach Divisional Round", 20, "divisional"],
  ["Reach Conference Championship", 40, "conference"],
  ["Reach Super Bowl", 60, "superBowl"],
  ["Win Super Bowl", 100, "champion"],
];

export function quote(team) {
  const parts = PAYOUTS.map(([label, payout, key]) => ({
    label,
    cents: Math.round(payout * team.forecast[key] * 100),
  }));
  return { parts, cents: parts.reduce((sum, part) => sum + part.cents, 0) };
}

// Read ESPN's named columns, rather than relying on their column order.
export function readForecasts(feed) {
  const season = feed.requestedSeason?.year;
  if (
    !Number.isInteger(season) ||
    season !== feed.currentSeason?.year ||
    !Number.isFinite(Date.parse(feed.lastUpdated))
  ) {
    throw new Error(
      "The forecast feed is missing its current season or update time.",
    );
  }
  const columns = Object.fromEntries(
    feed.categories.map((category) => [category.name, category.names]),
  );
  const teams = feed.teams.map((entry) => {
    const stats = Object.assign(
      {},
      ...entry.categories.map((category) =>
        Object.fromEntries(
          columns[category.name].map((name, index) => [
            name,
            category.values[index],
          ]),
        ),
      ),
    );
    const required = [
      "numwins",
      "numlosses",
      "numties",
      "projectedw",
      "projectedl",
      "probmakeplayoffs",
      "probmakedivplayoffs",
      "probmakeconfchamp",
      "probmaketitlegame",
      "probwintitle",
    ];
    if (required.some((key) => !Number.isFinite(stats[key])))
      throw new Error(`Incomplete forecast for ${entry.team.abbreviation}.`);
    const forecast = {
      wins: stats.projectedw,
      ties: Math.max(
        stats.numties,
        17 - stats.projectedw - stats.projectedl,
        0,
      ),
      playoffs: stats.probmakeplayoffs / 100,
      divisional: stats.probmakedivplayoffs / 100,
      conference: stats.probmakeconfchamp / 100,
      superBowl: stats.probmaketitlegame / 100,
      champion: stats.probwintitle / 100,
    };
    const probabilities = [
      forecast.playoffs,
      forecast.divisional,
      forecast.conference,
      forecast.superBowl,
      forecast.champion,
    ];
    if (
      probabilities.some(
        (p, i) => p < 0 || p > 1 || (i > 0 && p > probabilities[i - 1]),
      ) ||
      forecast.wins < stats.numwins ||
      stats.projectedl < stats.numlosses ||
      forecast.wins + forecast.ties > 17.01
    )
      throw new Error(`Invalid forecast for ${entry.team.abbreviation}.`);
    return {
      symbol: entry.team.abbreviation,
      name: entry.team.displayName,
      logo: entry.team.logos.find((logo) => logo.rel.includes("default"))?.href,
      conference: entry.team.group.parent.abbreviation,
      record: [stats.numwins, stats.numlosses, stats.numties].join("–"),
      forecast,
    };
  });
  if (
    teams.length !== 32 ||
    new Set(teams.map((team) => team.symbol)).size !== 32
  )
    throw new Error("Expected forecasts for all 32 NFL teams.");
  return {
    season,
    week: feed.requestedSeason.type.week.number,
    updatedAt: feed.lastUpdated,
    teams,
  };
}

export function balances(trades) {
  let cash = STARTING_CASH;
  const holdings = {};
  for (const trade of trades) {
    if (
      !["buy", "sell"].includes(trade.side) ||
      !Number.isSafeInteger(trade.quantity) ||
      trade.quantity <= 0 ||
      !Number.isSafeInteger(trade.price) ||
      trade.price <= 0 ||
      !/^[A-Z]{2,3}$/.test(trade.symbol) ||
      !Number.isFinite(Date.parse(trade.at)) ||
      !Number.isSafeInteger(trade.price * trade.quantity)
    ) {
      throw new Error("The saved trade history could not be read.");
    }
    const position = holdings[trade.symbol] ?? { quantity: 0, cost: 0 };
    const amount = trade.quantity * trade.price;
    if (trade.side === "buy") {
      if (amount > cash) throw new Error("Not enough cash.");
      cash -= amount;
      position.quantity += trade.quantity;
      position.cost += amount;
    } else {
      if (trade.quantity > position.quantity)
        throw new Error("Not enough shares.");
      cash += amount;
      position.cost = Math.round(
        (position.cost * (position.quantity - trade.quantity)) /
          position.quantity,
      );
      position.quantity -= trade.quantity;
    }
    holdings[trade.symbol] = position;
  }
  return { cash, holdings };
}

export function placeTrade(
  trades,
  team,
  side,
  quantity,
  at = new Date().toISOString(),
) {
  const trade = {
    symbol: team.symbol,
    side,
    quantity,
    price: quote(team).cents,
    at,
  };
  const next = [...trades, trade];
  balances(next); // Validate before the caller saves or changes the displayed state.
  return next;
}
