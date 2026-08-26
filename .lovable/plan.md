# Say Sukii Portal — Round 1: Proposal Studio

Build the branded portal shell plus the Proposal Studio end to end: pick a service line, build priced line items, attach essence images, and generate a linked proposal + agreement + invoice set that can be emailed from the portal. Pipeline, Accounts, and Dashboard follow in the next round (the tables for them are created now so nothing has to be re-plumbed).

## One thing to flag on payments

Square is not one of Lovable's built-in payment providers, so it can't be enabled with one click the way Stripe or Paddle can. Square is still doable: it connects using your own Square account credentials (access token + location ID + webhook signature key from the Square developer dashboard), and payment status is set only by Square's webhook. That's the route this plan takes. If you'd rather skip the account setup, built-in Stripe payment links need no keys at all — say the word and I'll swap it.

Round 1 creates invoices with correct amounts and deposit/balance splits, and leaves a payment-link field ready. The Square hookup is a short follow-up step once you have the credentials.

## Design system

Brand skin applied globally as design tokens, not one-off styles.

- Blush cream ground `#F3EBE4`, frosted white surfaces (~60% white + 20px blur, 1px white border, soft shadow), solid alt `#FBF7F4`, petal `#F0D3D7`, rose `#DEA6AD`, bloom `#C77E86`, ink `#1A1817`, muted `#8A7F79`.
- Iridescent hover glow: `#F8D7E4` → `#D9DDF6`, on buttons/hover only.
- Type: Montserrat throughout — heavy weights and wide tracking for display moments and big numbers, regular/medium for body, labels, and inputs.
- Radii: cards 24px, inputs 14px, buttons pill or circular.
- Buttons: default is neumorphic cream with dual shadow and an iridescent bloom on hover; primary is a solid ink pill with white label and an arrow. Arrow motif recurring (↗ / →).
- Ambient blurred pink gradient orbs used sparingly; optional faint dotted grid.
- Motion: gentle fades and slight hover scale only, with reduced-motion respected.
- Say Sukii wordmark (uploaded black + white marks) in the app header and on generated documents.

## What gets built

**Auth** — admin-only email/password sign-in plus Google, single shared workspace. All app routes behind the auth gate; no client login.

**App shell** — glass sidebar/topbar with the wordmark, nav for Dashboard, Pipeline, Accounts, Proposals, Rate Card. Non-Proposal sections show a light placeholder this round.

**Rate Card** — manage line items per service line (floral / wedding / experiential) with unit and unit price.

**Proposal Studio** (the focus)
1. Choose project (or create one inline against an account) and service line.
2. Add rate-card items or custom lines, set qty; live total shown in the UI but recomputed and stored server-side.
3. Drop in essence images (uploaded to storage, stored as URLs).
4. Choose agreement type: standard or in-kind barter.
5. Choose deposit (50%) or pay-in-full (100%).
6. Generate the set: proposal (numbered), agreement (versioned, from a template), invoice (auto-number starting INV-101) — all linked to the one project.
7. Preview each document in the branded layout, download PDF, and send by email to the account contact from info@saysukii.com with the PDFs attached.
8. Sending marks the proposal `sent`, stamps `sent_at`, and moves the project to `proposal_out`.

**Proposals list** — every generated set with status, total, and quick access to the documents.

## Technical notes

- Database in Lovable Cloud (Postgres): `accounts`, `projects`, `rate_card_items`, `proposals`, `proposal_line_items`, `agreements`, `invoices` exactly as specified — money in integer cents, UTC timestamps, `archived` boolean instead of hard deletes. RLS enabled; authenticated admins have full access, no anon access. Storage bucket for essence images.
- All pricing, subtotals, totals, deposit/balance splits, and invoice/proposal numbering computed in server functions. Browser-submitted totals are ignored. Invoice numbering uses a Postgres sequence-backed function so concurrent generation can't collide.
- PDFs rendered server-side from branded HTML templates and stored in Cloud storage; `pdf_url` saved on the proposal.
- Email via the Lovable email infrastructure sending from the saysukii.com domain — this needs a one-time domain verification step (DNS records) which I'll surface when we get there.
- Payment status column is only ever written by the payment webhook handler, never by client code.
- Seed data: the rate card is seeded with starter items per service line, and both agreement templates (standard, in-kind barter) ship as content templates.

## Next rounds

Round 2: Pipeline board + list + detail panel, Accounts with history and high-value flag, Dashboard attention widgets and season revenue. Round 3: Square credentials wired, live payment links, webhook-driven paid/deposit_paid status.
