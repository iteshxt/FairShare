// ─── Types for the CSV Import Pipeline ──────────────────────

export interface RawCSVRow {
  date: string;
  description: string;
  paid_by: string;
  amount: string;
  currency: string;
  split_type: string;
  split_with: string;
  split_details: string;
  notes: string;
}

export interface ParsedExpense {
  rowIndex: number;
  date: Date;
  description: string;
  paidBy: string;
  amount: number;
  currency: "INR" | "USD";
  exchangeRate: number;
  amountINR: number;
  splitType: "EQUAL" | "PERCENTAGE" | "SHARE" | "EXACT";
  participants: string[];
  splitDetails: ParsedSplitDetail[];
  notes: string;
  isSettlement: boolean;
}

export interface ParsedSplitDetail {
  person: string;
  allocationType: "EQUAL" | "PERCENTAGE" | "SHARE" | "EXACT";
  allocationValue: number;
  calculatedAmount: number;
}

export type AnomalyType =
  | "DUPLICATE"
  | "CONFLICTING_DUPLICATE"
  | "INCONSISTENT_NAME"
  | "MISSING_PAYER"
  | "MISSING_CURRENCY"
  | "MISSING_SPLIT_TYPE"
  | "INVALID_AMOUNT"
  | "NEGATIVE_AMOUNT"
  | "ZERO_AMOUNT"
  | "SETTLEMENT_AS_EXPENSE"
  | "CURRENCY_CONVERSION"
  | "INVALID_PERCENTAGE_TOTAL"
  | "SPLIT_TYPE_CONFLICT"
  | "MEMBERSHIP_VIOLATION"
  | "UNKNOWN_PARTICIPANT"
  | "AMBIGUOUS_DATE"
  | "AMOUNT_FORMAT";

export type AnomalySeverity = "INFO" | "WARNING" | "CRITICAL";

export interface Anomaly {
  rowIndex: number;
  type: AnomalyType;
  severity: AnomalySeverity;
  description: string;
  suggestion?: string;
}

export interface ImportResult {
  totalRows: number;
  parsedExpenses: ParsedExpense[];
  anomalies: Anomaly[];
  settlements: ParsedExpense[];
}

// ─── Balance Engine Types ────────────────────────────────────

export interface PersonBalance {
  personId: string;
  personName: string;
  totalPaid: number;
  totalOwed: number;
  netBalance: number; // positive = owed money, negative = owes money
}

export interface BalanceTrace {
  personName: string;
  expenses: ExpenseContribution[];
}

export interface ExpenseContribution {
  expenseId: string;
  description: string;
  date: string;
  paidBy: string;
  totalAmount: number;
  yourShare: number;
  youPaid: number;
  netEffect: number; // youPaid - yourShare
  splitType: string;
  allocationType: string;
  allocationValue: number;
}

export interface SimplifiedDebt {
  from: string;
  to: string;
  amount: number;
}

export interface GroupBalanceSummary {
  balances: PersonBalance[];
  simplifiedDebts: SimplifiedDebt[];
  traces: Record<string, BalanceTrace>;
}

// ─── Database row types (matching supabase schema) ───────────

export interface DBGroup {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface DBPerson {
  id: string;
  name: string;
  user_id: string | null;
}

export interface DBGroupMembership {
  id: string;
  group_id: string;
  person_id: string;
  joined_at: string;
  left_at: string | null;
  person?: DBPerson;
}

export interface DBExpense {
  id: string;
  group_id: string;
  description: string;
  amount: number;
  currency: string;
  exchange_rate: number;
  paid_by_id: string;
  expense_date: string;
  created_by_id: string | null;
  is_deleted: boolean;
  notes: string | null;
  created_at: string;
  paid_by?: DBPerson;
  participants?: DBExpenseParticipant[];
}

export interface DBExpenseParticipant {
  id: string;
  expense_id: string;
  person_id: string;
  allocation_type: string;
  allocation_value: number;
  calculated_amount: number;
  person?: DBPerson;
}

export interface DBSettlement {
  id: string;
  group_id: string;
  payer_id: string;
  receiver_id: string;
  amount: number;
  settlement_date: string;
  created_at: string;
  payer?: DBPerson;
  receiver?: DBPerson;
}
