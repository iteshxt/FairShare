import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { parseCSV, processCSVImport } from "@/lib/csvParser";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const groupId = formData.get("groupId") as string;

    if (!file || !groupId) {
      return NextResponse.json(
        { error: "Missing file or groupId" },
        { status: 400 }
      );
    }

    const csvText = await file.text();

    // 1. Fetch group memberships from DB to check timelines
    const { data: membershipsData, error: memError } = await supabaseAdmin
      .from("group_memberships")
      .select(`
        joined_at,
        left_at,
        persons (
          id,
          name
        )
      `)
      .eq("group_id", groupId);

    if (memError) {
      return NextResponse.json({ error: memError.message }, { status: 500 });
    }

    const memberships = (membershipsData || []).map((m: any) => ({
      name: m.persons.name,
      joinedAt: new Date(m.joined_at),
      leftAt: m.left_at ? new Date(m.left_at) : null,
    }));

    // 2. Process CSV import and detect anomalies
    const rawRows = parseCSV(csvText);
    const importResult = processCSVImport(csvText, memberships);

    // 3. Create Import Batch in DB
    const { data: batch, error: batchError } = await supabaseAdmin
      .from("import_batches")
      .insert({
        group_id: groupId,
        source_file: file.name,
        status: "REVIEWING",
        summary: {
          totalRows: importResult.totalRows,
          parsedCount: importResult.parsedExpenses.length,
          settlementCount: importResult.settlements.length,
          anomalyCount: importResult.anomalies.length,
        },
      })
      .select()
      .single();

    if (batchError || !batch) {
      return NextResponse.json(
        { error: batchError?.message || "Failed to create batch" },
        { status: 500 }
      );
    }

    // 4. Insert imported rows into staging table
    const rowsToInsert = [
      ...importResult.parsedExpenses.map((exp: any) => ({
        batch_id: batch.id,
        row_index: exp.rowIndex,
        raw_data: {
          raw: rawRows[exp.rowIndex - 1],
          parsed: exp,
          isSettlement: false,
        },
        status: "PENDING",
      })),
      ...importResult.settlements.map((set: any) => ({
        batch_id: batch.id,
        row_index: set.rowIndex,
        raw_data: {
          raw: rawRows[set.rowIndex - 1],
          parsed: set,
          isSettlement: true,
        },
        status: "PENDING",
      })),
    ];

    const { data: insertedRows, error: rowsError } = await supabaseAdmin
      .from("imported_rows")
      .insert(rowsToInsert)
      .select("id, row_index");

    if (rowsError || !insertedRows) {
      // Cleanup batch if failed
      await supabaseAdmin.from("import_batches").delete().eq("id", batch.id);
      return NextResponse.json(
        { error: rowsError?.message || "Failed to insert imported rows" },
        { status: 500 }
      );
    }

    // 5. Insert anomalies into staging table
    if (importResult.anomalies.length > 0) {
      const anomaliesToInsert = importResult.anomalies.map((anom: any) => {
        const row = insertedRows.find((r: any) => r.row_index === anom.rowIndex);
        return {
          row_id: row ? row.id : insertedRows[0].id, // fallback to first row if index mismatch
          type: anom.type,
          severity: anom.severity,
          description: anom.description,
          status: "UNRESOLVED",
        };
      });

      const { error: anomsError } = await supabaseAdmin
        .from("anomalies")
        .insert(anomaliesToInsert);

      if (anomsError) {
        console.error("Error inserting anomalies:", anomsError);
      }
    }

    return NextResponse.json({
      batchId: batch.id,
      summary: batch.summary,
    });
  } catch (error: any) {
    console.error("Import API Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
