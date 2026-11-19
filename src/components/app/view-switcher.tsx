import { Link, useLocation } from "@tanstack/react-router";
import { Briefcase, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

/** HR View ↔ Candidate View toggle for live demos. */
export function ViewSwitcher() {
  const { pathname } = useLocation();
  const candidate = pathname === "/" || pathname.startsWith("/interview/");
  const base = "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors";
  return (
    <div className="flex rounded-md border bg-muted p-0.5" role="tablist" aria-label="Switch view">
      <Link to="/" className={cn(base, candidate ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
        <UserRound className="h-3.5 w-3.5" />Candidate view
      </Link>
      <Link to="/dashboard" className={cn(base, !candidate ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
        <Briefcase className="h-3.5 w-3.5" />HR view
      </Link>
    </div>
  );
}
