import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";

import {
  mergeEmailTemplates,
  type EmailTemplate,
  type EmailTemplateId,
  type EmailTemplateInfo,
} from "@/lib/email-templates";
import {
  listEmailTemplates,
  resetEmailTemplate,
  saveEmailTemplate,
} from "@/lib/os/email-templates.functions";
import {
  markTemplatesMoved,
  storedTemplates,
  storeTemplate,
  templatesToMove,
  unstoreTemplate,
} from "@/lib/os/mail-templates";
import { useDevPreview } from "@/lib/use-dev-preview";

const TEMPLATES_KEY = ["os", "email-templates"] as const;

/** Every letter's words as the studio saved them; the preview keeps its own in this browser. */
export function useEmailTemplates() {
  const devPreview = useDevPreview();
  const list = useServerFn(listEmailTemplates);
  const save = useServerFn(saveEmailTemplate);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: TEMPLATES_KEY,
    queryFn: async (): Promise<EmailTemplateInfo[]> =>
      devPreview ? mergeEmailTemplates(storedTemplates()) : list(),
    staleTime: 60_000,
  });

  // letters edited in this browser before they were saved for the studio come along, once
  useEffect(() => {
    if (devPreview || !query.data) return;
    const moving = templatesToMove().filter(
      (item) => !query.data.find((saved) => saved.id === item.id)?.saved,
    );
    markTemplatesMoved();
    if (!moving.length) return;
    void Promise.all(
      mergeEmailTemplates(moving)
        .filter((item) => item.saved)
        .map((item) =>
          save({
            data: { id: item.id, subject: item.subject, headline: item.headline, body: item.body },
          }),
        ),
    ).then(() => queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY }));
  }, [devPreview, query.data, queryClient, save]);

  const templates = query.data ?? mergeEmailTemplates([]);
  const template = (id: EmailTemplateId) => templates.find((item) => item.id === id)!;
  return { templates, template, loading: query.isPending };
}

/** Saves a letter's words, or puts them back to the app's own. */
export function useSaveEmailTemplate() {
  const devPreview = useDevPreview();
  const save = useServerFn(saveEmailTemplate);
  const reset = useServerFn(resetEmailTemplate);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { template: EmailTemplate; reset?: boolean }) => {
      const { id, subject, headline, body } = input.template;
      if (devPreview) {
        if (input.reset) unstoreTemplate(id);
        else storeTemplate({ id, subject, headline, body });
        return;
      }
      if (input.reset) await reset({ data: { id } });
      else await save({ data: { id, subject, headline, body } });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  });
}
