-- ═══════════════════════════════════════════════════════════════
-- Shared Expenses App — Database Schema
-- Run this in the Supabase SQL Editor to create all tables.
-- ═══════════════════════════════════════════════════════════════

-- ─── Custom Types ────────────────────────────────────────────

CREATE TYPE allocation_type AS ENUM ('EQUAL', 'PERCENTAGE', 'SHARE', 'EXACT');
CREATE TYPE import_batch_status AS ENUM ('PENDING', 'REVIEWING', 'COMPLETED', 'FAILED');
CREATE TYPE imported_row_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED');
CREATE TYPE anomaly_severity AS ENUM ('INFO', 'WARNING', 'CRITICAL');
CREATE TYPE anomaly_status AS ENUM ('UNRESOLVED', 'RESOLVED', 'IGNORED');

-- ─── Auth ────────────────────────────────────────────────────

CREATE TABLE users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  email      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── People & Groups ─────────────────────────────────────────

CREATE TABLE persons (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name    TEXT NOT NULL,
  user_id UUID UNIQUE REFERENCES users(id)
);

CREATE TABLE groups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE group_memberships (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id  UUID NOT NULL REFERENCES groups(id),
  person_id UUID NOT NULL REFERENCES persons(id),
  joined_at DATE NOT NULL,
  left_at   DATE,
  UNIQUE(group_id, person_id, joined_at)
);

-- ─── Expenses ────────────────────────────────────────────────

CREATE TABLE expenses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      UUID NOT NULL REFERENCES groups(id),
  description   TEXT NOT NULL,
  amount        NUMERIC(12,2) NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'INR',
  exchange_rate NUMERIC(10,4) NOT NULL DEFAULT 1,
  paid_by_id    UUID NOT NULL REFERENCES persons(id),
  expense_date  DATE NOT NULL,
  created_by_id UUID REFERENCES users(id),
  is_deleted    BOOLEAN DEFAULT false,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE expense_participants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id        UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  person_id         UUID NOT NULL REFERENCES persons(id),
  allocation_type   allocation_type NOT NULL,
  allocation_value  NUMERIC(12,4) NOT NULL,
  calculated_amount NUMERIC(12,2) NOT NULL,
  UNIQUE(expense_id, person_id)
);

-- ─── Settlements ─────────────────────────────────────────────

CREATE TABLE settlements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID NOT NULL REFERENCES groups(id),
  payer_id        UUID NOT NULL REFERENCES persons(id),
  receiver_id     UUID NOT NULL REFERENCES persons(id),
  amount          NUMERIC(12,2) NOT NULL,
  settlement_date DATE NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ─── Import Staging ──────────────────────────────────────────

CREATE TABLE import_batches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES groups(id),
  source_file TEXT NOT NULL,
  status      import_batch_status DEFAULT 'PENDING',
  imported_at TIMESTAMPTZ DEFAULT now(),
  summary     JSONB
);

CREATE TABLE imported_rows (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id  UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  row_index INT NOT NULL,
  raw_data  JSONB NOT NULL,
  status    imported_row_status DEFAULT 'PENDING'
);

CREATE TABLE anomalies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  row_id      UUID NOT NULL REFERENCES imported_rows(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  severity    anomaly_severity NOT NULL,
  description TEXT NOT NULL,
  status      anomaly_status DEFAULT 'UNRESOLVED',
  resolution  JSONB
);

-- ─── Indexes ─────────────────────────────────────────────────

CREATE INDEX idx_expenses_group ON expenses(group_id);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_expense_participants_expense ON expense_participants(expense_id);
CREATE INDEX idx_settlements_group ON settlements(group_id);
CREATE INDEX idx_memberships_group ON group_memberships(group_id);
CREATE INDEX idx_imported_rows_batch ON imported_rows(batch_id);
CREATE INDEX idx_anomalies_row ON anomalies(row_id);

-- ─── Seed: Flatmates Group ──────────────────────────────────

INSERT INTO groups (id, name, slug) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Flatmates', 'flatmates');

INSERT INTO persons (id, name) VALUES
  ('00000000-0000-0000-0000-100000000001', 'Aisha'),
  ('00000000-0000-0000-0000-100000000002', 'Rohan'),
  ('00000000-0000-0000-0000-100000000003', 'Priya'),
  ('00000000-0000-0000-0000-100000000004', 'Meera'),
  ('00000000-0000-0000-0000-100000000005', 'Dev'),
  ('00000000-0000-0000-0000-100000000006', 'Sam');

INSERT INTO group_memberships (group_id, person_id, joined_at, left_at) VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-100000000001', '2026-02-01', NULL),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-100000000002', '2026-02-01', NULL),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-100000000003', '2026-02-01', NULL),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-100000000004', '2026-02-01', '2026-03-31'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-100000000005', '2026-03-01', '2026-03-31'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-100000000006', '2026-04-15', NULL);
