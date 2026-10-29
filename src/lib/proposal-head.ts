/** How a proposal link reads when it's shared, in a text or an email preview. */
export function proposalHead() {
  return {
    meta: [
      { title: "say sukii proposal" },
      { name: "description", content: "a floral design proposal prepared for you by say sukii." },
      { property: "og:title", content: "say sukii proposal" },
      { name: "twitter:title", content: "say sukii proposal" },
      {
        property: "og:description",
        content: "a floral design proposal prepared for you by say sukii.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  };
}
