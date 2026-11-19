import { createFileRoute, Link, Navigate, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  BarChart3, Bell, ClipboardCheck, FileText, Gauge, IndianRupee, LogOut, Menu, MessagesSquare, Search, Settings, Users, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Loading } from "@/components/app/ui-bits";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: Layout,
});

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: Gauge },
  { to: "/candidates", label: "Candidates", icon: Users },
  { to: "/interviews", label: "Interviews", icon: MessagesSquare },
  { to: "/scorecards", label: "Scorecards", icon: FileText },
  { to: "/review-queue", label: "Review Queue", icon: ClipboardCheck },
  { to: "/salary-bands", label: "Salary Bands", icon: IndianRupee },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function Layout() {
  const { user, roles, loading, signOut } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const pending = useQuery({
    queryKey: ["pending-reviews"],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("scorecards")
        .select("id, review_reasons, candidates(full_name)")
        .eq("reviewer_status", "pending")
        .order("created_at", { ascending: false })
        .limit(8);
      return data ?? [];
    },
  });

  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" />;
  if (roles.length === 0)
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div className="surface max-w-md p-6">
          <h1 className="font-semibold">Awaiting access</h1>
          <p className="mt-2 text-sm text-muted-foreground">Your account has no role yet. Ask an admin to grant you access.</p>
          <button className="mt-4 text-sm text-primary" onClick={() => signOut()}>Sign out</button>
        </div>
      </div>
    );

  const current = NAV.find((n) => loc.pathname.startsWith(n.to));
  const title = loc.pathname.startsWith("/interview-summary") ? "Interview Summary" : (current?.label ?? "Aria HR");
  const name = (user.user_metadata?.["full_name"] as string) || user.email || "";

  return (
    <div className="flex min-h-screen">
      <aside
        className={cn(
          "no-print fixed inset-y-0 left-0 z-40 w-60 shrink-0 bg-sidebar text-sidebar-foreground transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center justify-between px-4">
          <Link to="/dashboard" className="flex items-center gap-2 text-sidebar-accent-foreground">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">A</div>
            <span className="font-semibold">Aria HR</span>
          </Link>
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-4 w-4" /></button>
        </div>
        <nav className="space-y-0.5 px-2 py-2">
          {NAV.map((n) => {
            const active = loc.pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <n.icon className={cn("h-4 w-4", active && "text-sidebar-primary")} />
                {n.label}
                {n.to === "/review-queue" && (pending.data?.length ?? 0) > 0 && (
                  <span className="ml-auto rounded-full bg-sidebar-primary px-1.5 text-[10px] font-semibold text-sidebar-primary-foreground">
                    {pending.data?.length}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="absolute bottom-0 w-full border-t border-sidebar-border p-4 text-xs">
          Roles: {roles.join(", ")}
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-foreground/30 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-card/90 px-4 backdrop-blur">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <h1 className="text-sm font-semibold">{title}</h1>
          <form
            className="ml-auto hidden w-72 md:block"
            onSubmit={(e) => {
              e.preventDefault();
              nav({ to: "/candidates", search: { q } });
            }}
          >
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search candidates…" className="h-9 pl-8" />
            </div>
          </form>
          <Popover>
            <PopoverTrigger className="relative ml-auto rounded-md p-2 hover:bg-muted md:ml-0" aria-label="Notifications">
              <Bell className="h-4 w-4" />
              {(pending.data?.length ?? 0) > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />}
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <div className="border-b px-3 py-2 text-sm font-semibold">Awaiting human review</div>
              {(pending.data ?? []).length === 0 && <p className="p-3 text-sm text-muted-foreground">Nothing pending.</p>}
              {(pending.data ?? []).map((p) => (
                <Link key={p.id} to="/scorecards/$scorecardId" params={{ scorecardId: p.id }} className="block border-b px-3 py-2 text-sm last:border-0 hover:bg-muted">
                  <div className="font-medium">{(p.candidates as { full_name: string } | null)?.full_name}</div>
                  <div className="text-xs text-muted-foreground">{p.review_reasons?.[0]}</div>
                </Link>
              ))}
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger className="grid h-8 w-8 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {name.slice(0, 1).toUpperCase()}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="font-normal">
                <div className="text-sm font-medium">{name}</div>
                <div className="text-xs text-muted-foreground">{user.email}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => nav({ to: "/settings" })}><Settings className="mr-2 h-4 w-4" />Settings</DropdownMenuItem>
              <DropdownMenuItem onClick={() => signOut()}><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
