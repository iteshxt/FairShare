import {
  RawCSVRow,
  ParsedExpense,
  ParsedSplitDetail,
  Anomaly,
  ImportResult,
} from "./types";

// ─── Constants ───────────────────────────────────────────────

const USD_TO_INR = 83;

// Known name aliases → canonical name
const NAME_ALIASES: Record<string, string> = {
  priya: "Priya",
  "priya s": "Priya",
  rohan: "Rohan",
  aisha: "Aisha",
  meera: "Meera",
  dev: "Dev",
  sam: "Sam",
};

// Known group members
const KNOWN_MEMBERS = ["Aisha", "Rohan", "Priya", "Meera", "Dev", "Sam"];

// Settlement detection keywords
const SETTLEMENT_KEYWORDS = [
  "paid back",
  "paid .* back",
  "settlement",
  "settled",
  "deposit share",
  "reimburs",
];

// ─── CSV Parsing ─────────────────────────────────────────────

export function parseCSV(csvText: string): RawCSVRow[] {
  const lines = csvText.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

  const rows: RawCSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    const row: Record<string, string> = {};

    headers.forEach((header, idx) => {
      row[header] = (values[idx] || "").trim();
    });

    rows.push(row as unknown as RawCSVRow);
  }

  return rows;
}

// Handle quoted CSV fields (e.g. "Aisha;Rohan;Priya")
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

// ─── Name Normalization ──────────────────────────────────────

export function normalizeName(raw: string): {
  normalized: string;
  wasAliased: boolean;
} {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  const alias = NAME_ALIASES[lower];

  if (alias) {
    return { normalized: alias, wasAliased: lower !== alias.toLowerCase() };
  }

  // Capitalize first letter as fallback
  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return { normalized: capitalized, wasAliased: false };
}

// ─── Date Parsing ────────────────────────────────────────────

interface DateParseResult {
  date: Date | null;
  isAmbiguous: boolean;
  rawFormat: string;
}

export function parseDate(raw: string): DateParseResult {
  const trimmed = raw.trim();

  // Format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { date: new Date(trimmed + "T00:00:00"), isAmbiguous: false, rawFormat: "YYYY-MM-DD" };
  }

  // Format: DD/MM/YYYY or MM/DD/YYYY — ambiguous if day ≤ 12
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [a, b, year] = trimmed.split("/").map(Number);

    // If first number > 12, it must be DD/MM/YYYY
    if (a > 12) {
      return {
        date: new Date(year, b - 1, a),
        isAmbiguous: false,
        rawFormat: "DD/MM/YYYY",
      };
    }
    // If second number > 12, it must be MM/DD/YYYY
    if (b > 12) {
      return {
        date: new Date(year, a - 1, b),
        isAmbiguous: false,
        rawFormat: "MM/DD/YYYY",
      };
    }
    // Both ≤ 12 — ambiguous. Default to DD/MM/YYYY but flag it.
    return {
      date: new Date(year, b - 1, a),
      isAmbiguous: true,
      rawFormat: "DD/MM/YYYY (assumed)",
    };
  }

  // Format: "Mar 14", "March 14"
  const monthNameMatch = trimmed.match(
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+(\d{1,2})$/i
  );
  if (monthNameMatch) {
    const monthStr = monthNameMatch[1];
    const day = parseInt(monthNameMatch[2]);
    const months: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    const month = months[monthStr.toLowerCase().slice(0, 3)];
    // Assume 2026 based on context
    return {
      date: new Date(2026, month, day),
      isAmbiguous: false,
      rawFormat: "Month DD",
    };
  }

  return { date: null, isAmbiguous: false, rawFormat: "UNKNOWN" };
}

// ─── Amount Parsing ──────────────────────────────────────────

export function parseAmount(raw: string): {
  value: number | null;
  wasFormatted: boolean;
} {
  const trimmed = raw.trim();
  // Remove commas and whitespace
  const cleaned = trimmed.replace(/,/g, "").replace(/\s/g, "");
  const value = parseFloat(cleaned);

  if (isNaN(value)) {
    return { value: null, wasFormatted: false };
  }

  const wasFormatted = trimmed !== String(value);
  return { value: Math.round(value * 100) / 100, wasFormatted };
}

// ─── Split Parsing ───────────────────────────────────────────

function parseParticipants(raw: string): string[] {
  return raw
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => normalizeName(p).normalized);
}

function parseSplitDetails(
  raw: string,
  splitType: string,
  participants: string[],
  totalAmount: number
): { details: ParsedSplitDetail[]; anomalies: Anomaly[]; rowIndex: number } {
  const anomalies: Anomaly[] = [];
  const details: ParsedSplitDetail[] = [];

  if (splitType === "equal" || !raw) {
    const share = Math.round((totalAmount / participants.length) * 100) / 100;
    participants.forEach((p) => {
      details.push({
        person: p,
        allocationType: "EQUAL",
        allocationValue: 1,
        calculatedAmount: share,
      });
    });
    return { details, anomalies, rowIndex: -1 };
  }

  // Parse "Name Value; Name Value" or "Value|Value" formats
  if (raw.includes(";")) {
    // Format: "Rohan 700; Priya 400; Meera 400"
    const parts = raw.split(";").map((s) => s.trim());

    for (const part of parts) {
      const match = part.match(/^(.+?)\s+([\d.%]+)%?$/);
      if (match) {
        const name = normalizeName(match[1]).normalized;
        const val = parseFloat(match[2]);

        let allocType: "PERCENTAGE" | "SHARE" | "EXACT" = "EXACT";
        if (splitType === "percentage" || part.includes("%")) allocType = "PERCENTAGE";
        else if (splitType === "share") allocType = "SHARE";

        details.push({
          person: name,
          allocationType: allocType,
          allocationValue: val,
          calculatedAmount: 0, // calculated below
        });
      }
    }
  } else if (raw.includes("|")) {
    // Format: "30|30|20|20"
    const values = raw.split("|").map((v) => parseFloat(v.trim()));

    participants.forEach((p, i) => {
      let allocType: "PERCENTAGE" | "SHARE" | "EXACT" = "EXACT";
      if (splitType === "percentage") allocType = "PERCENTAGE";
      else if (splitType === "share") allocType = "SHARE";

      details.push({
        person: p,
        allocationType: allocType,
        allocationValue: values[i] || 0,
        calculatedAmount: 0,
      });
    });
  }

  // Calculate amounts based on allocation type
  if (details.length > 0) {
    const firstType = details[0].allocationType;

    if (firstType === "PERCENTAGE") {
      const totalPct = details.reduce((s, d) => s + d.allocationValue, 0);
      details.forEach((d) => {
        d.calculatedAmount =
          Math.round((totalAmount * (d.allocationValue / 100)) * 100) / 100;
      });

      if (Math.abs(totalPct - 100) > 0.01) {
        anomalies.push({
          rowIndex: -1,
          type: "INVALID_PERCENTAGE_TOTAL",
          severity: "WARNING",
          description: `Percentages sum to ${totalPct}%, not 100%.`,
          suggestion: `Adjust percentages to total 100%.`,
        });
      }
    } else if (firstType === "SHARE") {
      const totalShares = details.reduce((s, d) => s + d.allocationValue, 0);
      details.forEach((d) => {
        d.calculatedAmount =
          Math.round((totalAmount * (d.allocationValue / totalShares)) * 100) / 100;
      });
    } else if (firstType === "EXACT") {
      details.forEach((d) => {
        d.calculatedAmount = d.allocationValue;
      });
    }
  }

  return { details, anomalies, rowIndex: -1 };
}

// ─── Settlement Detection ────────────────────────────────────

function isSettlement(description: string, splitType: string, notes: string): boolean {
  const combined = `${description} ${notes}`.toLowerCase();
  return (
    SETTLEMENT_KEYWORDS.some((kw) => new RegExp(kw, "i").test(combined)) ||
    (!splitType && combined.includes("paid"))
  );
}

// ─── Duplicate Detection ─────────────────────────────────────

function detectDuplicates(expenses: ParsedExpense[]): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const seen = new Map<string, number>();

  for (const exp of expenses) {
    // Fingerprint: normalized description + date + paidBy
    const descKey = exp.description.toLowerCase().replace(/[^a-z0-9]/g, "");
    const key = `${descKey}_${exp.date.toISOString().slice(0, 10)}_${exp.paidBy}`;

    if (seen.has(key)) {
      const prevIdx = seen.get(key)!;
      const prevExp = expenses.find((e) => e.rowIndex === prevIdx)!;

      if (prevExp.amount === exp.amount) {
        anomalies.push({
          rowIndex: exp.rowIndex,
          type: "DUPLICATE",
          severity: "WARNING",
          description: `Exact duplicate of row ${prevIdx + 1}: "${exp.description}" (${exp.amount} ${exp.currency}).`,
          suggestion: "Keep one and reject the other.",
        });
      } else {
        anomalies.push({
          rowIndex: exp.rowIndex,
          type: "CONFLICTING_DUPLICATE",
          severity: "CRITICAL",
          description: `Conflicting duplicate of row ${prevIdx + 1}: same event "${exp.description}" but amount differs (${prevExp.amount} vs ${exp.amount}).`,
          suggestion: "Review and choose the correct amount.",
        });
      }
    } else {
      seen.set(key, exp.rowIndex);
    }
  }

  return anomalies;
}

// ─── Membership Validation ───────────────────────────────────

export interface MembershipTimeline {
  name: string;
  joinedAt: Date;
  leftAt: Date | null;
}

export function checkMembership(
  person: string,
  expenseDate: Date,
  memberships: MembershipTimeline[]
): { isActive: boolean; violation?: string } {
  const membership = memberships.find(
    (m) => m.name.toLowerCase() === person.toLowerCase()
  );

  if (!membership) {
    return { isActive: false, violation: `${person} is not a known group member.` };
  }

  if (expenseDate < membership.joinedAt) {
    return {
      isActive: false,
      violation: `${person} joined on ${membership.joinedAt.toISOString().slice(0, 10)}, but this expense is dated ${expenseDate.toISOString().slice(0, 10)}.`,
    };
  }

  if (membership.leftAt && expenseDate > membership.leftAt) {
    return {
      isActive: false,
      violation: `${person} left on ${membership.leftAt.toISOString().slice(0, 10)}, but this expense is dated ${expenseDate.toISOString().slice(0, 10)}.`,
    };
  }

  return { isActive: true };
}

// ─── Main Import Pipeline ────────────────────────────────────

export function processCSVImport(
  csvText: string,
  memberships: MembershipTimeline[]
): ImportResult {
  const rawRows = parseCSV(csvText);
  const allAnomalies: Anomaly[] = [];
  const parsedExpenses: ParsedExpense[] = [];
  const settlements: ParsedExpense[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const rowIndex = i + 1; // 1-indexed (matches CSV line number, accounting for header)
    const rowAnomalies: Anomaly[] = [];

    // 1. Parse date
    const dateResult = parseDate(row.date);
    if (!dateResult.date) {
      rowAnomalies.push({
        rowIndex,
        type: "AMBIGUOUS_DATE",
        severity: "CRITICAL",
        description: `Cannot parse date: "${row.date}".`,
      });
    }
    if (dateResult.isAmbiguous) {
      rowAnomalies.push({
        rowIndex,
        type: "AMBIGUOUS_DATE",
        severity: "WARNING",
        description: `Date "${row.date}" is ambiguous (DD/MM vs MM/DD). Assumed ${dateResult.rawFormat}.`,
        suggestion: "Confirm the correct interpretation.",
      });
    }

    // 2. Parse amount
    const amountResult = parseAmount(row.amount);
    if (amountResult.value === null) {
      rowAnomalies.push({
        rowIndex,
        type: "INVALID_AMOUNT",
        severity: "CRITICAL",
        description: `Cannot parse amount: "${row.amount}".`,
      });
      continue; // Can't process this row further
    }
    if (amountResult.wasFormatted) {
      rowAnomalies.push({
        rowIndex,
        type: "AMOUNT_FORMAT",
        severity: "INFO",
        description: `Amount "${row.amount}" was normalized to ${amountResult.value}.`,
      });
    }

    // 3. Check zero and negative amounts
    if (amountResult.value === 0) {
      rowAnomalies.push({
        rowIndex,
        type: "ZERO_AMOUNT",
        severity: "WARNING",
        description: `Zero amount expense: "${row.description}".`,
        suggestion: "Review if this should be skipped.",
      });
    }
    if (amountResult.value < 0) {
      rowAnomalies.push({
        rowIndex,
        type: "NEGATIVE_AMOUNT",
        severity: "WARNING",
        description: `Negative amount (${amountResult.value}) for "${row.description}". Likely a refund.`,
        suggestion: "Treat as refund and adjust balances accordingly.",
      });
    }

    // 4. Normalize payer
    if (!row.paid_by || !row.paid_by.trim()) {
      rowAnomalies.push({
        rowIndex,
        type: "MISSING_PAYER",
        severity: "CRITICAL",
        description: `No payer specified for "${row.description}".`,
        suggestion: "Assign a payer before importing.",
      });
    }
    const payerResult = row.paid_by ? normalizeName(row.paid_by) : { normalized: "", wasAliased: false };
    if (payerResult.wasAliased) {
      rowAnomalies.push({
        rowIndex,
        type: "INCONSISTENT_NAME",
        severity: "INFO",
        description: `Payer "${row.paid_by}" normalized to "${payerResult.normalized}".`,
      });
    }

    // 5. Handle currency
    let currency: "INR" | "USD" = "INR";
    let exchangeRate = 1;
    if (!row.currency || !row.currency.trim()) {
      rowAnomalies.push({
        rowIndex,
        type: "MISSING_CURRENCY",
        severity: "WARNING",
        description: `No currency specified for "${row.description}". Defaulting to INR.`,
      });
    } else if (row.currency.trim().toUpperCase() === "USD") {
      currency = "USD";
      exchangeRate = USD_TO_INR;
      rowAnomalies.push({
        rowIndex,
        type: "CURRENCY_CONVERSION",
        severity: "INFO",
        description: `USD ${amountResult.value} converted to INR ${amountResult.value * USD_TO_INR} at rate 1 USD = ${USD_TO_INR} INR.`,
      });
    }

    const amountINR = Math.round(amountResult.value * exchangeRate * 100) / 100;

    // 6. Parse participants and check names
    const participants = parseParticipants(row.split_with);
    for (const p of participants) {
      const nameCheck = normalizeName(p);
      if (!KNOWN_MEMBERS.includes(nameCheck.normalized) && !nameCheck.normalized.includes("friend")) {
        // Check if this is a completely unknown person
        if (!KNOWN_MEMBERS.map((m) => m.toLowerCase()).includes(nameCheck.normalized.toLowerCase())) {
          rowAnomalies.push({
            rowIndex,
            type: "UNKNOWN_PARTICIPANT",
            severity: "CRITICAL",
            description: `Unknown participant "${p}" in "${row.description}".`,
            suggestion: "Add this person to the group or remove from split.",
          });
        }
      }
    }

    // 7. Check for settlement
    const settlementFlag = isSettlement(row.description, row.split_type, row.notes);
    if (settlementFlag) {
      rowAnomalies.push({
        rowIndex,
        type: "SETTLEMENT_AS_EXPENSE",
        severity: "WARNING",
        description: `"${row.description}" appears to be a settlement, not an expense.`,
        suggestion: "Import as a settlement record instead.",
      });
    }

    // 8. Parse split type
    const splitType = (row.split_type || "equal").toLowerCase().trim();
    let normalizedSplitType: "EQUAL" | "PERCENTAGE" | "SHARE" | "EXACT" = "EQUAL";
    if (splitType === "percentage") normalizedSplitType = "PERCENTAGE";
    else if (splitType === "share") normalizedSplitType = "SHARE";
    else if (splitType === "unequal") normalizedSplitType = "EXACT";

    if (!row.split_type || !row.split_type.trim()) {
      rowAnomalies.push({
        rowIndex,
        type: "MISSING_SPLIT_TYPE",
        severity: "INFO",
        description: `No split type specified for "${row.description}". Defaulting to equal.`,
      });
    }

    // 9. Check for split type conflicts (e.g., split_type says "equal" but split_details has shares)
    if (
      splitType === "equal" &&
      row.split_details &&
      row.split_details.trim()
    ) {
      rowAnomalies.push({
        rowIndex,
        type: "SPLIT_TYPE_CONFLICT",
        severity: "WARNING",
        description: `Split type is "equal" but split_details are provided: "${row.split_details}". Using equal split.`,
        suggestion: "Verify if equal split or custom split was intended.",
      });
    }

    // 10. Parse split details
    const splitResult = parseSplitDetails(
      row.split_details,
      splitType,
      participants,
      Math.abs(amountINR)
    );
    splitResult.anomalies.forEach((a) => {
      a.rowIndex = rowIndex;
      rowAnomalies.push(a);
    });

    // 11. Membership timeline checks
    if (dateResult.date) {
      for (const participant of participants) {
        const memberCheck = checkMembership(
          participant,
          dateResult.date,
          memberships
        );
        if (!memberCheck.isActive && memberCheck.violation) {
          rowAnomalies.push({
            rowIndex,
            type: "MEMBERSHIP_VIOLATION",
            severity: "WARNING",
            description: memberCheck.violation,
            suggestion: `Auto-exclude ${participant} from this expense split.`,
          });
        }
      }
      // Also check payer
      if (payerResult.normalized) {
        const payerCheck = checkMembership(
          payerResult.normalized,
          dateResult.date,
          memberships
        );
        if (!payerCheck.isActive && payerCheck.violation) {
          rowAnomalies.push({
            rowIndex,
            type: "MEMBERSHIP_VIOLATION",
            severity: "WARNING",
            description: `Payer: ${payerCheck.violation}`,
          });
        }
      }
    }

    // Build parsed expense
    const expense: ParsedExpense = {
      rowIndex,
      date: dateResult.date || new Date(),
      description: row.description,
      paidBy: payerResult.normalized,
      amount: amountResult.value,
      currency,
      exchangeRate,
      amountINR,
      splitType: normalizedSplitType,
      participants,
      splitDetails: splitResult.details,
      notes: row.notes,
      isSettlement: settlementFlag,
    };

    if (settlementFlag) {
      settlements.push(expense);
    } else {
      parsedExpenses.push(expense);
    }

    allAnomalies.push(...rowAnomalies);
  }

  // 12. Cross-row duplicate detection
  const dupeAnomalies = detectDuplicates([...parsedExpenses, ...settlements]);
  allAnomalies.push(...dupeAnomalies);

  return {
    totalRows: rawRows.length,
    parsedExpenses,
    anomalies: allAnomalies,
    settlements,
  };
}
