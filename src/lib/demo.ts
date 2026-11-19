import { supabase } from "@/integrations/supabase/client";
import { demoHrSignIn } from "./interview.functions";

/** Signs the browser in as the HR demo admin (no password form). */
export async function signInAsHrDemo() {
  const { tokenHash } = await demoHrSignIn();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (error) throw error;
}
