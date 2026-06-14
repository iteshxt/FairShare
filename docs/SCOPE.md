# Project Scope & Anomaly Handling

This document details the functional scope of the 2-day MVP, with focus on CSV anomaly categories, detection strategies, handling policies, and the database schema.

---

## 1. Functional Scope

### In-Scope
- Group management: Create group, add/remove members, maintain membership history.
- Expense tracking: Split methods (Equal, Percentage, Share, Exact), soft deletion, edit logs.
- Balance calculations: Accurate ledger calculations aware of member joined/left dates.
- Debt simplification: Calculate and display optimized settlement paths.
- Two-stage CSV import: File upload, staging, review screen, finalized write.

### Out-of-Scope
- Multi-currency beyond USD and INR.
- OCR scanning, repeating expenses, payment integration.

---

## 2. Anomaly Classifications & Handling Policies

| Anomaly Category | Detection Strategy | Handling Policy |
|---|---|---|
| **Duplicate Expense** | Exact match on description, amount, date, and payer. | Flag for review; user chooses to Merge, Keep Both, or Reject. |
| **Conflicting Duplicates** | Same event/date/payer with different amount or splits. | Flag for review; user manually edits or chooses which version to keep. |
| **Inconsistent Names** | Fuzzy match or case-insensitive string clean (e.g., "Priya" vs "Priya S"). | Normalize during import or map to a single `Person` ID. |
| **Missing Values** | Null/empty fields in required columns (Amount, Payer, Split). | Flag as Critical Anomaly; block import until user supplies missing values. |
| **Invalid Amount Format** | Parsing numbers with commas, text symbols, or excessive decimals. | Normalize (e.g. strip commas, round to 2 decimal places). |
| **Negative Amounts** | Amount < 0. | Classify as reimbursement/refund if details match, or flag for review. |
| **Settlement as Expense** | Description indicates payment/settlement (e.g., "Rohan paid Aisha"). | Re-classify as a `Settlement` record instead of an `Expense`. |
| **Currency Inconsistencies** | Mixed USD/INR. | Convert USD to INR using a configured historical exchange rate table and log conversion. |
| **Invalid Split Details** | Percentages != 100%, Shares total != participants, etc. | Flag for review; user must correct split configuration. |
| **Membership Violations** | Expense date outside user's active membership dates. | Flag warning; auto-exclude user from split and log action. |
| **Ambiguous Dates** | Multi-interpretable date formats (e.g. DD/MM/YYYY vs MM/DD/YYYY). | Flag for review; prompt user to confirm correct date. |

---

## 3. Database Schema

### Staging Schema

#### ImportBatch
- `id` (UUID, PK)
- `importedAt` (DateTime)
- `sourceFile` (String)
- `status` (Enum: `PENDING`, `PROCESSED`, `FAILED`)

#### ImportedRow
- `id` (UUID, PK)
- `batchId` (UUID, FK to `ImportBatch`)
- `rawRowIndex` (Int)
- `rawData` (JSON)
- `status` (Enum: `UNRESOLVED`, `RESOLVED`, `IGNORED`)

#### Anomaly
- `id` (UUID, PK)
- `rowId` (UUID, FK to `ImportedRow`)
- `type` (String - e.g., `DUPLICATE`, `MEMBERSHIP_VIOLATION`)
- `severity` (Enum: `WARNING`, `CRITICAL`)
- `description` (String)
- `status` (Enum: `UNRESOLVED`, `RESOLVED`, `IGNORED`)
- `resolutionDetails` (JSON)

---

### Production Schema

#### User
- `id` (UUID, PK)
- `name` (String)
- `email` (String, Unique)
- `passwordHash` (String)

#### Person
- `id` (UUID, PK)
- `name` (String)
- `userId` (UUID, FK to `User`, Optional) - links imported/local person to registered user

#### Group
- `id` (UUID, PK)
- `name` (String)
- `slug` (String, Unique) - human-readable URL identifier (e.g., "flatmates")
- `createdAt` (DateTime)

#### GroupMembership
- `id` (UUID, PK)
- `groupId` (UUID, FK to `Group`)
- `personId` (UUID, FK to `Person`)
- `joinedAt` (DateTime)
- `leftAt` (DateTime, Optional)

#### Expense
- `id` (UUID, PK)
- `groupId` (UUID, FK to `Group`)
- `description` (String)
- `amount` (Decimal)
- `currency` (String - INR/USD)
- `exchangeRate` (Decimal) - conversion factor to INR
- `paidById` (UUID, FK to `Person`)
- `expenseDate` (DateTime)
- `createdById` (UUID, FK to `User`)
- `isDeleted` (Boolean) - soft delete

#### ExpenseParticipant
- `id` (UUID, PK)
- `expenseId` (UUID, FK to `Expense`)
- `personId` (UUID, FK to `Person`)
- `allocationType` (Enum: `EQUAL`, `PERCENTAGE`, `SHARE`, `EXACT`)
- `allocationValue` (Decimal)
- `calculatedAmount` (Decimal)

#### Settlement
- `id` (UUID, PK)
- `groupId` (UUID, FK to `Group`)
- `payerId` (UUID, FK to `Person`)
- `receiverId` (UUID, FK to `Person`)
- `amount` (Decimal)
- `settlementDate` (DateTime)
- `isSystemGenerated` (Boolean)

