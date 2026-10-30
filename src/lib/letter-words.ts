/** the place in a designed letter's html where its words go, so a preview can fill them in as they're typed */
export const LETTER_WORDS = "@@letter-words@@";

/** puts the words into the letter the way the email layout does: escaped, with line breaks kept */
export function fillLetterWords(html: string, words: string) {
  const escaped = words
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("\n", "<br>");
  return html.replace(LETTER_WORDS, escaped);
}
