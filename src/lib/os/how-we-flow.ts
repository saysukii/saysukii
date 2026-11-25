/**
 * How we flow: the studio's terms for the gang, in sukii's words, agreed to the first time someone
 * signs in, and kept at the bottom of their today for later. Changing the words? Change the version
 * too, and everyone agrees again the next time they sign in.
 *
 * Each line shows on its own, as in sukii's notion page. Words between ** are bold, as she wrote them.
 */
export const FLOW_VERSION = "2026-11-25.2";

/** the first line, in hot pink */
export const FLOW_WELCOME = "welcome to the say sukii gang.";

/** the line after the welcome */
export const FLOW_GUIDE = "here’s a guide to studio reciprocity.";

export const FLOW_SECTIONS: Array<{ title: string; lines: string[] }> = [
  {
    title: "communication",
    lines: [
      "we keep things simple + clear.",
      "text, voice notes, or shared notion comments work best.",
    ],
  },
  {
    title: "timing + updates",
    lines: [
      "you’ll usually receive a reminder or update the **day before** an event or studio session.",
      "on event days, please **arrive on time**, stay grounded, and let joy lead.",
    ],
  },
  {
    title: "how we prep",
    lines: [
      "studio setups are intuitive and collaborative — we check in, assess the vibe, and jump in where needed.",
      "if you ever feel unsure, ask or observe.",
      "we’re blooming together.",
    ],
  },
  {
    title: "studio energy",
    lines: [
      "we move with **intention**, **precision**, and **love**.",
      "music is always welcome.",
      "laughter, water and snack breaks are sacred.",
    ],
  },
  {
    title: "accountability + care",
    lines: [
      "if you can’t make it to something you committed to, let sukii know as soon as you can.",
      "we respect each other’s time and energy.",
      "check in with yourself and your team often.",
      "always leave the studio or event space **better than you found it**.",
    ],
  },
];

/** a line's words, with the bold ones marked, for showing as sukii wrote them */
export function flowWords(body: string) {
  return body.split(/(\*\*[^*]+\*\*)/g).flatMap((part) => {
    if (!part) return [];
    const bold = /^\*\*([^*]+)\*\*$/.exec(part);
    return [bold ? { text: bold[1]!, bold: true } : { text: part, bold: false }];
  });
}

/** whether someone still has to agree: the gang does, once per version; admins never see it */
export function needsFlow(profile: {
  role: string;
  is_owner?: boolean | null | undefined;
  flow_version?: string | null | undefined;
}) {
  // how we flow is the gang's: admins, and the founder, never see it
  if (profile.role !== "team") return false;
  return profile.flow_version !== FLOW_VERSION;
}
