import { INTEREST_OPTIONS, type InquiryInterest } from "@/lib/os/inquiry-schema";
import { buildInquirySteps, type InquiryStep } from "@/lib/os/inquiry-steps";

const STORAGE_KEY = "say-sukii-inquiry-drafts-v1";
const NOTES_HASH = "#notes=";

export type InquiryPathCopy = {
  label: string;
  hint: string;
  options?: Record<string, string>;
};

export type InquiryPathDraft = {
  order: string[];
  copy: Record<string, InquiryPathCopy>;
};

export type InquiryDrafts = Partial<Record<InquiryInterest, InquiryPathDraft>> & {
  shared?: InquiryPathDraft;
};

export type InquiryEditorTab = InquiryInterest | "shared";

export const SHARED_INQUIRY_STEP_IDS = ["name", "email", "phone", "interest"] as const;
export const SHARED_TAB_LABEL = "Contact + service";

export function isSharedInquiryStep(id: string) {
  return (SHARED_INQUIRY_STEP_IDS as readonly string[]).includes(id);
}

export function visibleInquirySteps(steps: InquiryStep[]) {
  return steps.filter((step) => !isSharedInquiryStep(step.id));
}

export function stepKindLabel(step: InquiryStep) {
  switch (step.kind) {
    case "choice":
      return "single choice";
    case "multi":
      return "multi select";
    case "date":
      return "date + time";
    case "address":
      return "address";
    case "textarea":
      return "note";
    case "review":
      return "review";
    default:
      return step.kind;
  }
}

function snapshotCopy(step: InquiryStep): InquiryPathCopy {
  return {
    label: step.label,
    hint: step.kind !== "review" && "hint" in step && step.hint ? step.hint : "",
    ...(step.kind === "choice" || step.kind === "multi"
      ? { options: Object.fromEntries(step.options.map((option) => [option.value, option.label])) }
      : {}),
  };
}

function snapshotFromSteps(steps: InquiryStep[]): InquiryPathDraft {
  return {
    order: steps.map((step) => step.id),
    copy: Object.fromEntries(steps.map((step) => [step.id, snapshotCopy(step)])),
  };
}

export function snapshotSharedPath(): InquiryPathDraft {
  return snapshotFromSteps(buildInquirySteps("weddings").filter((step) => isSharedInquiryStep(step.id)));
}

export function snapshotInquiryPath(interest: InquiryInterest): InquiryPathDraft {
  return snapshotFromSteps(buildInquirySteps(interest));
}

export function applyStepCopy(step: InquiryStep, copy?: InquiryPathCopy | null): InquiryStep {
  if (!copy) return step;
  const label = copy.label.trim() ? copy.label : step.label;
  if (step.kind === "review") return { ...step, label };

  const hint = copy.hint.trim() ? copy.hint : step.hint;
  if (step.kind === "choice" || step.kind === "multi") {
    return {
      ...step,
      label,
      hint,
      options: step.options.map((option) => ({
        ...option,
        label: copy.options?.[option.value]?.trim() || option.label,
      })),
    };
  }
  return { ...step, label, hint };
}

export function resolveInquirySteps(
  interest: Parameters<typeof buildInquirySteps>[0],
  drafts: InquiryDrafts = {},
): InquiryStep[] {
  const steps = buildInquirySteps(interest);
  const byId = new Map(steps.map((step) => [step.id, step]));
  const sharedDraft = drafts.shared;
  const pathDraft = interest ? drafts[interest] : undefined;

  const sharedOrder =
    sharedDraft?.order.filter((id) => isSharedInquiryStep(id) && byId.has(id)) ??
    steps.filter((step) => isSharedInquiryStep(step.id)).map((step) => step.id);
  const restOrder =
    pathDraft?.order.filter((id) => !isSharedInquiryStep(id) && byId.has(id)) ??
    steps.filter((step) => !isSharedInquiryStep(step.id)).map((step) => step.id);

  return [...sharedOrder, ...restOrder]
    .map((id) => byId.get(id))
    .filter((step): step is InquiryStep => Boolean(step))
    .map((step) =>
      applyStepCopy(step, isSharedInquiryStep(step.id) ? sharedDraft?.copy[step.id] : pathDraft?.copy[step.id]),
    );
}

export function resolveSharedSteps(drafts: InquiryDrafts = {}) {
  return resolveInquirySteps("weddings", { shared: drafts.shared }).filter((step) => isSharedInquiryStep(step.id));
}

export function draftedInterestLabel(value: InquiryInterest, drafts: InquiryDrafts) {
  const label = drafts.shared?.copy.interest?.options?.[value]?.trim();
  return label || INTEREST_OPTIONS.find((option) => option.value === value)?.label || value;
}

function stepsSignature(steps: InquiryStep[]) {
  return JSON.stringify(
    steps.map((step) => ({
      id: step.id,
      label: step.label,
      hint: step.kind === "review" ? "" : (step.hint ?? ""),
      options: step.kind === "choice" || step.kind === "multi" ? step.options.map((option) => option.label) : [],
    })),
  );
}

export function inquirySectionEdited(tab: InquiryEditorTab, drafts: InquiryDrafts) {
  if (tab === "shared") {
    return stepsSignature(resolveSharedSteps(drafts)) !== stepsSignature(resolveSharedSteps({}));
  }
  return (
    stepsSignature(visibleInquirySteps(resolveInquirySteps(tab, drafts))) !==
    stepsSignature(visibleInquirySteps(resolveInquirySteps(tab, {})))
  );
}

export function inquiryDraftsAreActive(drafts: InquiryDrafts) {
  if (inquirySectionEdited("shared", drafts)) return true;
  return INTEREST_OPTIONS.some((option) => inquirySectionEdited(option.value, drafts));
}

export function hydrateInquiryDrafts(raw: InquiryDrafts): InquiryDrafts {
  if (raw.shared) return raw;
  const donor = INTEREST_OPTIONS.map((option) => raw[option.value]).find(Boolean);
  if (!donor) return raw;
  const copy = Object.fromEntries(
    SHARED_INQUIRY_STEP_IDS.flatMap((id) => {
      const item = donor.copy[id];
      return item ? [[id, item]] : [];
    }),
  );
  if (!Object.keys(copy).length) return raw;
  return {
    ...raw,
    shared: {
      order: [...SHARED_INQUIRY_STEP_IDS],
      copy,
    },
  };
}

export function readInquiryDrafts(): InquiryDrafts {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as InquiryDrafts;
    return parsed && typeof parsed === "object" ? hydrateInquiryDrafts(parsed) : {};
  } catch {
    return {};
  }
}

export function writeInquiryDrafts(drafts: InquiryDrafts) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

export function draftsAreEqual(left: InquiryPathDraft, right: InquiryPathDraft) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function encodeInquiryDrafts(drafts: InquiryDrafts) {
  return `${NOTES_HASH}${encodeURIComponent(JSON.stringify(drafts))}`;
}

export function decodeInquiryDrafts(hash: string): InquiryDrafts | null {
  if (!hash.startsWith(NOTES_HASH)) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(hash.slice(NOTES_HASH.length))) as InquiryDrafts;
    return parsed && typeof parsed === "object" ? hydrateInquiryDrafts(parsed) : null;
  } catch {
    return null;
  }
}

function formatStepNotes(steps: InquiryStep[]) {
  return steps
    .map((step, index) => {
      const hint = step.kind !== "review" && step.hint ? `\n   ${step.hint}` : "";
      const options =
        step.kind === "choice" || step.kind === "multi"
          ? `\n   options: ${step.options.map((option) => option.label).join(" · ")}`
          : "";
      return `${index + 1}. ${step.label}${hint}${options}`;
    })
    .join("\n");
}

export function formatInquiryNotes(drafts: InquiryDrafts) {
  const shared = `✧ ${SHARED_TAB_LABEL}${inquirySectionEdited("shared", drafts) ? " — edited" : ""}\n${formatStepNotes(resolveSharedSteps(drafts))}`;
  const paths = INTEREST_OPTIONS.map((option) => {
    const steps = visibleInquirySteps(resolveInquirySteps(option.value, drafts));
    const edited = inquirySectionEdited(option.value, drafts);
    return `✧ ${draftedInterestLabel(option.value, drafts)}${edited ? " — edited" : ""}\n${formatStepNotes(steps)}`;
  });
  return [shared, ...paths].join("\n\n");
}
