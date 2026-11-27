import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "recruiter" | "reviewer";

interface AuthState {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  displayName: string;
  loading: boolean;
  refreshRoles: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const currentUid = useRef<string | undefined>(undefined);

  const loadRoles = async (uid: string | undefined) => {
    if (!uid) {
      setRoles([]);
      setDisplayName("");
      return;
    }
    const [{ data }, { data: prof }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("profiles").select("full_name").eq("id", uid).maybeSingle(),
    ]);
    // Ignore results that arrive after the user has changed.
    if (currentUid.current !== uid) return;
    setRoles((data ?? []).map((r) => r.role as AppRole));
    setDisplayName(prof?.full_name ?? "");
  };

  const applySession = (s: Session | null) => {
    const uid = s?.user.id;
    if (currentUid.current !== uid) {
      // Identity changed: drop everything cached for the previous account.
      void qc.cancelQueries();
      qc.clear();
      currentUid.current = uid;
    }
    setSession(s);
    setTimeout(() => {
      void loadRoles(uid).finally(() => setLoading(false));
    }, 0);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => applySession(s));
    supabase.auth.getSession().then(({ data }) => applySession(data.session));
    return () => sub.subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Ctx.Provider
      value={{
        session,
        user: session?.user ?? null,
        roles,
        displayName,
        loading,
        refreshRoles: () => loadRoles(session?.user.id),
        signOut: async () => {
          await qc.cancelQueries();
          qc.clear();
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}
