import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { TodayHome, type DeskTaskDraft } from "@/components/portal/TodayHome";
import type { InquiryFormValues } from "@/lib/os/inquiry-form";
import { createAdminInquiry, getInquiryDashboard } from "@/lib/os/inquiries.functions";
import { completeTask, createManualTask } from "@/lib/os/tasks.functions";
import { getDevPreviewDashboard } from "@/lib/dev-preview";
import { useDevPreview } from "@/lib/use-dev-preview";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Today — Say Sukii OS" },
      {
        name: "description",
        content: "New inquiries, studio response times, and upcoming Say Sukii projects.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { profile } = Route.useRouteContext();
  const devPreview = useDevPreview();
  const router = useRouter();
  const queryClient = useQueryClient();
  const fetchDashboard = useServerFn(getInquiryDashboard);
  const saveInquiry = useServerFn(createAdminInquiry);
  const markTaskDone = useServerFn(completeTask);
  const saveTask = useServerFn(createManualTask);
  const { data, isPending, isError } = useQuery({
    queryKey: ["inquiry-dashboard", devPreview],
    queryFn: () => (devPreview ? getDevPreviewDashboard() : fetchDashboard()),
  });

  const completeDeskTask = useMutation({
    mutationFn: (id: string) => {
      if (devPreview) return Promise.resolve();
      return markTaskDone({ data: { id } });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["inquiry-dashboard"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addDeskTask = useMutation({
    mutationFn: (values: DeskTaskDraft) => {
      if (devPreview) {
        return Promise.resolve({
          id: crypto.randomUUID(),
          title: values.title,
          linked_type: values.linked_type,
          linked_id: values.linked_id,
          source: "manual" as const,
          trigger_stage: null,
          due_at: values.due_at,
          created_at: new Date().toISOString(),
          status: "open" as const,
        });
      }
      return saveTask({
        data: {
          title: values.title,
          linked_type: values.linked_type,
          linked_id: values.linked_type === "none" ? undefined : values.linked_id,
          due_at: values.due_at,
        },
      });
    },
    onSuccess: () => {
      toast.success("task added");
      void queryClient.invalidateQueries({ queryKey: ["inquiry-dashboard"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createInquiry = useMutation({
    mutationFn: (values: InquiryFormValues) => {
      if (devPreview) {
        toast.message("Preview mode — inquiry not saved");
        return Promise.resolve({ id: "preview" });
      }
      return saveInquiry({ data: values });
    },
    onSuccess: async (result) => {
      toast.success("inquiry added");
      void queryClient.invalidateQueries({ queryKey: ["inquiry-dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["inquiry-pipeline"] });
      if (result.id && result.id !== "preview") {
        await router.navigate({ to: "/pipeline/$id", params: { id: result.id } });
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="studio-today">
      {!devPreview && isError ? (
        <p className="studio-pearl-note">the inquiry board is available to studio admins only.</p>
      ) : null}

      {isPending || !data ? (
        <p className="studio-empty">opening today…</p>
      ) : (
        <TodayHome
          data={data}
          name={profile.full_name}
          email={profile.email}
          creating={createInquiry.isPending}
          completingId={completeDeskTask.isPending ? (completeDeskTask.variables ?? null) : null}
          savingTask={addDeskTask.isPending}
          onCreateInquiry={async (values) => {
            await createInquiry.mutateAsync(values);
          }}
          onCompleteTask={async (id) => {
            await completeDeskTask.mutateAsync(id);
          }}
          onCreateTask={async (values) => addDeskTask.mutateAsync(values)}
        />
      )}
    </div>
  );
}
