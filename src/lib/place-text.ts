/** The studio is in Florida, so an address never needs to end in the country. */
export function withoutCountry(address: string | null | undefined) {
  return (address ?? "")
    .replace(/,?\s*(united states( of america)?|u\.?s\.?a?\.?)\s*$/i, "")
    .trim();
}
