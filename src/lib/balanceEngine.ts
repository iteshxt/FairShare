import {
  DBPerson,
  DBExpense,
  DBSettlement,
  GroupBalanceSummary,
  PersonBalance,
  SimplifiedDebt,
  BalanceTrace,
  ExpenseContribution,
} from "./types";

/**
 * Calculates net balances, simplified debts, and audit traces for all persons in a group.
 * Decoupled from the database to allow pure unit testing and client/server reuse.
 */
export function calculateGroupBalances(
  persons: DBPerson[],
  expenses: DBExpense[],
  settlements: DBSettlement[]
): GroupBalanceSummary {
  const balances: Record<string, PersonBalance> = {};
  const traces: Record<string, BalanceTrace> = {};

  // Initialize balances and traces for all persons
  persons.forEach((person) => {
    balances[person.id] = {
      personId: person.id,
      personName: person.name,
      totalPaid: 0,
      totalOwed: 0,
      netBalance: 0,
    };
    traces[person.name] = {
      personName: person.name,
      expenses: [],
    };
  });

  const activeExpenses = expenses.filter((e) => !e.is_deleted);

  // Process all active expenses
  activeExpenses.forEach((expense) => {
    const amountINR = Math.round(Number(expense.amount) * Number(expense.exchange_rate) * 100) / 100;
    const payerName = expense.paid_by?.name || persons.find((p) => p.id === expense.paid_by_id)?.name || "Unknown";

    // 1. Credit the payer
    if (balances[expense.paid_by_id]) {
      balances[expense.paid_by_id].totalPaid =
        Math.round((balances[expense.paid_by_id].totalPaid + amountINR) * 100) / 100;
    }

    // 2. Charge participants
    const participants = expense.participants || [];
    participants.forEach((part) => {
      const partId = part.person_id;
      const partAmt = Math.round(Number(part.calculated_amount) * 100) / 100;

      if (balances[partId]) {
        balances[partId].totalOwed =
          Math.round((balances[partId].totalOwed + partAmt) * 100) / 100;
      }
    });

    // 3. Add to traces for auditable explainability
    persons.forEach((person) => {
      const isPayer = person.id === expense.paid_by_id;
      const participant = participants.find((p) => p.person_id === person.id);

      if (isPayer || participant) {
        const youPaid = isPayer ? amountINR : 0;
        const yourShare = participant ? Math.round(Number(participant.calculated_amount) * 100) / 100 : 0;
        const netEffect = Math.round((youPaid - yourShare) * 100) / 100;

        const contribution: ExpenseContribution = {
          expenseId: expense.id,
          description: expense.description,
          date: expense.expense_date,
          paidBy: payerName,
          totalAmount: amountINR,
          youPaid,
          yourShare,
          netEffect,
          splitType: expense.participants?.[0]?.allocation_type || "EQUAL",
          allocationType: participant?.allocation_type || "EQUAL",
          allocationValue: participant ? Number(participant.allocation_value) : 0,
        };

        traces[person.name].expenses.push(contribution);
      }
    });
  });

  // Process settlements
  settlements.forEach((settlement) => {
    const amount = Math.round(Number(settlement.amount) * 100) / 100;
    const payerId = settlement.payer_id;
    const receiverId = settlement.receiver_id;

    const payerName = settlement.payer?.name || persons.find((p) => p.id === payerId)?.name || "Unknown";
    const receiverName = settlement.receiver?.name || persons.find((p) => p.id === receiverId)?.name || "Unknown";

    // Adjust net balances directly (settlements reduce debt/credit outstanding)
    // Payer paid money -> gets credited (net balance goes up towards 0 or positive)
    if (balances[payerId]) {
      balances[payerId].totalPaid =
        Math.round((balances[payerId].totalPaid + amount) * 100) / 100;
    }
    // Receiver got money -> gets debited (net balance goes down towards 0 or negative)
    if (balances[receiverId]) {
      balances[receiverId].totalOwed =
        Math.round((balances[receiverId].totalOwed + amount) * 100) / 100;
    }

    // Add settlement to traces
    if (traces[payerName]) {
      traces[payerName].expenses.push({
        expenseId: settlement.id,
        description: `Settlement: Paid ${receiverName}`,
        date: settlement.settlement_date,
        paidBy: payerName,
        totalAmount: amount,
        youPaid: amount,
        yourShare: 0,
        netEffect: amount,
        splitType: "EQUAL",
        allocationType: "EQUAL",
        allocationValue: 1,
      });
    }

    if (traces[receiverName]) {
      traces[receiverName].expenses.push({
        expenseId: settlement.id,
        description: `Settlement: Received from ${payerName}`,
        date: settlement.settlement_date,
        paidBy: payerName,
        totalAmount: amount,
        youPaid: 0,
        yourShare: amount,
        netEffect: -amount,
        splitType: "EQUAL",
        allocationType: "EQUAL",
        allocationValue: 1,
      });
    }
  });

  // Calculate net balances (net = totalPaid - totalOwed)
  const balanceList = Object.values(balances).map((bal) => {
    bal.netBalance = Math.round((bal.totalPaid - bal.totalOwed) * 100) / 100;
    return bal;
  });

  // Sort traces chronologically
  Object.keys(traces).forEach((name) => {
    traces[name].expenses.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  });

  // Greedy Debt Simplification
  const simplifiedDebts = simplifyDebts(balanceList);

  return {
    balances: balanceList,
    simplifiedDebts,
    traces,
  };
}

/**
 * Greedy debt simplification algorithm.
 * Minimizes total number of transactions required to settle all debts.
 */
function simplifyDebts(balances: PersonBalance[]): SimplifiedDebt[] {
  const debtors: { name: string; amount: number }[] = [];
  const creditors: { name: string; amount: number }[] = [];

  balances.forEach((bal) => {
    if (bal.netBalance < -0.01) {
      debtors.push({ name: bal.personName, amount: -bal.netBalance });
    } else if (bal.netBalance > 0.01) {
      creditors.push({ name: bal.personName, amount: bal.netBalance });
    }
  });

  // Sort: largest debtors and creditors first to greedily settle largest debts
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const debts: SimplifiedDebt[] = [];

  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];

    const amount = Math.min(debtor.amount, creditor.amount);
    const roundedAmount = Math.round(amount * 100) / 100;

    if (roundedAmount > 0) {
      debts.push({
        from: debtor.name,
        to: creditor.name,
        amount: roundedAmount,
      });
    }

    debtor.amount -= amount;
    creditor.amount -= amount;

    if (debtor.amount < 0.01) {
      dIdx++;
    }
    if (creditor.amount < 0.01) {
      cIdx++;
    }
  }

  return debts;
}
