import { Check, ImagePlus, Palette, X } from "lucide-react";
import { useState } from "react";

import { ProdSection, type BoardMode } from "@/components/production/parts";
import { useChange } from "@/components/production/use-change";
import { VisionPages } from "@/components/production/VisionPages";
import { ConfirmRemove } from "@/components/studio/ConfirmRemove";
import type { ProductionView } from "@/lib/os/production";
import type { ProductionApi } from "@/lib/production-api";
import { cn } from "@/lib/utils";

/**
 * The floral vision: the mood + feel pages chosen from the proposal, drawn full width, and any
 * images the studio adds beside them. The team only ever receives the chosen pages.
 */
export function ProductionVision({
  view,
  mode,
  api,
  onChanged,
}: {
  view: ProductionView;
  mode: BoardMode;
  api: ProductionApi;
  onChanged: () => Promise<unknown> | void;
}) {
  const studio = mode === "studio";
  const change = useChange(onChanged);
  const inquiryId = view.production.inquiry_id;
  const [picking, setPicking] = useState(false);
  const [proposalId, setProposalId] = useState(
    view.production.vision_proposal_id ?? view.proposals[0]?.id ?? "",
  );
  const [chosen, setChosen] = useState<number[]>(view.production.vision_pages);
  const proposal = view.proposals.find((item) => item.id === proposalId) ?? view.proposals[0];
  const images = view.files.filter((file) => file.kind === "vision");
  // the vision's own pdf holds only the chosen pages; the preview shows them from the proposal
  const shownPages = api.preview ? view.production.vision_pages : undefined;

  function toggle(page: number) {
    setChosen((current) =>
      current.includes(page)
        ? current.filter((item) => item !== page)
        : [...current, page].sort((a, b) => a - b),
    );
  }

  async function saveChoice() {
    const saved = await change.run(
      () =>
        api.update(inquiryId, {
          vision_proposal_id: chosen.length ? (proposal?.id ?? null) : null,
          vision_pages: chosen,
        }),
      chosen.length
        ? `${chosen.length} ${chosen.length === 1 ? "page" : "pages"} in the vision`
        : "vision cleared",
    );
    if (saved) setPicking(false);
  }

  async function addImages(list: FileList) {
    for (const file of Array.from(list)) {
      if (!file.type.startsWith("image/")) {
        await Promise.resolve();
        continue;
      }
      await change.run(() => api.addFile(inquiryId, file, "vision"), "image added");
    }
  }

  return (
    <ProdSection
      icon={<Palette aria-hidden="true" strokeWidth={1.5} />}
      title="floral vision"
      id="vision"
      className="is-vision"
      action={
        studio && view.proposals.length ? (
          <button
            type="button"
            className="studio-ghost"
            onClick={() => {
              setChosen(view.production.vision_pages);
              setPicking((value) => !value);
            }}
          >
            {picking
              ? "close"
              : view.production.vision_pages.length
                ? "change pages"
                : "choose pages"}
          </button>
        ) : null
      }
    >
      {studio && picking && proposal?.href ? (
        <div className="studio-prod-picker">
          <div className="studio-prod-picker-head">
            <p>tap the mood + feel pages. the team gets only these pages, never the prices.</p>
            {view.proposals.length > 1 ? (
              <select
                className="studio-prod-input"
                value={proposal.id}
                aria-label="proposal"
                onChange={(event) => {
                  setProposalId(event.target.value);
                  setChosen([]);
                }}
              >
                {view.proposals.map((item) => (
                  <option key={item.id} value={item.id}>
                    proposal {item.number}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <VisionPages
            src={proposal.href}
            width={520}
            className="studio-prod-thumbs"
            renderPage={(page, canvas) => (
              <button
                type="button"
                className={cn("studio-prod-thumb", chosen.includes(page) && "is-on")}
                aria-pressed={chosen.includes(page)}
                aria-label={`page ${page}`}
                onClick={() => toggle(page)}
              >
                {canvas}
                <span className="studio-prod-thumb-mark">
                  {chosen.includes(page) ? <Check aria-hidden="true" strokeWidth={2} /> : page}
                </span>
              </button>
            )}
          />
          <div className="studio-prod-row-go">
            <button
              type="button"
              className="studio-today-go"
              disabled={change.busy}
              onClick={() => void saveChoice()}
            >
              {chosen.length
                ? `use ${chosen.length === 1 ? "page" : "pages"} ${chosen.join(", ")}`
                : "show no pages"}
            </button>
            <button type="button" className="studio-ghost" onClick={() => setPicking(false)}>
              cancel
            </button>
          </div>
        </div>
      ) : null}

      {view.visionUrl ? (
        <VisionPages src={view.visionUrl} pages={shownPages} carousel />
      ) : studio && !picking ? (
        <p className="studio-prod-muted">
          {view.proposals.length
            ? "choose the mood + feel pages from the proposal, and they'll show here for the team."
            : "once the proposal pdf is attached, its mood + feel pages can show here."}
        </p>
      ) : null}

      {images.length ? (
        <div className="studio-prod-images">
          {images.map((image) => (
            <figure key={image.id}>
              {image.href ? <img src={image.href} alt={image.name} loading="lazy" /> : null}
              {studio ? (
                <ConfirmRemove
                  question="remove this image?"
                  detail="the team won't see it in the vision anymore."
                  disabled={change.busy}
                  onConfirm={() => change.run(() => api.removeFile(image.id), "image removed")}
                >
                  <button
                    type="button"
                    className="studio-prod-x"
                    aria-label={`remove ${image.name}`}
                  >
                    <X aria-hidden="true" strokeWidth={1.5} />
                  </button>
                </ConfirmRemove>
              ) : null}
            </figure>
          ))}
        </div>
      ) : null}

      {studio ? (
        <label className="studio-ghost studio-prod-add-images">
          <ImagePlus aria-hidden="true" strokeWidth={1.5} />
          add images
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(event) => {
              if (event.target.files) void addImages(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
      ) : null}
    </ProdSection>
  );
}
