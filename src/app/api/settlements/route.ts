import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { groupId, payerId, receiverId, amount, settlementDate } = body;

    if (!groupId || !payerId || !receiverId || !amount || !settlementDate) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { data: settlement, error } = await supabaseAdmin
      .from("settlements")
      .insert({
        group_id: groupId,
        payer_id: payerId,
        receiver_id: receiverId,
        amount: Number(amount),
        settlement_date: settlementDate,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, settlement });
  } catch (error: any) {
    console.error("Settlement Create API Error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
