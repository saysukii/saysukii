import { z } from "zod";

export const MAX_NOTE_LENGTH = 650;
export const MAX_NAME_LENGTH = 60;
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
/** a minute of phone video at the card's bitrate is well under this; it stays inside storage's 50mb upload cap */
export const MAX_VIDEO_BYTES = 45 * 1024 * 1024;

/** The words beside the checkboxes on the card. Saved with each recording, as the record of what was agreed. */
export const VOICE_CONSENT_WORDING = "i give say sukii permission to store and use my voice note.";
export const VOICE_MARKETING_WORDING =
  "i give say sukii permission to use my voice note in its marketing.";
export const VIDEO_CONSENT_WORDING = "i give say sukii permission to store and use my video note.";
export const VIDEO_MARKETING_WORDING =
  "i give say sukii permission to use my video note in its marketing.";

const AUDIO_EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
};

const VIDEO_EXTENSIONS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

const loveNoteSchema = z.object({
  text: z
    .string()
    .max(MAX_NOTE_LENGTH * 2)
    .optional()
    .default(""),
  name: z
    .string()
    .max(MAX_NAME_LENGTH * 2)
    .optional()
    .default(""),
  consent: z.boolean().optional().default(false),
  consentMarketing: z.boolean().optional().default(false),
  // browsers name a recording's type with its codec too, like "audio/webm;codecs=opus"
  audioType: z.string().max(80).optional().default(""),
  audioBytes: z.number().int().nonnegative().optional().default(0),
  videoType: z.string().max(120).optional().default(""),
  videoBytes: z.number().int().nonnegative().optional().default(0),
  website: z.string().max(240).optional().default(""),
});

export type LoveNoteInput = {
  note: string;
  name: string;
  audio: { contentType: string; extension: string } | null;
  /** a note carries a voice note or a video note, never both */
  video: { contentType: string; extension: string } | null;
  /** marketing is optional, and only ever applies to a recording */
  marketing: boolean;
};

export type ParsedLoveNote =
  { kind: "ok"; input: LoveNoteInput } | { kind: "bot" } | { kind: "invalid"; error: string };

/** Checks a note exactly as it arrives from the public page: nothing about it is trusted yet. */
export function parseLoveNote(raw: unknown): ParsedLoveNote {
  const parsed = loveNoteSchema.safeParse(raw);
  if (!parsed.success) return { kind: "invalid", error: "invalid note" };
  const {
    text,
    name: rawName,
    consent,
    consentMarketing,
    audioType,
    audioBytes,
    videoType,
    videoBytes,
    website,
  } = parsed.data;

  // a hidden field people never see: only bots fill it in
  if (website.trim()) return { kind: "bot" };

  const note = text.trim().toLowerCase();
  if (note.length > MAX_NOTE_LENGTH) return { kind: "invalid", error: "note is too long" };

  const name = rawName.trim();
  if (!name || name.length > MAX_NAME_LENGTH) return { kind: "invalid", error: "a name is needed" };

  let audio: LoveNoteInput["audio"] = null;
  if (audioType) {
    const contentType = audioType.split(";")[0]!.trim().toLowerCase();
    const extension = AUDIO_EXTENSIONS[contentType];
    if (!extension || audioBytes < 1 || audioBytes > MAX_AUDIO_BYTES) {
      return { kind: "invalid", error: "invalid voice note" };
    }
    if (!consent) return { kind: "invalid", error: "consent is needed for a voice note" };
    audio = { contentType, extension };
  }

  let video: LoveNoteInput["video"] = null;
  if (videoType) {
    if (audio) return { kind: "invalid", error: "one recording per note" };
    const contentType = videoType.split(";")[0]!.trim().toLowerCase();
    const extension = VIDEO_EXTENSIONS[contentType];
    if (!extension || videoBytes < 1 || videoBytes > MAX_VIDEO_BYTES) {
      return { kind: "invalid", error: "invalid video note" };
    }
    if (!consent) return { kind: "invalid", error: "consent is needed for a video note" };
    video = { contentType, extension };
  }

  if (!note && !audio && !video) return { kind: "invalid", error: "a note or recording is needed" };
  const recorded = !!audio || !!video;
  return {
    kind: "ok",
    input: { note, name, audio, video, marketing: recorded && consentMarketing },
  };
}
