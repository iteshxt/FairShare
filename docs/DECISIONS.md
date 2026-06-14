# Architectural & Design Decisions

This document logs key technical and design decisions, alternatives considered, and reasoning behind choices made.

---

## 1. Directory Structure & Monorepo vs Single App
- **Decision:** Use a single Next.js App Router project without Monorepo overhead, but structured cleanly.
- **Reasoning:** Reduces configuration overhead, speeds up deployment on Vercel, and fits well within the 2-day MVP scope.

## 2. Authentication Strategy
- **Decision:** NextAuth.js with Email/Password credentials.
- **Reasoning:** Simple, secure, local testing is self-contained without needing third-party provider credentials setup.

## 3. CSV Import Architecture
- **Decision:** Two-stage import using Staging Tables (`import_batches`, `imported_rows`, `anomalies`).
- **Reasoning:** Ensures raw CSV data is preserved, validation errors can be reviewed, and no corrupt data is written to core transactional tables (`Expenses`, `Settlements`).

## 4. User vs. Person Separation
- **Decision:** Maintain `Users` (for login/auth) and `Person` (for expense participation and CSV names) separately.
- **Reasoning:** Resolves inconsistencies where CSV expenses mention people who haven't registered yet, allowing audit tracking without breaking database constraints.

## 5. UI and Styling Language
- **Decision:** Create custom UI components using Tailwind CSS directly instead of utilizing pre-built component libraries like `shadcn/ui`. Establish a colorful, playful, and friendly visual language.
- **Reasoning:**
  - Avoids dependencies on external components, making live refactoring/modifications during evaluation simple and direct.
  - Using a warm, vibrant color palette and soft shadows gives a playful, friendly aesthetic (less "corporate SaaS", more "roommate-focused app") that stands out.

## 6. Database & ORM Choice
- **Decision:** Use Supabase PostgreSQL with the `@supabase/supabase-js` client directly. No ORM (Prisma was considered and dropped).
- **Alternatives considered:** Prisma ORM for type-safe queries and migrations.
- **Reasoning:**
  - Prisma adds heavy binary downloads, Docker dependency for local dev, and slow cold starts on Vercel.
  - Supabase JS client connects directly to the hosted Supabase PostgreSQL — zero local infra needed.
  - Schema is managed via raw SQL (`supabase/schema.sql`) run in the Supabase SQL Editor, giving full control.
  - For a 2-day MVP, the simplicity of direct SQL + Supabase client wins over ORM abstractions.

## 7. Responsive Mobile-First Layouts
- **Decision:** Prioritize mobile responsive layouts for all pages and components.
- **Reasoning:** Expense trackers are primarily used on mobile devices (e.g. while out shopping or splitting restaurant tabs). All lists, tables, dynamic resolution forms, and navigation headers must stack elegantly and fit within standard viewport widths (320px - 768px).

