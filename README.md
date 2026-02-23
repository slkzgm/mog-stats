## Mog Wallet Stats App

One-page wallet stats app for MOG on Abstract.

- Frontend is static (`index.html`, `app.js`, `styles.css`)
- Backend runs as Vercel Serverless Functions (`/api/*`)
- `Copy as Image` uses server-rendered PNG for stable output
- Includes a `General stats` view with global aggregates + profit leaderboard (non-projected, onchain indexed fields)

## Run Locally

```bash
cd /home/slk/personal/och/mog-wallet-stats-app
pnpm dev
```

Then open `http://127.0.0.1:4173`.

To run in Vercel emulation mode (real `/api/*` serverless functions):

```bash
pnpm dev:vercel
```

## Deploy to Vercel

1. Push this folder to GitHub.
2. Import the repo in Vercel.
3. Set environment variables in Vercel Project Settings:
   - `GRAPHQL_ENDPOINT`
   - `HASURA_ADMIN_SECRET` (optional, only if your GraphQL endpoint requires it)
   - `ABS_SEARCH_BEARER` (optional)
   - `ABS_RPC_ENDPOINT` (optional, default: `https://api.mainnet.abs.xyz`)
   - `MOG_WEEKLY_POOL_SHARE_BPS` (optional, default: `6000`)
   - `MOG_WEEKLY_POOL_CACHE_MS` (optional, default: `45000`)
4. Deploy.

`vercel.json` is already configured for Node runtime and function limits.

## Environment Variables

- `GRAPHQL_ENDPOINT` (default local fallback: `http://127.0.0.1:8080/v1/graphql`)
- `HASURA_ADMIN_SECRET` (optional)
- `ABS_SEARCH_BEARER` (optional)
- `ABS_RPC_ENDPOINT` (optional, default: `https://api.mainnet.abs.xyz`)
- `MOG_WEEKLY_POOL_SHARE_BPS` (optional, default `6000` = 60% of key spend to weekly pool)
- `MOG_WEEKLY_POOL_CACHE_MS` (optional, projected pool cache TTL in ms)

## GraphQL Schema Requirement

The `General stats` page expects these indexed fields on `GlobalStats` and `PlayerStats`:

- `totalClaimAmount`
- `netProfitAmount`

If your deployed indexer does not expose these fields yet, deploy/reindex the latest `mog-indexer` schema + handlers first.

## Assets: Background / Ghost / Copy Sound

Current files:

- `assets/bg-main.png` (main page background)
- `assets/ghost.gif` (decorative ghost in the panel)
- `assets/*.gif` (all GIFs are auto-detected; one is picked randomly on each refresh and used in copy image)
- `assets/copy.mp3` (copy-as-image sound)
- `assets/key_big.png` (icon on Key spend card)
- `assets/jackpot_big.png` (icon on Jackpot claims card)
- `assets/mog_slime.png` (favicon source image)
- `favicon.ico`, `favicon-32x32.png`, `favicon-16x16.png`, `apple-touch-icon.png` (browser/app icons)

Current CSS variable for background:

- `styles.css` (in `:root`): `--bg-image-url: url("/assets/bg-main.png");`

To use your own background:

1. Put your file in `assets/` (example: `assets/my-bg.jpg`).
2. Edit `styles.css` and change:
   - from `--bg-image-url: url("/assets/bg-main.png");`
   - to `--bg-image-url: url("/assets/my-bg.jpg");`

For ghost/sound, keep the same filenames (`assets/ghost.gif`, `assets/copy.mp3`) or update paths in `index.html` / `app.js`.
