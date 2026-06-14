import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { calculateGroupBalances } from "@/lib/balanceEngine";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // 1. Fetch group
    const { data: group, error: gError } = await supabaseAdmin
      .from("groups")
      .select("*")
      .eq("slug", slug)
      .single();

    if (gError || !group) {
      return NextResponse.json(
        { error: gError?.message || "Group not found" },
        { status: 404 }
      );
    }

    // 2. Fetch memberships for this group
    const { data: memberships, error: memError } = await supabaseAdmin
      .from("group_memberships")
      .select("person_id, joined_at, left_at")
      .eq("group_id", group.id);

    if (memError) {
      return NextResponse.json({ error: memError.message }, { status: 500 });
    }

    const memberIds = (memberships || []).map((m: any) => m.person_id);
    if (memberIds.length === 0) {
      return NextResponse.json({
        balances: [],
        simplifiedDebts: [],
        traces: {},
      });
    }

    // 3. Fetch all persons in the database
    const { data: persons, error: pError } = await supabaseAdmin
      .from("persons")
      .select("*")
      .in("id", memberIds);

    if (pError) {
      return NextResponse.json({ error: pError.message }, { status: 500 });
    }

    // 4. Fetch active expenses
    const { data: expenses, error: expError } = await supabaseAdmin
      .from("expenses")
      .select("*")
      .eq("group_id", group.id)
      .eq("is_deleted", false);

    if (expError) {
      return NextResponse.json({ error: expError.message }, { status: 500 });
    }

    // 5. Fetch expense participants
    const expenseIds = (expenses || []).map((e: any) => e.id);
    let participants: any[] = [];
    if (expenseIds.length > 0) {
      const { data: partData, error: partError } = await supabaseAdmin
        .from("expense_participants")
        .select("*")
        .in("expense_id", expenseIds);

      if (partError) {
        return NextResponse.json({ error: partError.message }, { status: 500 });
      }
      participants = partData || [];
    }

    // 6. Fetch settlements
    const { data: settlements, error: setError } = await supabaseAdmin
      .from("settlements")
      .select("*")
      .eq("group_id", group.id);

    if (setError) {
      return NextResponse.json({ error: setError.message }, { status: 500 });
    }

    // 7. Populate relationships in memory (robust against join anomalies)
    const populatedExpenses = expenses.map((e: any) => {
      const paidBy = persons.find((p: any) => p.id === e.paid_by_id);
      const expParts = participants
        .filter((p: any) => p.expense_id === e.id)
        .map((p: any) => ({
          ...p,
          person: persons.find((person: any) => person.id === p.person_id),
        }));

      return {
        ...e,
        paid_by: paidBy,
        participants: expParts,
      };
    });

    const populatedSettlements = settlements.map((s: any) => ({
      ...s,
      payer: persons.find((p: any) => p.id === s.payer_id),
      receiver: persons.find((p: any) => p.id === s.receiver_id),
    }));

    // 8. Calculate balances using core engine
    const balanceSummary = calculateGroupBalances(
      persons,
      populatedExpenses,
      populatedSettlements
    );

    return NextResponse.json({
      group,
      persons,
      expenses: populatedExpenses,
      settlements: populatedSettlements,
      ...balanceSummary,
    });
  } catch (error: any) {
    console.error("Balances Calculation API Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
