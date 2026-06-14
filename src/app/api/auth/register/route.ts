import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, password } = body;

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanName = name.trim();

    // 1. Check if user already exists
    const { data: existingUser } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json({ error: "User already exists with this email" }, { status: 400 });
    }

    // 2. Hash the password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 3. Create the user
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .insert({
        name: cleanName,
        email: cleanEmail,
        password_hash: passwordHash,
      })
      .select()
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: userError?.message || "Failed to create user" }, { status: 500 });
    }

    // 4. Link or create Person record
    // Look for a person with the same name who doesn't have a linked user account yet
    const { data: existingPerson } = await supabaseAdmin
      .from("persons")
      .select("id")
      .eq("name", cleanName)
      .is("user_id", null)
      .maybeSingle();

    if (existingPerson) {
      // Link user to existing person
      await supabaseAdmin
        .from("persons")
        .update({ user_id: user.id })
        .eq("id", existingPerson.id);
    } else {
      // Create a new person linked to this user
      await supabaseAdmin
        .from("persons")
        .insert({
          name: cleanName,
          user_id: user.id,
        });
    }

    return NextResponse.json({ success: true, user: { id: user.id, name: user.name, email: user.email } });
  } catch (error: any) {
    console.error("Registration API Error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
