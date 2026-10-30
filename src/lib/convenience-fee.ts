/** every card payment, apple pay included, carries a 4% convenience fee */
export const CONVENIENCE_FEE_RATE = 0.04;
export const CONVENIENCE_FEE_LABEL = "Convenience fee (4%)";

/** 4% of an amount, to the cent */
export function convenienceFee(cents: number) {
  return Math.round(Math.max(0, cents) * CONVENIENCE_FEE_RATE);
}

/**
 * The fee on one payment toward a total: its share of 4% on everything paid so far. A deposit and
 * its balance each carry half, and together they come to exactly 4% of the whole.
 */
export function paymentFee(baseCents: number, paidBeforeCents = 0) {
  return convenienceFee(paidBeforeCents + baseCents) - convenienceFee(paidBeforeCents);
}

/** what a payment charges the card: the amount and its fee */
export function withFee(baseCents: number, paidBeforeCents = 0) {
  return baseCents + paymentFee(baseCents, paidBeforeCents);
}

/** a charge taken apart again: what it paid toward the total, and its fee */
export function splitCharge(chargedCents: number, paidBeforeCents = 0) {
  const guess = Math.round(chargedCents / (1 + CONVENIENCE_FEE_RATE));
  for (const step of [0, -1, 1, -2, 2]) {
    const base = guess + step;
    if (withFee(base, paidBeforeCents) === chargedCents) {
      return { baseCents: base, feeCents: chargedCents - base };
    }
  }
  return { baseCents: chargedCents, feeCents: 0 };
}
