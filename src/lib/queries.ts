import { supabase } from "@/integrations/supabase/client";

export async function fetchJobRoles() {
  const { data, error } = await supabase.from("job_roles").select("*").order("title");
  if (error) throw error;
  return data;
}

export function newClientId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
