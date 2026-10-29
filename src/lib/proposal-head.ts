/** How a proposal link reads when it's shared, in a text or an email preview. */
export function proposalHead() {
  return {
    meta: [
      { title: "your proposal · say sukii" },
      { name: "description", content: "a floral design proposal prepared for you by say sukii." },
      { property: "og:title", content: "your proposal · say sukii" },
      {
        property: "og:description",
        content: "a floral design proposal prepared for you by say sukii.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  };
}
