# Sunday Market

A single-player NFL team stock market with $10,000 in virtual cash.
Buy and sell whole shares, view your portfolio, and track your trades.
Progress is saved in your browser, separately for each season.

## Run

Requires Node.js 22.12 or newer.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite.

## Prices

ESPN FPI supplies projected final wins and the probability of reaching each
playoff round. The app turns those forecasts into the expected final payout:

| Accomplishment                          | Per-share payout |
| --------------------------------------- | ---------------: |
| Each regular-season win                 |              $10 |
| Each regular-season tie                 |               $5 |
| Make playoffs                           |              $30 |
| Reach Divisional Round, including a bye |              $20 |
| Reach Conference Championship           |              $40 |
| Reach Super Bowl                        |              $60 |
| Win Super Bowl                          |             $100 |

Bonuses add together. A No. 1 seed's bye counts toward reaching the Divisional
Round. Expected ties are the difference between 17 games and ESPN's projected
wins and losses, with rounding clamped to at least the ties already earned.
Each expected payout component is rounded to cents and added to the share price.
Your trades fill at that price and do not move it. There are no fees or shorts.

The app refreshes forecasts on opening and with **Refresh prices**. If ESPN is
unavailable, it displays the saved snapshot and its update time. Forecasts can
lag game results; the displayed record and prices share the same forecast date.
The [public ESPN feed](https://site.web.api.espn.com/apis/fitt/v3/sports/football/nfl/powerindex?limit=32)
is undocumented and may change. [ESPN projections](https://www.espn.com/nfl/fpi/_/view/projections)
are the source of the football expectations.

To update the saved snapshot:

```sh
npm run refresh
```

## Check and build

```sh
npm test
npm run build
```

Vite is the only development dependency. The app uses standard browser APIs.
`market.js` contains pricing and trade calculations; `app.js` handles the screen
and browser storage; `refresh.js` saves a current forecast snapshot.
