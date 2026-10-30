// little words inside a name that stay lowercase: "fleurs de villes", "gigi of henri bendel"
const PARTICLES = new Set([
  "de",
  "del",
  "della",
  "la",
  "le",
  "da",
  "di",
  "du",
  "van",
  "von",
  "der",
  "of",
  "and",
  "at",
  "for",
  "the",
]);

/**
 * A client's name with each word capitalized: "amiyah qi" → "Amiyah Qi". Only a word written all in
 * lowercase changes, so "McKenzie", "deRoquancourt", and "TAĪSTU" stay as they are, and anything
 * that reads like an email ("ashlee.balom001") is left alone.
 */
export function capitalizeName(value: string) {
  const name = value.trim();
  if (!name || /[@\d]/.test(name) || /\.\S/.test(name)) return name;
  return name
    .split(/(\s+)/)
    .map((word, index) => {
      if (word !== word.toLowerCase() || word.toUpperCase() === word) return word;
      if (index > 0 && PARTICLES.has(word)) return word;
      return word.replace(
        /(^|[-‐'’])(\p{L})/gu,
        (_, mark: string, letter: string) => `${mark}${letter.toUpperCase()}`,
      );
    })
    .join("");
}
