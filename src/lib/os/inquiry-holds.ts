const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isVenueTbd(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase() === "tbd";
}

export function inquiryHoldDates(inquiry: {
  event_date?: string | null;
  event_date_tbd?: boolean | null;
  message?: string | null;
}) {
  if (inquiry.event_date_tbd) return [];
  const noted = (inquiry.message ?? "")
    .split("\n")
    .flatMap((line) => {
      const match = line.trim().match(/^Dates:\s*(.+)$/i);
      return match?.[1]?.split(",") ?? [];
    })
    .map((part) => part.trim())
    .filter((part) => DATE.test(part));
  return [...new Set(inquiry.event_date ? [inquiry.event_date, ...noted] : noted)];
}

export function withDatesNote(message: string, dates: string[]) {
  const unique = [...new Set(dates.filter((date) => DATE.test(date)))];
  const body = message
    .split("\n")
    .filter((line) => !/^Dates:\s+/i.test(line.trim()))
    .join("\n")
    .trim();
  const note = unique.length > 1 ? `Dates: ${unique.join(", ")}` : "";
  return [body, note].filter(Boolean).join("\n");
}

export function studioFileKey(folder: string, name: string) {
  const ext = name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const stem =
    name
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "file";
  return `${folder}/${Date.now()}-${stem}.${ext}`;
}

export function fileContentType(file: File) {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const known: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    pdf: "application/pdf",
    zip: "application/zip",
  };
  return known[ext] ?? "application/octet-stream";
}
