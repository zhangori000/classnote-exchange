# Classnote Exchange

Collaborative web app for college students to browse campuses, drill into class boards, and swap lecture notes or general study threads without logging in.

## Tech stack

- Next.js 14 (App Router, TypeScript)
- Tailwind CSS for styling
- date-fns, lucide-react, clsx for UX polish

## Getting started

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` and start searching for a university to open its class board. Use the general tab for Blind-style threads and the lecture tab for the calendar-driven note drops.

## Next steps

- Wire up authentication when you are ready for persistent profiles.
- Replace the in-memory sample data under `lib/sample-data.ts` with a database or API.
- Persist reactions/comments via an API route to keep counts consistent across sessions.
- Consensus + expiration are already modeled on the front-end (each post needs `minConsensusLikes` within 30 days), so your eventual API should enforce the same rule before writing to the database.

## Deploying for demos

1. Create a free Vercel account and link this repo (or run `npx vercel` in the project root).
2. Set the framework preset to **Next.js**; defaults are fine because the app is fully static.
3. Every push (or manual `npx vercel --prod`) publishes a shareable URL you can drop on LinkedIn for folks to try.

For a lightweight production database once you grow past static seed data, consider:

- **Supabase (Postgres)** – generous free tier, row-level auth, and web dashboards for quick CRUD.
- **Planetscale / Turso** – serverless MySQL/SQLite with HTTP APIs; great for read-heavy workloads.
- **Neon** – elastic Postgres that sleeps when idle (nice for hobby deployments).

You can start with a single `posts` table that mirrors the fields already in `lib/sample-data.ts`, plus a `votes` table to prevent duplicate likes. The consensus + 30 day expiry rules can run via cron (Vercel Cron or GitHub Actions) to prune anything that never hit the threshold.
