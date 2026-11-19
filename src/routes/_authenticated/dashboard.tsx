import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Clock, MessagesSquare, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Empty, Kpi, Loading, PageHeader, Section, StatusPill } from "@/components/app/ui-bits";
import { CANDIDATE_STATUS, RECOMMENDATION, formatDate, passThroughRate } from "@/lib/labels";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Aria HR" }, { name: "description", content: "Recruiter dashboard for HR interviews." }] }),
  component: Dashboard,
});

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function Dashboard() {
  const q = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [c, i, s] = await Promise.all([
        supabase.from("candidates").select("id, full_name, status, created_at, job_roles(title)").order("created_at", { ascending: false }),
        supabase.from("interviews").select("id, status, started_at, completed_at, candidates(full_name)").order("started_at", { ascending: false }),
        supabase.from("scorecards").select("id, final_recommendation, reviewer_status, final_round_outcome, created_at, candidates(full_name)").order("created_at", { ascending: false }),
      ]);
      const evals = await supabase.from("interview_evaluations").select("red_flags");
      return { candidates: c.data ?? [], interviews: i.data ?? [], scorecards: s.data ?? [], evals: evals.data ?? [] };
    },
  });
  if (q.isLoading || !q.data) return <Loading />;
  const { candidates, interviews, scorecards, evals } = q.data;
  const conducted = interviews.filter((i) => i.status !== "in_progress").length;
  const pendingInterviews = candidates.filter((c) => c.status === "new" || c.status === "ready").length;
  const recommended = candidates.filter((c) => c.status === "recommended").length;
  const awaiting = scorecards.filter((s) => s.reviewer_status === "pending").length;
  const redFlags = evals.reduce((n, e) => n + (Array.isArray(e.red_flags) ? e.red_flags.length : 0), 0);
  const ptr = passThroughRate(scorecards.map((s) => s.final_round_outcome));

  const outcomes = Object.entries(RECOMMENDATION).map(([k, v]) => ({
    name: v.label,
    value: scorecards.filter((s) => s.final_recommendation === k).length,
  })).filter((d) => d.value > 0);
  const pipeline = Object.entries(CANDIDATE_STATUS).map(([k, v]) => ({ name: v.label.replace(" for Final Round", ""), value: candidates.filter((c) => c.status === k).length }));
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    const key = d.toISOString().slice(0, 10);
    return { day: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), count: interviews.filter((x) => x.started_at.slice(0, 10) === key).length };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Live figures from your interview records."
        actions={<Button asChild><Link to="/candidates/new">Add candidate</Link></Button>}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Total candidates" value={candidates.length} icon={Users} />
        <Kpi label="Interviews conducted" value={conducted} icon={MessagesSquare} />
        <Kpi label="Interviews pending" value={pendingInterviews} icon={Clock} />
        <Kpi label="Recommended" value={recommended} icon={CheckCircle2} hint="for final round" />
        <Kpi label="Awaiting review" value={awaiting} icon={ClipboardCheck} />
        <Kpi label="Red flags" value={redFlags} icon={AlertTriangle} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Candidate pipeline" className="lg:col-span-2">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={pipeline} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                <XAxis type="number" allowDecimals={false} fontSize={11} stroke="var(--muted-foreground)" />
                <YAxis type="category" dataKey="name" width={140} fontSize={11} stroke="var(--muted-foreground)" />
                <Tooltip />
                <Bar dataKey="value" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
        <Section title="Interview outcomes (AI advisory)">
          {outcomes.length === 0 ? (
            <Empty title="No evaluations yet" />
          ) : (
            <div className="h-64">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={outcomes} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {outcomes.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Section>
        <Section title="Interviews over the last 14 days" className="lg:col-span-2">
          <div className="h-56">
            <ResponsiveContainer>
              <LineChart data={days}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" fontSize={11} stroke="var(--muted-foreground)" />
                <YAxis allowDecimals={false} fontSize={11} stroke="var(--muted-foreground)" />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>
        <Section title="Pass-through to final round">
          <div className="text-4xl font-semibold tabular">{ptr == null ? "—" : `${ptr.toFixed(0)}%`}</div>
          <p className="mt-2 text-sm text-muted-foreground">
            Progressed ÷ candidates with a recorded final-round outcome.
            {ptr == null && " No outcomes recorded yet — record them on a scorecard."}
          </p>
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Recently added candidates">
          {candidates.length === 0 ? <Empty title="No candidates yet">Add your first candidate to begin.</Empty> : (
            <ul className="divide-y">
              {candidates.slice(0, 5).map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                  <Link to="/candidates/$candidateId" params={{ candidateId: c.id }} className="font-medium hover:text-primary">{c.full_name}</Link>
                  <StatusPill map={CANDIDATE_STATUS} value={c.status} />
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Recent scorecards & cases awaiting approval">
          {scorecards.length === 0 ? <Empty title="No scorecards yet" /> : (
            <ul className="divide-y">
              {scorecards.slice(0, 5).map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                  <Link to="/scorecards/$scorecardId" params={{ scorecardId: s.id }} className="font-medium hover:text-primary">
                    {(s.candidates as { full_name: string } | null)?.full_name}
                  </Link>
                  <span className="flex items-center gap-2">
                    {s.reviewer_status === "pending" && <StatusPill map={{ pending: { label: "Awaiting review", tone: "warning" } }} value="pending" />}
                    <span className="text-xs text-muted-foreground">{formatDate(s.created_at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
