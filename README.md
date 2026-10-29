# The studio · Say Sukii

The private workspace for the Say Sukii floral studio, kept apart from the public site at [saysukii.com](https://www.saysukii.com).

Say Sukii makes flowers for weddings, events, deliveries, subscriptions, and set design. This is where that work is held: who wrote in, what they asked for, what was promised, what has been paid, and what needs Sukii next.

The public site is how people find the flowers. **The studio is how the work gets done.**

**Code:** [github.com/taistu/say-sukii-studio](https://github.com/taistu/say-sukii-studio)

---

## Who this is for

**Studio:** Say Sukii
**Founder:** Sukii
**Built by:** [TAĪSTU](https://taistu.com)

**Admins** see the whole studio: Today, Inquiries, Schedule, Library, and Settings. **Team members** see Today for now; the rooms they work in arrive with the next phase (see [What's next](#whats-next)).

---

## A week in the studio

How a job moves through the app, from the first note to a booked date:

1. **Someone writes in.** A client fills in the form at `/inquire`, emails the studio inbox, or messages Sukii and she adds them by hand. Every route lands in the same inquiry book.
2. **The studio sees it right away.** A new inquiry shows on Today with a notice, and the studio gets an email. Each inquiry gets a short summary of what's happening and the next step.
3. **Sukii writes back from the record.** Replies go out from the studio Gmail, in her voice, with her signature. The client's answers come back onto the same record, along with anyone else on the thread, like a planner or a parent.
4. **They talk.** The client books a call from the link in the letter, and the call shows on Today and on the schedule.
5. **A proposal or an invoice goes out.** A wedding or event gets a proposal with a private link. A single arrangement or a delivery gets a Square invoice instead, with no proposal needed.
6. **They say yes and pay.** On the proposal page, the client accepts, signs the service agreement, and pays the deposit through Square. That marks the date as held, sends them a receipt, and adds the job to Google Calendar.

---

## The rooms

The menu has four rooms, plus Settings.

### Today (`/dashboard`)

The first thing Sukii sees each morning.

- **Four counters** across the top: what's happening **today**, **new leads**, **pending** inquiries waiting on the studio, and **booked** jobs. Each opens its list.
- **Tasks:** the studio writes some for you as inquiries move along (reply to a new lead, follow up on a proposal), and you can add your own. Mark them done as you go.
- **The week:** calls, event dates, booked jobs, and tasks laid out across the days, opening on today.
- **A calendar** of the month, with marks on the busy days.
- **A detail card** for whatever you select: the summary of what's happening, the next step, the date, the place, and the budget.
- **Add an inquiry** for someone who wrote by DM, text, or a call, using the same questions as the public form.
- **The bell** shows new arrivals and anything that didn't go through, like an email that failed to send.

### Inquiries (`/pipeline`)

Every person who wrote in, as one record. The book sorts them by stage: **new**, **in touch**, **proposal sent**, and **booked**. Mail that Gmail thinks might be an inquiry waits in **needs review** until Sukii approves it or dismisses it, and the app learns from each choice.

Opening an inquiry shows:

- **A summary at the top:** what's happening with this client in a line or two, then the **next** step on its own line. It covers every situation, from a brand-new lead to a proposal they opened but haven't answered, an unpaid deposit, or an event next week. It's written in plain studio language and refreshes as things change.
- **The status path** from new to booked, and **archive** at the bottom once a lead is done.
- **The moment:** the date, or "tbd", and the place, with a place search that suggests real addresses.
- **Client details** and the client's **form answers**.

Then five tabs:

| Tab               | What it does                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Conversation**  | The Gmail thread as soft bubbles, with each subject as its own thread. Everyone on the thread shows by name, and replies go to all of them by default, with **to** and **cc** you can change. Attach files, and they go to the client. Schedule a letter for later, and cancel it if plans change. Starter letters ("let's connect!", "your proposal") and **help me write** are in the toolbar.                                   |
| **Proposal**      | Attach the proposal PDF, set the amount, a courtesy discount, and deposit or pay in full. Preview the proposal, the service agreement, and the invoice before sending. Then share the private link or email it, with a preview of the letter first.                                                                                                                                                                                |
| **Invoice**       | For work without a proposal, like an arrangement or a delivery. Pick items from the Square catalog, or add your own, and set quantities and prices. Choose deposit or pay in full, preview the letter, and send. The client gets a real Square invoice with a **pay your invoice** button, and it shows in Sukii's Square dashboard too. Sent invoices are listed with their status, and they're marked paid when the client pays. |
| **Files**         | Drop in references, layouts, and photos for this job. Open them or remove them.                                                                                                                                                                                                                                                                                                                                                    |
| **Internal note** | Notes only the studio sees.                                                                                                                                                                                                                                                                                                                                                                                                        |

### Schedule (`/calendar`)

The month, with every booked call, the studio's Google Calendar events, and the dates held for booked jobs. Opening a call shows a brief from that client's inquiry. With Granola connected, the meeting notes land on the call. **Settings** on this page set the hours clients can book, the length of a call, and how you meet. **Copy link** gives you the booking page to share.

### Library (`/library`)

The studio's book of people and places, and its files.

| Book        | What it holds                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Clients** | Name, email, phone, address, organization, type, and how they found you. A client's page lists their inquiries and files.      |
| **Vendors** | Wholesalers, markets, rentals, and warehouses: the contact, their location, and ordering notes.                                |
| **Venues**  | The category (hotel, gallery, event space), location, website, capacity, contact, load-in notes, and every inquiry held there. |

- **Search** each book.
- **Select** several entries at once to archive or delete them.
- **Open any entry** to edit it, with its notes on the left and its details on the right. Addresses open in Maps, and emails open the mail app.
- **Archived clients** stay in the book with an **archived** pill, so their history isn't lost.
- **Import from Notion** in one step: in Notion, use **⋯ → Export → Markdown & CSV**, unzip the download, then click **import** in the matching book. Notion's own columns are understood: "full name", "phone number", "location", "category", "website", and "capacity". Anyone already in the book is skipped.

The **files** shelf holds the studio's own papers alongside each client's files.

### Settings (`/settings`)

| Section         | What it's for                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Account**     | Your name and password.                                                                                           |
| **Connections** | **Google** (Calendar, Gmail, and Drive in one sign-in) and **Square** (the item catalog, invoices, and deposits). |
| **People**      | Invite someone into the studio, as an admin or a team member.                                                     |
| **Forms**       | Edit the questions on the public inquiry form, path by path.                                                      |
| **Health**      | Anything that didn't go through, like a letter that didn't send or a payment link that failed.                    |

---

## What clients see

| Page                    | What happens there                                                                                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`/inquire`**          | The inquiry form. It asks different questions for each path: weddings, events + activations, deliveries, concierge + subscriptions, and set design + styling.                                                                                                       |
| **`/schedule`**         | Book a call with Sukii. The guest gets a confirmation with the call on their calendar.                                                                                                                                                                              |
| **`/maya-chen`**        | The proposal, at the client's name on inside.saysukii.com: read it, approve it or ask for changes, sign the service agreement, and pay the deposit through Square. A second client with the same name gets `-2`. Older `/proposal/…` links move there on their own. |
| **Letters**             | Every reply comes from the studio Gmail, signed by the person who sent it.                                                                                                                                                                                          |
| **Square invoice page** | The pay button in an invoice letter opens Square's own page to pay by card.                                                                                                                                                                                         |

---

## What the studio does on its own

- **Every five minutes,** new mail in the studio inbox is read. Replies are filed onto their inquiry, and new leads go to needs review. Letters scheduled for that time go out.
- **Every inquiry keeps its summary current,** with the next step for Sukii.
- **Tasks appear** as an inquiry reaches a new stage.
- **A paid deposit** marks the date as held, sends the client a receipt, and puts the job on Google Calendar.
- **A paid Square invoice** marks itself paid in the invoice tab.
- **Each new inquiry** emails the studio a notice.

---

## How your team gets in

You decide who has access. Invite someone from **Settings → People**. They get an email, set themselves up at `/onboarding`, and land in the studio.

| Method         | How it works                                             |
| -------------- | -------------------------------------------------------- |
| **Password**   | Email and password. **Enter the studio.**                |
| **Magic link** | Enter email, then open the link that arrives.            |
| **Google**     | Continue with the Google account you use for the studio. |

A forgotten password resets from the same sign-in page.

---

## What's next

The next phase moves past the booked date, into the making of the work and the people who make it.

**Production space.** Today a paid deposit opens a project behind the scenes and puts it on the calendar, but it has no room of its own. The next room is where a booked job is built: the arrangements and their recipes, stem counts by variety and color, the shopping list and orders to vendors from the Library, the timeline and load-in using the venue's notes, and the job's files in one place. None of that exists yet: arrangements, recipes, stems, and orders will be designed and built with this room.

**Team coordination.** Team members can sign in today, but they only see Today. The next phase gives them the rooms they work in: who is on which job, call times for prep and install days, tasks handed to a person, and the production sheet each of them needs on the day.

---

## The brand at a glance

**Line**
Flowers for the people.

**Color**

| Color      | Hex       | Role                                 |
| ---------- | --------- | ------------------------------------ |
| Blush      | `#F5E6E8` | The room                             |
| Warm white | `#FFF8F9` | Cards and paper                      |
| Field      | `#FFF4F6` | Quiet fills                          |
| Pink       | `#FF4D94` | The accent: a date, a reply, a hover |
| Ink        | `#24221F` | Words                                |

**Tone**
Soft, specific, and close. A letter, not a brochure. The client's name first. Dates and places written the way you would say them, all in lowercase. Pink shows up where the eye should land. Everything else stays warm and quiet.

---

## Where things live

| Service                                                  | What it's for                                                                                                                                                                     |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[GitHub](https://github.com/taistu/say-sukii-studio)** | The code. History, pull requests, and deploys start here.                                                                                                                         |
| **[Vercel](https://vercel.com)**                         | Hosts the studio, the private rooms and the public pages. Environment variables for production are set here.                                                                      |
| **[Supabase](https://supabase.com)**                     | Sign-in, the database, and files in storage, with the migrations under `supabase/migrations/`. Also the clock: every five minutes it sends scheduled letters and reads new Gmail. |

Related:

| Service                                      | What it's for                                                                                                                     |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **[saysukii.com](https://www.saysukii.com)** | The public site. The studio and the form stay with this app.                                                                      |
| **Gmail**                                    | The living letters. Replies, proposals, and invoice letters send as Sukii from the connected studio inbox, and replies come back. |
| **Google Calendar**                          | Booked calls, and the job once a deposit is paid.                                                                                 |
| **Square**                                   | The item catalog, invoices, and deposits.                                                                                         |
| **Resend**                                   | The fixed notes: a new inquiry to the studio, a change request, a booking confirmation, and a deposit receipt.                    |
| **Granola**                                  | Meeting notes for calls on the schedule.                                                                                          |
| **Anthropic**                                | Reads new mail to spot inquiries, and writes the summary on each inquiry.                                                         |

---

## For developers

React, TanStack Start, Tailwind, and **Supabase** for auth and data. The app is one server. **Vercel** runs it. **Supabase** calls it every five minutes for scheduled letters and the mail poll. **GitHub** holds the code.

```bash
npm install
cp .env.example .env   # Supabase, Resend, Google, Square, Anthropic
npm run dev            # http://localhost:8080 — dev preview with sample data, no sign-in
npm run typecheck      # tsc --noEmit
npm run test:gmail     # mail, routing, summaries, reply-all, and csv import
npm run build          # type-checks first, then builds
```

`.env.example` lists every variable. Migrations live in `supabase/migrations/` and apply in timestamp order (`supabase db push`). The first migration replaces an older schema, so point it at a project you can reset. Production secrets stay on Vercel and are never committed.

The first admin is `info@saysukii.com`. Create that user in Supabase Auth, then insert that user's id, email, and the `admin` role into `public.profiles`. Change the temporary password after the first sign-in. Later teammates are invited from **Settings**.

**Where the code is.** Pages are in `src/routes/` (`_authenticated/` for the studio rooms). The inquiry record is `src/components/inquiry/InquiryLeadPane.tsx` with its composer, thread, invoice, and helpers in `src/components/inquiry/lead/`. Server functions are the `*.functions.ts` files in `src/lib/os/`, and server-only code is `*.server.ts`. Summaries are `src/lib/os/inquiry-summary.ts`, Gmail sending is `src/lib/os/letter-send.server.ts`, and Square is `src/lib/os/square.server.ts`.

### Vercel

Connect the GitHub repo. Nitro picks up a Vercel deploy on its own. Set every key from `.env.example`, and set `APP_URL` to `https://inside.saysukii.com`. Attach that domain.

Point these at that same origin:

- `GOOGLE_CALENDAR_REDIRECT_URI`
- `GOOGLE_GMAIL_REDIRECT_URI`
- `SQUARE_REDIRECT_URI`
- `SQUARE_WEBHOOK_URL` → `/api/square/webhook`
- `SQUARE_PAYMENT_REDIRECT_URL`

In Google Cloud, add those callbacks and enable Gmail send, Gmail read, Calendar, and Places. In Square, add the OAuth callback and a `payment.updated` webhook, and set `SQUARE_LOCATION_ID`. Square asks for permission to read items, customers, and invoices, and to write orders, customers, and invoices. Reconnect Square from **Settings** after that list changes. Generate `INTEGRATION_ENCRYPTION_KEY` and `CRON_SECRET` as long random values. After deploy, connect Google and Square from **Settings**.

### Supabase

Site URL is `https://inside.saysukii.com`. Allow redirects to `/auth/callback`, `/onboarding`, and `/onboarding?reset=1`.

**Every five minutes.** The `studio_cron` migration has Supabase call two routes on the app: `/api/cron/scheduled-letters` sends letters whose time has come, and `/api/cron/gmail-inbound` files a client's reply onto the inquiry. It reads the app's address and the cron secret from Vault, so add both once in the SQL editor, using the same `CRON_SECRET` that's on Vercel:

```sql
select vault.create_secret('https://inside.saysukii.com', 'studio_app_url');
select vault.create_secret('<CRON_SECRET from Vercel>', 'studio_cron_secret');
```

To see it working:

```sql
select jobname, status, return_message, start_time from cron.job_run_details
  join cron.job using (jobid) order by start_time desc limit 10;
select status_code, content, created from net._http_response order by created desc limit 10;
```

To change the secret later, update it in both places: `select vault.update_secret((select id from vault.secrets where name = 'studio_cron_secret'), '<new secret>');`

Google sign-in uses Supabase Auth. Enable the Google provider in the Supabase dashboard, and add `https://<project-ref>.supabase.co/auth/v1/callback` as an authorized redirect on that Google OAuth client.

The magic link and the password reset are sent by the studio in its own letter, from `src/lib/os/sign-in-email.functions.ts`. Only the team invite still uses Supabase's template, under Authentication → Emails in the Supabase dashboard.

### Email

Fixed notes and living letters are different. Put a template in the file that already sends that moment.

| Moment                                   | Who receives it                             | Where the words live                                                                                                                                 |
| ---------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Someone finishes `/inquire`              | The studio, at `INQUIRY_NOTIFICATION_EMAIL` | `src/emails/layout.html`, sent from `src/lib/os/inquiry-email.server.ts`                                                                             |
| A client asks for a change on a proposal | The studio, at `INQUIRY_NOTIFICATION_EMAIL` | `src/emails/layout.html`, sent from `src/lib/os/change-request-email.server.ts`                                                                      |
| A client approves a proposal             | The studio, at `INQUIRY_NOTIFICATION_EMAIL` | `src/emails/layout.html`, sent from `acceptPublicProposal` in `src/lib/os/proposals.functions.ts`                                                    |
| A guest books a time                     | The guest                                   | `src/emails/layout.html`, sent from `src/lib/os/booking-email.server.ts`                                                                             |
| Square confirms the deposit              | The client                                  | `src/emails/layout.html`, sent from `src/routes/api/square/webhook.ts`                                                                               |
| A reply, proposal, or invoice letter     | The client, from studio Gmail               | Written in the composer. Starter letters are `BUILT_IN_TEMPLATES` in `src/lib/os/mail-templates.ts`. The sign-off is `src/lib/os/mail-signature.ts`. |
| Magic link, password reset               | The team member signing in                  | `src/emails/layout.html`, sent from `src/lib/os/sign-in-email.functions.ts`                                                                          |
| Team invite                              | The person invited                          | Supabase → Authentication → Emails                                                                                                                   |

`RESEND_API_KEY` and `RESEND_FROM_EMAIL` send the fixed notes, the sign-in letters among them. Letters from an inquiry go through the connected Gmail account with the signature underneath, with any attachments, and threaded onto the conversation. A new HTML file won't change those letters until that sender is updated.

`public/email-preview.html` is a picture of the change-request card and a client letter. Nothing sends it.

### A quiet check after deploy

Send a test inquiry, book a test time, send a test letter with an attachment, schedule one for a few minutes out, send a Square sandbox invoice, and pay a sandbox deposit. The inquiry should land on Today, the guest should get the booking note, both letters should arrive from Gmail, the invoice should show paid, and the deposit should put the job on the calendar.

---

_The studio · Say Sukii × TAĪSTU · October 2026_
