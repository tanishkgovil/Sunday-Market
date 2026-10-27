import { mkdir, writeFile } from "node:fs/promises";
import { FEED, readForecasts } from "./market.js";

const response = await fetch(FEED, { signal: AbortSignal.timeout(15000) });
if (!response.ok)
  throw new Error(
    `ESPN returned ${response.status}; the saved market was kept.`,
  );
const market = readForecasts(await response.json());
await mkdir("data", { recursive: true });
await writeFile("data/market.json", JSON.stringify(market, null, 2) + "\n");
console.log(
  `Saved ${market.teams.length} ESPN FPI forecasts for ${market.season}, Week ${market.week}. Updated ${market.updatedAt}.`,
);
