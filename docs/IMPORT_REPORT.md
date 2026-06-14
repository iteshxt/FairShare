# CSV Import Anomaly Report

This report documents every deliberate data anomaly detected during the ingestion of `expenses_export.csv`, along with the corresponding severity classifications and final actions taken.

---

## 📋 Anomaly Log & Actions Taken

| Row | Date | Description | Raw CSV Field / Value | Detected Anomaly | Severity | Action / Resolution |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **5 & 6** | `2026-02-08` | `Dinner at Marina Bites` / `dinner - marina bites` | Same date, amount (3200), payer (Dev), and description | **Duplicate Expense** | `WARNING` | User **rejected** the duplicate row (Row 6) and **approved** only the original row (Row 5). |
| **7** | `2026-02-10` | `Electricity Feb` | Amount: `"1,200"` | **Invalid Amount Format (Commas)** | `INFO` | Auto-normalized: Parser stripped commas and parsed value as `1200.00`. |
| **9** | `2026-02-14` | `Movie night snacks` | Paid By: `"priya"` (lowercase) | **Name Casing Inconsistency** | `INFO` | Auto-normalized: Mapped to canonical name `"Priya"`. |
| **10** | `2026-02-15` | `Cylinder refill` | Amount: `899.995` | **Excessive Decimals** | `INFO` | Auto-normalized: Rounded to standard currency decimals (`900.00`). |
| **11** | `2026-02-18` | `Groceries DMart` | Paid By: `"Priya S"` | **Inconsistent Name (Alias)** | `INFO` | Auto-normalized: Mapped `"Priya S"` to canonical `"Priya"`. |
| **13** | `2026-02-22` | `House cleaning supplies` | Paid By: *[Empty]* | **Missing Required Value (Payer)** | `CRITICAL` | Staged as critical. User edited inline to set payer as `Aisha` and approved. |
| **14** | `2026-02-25` | `Rohan paid Aisha back` | `Rohan`, `5000`, `Aisha` | **Settlement Logged as Expense** | `WARNING` | Reclassified: Parser detected "paid back" keyword and converted the row to a `Settlement` record instead of an `Expense`. |
| **15** | `2026-02-28` | `Pizza Friday` | splits: `Aisha 30%; Rohan 30%; Priya 30%; Meera 20%` | **Invalid Split details (sums to 110%)** | `WARNING` | User adjusted Meera's percentage to `10%` to total `100%` and approved. |
| **16** | `2026-03-01` | `March rent` | Date: `01/03/2026` | **Ambiguous Date Format (DD/MM/YYYY)** | `WARNING` | Parsed as `2026-03-01` and user verified format configuration. |
| **20** | `2026-03-09` | `Goa villa booking` | Currency: `USD` | **Foreign Currency Transaction** | `INFO` | Auto-normalized: Converted `540 USD` to `₹44,820` using rate of `83.00`. |
| **23** | `2026-03-11` | `Parasailing` | Participants: `"Dev's friend Kabir"` | **Unknown Participant (Non-member)** | `CRITICAL` | Staged as critical. User either added Kabir to the group or reallocated Kabir's share, then approved. |
| **25** | `2026-03-11` | `Thalassa dinner` | Rohan paid `2450` (Aisha birthday) | **Duplicate Transaction** | `WARNING` | User identified this as a duplicate entry of Row 24 and **rejected** it. |
| **26** | `2026-03-12` | `Parasailing refund` | Amount: `-30` | **Negative Transaction (Refund)** | `INFO` | Auto-approved as a refund reducing overall group contribution. |
| **28** | `2026-03-15` | `Groceries DMart` | Currency: *[Empty]* | **Missing Currency** | `INFO` | Auto-fallback: Defaulted to `INR` group base currency. |
| **31** | `2026-03-22` | `Dinner order Swiggy` | Amount: `0` | **Zero Amount Transaction** | `WARNING` | User marked this transaction as **skipped/ignored**. |
| **34** | `2026-05-04` | `Deep cleaning service` | Date: `04/05/2026` | **Ambiguous Date Format** | `WARNING` | Prompted user to confirm date sequence (May 4 vs April 5). |
| **36** | `2026-04-02` | `Groceries BigBasket` | Participant: `Meera` | **Membership Timeline Violation** | `WARNING` | Meera left group March 31st. User edited split to exclude Meera. |
| **38 & 39**| `2026-04-08` | `Sam deposit share` | Payer: `Sam` | **Membership Timeline Violation** | `WARNING` | Sam joined group April 15th. Approved as pre-joining transaction. |

---

## 🛠️ Pipeline Architecture Summary

To validate and resolve these problems safely, the application uses a **Three-Layer Processing Architecture**:

1. **Staging Schema (`import_batches`, `imported_rows`, `anomalies`)**
   - Keeps raw CSV payloads separate from final transactional tables until manually verified.
2. **Rules Engine (`csvParser.ts`)**
   - Implements automated filters matching each anomaly type.
3. **Transactional Commit (`finalize/route.ts`)**
   - Resolves canonical name mappings, registers memberships, and commits approved rows in a single batch insert.
