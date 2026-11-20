import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CandidateForm } from "@/components/app/candidate-form";
import { PageHeader } from "@/components/app/ui-bits";

export const Route = createFileRoute("/_authenticated/candidates/new")({
  head: () => ({ meta: [{ title: "Add candidate — WAE HR" }, { name: "description", content: "Add a new candidate." }, { property: "og:title", content: "Add candidate — WAE HR" }, { property: "og:description", content: "Add a new candidate." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: NewCandidate,
});

function NewCandidate() {
  const nav = useNavigate();
  const qc = useQueryClient();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Add candidate" description="Enter profile and HR details manually. Resumes are stored privately." />
      <CandidateForm
        onSaved={(id) => {
          qc.invalidateQueries();
          nav({ to: "/candidates/$candidateId", params: { candidateId: id } });
        }}
      />
    </div>
  );
}
