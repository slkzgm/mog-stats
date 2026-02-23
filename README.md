## Mog Wallet Stats App

One-page wallet stats app for MOG on Abstract.

- Frontend is static (`index.html`, `app.js`, `styles.css`)
- Backend runs as Vercel Serverless Functions (`/api/*`)
- `Copy as Image` uses server-rendered PNG for stable output

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
4. Deploy.

`vercel.json` is already configured for Node runtime and function limits.

## Environment Variables

- `GRAPHQL_ENDPOINT` (default local fallback: `http://127.0.0.1:8080/v1/graphql`)
- `HASURA_ADMIN_SECRET` (optional)
- `ABS_SEARCH_BEARER` (optional)

## Assets: Background / Ghost / Copy Sound

Current files:

- `assets/bg-main.png` (main page background)
- `assets/ghost.gif` (decorative ghost in the panel)
- `assets/copy.mp3` (copy-as-image sound)
- `assets/bundle_2.png` (icon on Key spend card)
- `assets/jackpot_big.png` (icon on Jackpot claims card)

Current CSS variable for background:

- `styles.css` (in `:root`): `--bg-image-url: url("/assets/bg-main.png");`

To use your own background:

1. Put your file in `assets/` (example: `assets/my-bg.jpg`).
2. Edit `styles.css` and change:
   - from `--bg-image-url: url("/assets/bg-main.png");`
   - to `--bg-image-url: url("/assets/my-bg.jpg");`

For ghost/sound, keep the same filenames (`assets/ghost.gif`, `assets/copy.mp3`) or update paths in `index.html` / `app.js`.
