/** The ways paying can look, for the pay pop-up and the local studies page. */
export type PayMomentStyle = "circle" | "dot" | "line" | "button";
export type PayPhase = "paying" | "paid";

export const PAY_MOMENTS: Array<{ id: PayMomentStyle; name: string; idea: string }> = [
  {
    id: "circle",
    name: "the circle",
    idea: "a thin pink ring turns while it pays, then closes and a check draws inside.",
  },
  {
    id: "dot",
    name: "the dot",
    idea: "a pink dot breathes while it pays, then grows into a circle with a white check.",
  },
  {
    id: "line",
    name: "the line",
    idea: "a thin line fills under the amount while it pays, then the amount turns pink with a check.",
  },
  {
    id: "button",
    name: "the button",
    idea: "the pay button itself says paying with a soft shimmer, then turns pink and reads paid.",
  },
];
