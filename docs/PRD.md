# PRD - Shared Expenses Management App

## Project Overview

Build a web-based Shared Expenses Management Application that allows a group of users to track shared expenses, manage changing group memberships, settle debts, and import historical expense data from a messy CSV dataset.

The application is designed around a real-world scenario where multiple roommates have been recording expenses in spreadsheets over several months. The existing data contains inconsistencies, duplicate entries, currency issues, settlement records mixed with expenses, changing group memberships, and multiple data quality problems.

The goal is to provide a transparent, auditable, and explainable expense management system rather than simply calculating balances.

---

# Problem Statement

Four flatmates (Aisha, Rohan, Priya, and Meera) have tracked shared expenses since February.

Additional events occurred over time:

* Dev joined only for a group trip.
* Some trip expenses were recorded in USD.
* Meera moved out at the end of March.
* Sam moved in during April.
* Expenses were recorded manually in spreadsheets resulting in inconsistent and unreliable data.

The current spreadsheet contains:

* Duplicate expenses
* Inconsistent user names
* Multiple date formats
* Currency inconsistencies
* Settlement transactions recorded as expenses
* Missing values
* Ambiguous entries
* Invalid split configurations
* Membership conflicts

The application must import this historical data, identify all anomalies, surface them to users, and handle them according to documented policies.

---

# Goals

## Primary Goals

1. Provide accurate group expense tracking.
2. Support changing group memberships over time.
3. Support multiple expense splitting methods.
4. Import historical CSV data without manual preprocessing.
5. Detect and report data anomalies.
6. Provide complete balance transparency.
7. Allow settlement tracking.
8. Maintain an audit trail of all import decisions.

## Non-Goals

1. Banking integration.
2. Payment gateway integration.
3. Mobile application.
4. Real-time notifications.
5. Advanced accounting features.

---

# User Personas

## Aisha

Goal:

"I just want one number per person. Who pays whom and how much."

Needs:

* Simplified balances
* Net settlement view

---

## Rohan

Goal:

"I want to see exactly how balances are calculated."

Needs:

* Expense traceability
* Balance breakdown
* Expense-level auditability

---

## Priya

Goal:

"USD expenses should not be treated as INR."

Needs:

* Proper currency handling
* Exchange rate transparency

---

## Sam

Goal:

"I joined in April. Earlier expenses should not affect me."

Needs:

* Membership-aware balance calculations

---

## Meera

Goal:

"Do not automatically delete data."

Needs:

* Review workflow
* Approval before modifications
* Visibility into detected anomalies

---

# Functional Requirements

## Authentication

Users must be able to:

* Register
* Login
* Logout

Authentication must protect application data.

---

## Group Management

Users must be able to:

### Create Groups

Example:

Flatmates Group

### Manage Members

* Add members
* Remove members
* View membership history

### Membership Timeline

Each membership record must contain:

* User
* Joined Date
* Left Date

This is required because balances depend on who was part of the group at a specific time.

---

## Expense Management

Users must be able to:

### Create Expense

Fields:

* Description
* Amount
* Currency
* Date
* Paid By
* Participants
* Split Type

---

### Edit Expense

Users may modify existing expenses.

All modifications should be auditable.

---

### Delete Expense

Soft delete preferred.

---

## Supported Split Types

The application must support every split type appearing in the CSV.

Expected split types include:

### Equal Split

Amount divided equally.

### Percentage Split

Custom percentage allocation.

### Share-Based Split

Amount divided according to share counts.

### Unequal Split

Explicit custom amounts.

---

## Balance Calculation

The system must provide:

### Group Balance Summary

Example:

* Aisha +₹1200
* Rohan -₹500
* Priya -₹700

### Individual Balance Summary

Example:

Rohan owes Aisha ₹500

### Expense Traceability

Users must be able to view:

* Which expenses contribute to a balance
* Calculation breakdown
* Historical transactions

---

## Settlements

Users must be able to:

### Record Settlements

Example:

Rohan paid Aisha ₹500

### View Settlement History

All settlement records must remain auditable.

---

# CSV Import System

## Core Requirement

The application must import the provided CSV exactly as received.

Manual editing of CSV files before import is prohibited.

---

## Import Workflow

1. Upload CSV
2. Parse records
3. Detect anomalies
4. Generate anomaly report
5. Apply handling policy
6. Request user approval where required
7. Import approved records
8. Generate import summary

---

# Data Quality Requirements

The importer must:

1. Detect anomalies
2. Surface anomalies
3. Apply documented handling rules
4. Generate an import report

The importer must never:

* Crash on bad data
* Silently modify data
* Silently discard records

---

# Expected Anomaly Categories

The CSV contains intentionally problematic records.

Potential anomaly categories include:

## Duplicate Expenses

Examples:

* Same description
* Same amount
* Same participants
* Similar wording

---

## Conflicting Duplicates

Example:

Same event recorded twice with different amounts.

---

## Inconsistent User Names

Examples:

* Priya
* priya
* Priya S

Must be normalized.

---

## Missing Values

Examples:

* Missing payer
* Missing currency
* Missing participant information

---

## Invalid Amount Formats

Examples:

* 1,200
* 899.995

Requires normalization.

---

## Negative Amounts

Examples:

* Refunds
* Reimbursements

Must be classified appropriately.

---

## Settlement Recorded As Expense

Must be detected and flagged.

---

## Currency Issues

Examples:

USD expenses requiring conversion.

The application must document and display exchange rate usage.

---

## Invalid Percentage Splits

Example:

Percentages not totaling 100%.

---

## Invalid Share Splits

Share totals not matching allocation logic.

---

## Unknown Participants

Example:

Participant not present in group membership records.

---

## Membership Violations

Examples:

Expense includes user after leaving group.

Expense includes user before joining group.

---

## Ambiguous Dates

Examples:

04/05/2026

Requires review workflow.

---

## Zero Amount Transactions

Must be reviewed and classified.

---

## Split Type Conflicts

Examples:

Split type and split details contradict each other.

---

# Approval Workflow

Certain anomalies must require manual review.

Examples:

* Potential duplicates
* Ambiguous dates
* Unknown participants
* Conflicting records

Users must be able to:

* Accept
* Reject
* Modify

before final import.

---

# Database Requirements

The application must use a relational database.

Preferred solution:

PostgreSQL

---

# Proposed Database Schema

## Users

* id
* name
* email
* password_hash

## Groups

* id
* name
* created_at

## GroupMemberships

* id
* group_id
* user_id
* joined_at
* left_at

## Expenses

* id
* group_id
* description
* amount
* currency
* paid_by
* expense_date

## ExpenseParticipants

* id
* expense_id
* user_id
* allocation_type
* allocation_value

## Settlements

* id
* payer_id
* receiver_id
* amount
* settlement_date

## Imports

* id
* imported_at
* source_file

## Anomalies

* id
* import_id
* anomaly_type
* severity
* status
* resolution

---

# Reporting Requirements

## Import Report

Generated after every import.

Must include:

* Rows processed
* Successful imports
* Failed imports
* Anomalies detected
* Actions taken

---

## Balance Report

Must show:

* User balances
* Settlement recommendations
* Expense traceability

---

# Transparency Requirements

Every calculated balance must be explainable.

Users must be able to trace:

Balance → Expense → Split Calculation → Original Record

No hidden calculations are allowed.

---

# Technical Requirements

## Frontend

* Next.js
* TypeScript
* Tailwind CSS
* shadcn/ui

## Backend

* Next.js API Routes

or

* Express.js

## Database

* PostgreSQL

## ORM

* Prisma

## Deployment

* Vercel
* Neon PostgreSQL

---

# Required Deliverables

## 1. Public Deployed URL

Accessible application.

---

## 2. GitHub Repository

Must contain meaningful commit history.

Single bulk commit is unacceptable.

---

## 3. README.md

Must include:

* Setup instructions
* Architecture overview
* Tech stack
* AI usage summary

---

## 4. SCOPE.md

Must include:

* Every anomaly discovered
* Detection strategy
* Handling policy
* Database schema

---

## 5. DECISIONS.md

Must include:

* Significant decisions
* Alternatives considered
* Reasoning behind final choice

---

## 6. Import Report

Generated by the application after import.

Must list:

* Anomalies
* Resolutions
* Actions taken

---

## 7. AI_USAGE.md

Must include:

* AI tools used
* Prompts used
* Development workflow
* At least three AI mistakes encountered
* How those mistakes were identified
* What corrections were made

---

# Success Criteria

The project is successful when:

1. Users can create and manage groups.
2. Membership changes affect balances correctly.
3. All CSV records can be imported.
4. Anomalies are detected and reported.
5. Balances are accurate and explainable.
6. Settlement tracking works.
7. The application is publicly deployed.
8. Every technical and product decision can be defended during a live technical review.
