import waeLogo from "@/assets/wae_logo.png.asset.json";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Briefcase, FlaskConical, KeyRound, PlayCircle, ShieldAlert, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { signInAsHrDemo } from "@/lib/demo";
import { createFreshDemoSession, getDemoPresets } from "@/lib/interview.functions";
import { ViewSwitcher } from "@/components/app/view-switcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "WAE HR — AI HR Interviewer demo" },
      { name: "description", content: "Switch between the candidate interview room and the HR dashboard in one click." },
      { property: "og:title", content: "WAE HR — AI HR Interviewer demo" },
      { property: "og:description", content: "Switch between the candidate interview room and the HR dashboard in one click." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { user, roles } = useAuth();
  const nav = useNavigate();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const presets = useQuery({ queryKey: ["demo-presets", user?.id], queryFn: () => getDemoPresets() });
  const hr = !!user && roles.length > 0;

  const asHr = async (to: () => void) => {
    if (!hr && presets.data?.enabled === false) {
      nav({ to: "/login" });
      return;
    }
    setBusy("hr");
    try {
      if (!hr) await signInAsHrDemo();
      to();
    } catch {
      toast.error("HR demo sign-in failed. Try again.");
    } finally {
      setBusy(null);
    }
  };
  const openToken = () => {
    const m = code.trim().match(/[0-9a-f-]{36}/i);
    if (!m) {
      toast.error("Paste a valid interview link or code");
      return;
    }
    nav({ to: "/interview/$token", params: { token: m[0] } });
  };
  const fresh = async (category: "fresher" | "experienced") => {
    setBusy(category);
    try {
      const { token } = await createFreshDemoSession({ data: { category } });
      nav({ to: "/interview/$token", params: { token } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create session");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-card/90 px-4 py-2.5 backdrop-blur">
        <img src={waeLogo.url} alt="WAE logo" className="h-8 w-auto rounded bg-card px-1" />
        <span className="font-semibold">WAE HR</span>
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
          <ViewSwitcher />
          {hr ? (
            <span className="hidden rounded-md bg-success/10 px-2 py-1 text-xs font-medium text-success sm:inline">HR demo mode on</span>
          ) : presets.data?.enabled === false ? (
            <Button size="sm" variant="outline" asChild><Link to="/login">HR sign in</Link></Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => asHr(() => {})} disabled={busy === "hr"}>
              <KeyRound className="mr-1 h-3.5 w-3.5" />{busy === "hr" ? "Signing in…" : "Sign in as HR Demo"}
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
        <div>
          <div className="eyebrow">Live demo</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Structured AI HR interviews, two perspectives.</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Candidates join with a private link — no account, no password. HR reviews scorecards, salary alignment and red flags behind a role gate.</p>
        </div>

        {presets.data?.enabled !== false && <section className="surface p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><FlaskConical className="h-4 w-4 text-primary" />Demo presets</div>
          <div className="grid gap-3 md:grid-cols-3">
            <Preset
              title="Active interview session"
              text={presets.data?.active[0] ? `${presets.data.active[0].name} is mid-interview` : "No live session yet — start a fresh one"}
              cta="Join as candidate"
              disabled={!presets.data?.active[0]}
              onClick={() => presets.data?.active[0] && nav({ to: "/interview/$token", params: { token: presets.data.active[0].token } })}
            />
            <Preset
              title="Completed with exceptions"
              text={presets.data?.exception ? `${presets.data.exception.name}: salary / flag review needed` : "Appears after an interview is flagged"}
              cta="Open as HR"
              icon={ShieldAlert}
              disabled={!presets.data?.exception || busy === "hr"}
              onClick={() => presets.data?.exception && asHr(() => nav({ to: "/scorecards/$scorecardId", params: { scorecardId: presets.data!.exception!.scorecardId } }))}
            />
            <div className="rounded-md border p-3">
              <div className="text-sm font-medium">Fresh session</div>
              <p className="mt-1 text-xs text-muted-foreground">New demo candidate with a separate question set.</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => fresh("fresher")} disabled={!!busy}>{busy === "fresher" ? "…" : "Fresher"}</Button>
                <Button size="sm" variant="outline" onClick={() => fresh("experienced")} disabled={!!busy}>{busy === "experienced" ? "…" : "0–6 yrs"}</Button>
              </div>
            </div>
          </div>
        </section>}

        <div className="grid gap-4 md:grid-cols-2">
          <section className="surface p-5">
            <div className="flex items-center gap-2 font-semibold"><UserRound className="h-4 w-4 text-primary" />Candidate interview room</div>
            <p className="mt-1 text-sm text-muted-foreground">Paste the interview link HR sent you.</p>
            <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); openToken(); }}>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="https://…/interview/xxxxxxxx-…" />
              <Button type="submit" aria-label="Open interview"><ArrowRight className="h-4 w-4" /></Button>
            </form>
            <p className="mt-3 text-xs text-muted-foreground">Candidates never see HR notes, salary bands, scores, red flags or approvals.</p>
          </section>
          <section className="surface p-5">
            <div className="flex items-center gap-2 font-semibold"><Briefcase className="h-4 w-4 text-primary" />HR dashboard</div>
            <p className="mt-1 text-sm text-muted-foreground">Candidates, interviews, scorecards, review queue, salary bands and analytics.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => asHr(() => nav({ to: "/dashboard" }))} disabled={busy === "hr"}>
                <PlayCircle className="mr-1 h-4 w-4" />{hr ? "Open HR dashboard" : "Enter as HR Demo"}
              </Button>
              {!hr && <Button variant="ghost" asChild><Link to="/login">Use my own account</Link></Button>}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function Preset({ title, text, cta, onClick, disabled, icon: Icon = PlayCircle }: { title: string; text: string; cta: string; onClick: () => void; disabled?: boolean; icon?: typeof PlayCircle }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-sm font-medium">{title}</div>
      <p className="mt-1 text-xs text-muted-foreground">{text}</p>
      <Button size="sm" variant="outline" className="mt-3" onClick={onClick} disabled={disabled}><Icon className="mr-1 h-3.5 w-3.5" />{cta}</Button>
    </div>
  );
}
