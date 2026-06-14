import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

// Create a new expense with splits
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      groupId,
      description,
      amount,
      currency,
      exchangeRate,
      paidById,
      expenseDate,
      notes,
      participants, // Array of { personId, allocationType, allocationValue, calculatedAmount }
    } = body;

    if (!groupId || !description || !amount || !paidById || !expenseDate || !participants || participants.length === 0) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Insert core expense
    const { data: expense, error: expError } = await supabaseAdmin
      .from("expenses")
      .insert({
        group_id: groupId,
        description,
        amount: Number(amount),
        currency: currency || "INR",
        exchange_rate: Number(exchangeRate || 1),
        paid_by_id: paidById,
        expense_date: expenseDate,
        notes: notes || "",
      })
      .select()
      .single();

    if (expError || !expense) {
      return NextResponse.json({ error: expError?.message || "Failed to create expense" }, { status: 500 });
    }

    // 2. Insert expense participants
    const participantsToInsert = participants.map((p: any) => ({
      expense_id: expense.id,
      person_id: p.personId,
      allocation_type: p.allocationType || "EQUAL",
      allocation_value: Number(p.allocationValue || 1),
      calculated_amount: Number(p.calculatedAmount),
    }));

    const { error: partError } = await supabaseAdmin
      .from("expense_participants")
      .insert(participantsToInsert);

    if (partError) {
      // Rollback expense insert
      await supabaseAdmin.from("expenses").delete().eq("id", expense.id);
      return NextResponse.json({ error: partError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, expense });
  } catch (error: any) {
    console.error("Expense Create API Error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// Update an existing expense
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id,
      description,
      amount,
      currency,
      exchangeRate,
      paidById,
      expenseDate,
      notes,
      participants,
    } = body;

    if (!id || !description || !amount || !paidById || !expenseDate || !participants || participants.length === 0) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Update core expense
    const { error: expError } = await supabaseAdmin
      .from("expenses")
      .update({
        description,
        amount: Number(amount),
        currency: currency || "INR",
        exchange_rate: Number(exchangeRate || 1),
        paid_by_id: paidById,
        expense_date: expenseDate,
        notes: notes || "",
      })
      .eq("id", id);

    if (expError) {
      return NextResponse.json({ error: expError.message }, { status: 500 });
    }

    // 2. Delete old participants and insert new ones
    const { error: delError } = await supabaseAdmin
      .from("expense_participants")
      .delete()
      .eq("expense_id", id);

    if (delError) {
      return NextResponse.json({ error: delError.message }, { status: 500 });
    }

    const participantsToInsert = participants.map((p: any) => ({
      expense_id: id,
      person_id: p.personId,
      allocation_type: p.allocationType || "EQUAL",
      allocation_value: Number(p.allocationValue || 1),
      calculated_amount: Number(p.calculatedAmount),
    }));

    const { error: partError } = await supabaseAdmin
      .from("expense_participants")
      .insert(participantsToInsert);

    if (partError) {
      return NextResponse.json({ error: partError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Expense Update API Error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// Soft delete an expense
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing expense ID" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("expenses")
      .update({ is_deleted: true })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Expense Delete API Error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
