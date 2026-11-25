import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { isDevPreviewEnabled } from "@/lib/dev-preview";
import {
  FLOW_GUIDE,
  FLOW_SECTIONS,
  FLOW_VERSION,
  FLOW_WELCOME,
  flowWords,
  needsFlow,
} from "@/lib/os/how-we-flow";
import { agreeToHowWeFlow } from "@/lib/os/settings.functions";
import { previewProduction } from "@/lib/preview-production";
import { useStudioSession } from "@/lib/studio-session";
import { cn } from "@/lib/utils";

// locally, the pop-up can be opened again after agreeing, to look at it
const REOPEN_EVENT = "say-sukii-flow-open";

function Welcome() {
  return (
    <p className="studio-flow-welcome">
      <b>{FLOW_WELCOME}</b> <span>{FLOW_GUIDE}</span>
    </p>
  );
}

/** a line as sukii wrote it, with her bold words in bold */
function FlowLine({ line }: { line: string }) {
  return (
    <>
      {flowWords(line).map((part, index) =>
        part.bold ? <strong key={index}>{part.text}</strong> : part.text,
      )}
    </>
  );
}

function FlowSections() {
  return (
    <ol className="studio-flow-list">
      {FLOW_SECTIONS.map((section, index) => (
        <li key={section.title}>
          <i aria-hidden="true">{index + 1}</i>
          <span>
            <b>{section.title}</b>
            <small>
              {section.lines.map((line) => (
                <span key={line}>
                  <FlowLine line={line} />
                </span>
              ))}
            </small>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** the top of the pop-up: the title with a pink tag, then the welcome in a blush card */
function FlowHeader() {
  return (
    <header className="studio-flow-head">
      <div className="studio-flow-head-row">
        <DialogTitle className="studio-shift-title">how we flow</DialogTitle>
        <span className="studio-flow-tag">before you come in</span>
      </div>
      <DialogDescription asChild>
        <div>
          <Welcome />
        </div>
      </DialogDescription>
    </header>
  );
}

/** the tick and the button */
function Agree({
  checked,
  busy,
  ready = true,
  onCheck,
  onAgree,
}: {
  checked: boolean;
  busy: boolean;
  ready?: boolean;
  onCheck: (checked: boolean) => void;
  onAgree: () => void;
}) {
  return (
    <>
      <label className={cn("studio-flow-agree", checked && "is-on", !ready && "is-waiting")}>
        <input
          type="checkbox"
          checked={checked}
          disabled={!ready}
          onChange={(event) => onCheck(event.target.checked)}
        />
        <span>i've read how we flow, and i agree to it.</span>
      </label>
      <div className="studio-shift-foot">
        <span />
        <span className="studio-shift-go">
          <button
            type="button"
            className="studio-today-go"
            disabled={!checked || busy || !ready}
            onClick={onAgree}
          >
            {busy ? "one moment…" : "agree and come in"}
          </button>
        </span>
      </div>
    </>
  );
}

/**
 * The first time someone signs in, and again whenever how we flow changes, they read it and agree
 * before anything else. It can't be closed without agreeing. The founder never sees it.
 */
export function HowWeFlowGate() {
  const { profile } = useStudioSession();
  const router = useRouter();
  const agree = useServerFn(agreeToHowWeFlow);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [agreedNow, setAgreedNow] = useState(false);
  // locally, opened again from the card, just to look; it closes like any other
  const [looking, setLooking] = useState(false);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const open = () => setLooking(true);
    window.addEventListener(REOPEN_EVENT, open);
    return () => window.removeEventListener(REOPEN_EVENT, open);
  }, []);

  // agreed just now: a page that read who's signed in only once, like a production, won't hear
  // until it loads again, so the pop-up remembers for this visit
  const must = needsFlow(profile) && !agreedNow;
  if (!must && !looking) return null;

  async function accept() {
    if (!must) {
      setLooking(false);
      return;
    }
    setBusy(true);
    try {
      if (isDevPreviewEnabled()) previewProduction.agreeToFlow(FLOW_VERSION);
      else await agree({ data: { version: FLOW_VERSION } });
      setAgreedNow(true);
      await router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "that didn't save. try again.");
    } finally {
      setBusy(false);
    }
  }

  const later = (
    <p className="studio-flow-later">find this anytime at the bottom of your home page.</p>
  );
  const agreeProps = {
    checked,
    busy,
    onCheck: setChecked,
    onAgree: () => void accept(),
  };

  return (
    <Dialog open onOpenChange={(open) => (!open && !must ? setLooking(false) : undefined)}>
      <DialogContent
        overlayClassName="studio-task-veil"
        className="studio-task-modal is-ask studio-shift-modal studio-flow-modal"
        hideClose
        onEscapeKeyDown={(event) => (must ? event.preventDefault() : undefined)}
        onPointerDownOutside={(event) => (must ? event.preventDefault() : undefined)}
        onInteractOutside={(event) => (must ? event.preventDefault() : undefined)}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <FlowHeader />
        <div className="studio-flow-scroll">
          <FlowSections />
        </div>
        {later}
        <Agree {...agreeProps} />
      </DialogContent>
    </Dialog>
  );
}

/** how we flow, kept at the bottom of today for later */
export function HowWeFlowCard() {
  const [open, setOpen] = useState(false);
  return (
    <section className="studio-module studio-prod-section studio-flow-card">
      <button
        type="button"
        className={cn("studio-flow-toggle", open && "is-open")}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="studio-home-label">how we flow</span>
        <ChevronDown aria-hidden="true" strokeWidth={1.5} />
      </button>
      {open ? <FlowSections /> : null}
      {import.meta.env.DEV ? (
        <button
          type="button"
          className="studio-flow-reopen"
          onClick={() => window.dispatchEvent(new Event(REOPEN_EVENT))}
        >
          see the pop-up again · local
        </button>
      ) : null}
    </section>
  );
}
