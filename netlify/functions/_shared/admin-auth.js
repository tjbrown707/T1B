import { createClient } from "@supabase/supabase-js";
import { hasOrderManagerRole } from "../../../src/data/order-management.js";
import { getEnv, readBearerToken } from "./http.js";

// Every staff function uses the same authorization boundary. The browser token
// proves identity, Supabase verifies it server-side, and authorization comes
// only from protected app_metadata (never customer-editable user_metadata).
export async function authenticateOrderManager(request, fail) {
  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("staff function: Supabase env vars missing");
    return { response: fail(500, "Staff operations are not configured.") };
  }

  const token = readBearerToken(request);
  if (!token) return { response: fail(401, "Sign in to continue.") };

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return { response: fail(401, "Your session has expired. Sign in again.") };
  }
  if (!data.user.email_confirmed_at) {
    return { response: fail(403, "Confirm this account's email before using staff operations.") };
  }
  if (!hasOrderManagerRole(data.user)) {
    console.warn(`staff function: forbidden user ${data.user.id}`);
    return { response: fail(403, "This account does not have staff access.") };
  }
  return { supabase, user: data.user };
}
