# AI Usage Report

This document records the AI tools, key prompts, development workflow, and corrections of AI mistakes during the development of the Shared Expenses App.

---

## 1. AI Tools & Models Used
- **Primary Assistant:** Antigravity (powered by Gemini) pair-programming agent.
- **Workflow:** Code-generation, direct file writing, terminal commands testing, and documentation generation.

---

## 2. Key Prompts & Interaction Style
- *"forget npm install do it last -- finish the rest of the app and the tasks first"* - instructed the agent to defer package installation and prioritize complete TypeScript and React UI logic.
- *"i dont like this prisma thing and watnt you to skip this get rid of it and use supabase db"* - redirected the database connection logic from local Docker Postgres + Prisma ORM to direct Supabase JS client queries.
- *"there shoudl be slug instead of raw id in the navigation"* - corrected route structures to use URL-friendly group slugs rather than system UUIDs.

---

## 3. Corrected AI Mistakes & Resolutions

### Mistake 1: Initial Database Strategy (Prisma + Docker)
- **Mistake:** The AI originally scaffolded the database using Prisma ORM and configured local Docker containers.
- **How Identified:** The developer explicitly stated they wanted to bypass Docker setup and use Supabase direct hosted PostgreSQL database instead.
- **Correction Made:** Killed the Prisma installation processes, removed the `/prisma` schema and seed code, removed Prisma client references, and implemented direct browser/server clients via `@supabase/supabase-js` targeting the raw SQL schema (`supabase/schema.sql`).

### Mistake 2: URL Routing using System UUIDs
- **Mistake:** The AI initially configured Next.js route folders using raw UUID parameters like `/groups/[id]` and `/groups/[id]/import/[batchId]`.
- **How Identified:** The developer commented on the design layout artifacts that URL navigation paths should use human-readable slugs instead of internal database IDs (e.g. `/groups/flatmates`).
- **Correction Made:** Added a unique `slug` column to the `groups` table in `supabase/schema.sql`, modified the Next.js routes to `/groups/[slug]`, and updated API handlers to resolve groups by their slug rather than raw IDs.

### Mistake 3: Root Layout Client Component Error (React 19 / Next.js 15)
- **Mistake:** The AI originally attempted to wrap the entire root `RootLayout` in `src/app/layout.tsx` inside the NextAuth `SessionProvider` client context directly.
- **How Identified:** Next.js throws an error because the root layout exports `metadata` (which is server-only) but is marked as `use client` or contains client-specific React context hooks without a boundary.
- **Correction Made:** Separated `SessionProvider` into a standalone `'use client'` wrapper file under `src/components/SessionProvider.tsx` and imported it as a clean boundary in `src/app/layout.tsx`.
