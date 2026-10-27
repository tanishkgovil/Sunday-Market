import initialMarket from "./data/market.json";
import {
  FEED,
  STARTING_CASH,
  PAYOUTS,
  quote,
  readForecasts,
  balances,
  placeTrade,
} from "./market.js";

const $ = (id) => document.getElementById(id);
const money = (cents) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const percent = (value) => `${(value * 100).toFixed(1)}%`;
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const date = (value) =>
  new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
let market = initialMarket;
const storageKey = `sunday-market-${market.season}`;
let trades = [],
  storageError = "",
  selected = null,
  side = "buy",
  toastTimer;
try {
  trades = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
  if (!Array.isArray(trades)) throw new Error("Invalid saved portfolio.");
  balances(trades);
  if (
    trades.some(
      (trade) => !market.teams.some((team) => team.symbol === trade.symbol),
    )
  )
    throw new Error("Unknown team in saved portfolio.");
} catch {
  trades = [];
  storageError =
    "Your saved portfolio could not be read. Trading is paused so it is not overwritten.";
}

const findTeam = (symbol) =>
  market.teams.find((team) => team.symbol === symbol);
const teamCell = (team) =>
  `<div class="team"><img src="${escape(team.logo)}" alt="" width="34" height="34" loading="lazy"><div><strong>${escape(team.name)}</strong><small>${escape(team.symbol)} · ${escape(team.conference)}</small></div></div>`;
function toast(message) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").hidden = false;
  toastTimer = setTimeout(() => {
    $("toast").hidden = true;
  }, 4500);
}
function showView(view) {
  for (const button of document.querySelectorAll("[data-view]"))
    button.classList.toggle("active", button.dataset.view === view);
  for (const name of ["market", "portfolio", "activity"])
    $(`${name}-view`).hidden = name !== view;
}
function render() {
  const { cash, holdings } = balances(trades);
  const positions = Object.entries(holdings).filter(
    ([, holding]) => holding.quantity > 0,
  );
  const invested = positions.reduce(
    (sum, [symbol, holding]) =>
      sum + holding.quantity * quote(findTeam(symbol)).cents,
    0,
  );
  const total = cash + invested,
    profit = total - STARTING_CASH;
  $("season").textContent = `${market.season} NFL season · Week ${market.week}`;
  $("updated").textContent = `Updated ${date(market.updatedAt)}`;
  $("total").textContent = money(total);
  $("cash").textContent = money(cash);
  $("invested").textContent = money(invested);
  $("positions").textContent =
    `${positions.length} position${positions.length === 1 ? "" : "s"}`;
  $("return").textContent =
    `${profit >= 0 ? "+" : "−"}${money(Math.abs(profit))} (${profit >= 0 ? "+" : ""}${((profit / STARTING_CASH) * 100).toFixed(2)}%) total return`;
  $("return").className = profit < 0 ? "negative" : "positive";
  renderMarket();
  $("portfolio-content").innerHTML = positions.length
    ? `<div class="table-scroll"><table><thead><tr><th>Team</th><th>Shares</th><th>Average cost</th><th>Share price</th><th>Market value</th><th>Unrealized return</th><th></th></tr></thead><tbody>${positions
        .map(([symbol, holding]) => {
          const team = findTeam(symbol),
            price = quote(team).cents,
            value = holding.quantity * price,
            gain = value - holding.cost;
          return `<tr><td>${teamCell(team)}</td><td>${holding.quantity}</td><td>${money(holding.cost / holding.quantity)}</td><td>${money(price)}</td><td class="price">${money(value)}</td><td class="${gain >= 0 ? "positive" : "negative"}">${gain >= 0 ? "+" : "−"}${money(Math.abs(gain))}</td><td><button class="trade-button" data-team="${symbol}">Trade</button></td></tr>`;
        })
        .join("")}</tbody></table></div>`
    : '<div class="empty"><p>No holdings.</p><button data-view="market">View market</button></div>';
  $("activity-content").innerHTML = trades.length
    ? `<div class="table-scroll"><table><thead><tr><th>Team</th><th>Trade</th><th>Shares</th><th>Price</th><th>Total</th><th>Date</th></tr></thead><tbody>${[
        ...trades,
      ]
        .reverse()
        .map(
          (trade) =>
            `<tr><td>${teamCell(findTeam(trade.symbol))}</td><td class="${trade.side === "buy" ? "positive" : ""}">${trade.side === "buy" ? "Bought" : "Sold"}</td><td>${trade.quantity}</td><td>${money(trade.price)}</td><td>${money(trade.price * trade.quantity)}</td><td>${date(trade.at)}</td></tr>`,
        )
        .join("")}</tbody></table></div>`
    : '<div class="empty"><p>No trades.</p></div>';
  if (storageError) {
    $("notice").textContent = storageError;
    $("notice").hidden = false;
  }
  if ($("ticket").open) renderTicket();
}
function renderMarket() {
  const search = $("search").value.toLowerCase(),
    conference = $("conference").value;
  const teams = market.teams
    .filter(
      (team) =>
        (!conference || team.conference === conference) &&
        `${team.name} ${team.symbol}`.toLowerCase().includes(search),
    )
    .sort((a, b) => quote(b).cents - quote(a).cents);
  $("market-rows").innerHTML =
    teams
      .map(
        (team) =>
          `<tr><td>${teamCell(team)}</td><td>${team.record}</td><td>${team.forecast.wins.toFixed(1)}</td><td>${percent(team.forecast.playoffs)}</td><td class="price">${money(quote(team).cents)}</td><td><button class="trade-button" data-team="${team.symbol}" ${storageError ? "disabled" : ""}>Trade</button></td></tr>`,
      )
      .join("") ||
    '<tr><td colspan="6" class="muted">No teams match your search.</td></tr>';
}
function renderTicket() {
  selected = findTeam(selected.symbol);
  const { cash, holdings } = balances(trades),
    price = quote(selected),
    owned = holdings[selected.symbol]?.quantity ?? 0;
  const quantity = Number($("quantity").value),
    max = side === "buy" ? Math.floor(cash / price.cents) : owned;
  $("ticket-title").textContent = selected.name;
  $("ticket-price").innerHTML = `${money(price.cents)}<small>per share</small>`;
  $("ticket-record").textContent =
    `${selected.record} · ${selected.forecast.wins.toFixed(1)} projected wins · ${percent(selected.forecast.playoffs)} playoff chance`;
  $("buy-side").classList.toggle("active", side === "buy");
  $("sell-side").classList.toggle("active", side === "sell");
  $("order-label").textContent =
    side === "buy" ? "Total cost" : "Total proceeds";
  $("order-total").textContent =
    Number.isSafeInteger(quantity) && quantity > 0
      ? money(quantity * price.cents)
      : "—";
  $("ticket-cash").textContent = money(cash);
  $("ticket-owned").textContent = String(owned);
  $("max").disabled = max < 1;
  $("max").dataset.quantity = max;
  $("submit-trade").textContent = `${side === "buy" ? "Buy" : "Sell"} shares`;
  $("submit-trade").disabled =
    !!storageError ||
    !Number.isSafeInteger(quantity) ||
    quantity <= 0 ||
    quantity > max ||
    price.cents <= 0;
  $("trade-error").textContent =
    quantity > max
      ? side === "buy"
        ? "Not enough cash for this order."
        : "You don’t own that many shares."
      : "";
  $("ticket-breakdown").innerHTML = price.parts
    .map(
      (part) =>
        `<div class="order-line"><span>${part.label}</span><span>${money(part.cents)}</span></div>`,
    )
    .join("");
}
async function refresh() {
  $("refresh").disabled = true;
  $("refresh").textContent = "Updating…";
  try {
    const response = await fetch(FEED, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("Forecast source unavailable.");
    const next = readForecasts(await response.json());
    if (
      next.season !== market.season ||
      Date.parse(next.updatedAt) < Date.parse(market.updatedAt)
    )
      throw new Error("Forecast date mismatch.");
    market = next;
    if (!storageError) $("notice").hidden = true;
    render();
  } catch {
    $("notice").textContent =
      storageError ||
      `Couldn’t refresh ESPN. Showing the saved forecasts from ${date(market.updatedAt)}.`;
    $("notice").hidden = false;
  } finally {
    $("refresh").disabled = false;
    $("refresh").textContent = "Refresh prices";
  }
}

document.addEventListener("click", (event) => {
  const view = event.target.closest("[data-view]");
  if (view) showView(view.dataset.view);
  const button = event.target.closest("[data-team]");
  if (button && !storageError) {
    selected = findTeam(button.dataset.team);
    side = "buy";
    $("quantity").value = 1;
    renderTicket();
    $("ticket").showModal();
  }
});
$("close-ticket").onclick = () => $("ticket").close();
$("ticket").addEventListener("click", (event) => {
  if (event.target === $("ticket")) {
    const r = $("ticket").getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      $("ticket").close();
  }
});
for (const direction of ["buy", "sell"])
  $(`${direction}-side`).onclick = () => {
    side = direction;
    renderTicket();
  };
$("quantity").oninput = renderTicket;
$("max").onclick = () => {
  $("quantity").value = $("max").dataset.quantity;
  renderTicket();
};
$("trade-form").onsubmit = (event) => {
  event.preventDefault();
  if (storageError) return;
  try {
    const next = placeTrade(
      trades,
      selected,
      side,
      Number($("quantity").value),
    );
    localStorage.setItem(storageKey, JSON.stringify(next));
    const trade = next.at(-1);
    trades = next;
    $("ticket").close();
    render();
    toast(
      `${side === "buy" ? "Bought" : "Sold"} ${trade.quantity} ${trade.symbol} share${trade.quantity === 1 ? "" : "s"} for ${money(trade.quantity * trade.price)}.`,
    );
  } catch (error) {
    $("trade-error").textContent =
      error.name === "QuotaExceededError" || error.name === "SecurityError"
        ? "Couldn’t save your trade in this browser. Your portfolio is unchanged."
        : error.message;
  }
};
$("search").oninput = renderMarket;
$("conference").onchange = renderMarket;
$("refresh").onclick = refresh;
$("payouts").innerHTML = PAYOUTS.map(
  ([label, payout]) =>
    `<div class="payout"><strong>${money(payout * 100)}</strong><span>${label}</span></div>`,
).join("");
render();
refresh();
