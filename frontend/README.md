# Lead-Lag Sentinel — frontend

Isometric diorama UI for the Lead-Lag Sentinel multi-agent paper-trading
system. Next.js App Router + react-three-fiber + SWR + KaTeX. Everything
renders from the live FastAPI backend — no mock data.

## Routes

- `/` — the 3D world (market tiles, agent blocks, wallet cloud) + sentinel header + agent round card
- `/math` — the 6-stage pipeline math panel (KaTeX + live numbers) + model card
- `/trades` — PnL chart, portfolio, blotter, full journal timeline

One SWR provider lives in the root layout, so the `/api/state` poll (3s,
dedupe 2.5s) is shared across routes; navigation is instant and never
refetches.

## Run locally

```bash
npm install
npm run dev -- -p 3600
```

Backend expected at `http://localhost:8600` (override with
`NEXT_PUBLIC_API_URL` in `.env.local`).

## Build

```bash
npm run build
npm start -- -p 3600
```

## Deploy (Vercel)

No `vercel.json` is required — Vercel auto-detects Next.js.

```bash
vercel --prod
```

Set the environment variable in the Vercel project (Production scope):

```
NEXT_PUBLIC_API_URL=https://<your-render-backend>.onrender.com
```

Note `NEXT_PUBLIC_*` vars are inlined at build time — redeploy after
changing it. The backend must allow CORS from the Vercel domain (it
currently serves `access-control-allow-origin: *`, so this works out of
the box).
