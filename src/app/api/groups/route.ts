import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

// List all groups
export async function GET(req: NextRequest) {
  try {
    const { data: groups, error } = await supabaseAdmin
      .from("groups")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(groups || []);
  } catch (error: any) {
    console.error("List Groups API Error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// Create a new group
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Group name is required" }, { status: 400 });
    }

    // Generate unique slug
    let baseSlug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    if (!baseSlug) {
      baseSlug = "group";
    }

    let slug = baseSlug;
    let count = 0;

    // Resolve slug conflicts
    while (true) {
      const { data: existing } = await supabaseAdmin
        .from("groups")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();

      if (!existing) {
        break;
      }

      count++;
      slug = `${baseSlug}-${count}`;
    }

    const { data: group, error } = await supabaseAdmin
      .from("groups")
      .insert({ name: name.trim(), slug })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, group });
  } catch (error: any) {
    console.error("Create Group API Error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
