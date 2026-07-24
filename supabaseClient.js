import { createClient } from "@supabase/supabase-js";

// Public browser credentials for the Tier One Bio Supabase project.
// These are safe to ship to the client — data access is protected by
// Row-Level Security policies on the database, not by hiding these keys.
const SUPABASE_URL = "https://nmafhetkofrekabqawgb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_lvnJ78JBM-vUduzJ6YtXEQ_BkA7idBD";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
