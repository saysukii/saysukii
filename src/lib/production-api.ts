import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { AppRole, EventType, ProductionRow } from "@/integrations/supabase/types";
import type { MemberRate } from "@/lib/os/production";
import { isDevPreviewEnabled } from "@/lib/dev-preview";
import { fileContentType, studioFileKey } from "@/lib/os/inquiry-holds";
import {
  addProductionFile,
  createManualProduction,
  addProductionPerson,
  addProductionStem,
  getProduction,
  getProductionPage,
  listMemberNotices,
  listMyProductions,
  listProductionClients,
  listProductions,
  readMemberNotices,
  removeProductionDay,
  removeProductionFile,
  removeProductionItem,
  removeProductionPerson,
  removeProductionShift,
  removeProductionStem,
  removeProductionTask,
  saveProductionDay,
  saveProductionItem,
  setProductionItemStatus,
  setProductionRate,
  saveProductionShift,
  saveProductionTask,
  setProductionTaskDone,
  shareProductionWithTeam,
  updateProduction,
  updateProductionStem,
} from "@/lib/os/production.functions";
import { deactivateTeamMember, inviteTeamMember } from "@/lib/os/settings.functions";
import {
  activateTeamMember,
  addTeamMember,
  cancelTeamInvite,
  updateTeamMember,
  listTeamDirectory,
} from "@/lib/os/team.functions";
import { previewProduction } from "@/lib/preview-production";

type ProductionPatch = Partial<
  Pick<
    ProductionRow,
    | "project_name"
    | "studio_address"
    | "dress_code"
    | "vision_proposal_id"
    | "vision_pages"
    | "reflection"
    | "has_team"
  >
>;

export type ManualProductionInput = {
  project_name: string;
  event_type: EventType;
  client_id?: string;
  new_client?: { name: string; email: string };
  event_date: string | null;
  hours?: string;
  has_team: boolean;
};

type ItemInput = {
  inquiry_id: string;
  id?: string;
  kind: string;
  name: string;
  quantity: number;
  status: "todo" | "in_progress" | "done";
};

type StemInput = {
  inquiry_id: string;
  name: string;
  color: string;
  quantity: number | null;
  item_id: string | null;
};

type StemPatch = {
  name?: string;
  color?: string;
  quantity?: number | null;
  item_id?: string | null;
  done?: boolean;
};

type ShiftInput = {
  inquiry_id: string;
  id?: string;
  profile_id: string;
  day: string;
  starts: string;
  ends: string;
  role: string;
  location: string;
};

type TaskInput = {
  inquiry_id: string;
  id?: string;
  title: string;
  starts_at: string | null;
  category: string;
  location: string;
  people: string[];
};

/**
 * Everything the production screens ask of the studio. In the dev preview it answers from this
 * browser instead of the server, the same way.
 */
export function useProductionApi() {
  const preview = isDevPreviewEnabled();
  const fns = {
    get: useServerFn(getProduction),
    page: useServerFn(getProductionPage),
    update: useServerFn(updateProduction),
    saveDay: useServerFn(saveProductionDay),
    removeDay: useServerFn(removeProductionDay),
    saveItem: useServerFn(saveProductionItem),
    setItemStatus: useServerFn(setProductionItemStatus),
    removeItem: useServerFn(removeProductionItem),
    addStem: useServerFn(addProductionStem),
    addPerson: useServerFn(addProductionPerson),
    saveShift: useServerFn(saveProductionShift),
    removeShift: useServerFn(removeProductionShift),
    setRate: useServerFn(setProductionRate),
    removePerson: useServerFn(removeProductionPerson),
    updateStem: useServerFn(updateProductionStem),
    removeStem: useServerFn(removeProductionStem),
    saveTask: useServerFn(saveProductionTask),
    removeTask: useServerFn(removeProductionTask),
    setTaskDone: useServerFn(setProductionTaskDone),
    addFile: useServerFn(addProductionFile),
    removeFile: useServerFn(removeProductionFile),
    mine: useServerFn(listMyProductions),
    all: useServerFn(listProductions),
    clients: useServerFn(listProductionClients),
    createManual: useServerFn(createManualProduction),
    notices: useServerFn(listMemberNotices),
    readNotices: useServerFn(readMemberNotices),
    team: useServerFn(listTeamDirectory),
    activate: useServerFn(activateTeamMember),
    deactivate: useServerFn(deactivateTeamMember),
    invite: useServerFn(inviteTeamMember),
    cancelInvite: useServerFn(cancelTeamInvite),
    add: useServerFn(addTeamMember),
    updateMember: useServerFn(updateTeamMember),
    share: useServerFn(shareProductionWithTeam),
  };

  // the server functions keep their identity between renders, so this is made once
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => makeApi(preview, fns), [preview]);
}

function makeApi(preview: boolean, fns: ServerFns) {
  const quiet = <T>(value: T) => Promise.resolve(value);
  return {
    preview,
    get: (inquiryId: string) =>
      preview
        ? quiet(previewProduction.get(inquiryId))
        : fns.get({ data: { inquiry_id: inquiryId } }),
    page: (slug: string) =>
      preview ? quiet(previewProduction.page(slug)) : fns.page({ data: { slug } }),
    update: (inquiryId: string, patch: ProductionPatch) =>
      preview
        ? quiet(previewProduction.update({ inquiry_id: inquiryId, ...patch }))
        : fns.update({ data: { inquiry_id: inquiryId, ...withoutNulls(patch) } }),
    saveDay: (input: { inquiry_id: string; id?: string; day: string; hours: string }) =>
      preview ? quiet(previewProduction.saveDay(input)) : fns.saveDay({ data: input }),
    removeDay: async (id: string) => {
      if (preview) previewProduction.removeDay(id);
      else await fns.removeDay({ data: { id } });
      return { ok: true as const };
    },
    saveItem: (input: ItemInput) =>
      preview ? quiet(previewProduction.saveItem(input)) : fns.saveItem({ data: input }),
    removeItem: async (id: string) => {
      if (preview) previewProduction.removeItem(id);
      else await fns.removeItem({ data: { id } });
      return { ok: true as const };
    },
    addStem: (input: StemInput) =>
      preview ? quiet(previewProduction.addStem(input)) : fns.addStem({ data: input }),
    updateStem: async (id: string, patch: StemPatch) => {
      if (preview) previewProduction.updateStem(id, patch);
      else await fns.updateStem({ data: { id, ...patch } });
      return { ok: true as const };
    },
    addPerson: async (inquiryId: string, profileId: string) => {
      if (preview) previewProduction.addPerson(inquiryId, profileId);
      else await fns.addPerson({ data: { inquiry_id: inquiryId, profile_id: profileId } });
      return { ok: true as const };
    },
    saveShift: (input: ShiftInput) =>
      preview ? quiet(previewProduction.saveShift(input)) : fns.saveShift({ data: input }),
    removeShift: async (id: string) => {
      if (preview) previewProduction.removeShift(id);
      else await fns.removeShift({ data: { id } });
      return { ok: true as const };
    },
    /** what someone is paid on this production: by the hour, or flat; null takes it off */
    setRate: async (inquiryId: string, profileId: string, rate: MemberRate | null) => {
      if (preview) previewProduction.setRate(inquiryId, profileId, rate);
      else await fns.setRate({ data: { inquiry_id: inquiryId, profile_id: profileId, rate } });
      return { ok: true as const };
    },
    removePerson: async (inquiryId: string, profileId: string) => {
      if (preview) return previewProduction.removePerson(inquiryId, profileId);
      return fns.removePerson({ data: { inquiry_id: inquiryId, profile_id: profileId } });
    },
    removeStem: async (id: string) => {
      if (preview) previewProduction.removeStem(id);
      else await fns.removeStem({ data: { id } });
      return { ok: true as const };
    },
    saveTask: async (input: TaskInput) => {
      if (preview) return previewProduction.saveTask(input);
      const saved = await fns.saveTask({ data: input });
      return { ...saved, notified: 0 };
    },
    removeTask: async (id: string) => {
      if (preview) previewProduction.removeTask(id);
      else await fns.removeTask({ data: { id } });
      return { ok: true as const };
    },
    setTaskDone: async (id: string, done: boolean) => {
      if (preview) return previewProduction.setTaskDone(id, done);
      await fns.setTaskDone({ data: { id, done } });
    },
    addFile: async (inquiryId: string, file: File, kind: "logistics" | "vision") => {
      if (preview) return previewProduction.addFile(inquiryId, file, kind);
      const path = studioFileKey(`productions/${inquiryId}/${kind}`, file.name);
      const upload = await supabase.storage.from("project-files").upload(path, file, {
        contentType: fileContentType(file),
        upsert: false,
      });
      if (upload.error) throw new Error(upload.error.message);
      await fns.addFile({
        data: { inquiry_id: inquiryId, file_path: path, file_type: fileContentType(file) },
      });
    },
    removeFile: async (id: string) => {
      if (preview) previewProduction.removeFile(id);
      else await fns.removeFile({ data: { id } });
      return { ok: true as const };
    },
    mine: () => (preview ? quiet(previewProduction.mine()) : fns.mine()),
    all: () => (preview ? quiet(previewProduction.all()) : fns.all()),
    notices: () => (preview ? quiet(previewProduction.notices()) : fns.notices()),
    readNotices: async (ids: string[]) => {
      if (preview) previewProduction.readNotices(ids);
      else await fns.readNotices({ data: { ids } });
      return { ok: true as const };
    },
    team: () => (preview ? quiet(previewProduction.team()) : fns.team()),
    setActive: async (id: string, active: boolean) => {
      if (preview) return previewProduction.setActive(id, active);
      await (active ? fns.activate({ data: { id } }) : fns.deactivate({ data: { id } }));
    },
    invite: async (email: string, role: AppRole) => {
      if (preview) return previewProduction.invite(email, role);
      await fns.invite({ data: { email, role } });
    },
    cancelInvite: async (id: string) => {
      if (preview) return previewProduction.cancelInvite(id);
      await fns.cancelInvite({ data: { id } });
    },
    /** add someone to the team without inviting them yet */
    add: async (email: string, name: string, role: AppRole) => {
      if (preview) return previewProduction.add(email, name, role);
      return fns.add({ data: { email, name, role } });
    },
    /** change someone on the team: name, email before they're invited, and access */
    updateMember: async (input: {
      id: string;
      name: string;
      email?: string;
      role: AppRole;
      access?: string[];
    }) => {
      if (preview) return previewProduction.updateMember(input);
      return fns.updateMember({ data: input });
    },
    /** move a floral order line along; anyone on the production can */
    setItemStatus: async (id: string, status: "todo" | "in_progress" | "done") => {
      if (preview) return previewProduction.setItemStatus(id, status);
      return fns.setItemStatus({ data: { id, status } });
    },
    /** clients to link a new production to */
    clients: () => (preview ? quiet(previewProduction.clients()) : fns.clients()),
    /** a production added by hand: linked to a client, booked from the start */
    createManual: (input: ManualProductionInput) =>
      preview
        ? quiet(previewProduction.createManual(input))
        : fns.createManual({
            data: {
              project_name: input.project_name,
              event_type: input.event_type,
              event_date: input.event_date,
              has_team: input.has_team,
              ...(input.hours ? { hours: input.hours } : {}),
              ...(input.client_id ? { client_id: input.client_id } : {}),
              ...(input.new_client ? { new_client: input.new_client } : {}),
            },
          }),
    /** share a production with everyone on it at once */
    share: (inquiryId: string) =>
      preview
        ? quiet(previewProduction.share(inquiryId))
        : fns.share({ data: { inquiry_id: inquiryId } }),
  };
}

export type ProductionApi = ReturnType<typeof makeApi>;

type ServerFns = {
  get: ReturnType<typeof useServerFn<typeof getProduction>>;
  page: ReturnType<typeof useServerFn<typeof getProductionPage>>;
  update: ReturnType<typeof useServerFn<typeof updateProduction>>;
  saveDay: ReturnType<typeof useServerFn<typeof saveProductionDay>>;
  removeDay: ReturnType<typeof useServerFn<typeof removeProductionDay>>;
  saveItem: ReturnType<typeof useServerFn<typeof saveProductionItem>>;
  setItemStatus: ReturnType<typeof useServerFn<typeof setProductionItemStatus>>;
  removeItem: ReturnType<typeof useServerFn<typeof removeProductionItem>>;
  addStem: ReturnType<typeof useServerFn<typeof addProductionStem>>;
  addPerson: ReturnType<typeof useServerFn<typeof addProductionPerson>>;
  saveShift: ReturnType<typeof useServerFn<typeof saveProductionShift>>;
  removeShift: ReturnType<typeof useServerFn<typeof removeProductionShift>>;
  setRate: ReturnType<typeof useServerFn<typeof setProductionRate>>;
  removePerson: ReturnType<typeof useServerFn<typeof removeProductionPerson>>;
  updateStem: ReturnType<typeof useServerFn<typeof updateProductionStem>>;
  removeStem: ReturnType<typeof useServerFn<typeof removeProductionStem>>;
  saveTask: ReturnType<typeof useServerFn<typeof saveProductionTask>>;
  removeTask: ReturnType<typeof useServerFn<typeof removeProductionTask>>;
  setTaskDone: ReturnType<typeof useServerFn<typeof setProductionTaskDone>>;
  addFile: ReturnType<typeof useServerFn<typeof addProductionFile>>;
  removeFile: ReturnType<typeof useServerFn<typeof removeProductionFile>>;
  mine: ReturnType<typeof useServerFn<typeof listMyProductions>>;
  all: ReturnType<typeof useServerFn<typeof listProductions>>;
  clients: ReturnType<typeof useServerFn<typeof listProductionClients>>;
  createManual: ReturnType<typeof useServerFn<typeof createManualProduction>>;
  notices: ReturnType<typeof useServerFn<typeof listMemberNotices>>;
  readNotices: ReturnType<typeof useServerFn<typeof readMemberNotices>>;
  team: ReturnType<typeof useServerFn<typeof listTeamDirectory>>;
  activate: ReturnType<typeof useServerFn<typeof activateTeamMember>>;
  deactivate: ReturnType<typeof useServerFn<typeof deactivateTeamMember>>;
  invite: ReturnType<typeof useServerFn<typeof inviteTeamMember>>;
  cancelInvite: ReturnType<typeof useServerFn<typeof cancelTeamInvite>>;
  add: ReturnType<typeof useServerFn<typeof addTeamMember>>;
  updateMember: ReturnType<typeof useServerFn<typeof updateTeamMember>>;
  share: ReturnType<typeof useServerFn<typeof shareProductionWithTeam>>;
};

/** the server reads a cleared text field as empty, not as missing */
function withoutNulls(patch: ProductionPatch) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    out[key] = value === null && key !== "vision_proposal_id" ? "" : value;
  }
  return out as {
    project_name?: string;
    studio_address?: string;
    dress_code?: string;
    vision_proposal_id?: string | null;
    vision_pages?: number[];
    reflection?: string;
  };
}
