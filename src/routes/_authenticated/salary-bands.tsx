import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fetchJobRoles } from "@/lib/queries";
import { validateSalary } from "@/lib/interview.functions";
import { SALARY_ALIGNMENT, formatDate, formatMoney } from "@/lib/labels";
import { Empty, PageHeader, Pill, Section, StatusPill } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/salary-bands")({
  head: () => ({ meta: [{ title: "Salary bands — Aria HR" }, { name: "description", content: "Approved salary bands by job role." }] }),
  component: SalaryBands,
});

function SalaryBands() {
  const { roles: myRoles, user } = useAuth();
  const isAdmin = myRoles.includes("admin");
  const qc = useQueryClient();
  const jobRoles = useQuery({ queryKey: ["job_roles"], queryFn: fetchJobRoles });
  const bands = useQuery({
    queryKey: ["salary_bands"],
    queryFn: async () => (await supabase.from("salary_bands").select("*, job_roles(title)").order("created_at", { ascending: false })).data ?? [],
  });
  const profiles = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => (await supabase.from("profiles").select("id, full_name")).data ?? [],
  });
  const who = (id: string | null) => profiles.data?.find((p) => p.id === id)?.full_name ?? "—";

  const [role, setRole] = useState({ title: "", description: "", experience_category: "both" });
  const [band, setBand] = useState({ job_role_id: "", min: "", max: "", currency: "INR", effective_from: new Date().toISOString().slice(0, 10) });
  const [check, setCheck] = useState({ job_role_id: "", amount: "" });
  const [result, setResult] = useState<Awaited<ReturnType<typeof validateSalary>> | null>(null);

  const addRole = async () => {
    if (!role.title.trim()) { toast.error("Title required"); return; }
    const { data, error } = await supabase.from("job_roles").insert({ ...role, title: role.title.trim() }).select("id").single();
    if (error) { toast.error(error.message); return; }
    await supabase.from("audit_logs").insert({ action: "job_role.created", entity_type: "job_role", entity_id: data.id });
    setRole({ title: "", description: "", experience_category: "both" });
    qc.invalidateQueries({ queryKey: ["job_roles"] });
    toast.success("Job role added");
  };
  const addBand = async () => {
    const min = Number(band.min), max = Number(band.max);
    if (!band.job_role_id || band.min === "" || band.max === "") { toast.error("Role, minimum and maximum required"); return; }
    if (max < min) { toast.error("Maximum must be ≥ minimum"); return; }
    const { data, error } = await supabase.from("salary_bands").insert({
      job_role_id: band.job_role_id, minimum_salary: min, maximum_salary: max, currency: band.currency.toUpperCase(),
      effective_from: band.effective_from, created_by: user!.id, updated_by: user!.id,
    }).select("id").single();
    if (error) { toast.error(error.message); return; }
    await supabase.from("audit_logs").insert({ action: "salary_band.created", entity_type: "salary_band", entity_id: data.id, metadata: { min, max } });
    setBand({ ...band, min: "", max: "" });
    qc.invalidateQueries({ queryKey: ["salary_bands"] });
    toast.success("Salary band saved");
  };
  const toggleBand = async (id: string, v: boolean) => {
    const { error } = await supabase.from("salary_bands").update({ is_active: v, updated_by: user!.id, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await supabase.from("audit_logs").insert({ action: "salary_band.status_changed", entity_type: "salary_band", entity_id: id, metadata: { active: v } });
    qc.invalidateQueries({ queryKey: ["salary_bands"] });
  };
  const delBand = async (id: string) => {
    const { error } = await supabase.from("salary_bands").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    await supabase.from("audit_logs").insert({ action: "salary_band.deleted", entity_type: "salary_band", entity_id: id });
    qc.invalidateQueries({ queryKey: ["salary_bands"] });
  };
  const runCheck = async () => {
    if (!check.job_role_id) { toast.error("Select a role"); return; }
    setResult(await validateSalary({ data: { jobRoleId: check.job_role_id, expected: check.amount === "" ? null : Number(check.amount) } }));
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Salary bands" description="Approved bands by role. Comparisons are calculated by the system, never by the AI." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Salary band check">
          <div className="space-y-3">
            <Select value={check.job_role_id} onValueChange={(v) => setCheck({ ...check, job_role_id: v })}>
              <SelectTrigger><SelectValue placeholder="Job role" /></SelectTrigger>
              <SelectContent>{(jobRoles.data ?? []).map((r) => <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>)}</SelectContent>
            </Select>
            <Input type="number" min={0} placeholder="Expected annual salary" value={check.amount} onChange={(e) => setCheck({ ...check, amount: e.target.value })} />
            <Button className="w-full" variant="outline" onClick={runCheck}>Check alignment</Button>
            {result && (
              <div className="rounded-md bg-muted p-3 text-sm">
                <StatusPill map={SALARY_ALIGNMENT} value={result.alignment} />
                {result.band && <p className="mt-2 text-xs text-muted-foreground">Band {formatMoney(result.band.min, result.band.currency)} – {formatMoney(result.band.max, result.band.currency)}</p>}
                {result.requiresHumanReview && <p className="mt-2 text-xs">Requires human approval before any offer.</p>}
              </div>
            )}
          </div>
        </Section>
        {isAdmin ? (
          <>
            <Section title="Add job role">
              <div className="space-y-3">
                <Input placeholder="Title, e.g. Software Engineer" value={role.title} onChange={(e) => setRole({ ...role, title: e.target.value })} />
                <Select value={role.experience_category} onValueChange={(v) => setRole({ ...role, experience_category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Freshers & experienced</SelectItem>
                    <SelectItem value="fresher">Freshers</SelectItem>
                    <SelectItem value="experienced">Experienced (0–6)</SelectItem>
                  </SelectContent>
                </Select>
                <Textarea rows={3} placeholder="Role description / context" value={role.description} onChange={(e) => setRole({ ...role, description: e.target.value })} />
                <Button className="w-full" onClick={addRole}><Plus className="mr-1 h-4 w-4" />Add role</Button>
              </div>
            </Section>
            <Section title="Add salary band">
              <div className="space-y-3">
                <Select value={band.job_role_id} onValueChange={(v) => setBand({ ...band, job_role_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Job role" /></SelectTrigger>
                  <SelectContent>{(jobRoles.data ?? []).map((r) => <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>)}</SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Minimum</Label><Input type="number" min={0} value={band.min} onChange={(e) => setBand({ ...band, min: e.target.value })} /></div>
                  <div><Label className="text-xs">Maximum</Label><Input type="number" min={0} value={band.max} onChange={(e) => setBand({ ...band, max: e.target.value })} /></div>
                  <div><Label className="text-xs">Currency</Label><Input maxLength={3} value={band.currency} onChange={(e) => setBand({ ...band, currency: e.target.value })} /></div>
                  <div><Label className="text-xs">Effective from</Label><Input type="date" value={band.effective_from} onChange={(e) => setBand({ ...band, effective_from: e.target.value })} /></div>
                </div>
                <Button className="w-full" onClick={addBand}>Save band</Button>
              </div>
            </Section>
          </>
        ) : (
          <Section title="Permissions" className="lg:col-span-2">
            <p className="text-sm text-muted-foreground">Only administrators can configure job roles and salary bands.</p>
          </Section>
        )}
      </div>

      <Section title="Approved bands">
        {(bands.data ?? []).length === 0 ? <Empty title="No salary bands yet" /> : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Role</TableHead><TableHead>Range</TableHead><TableHead>Effective</TableHead><TableHead>Status</TableHead><TableHead>Created by</TableHead><TableHead>Updated by</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {bands.data!.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{(b.job_roles as { title: string } | null)?.title}</TableCell>
                    <TableCell className="tabular">{formatMoney(b.minimum_salary, b.currency)} – {formatMoney(b.maximum_salary, b.currency)}</TableCell>
                    <TableCell>{formatDate(b.effective_from)}</TableCell>
                    <TableCell>{isAdmin ? <Switch checked={b.is_active} onCheckedChange={(v) => toggleBand(b.id, v)} /> : <Pill tone={b.is_active ? "success" : "neutral"}>{b.is_active ? "Active" : "Inactive"}</Pill>}</TableCell>
                    <TableCell className="text-muted-foreground">{who(b.created_by)}</TableCell>
                    <TableCell className="text-muted-foreground">{who(b.updated_by)}</TableCell>
                    <TableCell>{isAdmin && <Button size="icon" variant="ghost" onClick={() => delBand(b.id)} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>
    </div>
  );
}
