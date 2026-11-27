import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { z } from "zod";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { fetchJobRoles } from "@/lib/queries";
import { CANDIDATE_STATUS, EXPERIENCE, formatDate } from "@/lib/labels";
import { Empty, Loading, PageHeader, StatusPill } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/candidates/")({
  validateSearch: z.object({ q: z.string().optional() }),
  head: () => ({ meta: [{ title: "Candidates — WAE HR" }, { name: "description", content: "Manage HR interview candidates." }, { property: "og:title", content: "Candidates — WAE HR" }, { property: "og:description", content: "Manage HR interview candidates." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Candidates,
});

function Candidates() {
  const { roles: myRoles } = useAuth();
  const canRun = can(myRoles, "run_interviews");
  const { q: initialQ } = Route.useSearch();
  const [q, setQ] = useState(initialQ ?? "");
  const [exp, setExp] = useState("all");
  const [status, setStatus] = useState("all");
  const [role, setRole] = useState("all");
  const [sort, setSort] = useState<"desc" | "asc">("desc");
  const roles = useQuery({ queryKey: ["job_roles"], queryFn: fetchJobRoles });
  const list = useQuery({
    queryKey: ["candidates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("candidates").select("*, job_roles(title)").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const rows = useMemo(() => {
    let r = list.data ?? [];
    const s = q.toLowerCase().trim();
    if (s) r = r.filter((c) => [c.full_name, c.email, ...(c.skills ?? [])].some((x) => x?.toLowerCase().includes(s)));
    if (exp !== "all") r = r.filter((c) => c.experience_level === exp);
    if (status !== "all") r = r.filter((c) => c.status === status);
    if (role !== "all") r = r.filter((c) => c.job_role_id === role);
    return sort === "asc" ? [...r].reverse() : r;
  }, [list.data, q, exp, status, role, sort]);

  return (
    <div>
      <PageHeader
        title="Candidates"
        description="Profiles, HR details and interview status."
        actions={canRun && <Button asChild><Link to="/candidates/new"><Plus className="mr-1 h-4 w-4" />Add candidate</Link></Button>}
      />
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Input placeholder="Search name, email, skill…" value={q} onChange={(e) => setQ(e.target.value)} className="lg:col-span-2" />
        <Select value={exp} onValueChange={setExp}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All experience</SelectItem>
            <SelectItem value="fresher">Fresher</SelectItem>
            <SelectItem value="experienced">Experienced (0–6)</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(CANDIDATE_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {(roles.data ?? []).map((r) => <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => setSort(sort === "desc" ? "asc" : "desc")} title="Sort by date">
            {sort === "desc" ? "Newest" : "Oldest"}
          </Button>
        </div>
      </div>
      {list.isLoading ? <Loading /> : rows.length === 0 ? (
        <Empty title="No candidates found">Add a candidate or adjust your filters.</Empty>
      ) : (
        <div className="surface overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Experience</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link to="/candidates/$candidateId" params={{ candidateId: c.id }} className="font-medium hover:text-primary">{c.full_name}</Link>
                    <div className="text-xs text-muted-foreground">{c.email}</div>
                  </TableCell>
                  <TableCell>{(c.job_roles as { title: string } | null)?.title ?? "—"}</TableCell>
                  <TableCell>{EXPERIENCE[c.experience_level]}{c.experience_level === "experienced" && ` · ${c.years_of_experience} yrs`}</TableCell>
                  <TableCell><StatusPill map={CANDIDATE_STATUS} value={c.status} /></TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(c.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
