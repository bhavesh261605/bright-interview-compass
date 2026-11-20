import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, MessagesSquare, PauseCircle, TrendingUp, XCircle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { fetchJobRoles } from "@/lib/queries";
import { SALARY_ALIGNMENT, passThroughRate } from "@/lib/labels";
import { Kpi, Loading, PageHeader, Section } from "@/components/app/ui-bits";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Analytics — WAE HR" }, { name: "description", content: "Hiring funnel analytics." }, { property: "og:title", content: "Analytics — WAE HR" }, { property: "og:description", content: "Hiring funnel analytics." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Analytics,
});

function Analytics() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [role, setRole] = useState("all");
  const [cat, setCat] = useState("all");
  const roles = useQuery({ queryKey: ["job_roles"], queryFn: fetchJobRoles });
  const q = useQuery({
    queryKey: ["analytics"],
    queryFn: async () => {
      const { data } = await supabase
        .from("interviews")
        .select("id, status, started_at, job_role_id, experience_category, candidate_id, candidates(status), scorecards(salary_alignment, final_recommendation, final_round_outcome), interview_evaluations(red_flags)");
      return data ?? [];
    },
  });
  const rows = useMemo(() => (q.data ?? []).filter((i) => {
    const d = i.started_at.slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (role !== "all" && i.job_role_id !== role) return false;
    if (cat !== "all" && i.experience_category !== cat) return false;
    return true;
  }), [q.data, from, to, role, cat]);
  if (q.isLoading) return <Loading />;

  const sc = (i: (typeof rows)[number]) => {
    const s = i.scorecards as unknown;
    return (Array.isArray(s) ? s[0] : s) as { salary_alignment: string; final_recommendation: string; final_round_outcome: string | null } | null;
  };
  const ev = (i: (typeof rows)[number]) => {
    const e = i.interview_evaluations as unknown;
    return (Array.isArray(e) ? e[0] : e) as { red_flags: unknown[] } | null;
  };
  const completed = rows.filter((i) => i.status !== "in_progress").length;
  const cs = (i: (typeof rows)[number]) => (i.candidates as { status: string } | null)?.status;
  const recommended = rows.filter((i) => cs(i) === "recommended").length;
  const notRec = rows.filter((i) => cs(i) === "not_recommended").length;
  const hold = rows.filter((i) => cs(i) === "on_hold" || cs(i) === "human_review").length;
  const flags = rows.reduce((n, i) => n + (ev(i)?.red_flags?.length ?? 0), 0);
  const ptr = passThroughRate(rows.map((i) => sc(i)?.final_round_outcome));
  const salaryDist = Object.entries(SALARY_ALIGNMENT).map(([k, v]) => ({ name: v.label, value: rows.filter((i) => sc(i)?.salary_alignment === k).length }));

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" description="Calculated from recorded interviews only." />
      <div className="grid gap-2 sm:grid-cols-4">
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All roles</SelectItem>{(roles.data ?? []).map((r) => <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All categories</SelectItem><SelectItem value="fresher">Fresher</SelectItem><SelectItem value="experienced">Experienced (0–6)</SelectItem></SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Total interviews" value={rows.length} icon={MessagesSquare} />
        <Kpi label="Completed" value={completed} icon={CheckCircle2} />
        <Kpi label="Recommended" value={recommended} icon={TrendingUp} />
        <Kpi label="Not recommended" value={notRec} icon={XCircle} />
        <Kpi label="On hold / in review" value={hold} icon={PauseCircle} />
        <Kpi label="Red flags" value={flags} icon={AlertTriangle} />
        <Kpi label="Pass-through to final" value={ptr == null ? "—" : `${ptr.toFixed(0)}%`} icon={TrendingUp} hint="progressed ÷ recorded outcomes" />
      </div>
      <Section title="Salary alignment distribution">
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={salaryDist}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" fontSize={11} stroke="var(--muted-foreground)" />
              <YAxis allowDecimals={false} fontSize={11} stroke="var(--muted-foreground)" />
              <Tooltip />
              <Bar dataKey="value" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>
    </div>
  );
}
