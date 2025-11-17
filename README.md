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

## Supabase persistence

The UI now syncs general threads + comments through Supabase. Make sure your project matches the expected schema:

1. Add `.env.local` keys:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```
2. Update the **posts** table with the extra columns used by the app:
   ```sql
   alter table posts
     add column if not exists context text default 'general',
     add column if not exists lecture_date date,
     add column if not exists likes_count integer default 0 not null,
     add column if not exists dislikes_count integer default 0 not null,
     add column if not exists min_consensus_likes integer default 15 not null,
     add column if not exists approved boolean default false not null,
     add column if not exists expires_at timestamptz default now() + interval '30 days';
   ```
   `class_id` should match the `ClassTopic.id` in `lib/sample-data.ts` when you want Supabase rows to attach to existing classes.
3. Extend `post_likes` so each device can store both likes and dislikes:
   ```sql
   alter table post_likes
     add column if not exists vote text check (vote in ('like','dislike')) default 'like';
   ```
4. The `comments` table from the schema summary already matches what the app expects (`post_id`, `device_id`, `author`, `content`, `created_at`).

With RLS enabled, add policies that allow anonymous `select/insert/update/delete` for these tables or disable RLS while testing. Once the rows exist, the app loads all Supabase posts first, then falls back to the in-memory seed data so LinkedIn visitors always see something.
