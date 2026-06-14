import { createClient } from "@supabase/supabase-js";

let _supabaseAdmin: any = null;

export const supabaseAdmin = new Proxy({} as any, {
  get(target, prop) {
    if (!_supabaseAdmin) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-key";
      _supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    }
    return Reflect.get(_supabaseAdmin, prop);
  }
});
