/** A summary's point, with the finer points under it and who it's on, when it says. */
export type SummaryPoint = { text: string; owner: string | null; details: string[] };
export type SummarySection = { title: string; points: SummaryPoint[] };

const OWNER = /\s*\(([^()]{1,16})\)\s*\.?$/;

function cleanLine(line: string) {
  return line
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .trim();
}

/** "write the welcome text (sukii)" is on sukii. */
export function pointOwner(text: string): { text: string; owner: string | null } {
  const match = OWNER.exec(text);
  if (!match) return { text, owner: null };
  return { text: text.slice(0, match.index).trim(), owner: match[1]!.trim().toLowerCase() };
}

/**
 * Granola's markdown summary as sections of points. A heading starts a section, a bullet is a point,
 * and an indented bullet is a detail of the point above it. Lines before any heading go under "".
 */
export function parseSummary(markdown: string): SummarySection[] {
  const sections: SummarySection[] = [];
  let section: SummarySection | null = null;
  for (const raw of markdown.replace(/\r\n/g, "\n").split("\n")) {
    if (!raw.trim()) continue;
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(raw);
    if (heading) {
      section = { title: cleanLine(heading[1]!).toLowerCase(), points: [] };
      sections.push(section);
      continue;
    }
    if (!section) {
      section = { title: "", points: [] };
      sections.push(section);
    }
    const indent = raw.match(/^\s*/)![0].replace(/\t/g, "  ").length;
    const text = cleanLine(raw);
    const last = section.points[section.points.length - 1];
    if (indent >= 2 && last) {
      last.details.push(text);
    } else {
      section.points.push({ ...pointOwner(text), details: [] });
    }
  }
  return sections.filter((item) => item.points.length);
}

/** The section of to-dos, if the summary has one. */
export function isNextSteps(section: SummarySection) {
  return /next step|action item|to.?do|follow.?up/i.test(section.title);
}
