import type { InquiryFormValues } from "@/lib/os/inquiry-form";
import { buildInquirySteps, isStepComplete, type InquiryStep } from "@/lib/os/inquiry-steps";

export type GuideChapter = {
  id: string;
  eyebrow: string;
  title: string;
  help: string;
  fields: InquiryStep[];
};

export function buildGuideChapters(interest: InquiryFormValues["interest"]): GuideChapter[] {
  const steps = buildInquirySteps(interest).filter((step) => step.kind !== "review");
  const byId = (id: string) => steps.find((step) => step.id === id);

  const contact = [byId("name"), byId("email"), byId("phone")].filter(Boolean) as InquiryStep[];
  const interestStep = byId("interest");
  const setting = byId("event_setting");
  const details = steps.filter((step) =>
    ["arrangement_size", "event_date", "venue_text", "recipient", "budget_range", "space", "cadence"].includes(step.id),
  );
  const story = [byId("message"), byId("source")].filter(Boolean) as InquiryStep[];

  const chapters: GuideChapter[] = [
    {
      id: "contact",
      eyebrow: "About you",
      title: "Who should the studio reach?",
      help: "We’ll use this to write you back. One person is enough.",
      fields: contact,
    },
  ];

  if (interestStep) {
    chapters.push({
      id: "interest",
      eyebrow: "The work",
      title: "What are you interested in?",
      help: "Select only one. The next questions will follow this choice.",
      fields: [interestStep],
    });
  }

  if (setting) {
    chapters.push({
      id: "setting",
      eyebrow: "The work",
      title: "Is this a private or corporate event?",
      help: "This helps us know who we’re designing for.",
      fields: [setting],
    });
  }

  if (interest && details.length) {
    chapters.push({
      id: "details",
      eyebrow: "The details",
      title:
        interest === "deliveries"
          ? "Where should this go?"
          : interest === "weddings"
            ? "Tell us about the wedding."
            : "Tell us about the date and place.",
      help: "Skip anything still undecided. We can fill gaps later.",
      fields: details,
    });
  }

  if (story.length) {
    chapters.push({
      id: "story",
      eyebrow: "The note",
      title: "Anything the flowers should know?",
      help: "A sentence is enough. Links to references are welcome.",
      fields: story,
    });
  }

  chapters.push({
    id: "review",
    eyebrow: "Review",
    title: "Does this look right?",
    help: "This is what the studio will read. You can go back and change a step.",
    fields: [],
  });

  return chapters;
}

export function isChapterComplete(chapter: GuideChapter, values: InquiryFormValues) {
  if (chapter.id === "review") return true;
  return chapter.fields.every((field) => field.optional || isStepComplete(field, values));
}
