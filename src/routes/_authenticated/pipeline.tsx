import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { listProjects, setProjectStage } from "@/lib/portal.functions";
import { GlassCard, PageHeader, Pill, EmptyState } from "@/components/portal/bits";
import {
  SERVICE_LINE_LABEL,
  STAGES,
  STAGE_LABEL,
  formatDate,
  formatMoney,
  type Stage,
} from "@/lib/money";

export const Route = createFileRoute("/_authenticated/pipeline")({
  head: () => ({
    meta: [
      { title: "Pipeline — Say Sukii Portal" },
      {
        name: "description",
        content:
          "Every Say Sukii project from first conversation to complete install, with stage moves in one click.",
      },
      { property: "og:title", content: "Pipeline — Say Sukii Portal" },
      { property: "og:description", content: "Projects from first conversation to completed install." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PipelinePage,
});

function PipelinePage() {
  const queryClient = useQueryClient();
  const fetchProjects = useServerFn(listProjects);
  const moveStage = useServerFn(setProjectStage);

  const { data: projects = [], isPending } = useQuery({
    queryKey: ["projects"],
    queryFn: () => fetchProjects(),
  });

  const move = useMutation({
    mutationFn: (args: { id: string; stage: Stage }) => moveStage({ data: args }),
    onSuccess: () => {
      toast.success("Stage updated");
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div>
      <PageHeader
        eyebrow="Flow"
        title="Pipeline"
        description="Conversation to complete. Drag-free: tap the next stage to advance a project."
      />

      {!isPending && projects.length === 0 ? (
        <EmptyState
          title="Nothing in the pipeline yet"
          body="Add an account and a project, and it will appear here in the conversation column."
        />
      ) : null}

      <div className="grid gap-5 lg:grid-cols-5">
        {STAGES.map((stage) => {
          const column = projects.filter((project) => project.stage === stage);
          const value = column.reduce(
            (sum, project) => sum + (project.budget_estimate_cents ?? 0),
            0,
          );
          return (
            <div key={stage} className="glass-soft rounded-3xl p-4">
              <div className="flex items-baseline justify-between px-1">
                <p className="eyebrow">{STAGE_LABEL[stage]}</p>
                <span className="display-number text-sm text-muted-foreground">{column.length}</span>
              </div>
              {value > 0 ? (
                <p className="mt-1 px-1 text-xs text-muted-foreground">{formatMoney(value)} est.</p>
              ) : null}

              <div className="mt-4 space-y-3">
                {column.map((project) => {
                  const index = STAGES.indexOf(stage);
                  const next = STAGES[index + 1];
                  return (
                    <GlassCard key={project.id} className="p-4">
                      <p className="text-sm font-medium">{project.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {project.accounts?.name ?? "Account"}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Pill>
                          {
                            SERVICE_LINE_LABEL[
                              project.service_line as keyof typeof SERVICE_LINE_LABEL
                            ]
                          }
                        </Pill>
                        {project.accounts?.tier === "high_value" ? (
                          <Pill tone="rose">VIP</Pill>
                        ) : null}
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">
                        {formatDate(project.event_date)}
                      </p>
                      {next ? (
                        <button
                          onClick={() => move.mutate({ id: project.id, stage: next })}
                          className="mt-3 text-[0.6rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase transition-colors hover:text-foreground"
                        >
                          → {STAGE_LABEL[next]}
                        </button>
                      ) : null}
                    </GlassCard>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
