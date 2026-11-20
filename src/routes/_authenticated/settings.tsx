import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/lib/auth";
import { EVALUATION_COMPETENCIES } from "@/lib/interview-prompts";
import { PageHeader, Section } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — WAE HR" }, { name: "description", content: "Workspace settings." }, { property: "og:title", content: "Settings — WAE HR" }, { property: "og:description", content: "Workspace settings." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: SettingsPage,
});

const MODELS = [
  "google/gemini-3-flash-preview",
  "google/gemini-3.8-flash",
  "google/gemini-3.1-pro-preview",
  "google/gemini-4-argon",
  "google/gemini-3.1-flash-lite",
];
const ROLES: AppRole[] = ["admin", "recruiter", "reviewer"];

function SettingsPage() {
  const { user, roles, refreshRoles } = useAuth();
  const isAdmin = roles.includes("admin");
  const qc = useQueryClient();
  const [name, setName] = useState("");

  const profile = useQuery({
    queryKey: ["my-profile"],
    queryFn: async () => (await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle()).data,
  });
  useEffect(() => { setName(profile.data?.full_name ?? ""); }, [profile.data]);
  const settings = useQuery({
    queryKey: ["app_settings"],
    queryFn: async () => (await supabase.from("app_settings").select("*")).data ?? [],
  });
  const model = (settings.data?.find((s) => s.key === "ai_model")?.value as string) ?? MODELS[0];
  const weights = (settings.data?.find((s) => s.key === "competency_weights")?.value as Record<string, number>) ?? {};
  const [w, setW] = useState<Record<string, number>>({});
  useEffect(() => setW(weights), [settings.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const team = useQuery({
    queryKey: ["team"],
    enabled: isAdmin,
    queryFn: async () => {
      const [p, r] = await Promise.all([supabase.from("profiles").select("*").order("created_at"), supabase.from("user_roles").select("*")]);
      return (p.data ?? []).map((x) => ({ ...x, roles: (r.data ?? []).filter((y) => y.user_id === x.id).map((y) => y.role as AppRole) }));
    },
  });
  const auditQ = useQuery({
    queryKey: ["audit"],
    enabled: isAdmin,
    queryFn: async () => (await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(50)).data ?? [],
  });

  const saveName = async () => {
    const { error } = await supabase.from("profiles").update({ full_name: name }).eq("id", user!.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile saved");
  };
  const saveSetting = async (key: string, value: unknown) => {
    const { error } = await supabase.from("app_settings").upsert({ key, value: value as never, updated_at: new Date().toISOString() });
    if (error) { toast.error(error.message); return; }
    await supabase.from("audit_logs").insert({ action: "settings.updated", entity_type: "app_settings", metadata: { key } });
    qc.invalidateQueries({ queryKey: ["app_settings"] });
    toast.success("Saved");
  };
  const toggleRole = async (uid: string, role: AppRole, on: boolean) => {
    const { error } = on
      ? await supabase.from("user_roles").insert({ user_id: uid, role })
      : await supabase.from("user_roles").delete().eq("user_id", uid).eq("role", role);
    if (error) { toast.error(error.message); return; }
    await supabase.from("audit_logs").insert({ action: on ? "role.granted" : "role.revoked", entity_type: "user", entity_id: uid, metadata: { role } });
    qc.invalidateQueries({ queryKey: ["team"] });
    if (uid === user!.id) refreshRoles();
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Profile, AI configuration, team roles and audit log." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Your profile">
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="text-sm text-muted-foreground">{user?.email} · {roles.join(", ")}</div>
            <Button size="sm" onClick={saveName}>Save</Button>
          </div>
        </Section>
        <Section title="AI interviewer model (Gemini)">
          <div className="space-y-3">
            <Select value={model} onValueChange={(v) => saveSetting("ai_model", v)} disabled={!isAdmin}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MODELS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Used for interviews and evaluations. Calls go directly to Google Gemini using your GEMINI_API_KEY (optionally overridden by GEMINI_MODEL). {!isAdmin && "Only admins can change this."}
            </p>
          </div>
        </Section>
      </div>

      <Section title="Competency weighting (configurable, informational)">
        <div className="grid gap-3 sm:grid-cols-4">
          {EVALUATION_COMPETENCIES.map((c) => (
            <div key={c.key} className="space-y-1">
              <Label className="text-xs">{c.name}</Label>
              <Input type="number" min={0} max={5} step={0.5} value={w[c.key] ?? 1} disabled={!isAdmin} onChange={(e) => setW({ ...w, [c.key]: Number(e.target.value) })} />
            </div>
          ))}
        </div>
        {isAdmin && <Button size="sm" className="mt-3" onClick={() => saveSetting("competency_weights", w)}>Save weights</Button>}
        <p className="mt-2 text-xs text-muted-foreground">Default weights are equal (an assumption). No pass/fail threshold is applied.</p>
      </Section>

      {isAdmin && (
        <>
          <Section title="Team & roles">
            <Table>
              <TableHeader><TableRow><TableHead>Member</TableHead>{ROLES.map((r) => <TableHead key={r} className="capitalize">{r}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {(team.data ?? []).map((m) => (
                  <TableRow key={m.id}>
                    <TableCell><div className="font-medium">{m.full_name}</div><div className="text-xs text-muted-foreground">{m.email}</div></TableCell>
                    {ROLES.map((r) => (
                      <TableCell key={r}>
                        <Checkbox checked={m.roles.includes(r)} disabled={m.id === user!.id && r === "admin"} onCheckedChange={(v) => toggleRole(m.id, r, !!v)} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
          <Section title="Audit log (latest 50)">
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead>Actor</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(auditQ.data ?? []).map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</TableCell>
                      <TableCell className="font-mono text-xs">{a.action}</TableCell>
                      <TableCell className="text-xs">{a.entity_type}</TableCell>
                      <TableCell className="text-xs">{team.data?.find((t) => t.id === a.actor_id)?.full_name ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
