# Say Sukii Studio

Product vision

The Say Sukii Portal is the internal operating system for Say Sukii, a Miami floral + experiential design studio. It replaces a Notion workspace the studio has outgrown. It gives the founder one branded place to move a project from first conversation to booked and invoiced — removing the studio's biggest time drain (proposals + invoicing) and making the studio look as elite on paper as it is in the room. The portal is client-owned and lives on Say Sukii's own domain.

V1 goal: live before the fall proposal wave (Sept–Oct), ahead of Art Basel + holiday season.

Users & roles

Admin (Sukii + team) — the only logged-in users in V1. Single shared workspace. Admins can do everything.

Clients — do not log in during V1. They only receive proposals, agreements, and invoices by email (PDF + payment link). A client-facing login is a later phase.

Core features — V1 (must-have)

Dashboard — what needs attention: outstanding proposals, unpaid invoices, upcoming booked events, season revenue snapshot.

Pipeline — every project as one record moving through stages: Conversation → Proposal Out → Agreement → Booked → Complete. Board + list views + detail panel.

Accounts — clients and prospects with contact info, notes, and project history. High-value flag for hotels / restaurants / corporate wellness targets.

Proposal Studio — the core. Pick a service line → add rate-card line items with a live total → drop in essence images → generate a branded proposal + agreement + invoice as one set → send from the portal.

Out of scope for V1 (later phases — do not build yet)

Portfolio/archive, Sourcing/vendors, Production/logistics, full Essence Library, subscriptions & recurring deliveries, per-project margin analytics, client login.

Data model

All money in integer cents. All timestamps UTC. No hard deletes — use an archived boolean.

accounts — id, name, type (prospect | client), tier (standard | high_value), contact_name, email, phone, notes, archived, created_at

projects — id, account_id→accounts, title, service_line (floral | wedding | experiential), event_date, venue, budget_estimate_cents, stage (conversation | proposal_out | agreement | booked | complete), archived, created_at

rate_card_items — id, service_line, name, description, unit (each | hour | arrangement | flat), unit_price_cents

proposals — id, project_id→projects, number (auto), status (draft | sent | accepted | declined), subtotal_cents, total_cents, essence_image_urls[], pdf_url, created_at, sent_at

proposal_line_items — id, proposal_id→proposals, rate_card_item_id→rate_card_items (nullable), name, qty, unit_price_cents, line_total_cents

agreements — id, proposal_id→proposals, type (standard | in_kind_barter), content, version, created_at

invoices — id, proposal_id→proposals, number (auto, e.g. INV-101), amount_cents, deposit_cents, balance_cents, status (unpaid | deposit_paid | paid), due_date, stripe_payment_link, created_at

Business rules

Pricing is computed server-side. Never trust totals from the browser.

Invoice numbers auto-increment, generated server-side, starting at INV-101.

Deposit option = 50% of total; pay-in-full = 100%.

Payment status is set only by the Stripe webhook — never the browser.

One project generates one linked set: proposal → agreement → invoice.

The in-kind barter agreement is a selectable agreement type.

Design system

The portal's look — Say Sukii's brand. (This is not the warm-cream framework-document skin; separate thing.) Direction: soft, dreamy, romantic, editorial — flowers for the people. Glassmorphism + neumorphism on a blush-cream ground, with a high-contrast serif for big moments. Airy, generous whitespace, refined. Mobile + desktop responsive.

Palette

Background (blush cream): #F3EBE4

Surface / card (frosted): white at ~60% opacity with backdrop blur; solid alt #FBF7F4

Petal (light blush): #F0D3D7

Rose (primary pink accent): #DEA6AD

Bloom (deep rose, for gradients): #C77E86

Ink (text + high-contrast CTA): #1A1817

Muted text: #8A7F79

Iridescent glow (button / hover only): soft pink #F8D7E4 → periwinkle #D9DDF6

Type (swap for Say Sukii's licensed fonts if they exist)

Display / headings / big numbers: a soft high-contrast serif — Fraunces (Google Fonts; romantic, variable). Licensed alternatives: Canela, Reckless, PP Editorial New.

Body / UI / labels / inputs: a clean humanist sans — Inter (or General Sans / Geist).

Surfaces & texture

Glassmorphism for cards and overlays: translucent, ~20px backdrop blur, 1px light (white) border, soft drop shadow, on gentle pink gradient grounds.

Soft, generous radius: cards ~24px, inputs ~14px, buttons pill or circular. (Opposite of the flat, zero-radius document skin — the portal is soft.)

Ambient: blurred pink gradient orbs as background accents, used sparingly; optional faint dotted-grid texture.

Buttons (reference 04 — the studio's preferred style)

Default — neumorphic soft-UI: cream base (#FBF7F4), extruded look via dual shadow (light highlight top-left, soft shadow bottom-right). On hover / active, bloom a subtle iridescent pink→periwinkle glow. Icon buttons are circular with an arrow (↗ / →); text buttons are pills.

Primary — high-contrast (from 01): solid ink-black pill, white label, arrow — for the single most important action on a screen.

Arrows are a recurring motif throughout.

Motion: gentle only — soft fades, slight scale on hover, the glow bloom on buttons. Respect reduced-motion.

Tech stack

React + Vite + Tailwind (frontend) · Supabase via Lovable Cloud (Postgres, auth, storage, RLS, edge functions) · Stripe (deposits + payment links) · Resend (sending from the Say Sukii domain) · server-side PDF generation for the proposal/agreement/invoice.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/bfbedd03-71a7-42a6-8bff-1d2780356b20).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
