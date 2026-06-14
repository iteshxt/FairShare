import { createClient } from "@supabase/supabase-js";

let _supabaseClient: any = null;

export const supabase = new Proxy({} as any, {
  get(target, prop) {
    if (!_supabaseClient) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";
      _supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    }
    return Reflect.get(_supabaseClient, prop);
  }
});
