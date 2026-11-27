import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Opens / copies the unique no-login candidate interview link. */
export function CandidateLink({ token, compact }: { token: string | null | undefined; compact?: boolean }) {
  if (!token) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/interview/${token}`);
      toast.success("Candidate link copied");
    } catch {
      toast.error("Couldn't copy automatically — open the interview and copy the address bar.");
    }
  };
  return (
    <div className="flex gap-1.5">
      <Button asChild size="sm" variant={compact ? "outline" : "default"}>
        <Link to="/interview/$token" params={{ token }} target="_blank"><ExternalLink className="mr-1 h-3.5 w-3.5" />Open candidate interview</Link>
      </Button>
      <Button size="sm" variant="outline" onClick={copy} aria-label="Copy candidate link"><Copy className="h-3.5 w-3.5" /></Button>
    </div>
  );
}
