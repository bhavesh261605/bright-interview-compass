import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchJobRoles } from "@/lib/queries";
import { validateSalary, parseResume } from "@/lib/interview.functions";
import { SALARY_ALIGNMENT, formatMoney } from "@/lib/labels";
import { StatusPill } from "./ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Database } from "@/integrations/supabase/types";

type Candidate = Database["public"]["Tables"]["candidates"]["Row"];

export function CandidateForm({ initial, onSaved }: { initial?: Candidate; onSaved: (id: string) => void }) {
  const roles = useQuery({ queryKey: ["job_roles"], queryFn: fetchJobRoles });
  const [f, setF] = useState({
    full_name: initial?.full_name ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    job_role_id: initial?.job_role_id ?? "",
    experience_level: initial?.experience_level ?? "fresher",
    years_of_experience: String(initial?.years_of_experience ?? 0),
    current_company: initial?.current_company ?? "",
    current_location: initial?.current_location ?? "",
    skills: (initial?.skills ?? []).join(", "),
    recruiter_notes: initial?.recruiter_notes ?? "",
    notice_period_days: initial?.notice_period_days?.toString() ?? "",
    earliest_joining_date: initial?.earliest_joining_date ?? "",
    current_compensation: initial?.current_compensation?.toString() ?? "",
    expected_compensation: initial?.expected_compensation?.toString() ?? "",
    availability: initial?.availability ?? "",
    status: initial?.status ?? "ready",
  });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const readResume = async () => {
    if (!file) return;
    if (!["application/pdf", "image/png", "image/jpeg"].includes(file.type)) { toast.error("Resume reading works with PDF, PNG or JPG files."); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Resume must be under 10 MB."); return; }
    setReading(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      const r = await parseResume({ data: { base64: btoa(bin), mimeType: file.type } });
      if (!r.ok) { toast.error(r.error); return; }
      setF((p) => ({
        ...p,
        full_name: r.full_name || p.full_name, email: r.email || p.email, phone: r.phone || p.phone,
        current_company: r.current_company || p.current_company, current_location: r.current_location || p.current_location,
        experience_level: r.years_of_experience > 0 ? "experienced" : p.experience_level,
        years_of_experience: r.years_of_experience > 0 ? String(r.years_of_experience) : p.years_of_experience,
        skills: r.skills.length ? r.skills.join(", ") : p.skills,
        recruiter_notes: r.summary ? (p.recruiter_notes ? p.recruiter_notes + "\n\n" : "") + "Resume summary: " + r.summary : p.recruiter_notes,
      }));
      toast.success("Resume read — please check the filled details.");
    } catch { toast.error("Could not read the resume."); } finally { setReading(false); }
  };
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const salaryCheck = useQuery({
    queryKey: ["salary-check", f.job_role_id, f.expected_compensation],
    enabled: !!f.job_role_id && f.expected_compensation !== "",
    queryFn: () => validateSalary({ data: { jobRoleId: f.job_role_id, expected: Number(f.expected_compensation) } }),
  });

  const num = (v: string) => (v === "" ? null : Number(v));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const yrs = Number(f.years_of_experience);
    if (f.experience_level === "experienced" && (yrs < 0 || yrs > 6)) { toast.error("Experience must be between 0 and 6 years."); return; }
    if (file && file.size > 10 * 1024 * 1024) { toast.error("Resume must be under 10 MB."); return; }
    setBusy(true);
    try {
      const payload = {
        full_name: f.full_name.trim(),
        email: f.email.trim(),
        phone: f.phone || null,
        job_role_id: f.job_role_id || null,
        experience_level: f.experience_level,
        years_of_experience: f.experience_level === "fresher" ? 0 : yrs,
        current_company: f.current_company || null,
        current_location: f.current_location || null,
        skills: f.skills.split(",").map((s) => s.trim()).filter(Boolean),
        recruiter_notes: f.recruiter_notes || null,
        notice_period_days: num(f.notice_period_days),
        earliest_joining_date: f.earliest_joining_date || null,
        current_compensation: num(f.current_compensation),
        expected_compensation: num(f.expected_compensation),
        availability: f.availability || null,
        status: f.status,
      };
      let id = initial?.id;
      if (id) {
        const { error } = await supabase.from("candidates").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("candidates").insert(payload).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      if (file && id) {
        const path = `${id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("resumes").upload(path, file, { upsert: false });
        if (upErr) toast.error(`Candidate saved, but resume upload failed: ${upErr.message}`);
        else await supabase.from("candidates").update({ resume_path: path }).eq("id", id);
      }
      await supabase.from("audit_logs").insert({ action: initial ? "candidate.updated" : "candidate.created", entity_type: "candidate", entity_id: id });
      toast.success(initial ? "Candidate updated" : "Candidate added");
      onSaved(id!);
    } catch (err) {
      toast.error((err as { message?: string })?.message || "Could not save candidate");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <fieldset className="surface grid gap-4 p-5 sm:grid-cols-2">
        <legend className="eyebrow px-1">Personal & professional</legend>
        <F label="Full name *"><Input required value={f.full_name} onChange={(e) => set("full_name")(e.target.value)} /></F>
        <F label="Email *"><Input required type="email" value={f.email} onChange={(e) => set("email")(e.target.value)} /></F>
        <F label="Phone"><Input value={f.phone} onChange={(e) => set("phone")(e.target.value)} /></F>
        <F label="Job role">
          <Select value={f.job_role_id} onValueChange={set("job_role_id")}>
            <SelectTrigger><SelectValue placeholder={roles.data?.length ? "Select role" : "No roles yet — add in Salary Bands"} /></SelectTrigger>
            <SelectContent>{(roles.data ?? []).map((r) => <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>)}</SelectContent>
          </Select>
        </F>
        <F label="Experience level *">
          <Select value={f.experience_level} onValueChange={set("experience_level")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="fresher">Fresher</SelectItem>
              <SelectItem value="experienced">Experienced (0–6 years)</SelectItem>
            </SelectContent>
          </Select>
        </F>
        {f.experience_level === "experienced" && (
          <F label="Years of experience (0–6)"><Input type="number" min={0} max={6} step={0.5} value={f.years_of_experience} onChange={(e) => set("years_of_experience")(e.target.value)} /></F>
        )}
        <F label="Current company"><Input value={f.current_company} onChange={(e) => set("current_company")(e.target.value)} /></F>
        <F label="Current location"><Input value={f.current_location} onChange={(e) => set("current_location")(e.target.value)} /></F>
        <F label="Skills (comma separated)" wide><Input value={f.skills} onChange={(e) => set("skills")(e.target.value)} /></F>
        <F label="Resume (PDF/DOC, private)" wide>
          <div className="flex gap-2">
            <Input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Button type="button" variant="outline" disabled={!file || reading} onClick={() => void readResume()}>{reading ? "Reading…" : "Read resume & autofill"}</Button>
          </div>
          {initial?.resume_path && !file && <p className="mt-1 text-xs text-muted-foreground">A resume is on file. Uploading replaces it.</p>}
        </F>
        <F label="Recruiter notes" wide><Textarea rows={3} value={f.recruiter_notes} onChange={(e) => set("recruiter_notes")(e.target.value)} /></F>
      </fieldset>

      <fieldset className="surface grid gap-4 p-5 sm:grid-cols-2">
        <legend className="eyebrow px-1">HR information</legend>
        <F label="Notice period (days)"><Input type="number" min={0} value={f.notice_period_days} onChange={(e) => set("notice_period_days")(e.target.value)} /></F>
        <F label="Earliest joining date"><Input type="date" value={f.earliest_joining_date} onChange={(e) => set("earliest_joining_date")(e.target.value)} /></F>
        <F label="Current compensation (annual, optional)"><Input type="number" min={0} value={f.current_compensation} onChange={(e) => set("current_compensation")(e.target.value)} /></F>
        <F label="Expected compensation (annual)">
          <Input type="number" min={0} value={f.expected_compensation} onChange={(e) => set("expected_compensation")(e.target.value)} />
          {salaryCheck.data && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <StatusPill map={SALARY_ALIGNMENT} value={salaryCheck.data.alignment} />
              {salaryCheck.data.band && <span>Band {formatMoney(salaryCheck.data.band.min, salaryCheck.data.band.currency)} – {formatMoney(salaryCheck.data.band.max, salaryCheck.data.band.currency)}</span>}
            </div>
          )}
        </F>
        <F label="Availability for joining" wide><Input value={f.availability} placeholder="e.g. Immediate, after 30 days" onChange={(e) => set("availability")(e.target.value)} /></F>
        <p className="text-xs text-muted-foreground sm:col-span-2">We never collect age, religion, marital status or family status.</p>
      </fieldset>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : initial ? "Save changes" : "Add candidate"}</Button>
      </div>
    </form>
  );
}

function F({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
