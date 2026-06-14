import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params;

    // 1. Fetch the batch details
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

    // 2. Fetch all imported rows for this batch
    const { data: rows, error: rowsError } = await supabaseAdmin
      .from("imported_rows")
      .select("*")
      .eq("batch_id", batchId)
      .order("row_index", { ascending: true });

    if (rowsError) {
      return NextResponse.json({ error: rowsError.message }, { status: 500 });
    }

    // 3. Fetch all anomalies for the rows in this batch
    const rowIds = (rows || []).map((r) => r.id);
    let anomalies: any[] = [];

    if (rowIds.length > 0) {
      const { data: anomsData, error: anomsError } = await supabaseAdmin
        .from("anomalies")
        .select("*")
        .in("row_id", rowIds);

      if (anomsError) {
        return NextResponse.json({ error: anomsError.message }, { status: 500 });
      }
      anomalies = anomsData || [];
    }

    // 4. Combine rows and their anomalies
    const rowsWithAnomalies = rows.map((row) => ({
      ...row,
      anomalies: anomalies.filter((a) => a.row_id === row.id),
    }));

    return NextResponse.json({
      batch,
      rows: rowsWithAnomalies,
    });
  } catch (error: any) {
    console.error("Fetch Staging API Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
