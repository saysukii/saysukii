import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, GripVertical, Trash2 } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { INTEREST_OPTIONS } from "@/lib/os/inquiry-schema";
import {
  decodeInquiryDrafts,
  draftedInterestLabel,
  formatInquiryNotes,
  inquirySectionEdited,
  isSharedInquiryStep,
  readInquiryDrafts,
  resolveInquirySteps,
  resolveSharedSteps,
  SHARED_TAB_LABEL,
  snapshotInquiryPath,
  snapshotSharedPath,
  stepKindLabel,
  visibleInquirySteps,
  writeInquiryDrafts,
  type InquiryDrafts,
  type InquiryEditorTab,
  type InquiryPathCopy,
  type InquiryPathDraft,
} from "@/lib/os/inquiry-draft";
import type { InquiryStep } from "@/lib/os/inquiry-steps";
import { cn } from "@/lib/utils";

export function InquiryQuestionEditor() {
  const [tab, setTab] = useState<InquiryEditorTab>("shared");
  const [drafts, setDrafts] = useState<InquiryDrafts>({});
  const [dragging, setDragging] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fromLink = decodeInquiryDrafts(window.location.hash);
    const next = fromLink ?? readInquiryDrafts();
    setDrafts(next);
    if (fromLink) writeInquiryDrafts(next);
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const shared = tab === "shared";
  const draft =
    tab === "shared" ? (drafts.shared ?? snapshotSharedPath()) : (drafts[tab] ?? snapshotInquiryPath(tab));
  const steps =
    tab === "shared"
      ? resolveSharedSteps(drafts)
      : visibleInquirySteps(resolveInquirySteps(tab, drafts));
  const dirty = inquirySectionEdited(tab, drafts);

  function save(next: InquiryDrafts) {
    setDrafts(next);
    writeInquiryDrafts(next);
  }

  function updatePath(next: InquiryPathDraft) {
    save(shared ? { ...drafts, shared: next } : { ...drafts, [tab]: next });
  }

  function move(from: number, to: number) {
    if (shared) {
      const order = [...draft.order];
      if (to < 0 || to >= order.length || from === to) return;
      const [item] = order.splice(from, 1);
      order.splice(to, 0, item);
      updatePath({ ...draft, order });
      return;
    }

    const sharedOrder = draft.order.filter((id) => isSharedInquiryStep(id));
    const rest = draft.order.filter((id) => !isSharedInquiryStep(id));
    if (to < 0 || to >= rest.length || from === to) return;
    const next = [...rest];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    updatePath({ ...draft, order: [...sharedOrder, ...next] });
  }

  function updateCopy(step: InquiryStep, nextCopy: InquiryPathCopy) {
    updatePath({
      ...draft,
      copy: { ...draft.copy, [step.id]: nextCopy },
    });
  }

  async function copyNotes() {
    await navigator.clipboard.writeText(formatInquiryNotes(drafts));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  }

  return (
    <section className="inquire-question-map inquire-question-editor">
      <p className="inquire-question-map-kicker">Form questions</p>
      <p>
        Below are the questions per service. Feel free to refine as needed by rewriting, using the
        arrows to reorder, and/or delete anything that isn’t needed.
      </p>
      <p>
        When finished, copy the notes using the button below + paste them in an email to me so I can
        update it on my end.
      </p>
      <p>Much appreciated &lt;3.</p>
      <div className="inquire-question-share">
        <button type="button" onClick={() => void copyNotes()}>
          {copied ? "notes copied" : "copy notes"}
        </button>
        <Link to="/inquire" activeOptions={{ exact: true }}>
          Walk through as a client
        </Link>
        {dirty ? (
          <button
            type="button"
            className="auth-text-action"
            onClick={() => {
              const next = { ...drafts };
              if (shared) delete next.shared;
              else delete next[tab];
              save(next);
            }}
          >
            restore this path
          </button>
        ) : null}
      </div>
      <div className="inquire-question-map-tabs" role="tablist" aria-label="Service paths">
        <button
          type="button"
          role="tab"
          aria-selected={shared}
          className={cn(shared && "is-on")}
          onClick={() => setTab("shared")}
        >
          {SHARED_TAB_LABEL}
        </button>
        {INTEREST_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={tab === option.value}
            className={cn(tab === option.value && "is-on")}
            onClick={() => setTab(option.value)}
          >
            {draftedInterestLabel(option.value, drafts)}
          </button>
        ))}
      </div>
      {steps.length === 0 ? (
        <p className="inquire-question-editor-empty">No questions on this path.</p>
      ) : (
        <ol>
          {steps.map((step, index) => {
            const copy = draft.copy[step.id] ?? {
              label: step.label,
              hint: step.hint ?? "",
              options:
                step.kind === "choice" || step.kind === "multi"
                  ? Object.fromEntries(step.options.map((option) => [option.value, option.label]))
                  : undefined,
            };
            return (
              <li
                key={step.id}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragging !== null) move(dragging, index);
                  setDragging(null);
                }}
              >
                <article className={cn("inquire-question-card", dragging === index && "is-dragging")}>
                  <button
                    type="button"
                    className="inquire-question-grip"
                    aria-label={`Move ${copy.label || step.label}`}
                    draggable
                    onDragStart={(event) => {
                      setDragging(index);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", String(index));
                    }}
                    onDragEnd={() => setDragging(null)}
                  >
                    <GripVertical size={16} />
                  </button>
                  <span className="inquire-question-map-num">{index + 1}</span>
                  <div className="inquire-question-fields">
                    <label>
                      <span>Question</span>
                      <textarea
                        rows={2}
                        value={copy.label}
                        onChange={(event) => updateCopy(step, { ...copy, label: event.target.value })}
                      />
                    </label>
                    {step.kind === "review" ? null : (
                      <label>
                        <span>Subtitle</span>
                        <textarea
                          rows={2}
                          placeholder="optional hint under the question"
                          value={copy.hint}
                          onChange={(event) => updateCopy(step, { ...copy, hint: event.target.value })}
                        />
                      </label>
                    )}
                    {step.kind === "choice" || step.kind === "multi" ? (
                      <fieldset className="inquire-question-options">
                        <span>Options</span>
                        {step.options.map((option) => (
                          <label key={option.value}>
                            <textarea
                              rows={1}
                              value={copy.options?.[option.value] ?? option.label}
                              onChange={(event) =>
                                updateCopy(step, {
                                  ...copy,
                                  options: { ...copy.options, [option.value]: event.target.value },
                                })
                              }
                            />
                          </label>
                        ))}
                      </fieldset>
                    ) : null}
                    <em>
                      {stepKindLabel(step)}
                      {step.kind === "review" ? "" : step.optional ? " · optional" : " · required"}
                    </em>
                  </div>
                  <div className="inquire-question-tools">
                    <button
                      type="button"
                      aria-label="Move up"
                      disabled={index === 0}
                      onClick={() => move(index, index - 1)}
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label="Move down"
                      disabled={index === steps.length - 1}
                      onClick={() => move(index, index + 1)}
                    >
                      <ChevronDown size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete question"
                      onClick={() =>
                        updatePath({
                          order: draft.order.filter((id) => id !== step.id),
                          copy: draft.copy,
                        })
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
