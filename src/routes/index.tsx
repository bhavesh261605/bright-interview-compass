import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Loading } from "@/components/app/ui-bits";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Aria HR — AI HR Interviewer" },
      { name: "description", content: "Run structured AI HR interviews for freshers and 0–6 year candidates." },
      { property: "og:title", content: "Aria HR — AI HR Interviewer" },
      { property: "og:description", content: "Run structured AI HR interviews for freshers and 0–6 year candidates." },
    ],
  }),
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return <Navigate to={user ? "/dashboard" : "/login"} />;
}
