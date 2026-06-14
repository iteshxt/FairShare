import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params;
    const body = await req.json();
    const { resolutions } = body; // Map of row_id -> { status, parsed }

    if (!resolutions) {
      return NextResponse.json({ error: "Missing resolutions map" }, { status: 400 });
    }

    // 1. Fetch batch details to get group_id
    const { data: batch, error: batchError } = await supabaseAdmin
      .from("import_batches")
      .select("*")
      .eq("id", batchId)
      .single();

    if (batchError || !batch) {
      return NextResponse.json(
        { error: batchError?.message || "Batch not found" },
        { status: 404 }
      );
    }
    const groupId = batch.group_id;

    // 2. Fetch all persons in the database to map names to IDs
    const { data: existingPersons, error: pError } = await supabaseAdmin
      .from("persons")
      .select("*");
    if (pError) {
      return NextResponse.json({ error: pError.message }, { status: 500 });
    }

    const personMap = new Map<string, string>(); // Name (lowercase) -> ID
    existingPersons?.forEach((p) => {
      personMap.set(p.name.toLowerCase().trim(), p.id);
    });

    // Helper to resolve or create a Person
    const resolvePersonId = async (name: string): Promise<string> => {
      const cleanName = name.trim();
      const lowerName = cleanName.toLowerCase();
      if (personMap.has(lowerName)) {
        return personMap.get(lowerName)!;
      }

      // Create new person in DB
      const { data: newPerson, error: createError } = await supabaseAdmin
        .from("persons")
        .insert({ name: cleanName })
        .select()
        .single();

      if (createError || !newPerson) {
        throw new Error(`Failed to create person "${cleanName}": ${createError?.message}`);
      }

      // Add new person to group memberships
      const { error: memError } = await supabaseAdmin
        .from("group_memberships")
        .insert({
          group_id: groupId,
          person_id: newPerson.id,
          joined_at: "2026-02-01", // Default joined date (start of group)
        });

      if (memError) {
        console.error("Error creating group membership for new person:", memError);
      }

      personMap.set(lowerName, newPerson.id);
      return newPerson.id;
    };

    // 3. Fetch imported rows to process
    const { data: rows, error: rowsError } = await supabaseAdmin
      .from("imported_rows")
      .select("*")
      .eq("batch_id", batchId);

    if (rowsError) {
      return NextResponse.json({ error: rowsError.message }, { status: 500 });
    }

    let importedExpensesCount = 0;
    let importedSettlementsCount = 0;
    let rejectedCount = 0;

    // 4. Process each row
    for (const row of rows) {
      const resolution = resolutions[row.id];
      if (!resolution) continue; // Skip if no resolution provided

      const status = resolution.status; // 'APPROVED' | 'REJECTED' | 'SKIPPED'
      const parsedData = resolution.parsed || row.raw_data.parsed;
      const isSettlement = row.raw_data.isSettlement;

      // Update imported row status
      await supabaseAdmin
        .from("imported_rows")
        .update({ status: status === "APPROVED" ? "APPROVED" : "REJECTED" })
        .eq("id", row.id);

      // Update associated anomalies to resolved/ignored
      await supabaseAdmin
        .from("anomalies")
        .update({
          status: status === "APPROVED" ? "RESOLVED" : "IGNORED",
          resolution: { action: status, resolvedAt: new Date().toISOString() },
        })
        .eq("row_id", row.id);

      if (status !== "APPROVED") {
        rejectedCount++;
        continue;
      }

      // Commit approved rows to core tables
      if (isSettlement) {
        // Resolve payer and receiver IDs
        // Raw CSV names might have been edited by the user, or normalized.
        // Let's find receiver. Settlements usually have a notes field or description like "Rohan paid Aisha"
        // Let's parsing receiver from parsedData.splitWith or parsedData.description/notes
        // If parsedData.participants contains a receiver, use that.
        // If it's a settlement, let's look at splitDetails or custom fields.
        let payerName = parsedData.paidBy;
        // Settlements in CSV are: date, description (Aisha paid back Rohan), paid_by (Aisha), split_with (Rohan), amount (500)
        // So the payer is paidBy, and receiver is in participants[0] or split_with.
        let receiverName = parsedData.participants?.[0] || "";

        if (!receiverName && parsedData.description) {
          // Fallback parsing from description "X paid back Y"
          const desc = parsedData.description.toLowerCase();
          if (desc.includes("paid back")) {
            const parts = desc.split("paid back");
            receiverName = parts[1]?.trim();
          } else if (desc.includes("settled")) {
            const parts = desc.split("settled");
            receiverName = parts[1]?.trim();
          }
        }

        if (!payerName || !receiverName) {
          console.error("Missing payer or receiver for settlement row:", row.row_index);
          continue;
        }

        const payerId = await resolvePersonId(payerName);
        const receiverId = await resolvePersonId(receiverName);

        const { error: setInsertError } = await supabaseAdmin
          .from("settlements")
          .insert({
            group_id: groupId,
            payer_id: payerId,
            receiver_id: receiverId,
            amount: Number(parsedData.amount),
            settlement_date: new Date(parsedData.date).toISOString().slice(0, 10),
          });

        if (setInsertError) {
          throw new Error(`Failed to insert settlement: ${setInsertError.message}`);
        }
        importedSettlementsCount++;
      } else {
        // Expense
        const payerId = await resolvePersonId(parsedData.paidBy);

        // Insert expense
        const { data: newExp, error: expInsertError } = await supabaseAdmin
          .from("expenses")
          .insert({
            group_id: groupId,
            description: parsedData.description,
            amount: Number(parsedData.amount),
            currency: parsedData.currency,
            exchange_rate: Number(parsedData.exchangeRate || 1),
            paid_by_id: payerId,
            expense_date: new Date(parsedData.date).toISOString().slice(0, 10),
            notes: parsedData.notes || "",
          })
          .select()
          .single();

        if (expInsertError || !newExp) {
          throw new Error(`Failed to insert expense: ${expInsertError?.message}`);
        }

        // Insert participants
        const participants = parsedData.splitDetails || [];
        const partInserts = [];

        for (const part of participants) {
          const personId = await resolvePersonId(part.person);
          partInserts.push({
            expense_id: newExp.id,
            person_id: personId,
            allocation_type: part.allocationType || "EQUAL",
            allocation_value: Number(part.allocationValue || 1),
            calculated_amount: Number(part.calculatedAmount),
          });
        }

        if (partInserts.length > 0) {
          const { error: partInsertError } = await supabaseAdmin
            .from("expense_participants")
            .insert(partInserts);

          if (partInsertError) {
            throw new Error(`Failed to insert expense participants: ${partInsertError.message}`);
          }
        }
        importedExpensesCount++;
      }
    }

    // 5. Update batch status to COMPLETED
    await supabaseAdmin
      .from("import_batches")
      .update({
        status: "COMPLETED",
        summary: {
          ...batch.summary,
          importedExpensesCount,
          importedSettlementsCount,
          rejectedCount,
        },
      })
      .eq("id", batchId);

    return NextResponse.json({
      success: true,
      summary: {
        importedExpensesCount,
        importedSettlementsCount,
        rejectedCount,
      },
    });
  } catch (error: any) {
    console.error("Finalize API Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
