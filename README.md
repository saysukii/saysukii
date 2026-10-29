# The studio — Say Sukii

An internal home for the floral studio, kept apart from the public site at [saysukii.com](https://www.saysukii.com).

Say Sukii makes flowers for weddings, events, deliveries, and the rooms people remember. This is where that work is held: who wrote in, what the day looks like, what is on the books, and what still needs a reply.

The public site is how people find the flowers. **The studio is how the work gets done.**

**Code:** [github.com/taistu/say-sukii-studio](https://github.com/taistu/say-sukii-studio)

---

## Who this is for

**Studio:** Say Sukii
**Founder:** Sukii
**Built by:** [TAĪSTU](https://taistu.com)

The studio is for the people who run the work with you. Admins see the full book — today, inquiries, the schedule, files, directories, and settings. Team members you invite land in the same house, with the rooms an admin opens for the day-to-day.

---

## How your team gets in

You decide who has access. Invite someone from **Settings**. They receive an email, set themselves up, and land in the studio.

Three ways back in, every time:

| Method         | How it works                                             |
| -------------- | -------------------------------------------------------- |
| **Password**   | Email and password. **Enter the studio.**                |
| **Magic link** | Enter email → open the link that arrives.                |
| **Google**     | Continue with the Google account you use for the studio. |

Forgot a password, and the reset note comes from the same sign-in page.

---

## What's inside

The menu is the map. Each room is a piece of how a floral studio actually moves through a week.

### Today (`/dashboard`)

The first thing you see. A greeting, the date, and what still needs you — oldest first. The calendar sits beside the week. The week opens on today. Scroll up for the earlier days in this week, and down for the days still ahead. Meetings, inquiries, and open tasks live on that floor together.

### Inquiries (`/pipeline`)

Every person who wrote in, as one record. The letter, the date, the place, the budget, and the next reply. You answer from the record itself, in your own voice, from `info@saysukii.com`. A proposal goes out as a letter with a private link, not as a separate system the client has to learn.

The public form lives at `/inquire`. Weddings, events, deliveries, concierge, and set design each ask their own questions. A finished form arrives on Today and in the inquiry book.

### Schedule (`/schedule`)

Conversations booked from the letter. The public page is `/book` — a short hold with you, on Google Meet. The guest gets a note that the time is theirs, with the meeting attached to their calendar. The same conversations show on Today.

### Files (`/files`)

The studio's papers in one place. Proposals, references, and the files that belong to a job, without hunting through a desktop.

### Directories (`/directories`)

The book of people and places.

| Book        | What it holds                                             |
| ----------- | --------------------------------------------------------- |
| **Clients** | Name, email, phone, organization, and how they found you. |
| **Venues**  | The room, the address, who to call, and load-in notes.    |
| **Vendors** | Who you order from, and how the order goes out.           |

Each book can take a `.csv` when the columns match the fields already in that book. A row already there is left alone.

### Settings (`/settings`)

The studio account, team invites, and the two connections that power the week: **Google** (Calendar, Gmail, and Drive as one sign-in) and **Square** (deposits). This is where you decide who can come in.

Behind a booked job, the record continues into the project, the agreement, and the stem library (`/library`) — arrangements, stems, and the shopping list for a build.

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
| Pink       | `#FF4D94` | The accent — a date, a reply, a mark |
| Ink        | `#24221F` | Words                                |

**Tone**
Soft, specific, and close. A letter, not a brochure. The client's name first. Dates and places written the way you would say them. Pink shows up where the eye should land. Everything else stays warm and quiet.

---

## How this supports the studio

The studio is built around how Say Sukii already works.

1. **One place for the week** — Today, the inquiry, and the schedule share the same people, so a reply and a meeting are not in two different tools.
2. **The inquiry arrives whole** — the public form keeps the vision, the date, the place, and the budget on the record before you ever write back.
3. **Letters go out as you** — replies and proposals send from the studio Gmail, with your signature under them.
4. **The book stays current** — clients, venues, and vendors live here, and a spreadsheet can come in when it already speaks the same fields.
5. **A yes becomes a job** — a proposal link, a signature, and a Square deposit move the work onto the books and onto the calendar.
6. **Room to keep growing** — Google, Square, and Resend sit underneath. New letters and new rooms layer on without starting over.

---

## What's live today

- Today, with the week opening on the current day
- Inquiries, and the public form at `/inquire`
- Letters back to the client from the studio Gmail, including the proposal link
- Public proposal page — read, request a change, sign, pay the deposit
- Schedule, and the public booking page at `/book`
- Files
- Directories for clients, venues, and vendors, including CSV import
- Projects, agreements, and the arrangement and stem library
- Settings — team invites, Google, and Square
- Sign-in by password, magic link, or Google

---

## Where things live

| Service                                                  | What it's for                                                                                                                                                                                                           |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[GitHub](https://github.com/taistu/say-sukii-studio)** | The code. History, pull requests, and deploys start here.                                                                                                                                                               |
| **[Vercel](https://vercel.com)**                         | Hosts the studio — the private rooms and the public pages (`/inquire`, `/book`, `/proposal/…`). Environment variables for production are set here.                                                                      |
| **[Supabase](https://supabase.com)**                     | Auth and the database — sign-in, the book, files in storage, and the migrations under `supabase/migrations/`. Also the clock: every five minutes it sends scheduled letters and files new Gmail onto the right inquiry. |

Related:

| Service                                      | What it's for                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **[saysukii.com](https://www.saysukii.com)** | The public site. The studio and the form stay with this app.                                                                          |
| **Resend**                                   | The fixed notes: a new inquiry to the studio, a change request to `info@saysukii.com`, a booking confirmation, and a deposit receipt. |
| **Gmail**                                    | The living letters. Replies and proposals send as Sukii, from the connected studio inbox.                                             |
| **Google Calendar**                          | The meeting, and the job once a deposit is paid.                                                                                      |
| **Square**                                   | The deposit. A paid deposit opens the project.                                                                                        |

---

## For developers

React, TanStack Start, Tailwind, **Supabase** for auth and data. The app is one server. **Vercel** runs it. **Supabase** also calls it every five minutes for scheduled letters and the mail poll. **GitHub** holds the code.

```bash
npm install
cp .env.example .env   # Supabase, Resend, Google, Square
npm run dev            # http://localhost:8080
npm run build
```

`.env.example` lists every variable. Migrations live in `supabase/migrations/` and apply in timestamp order (`supabase db push` on a fresh project). The first migration replaces an older schema, so point it at a project you can reset. Production secrets stay on Vercel. They are never committed.

The first admin is `info@saysukii.com`. Create that user in Supabase Auth, then insert that user's id, email, and the `admin` role into `public.profiles`. Change the temporary password after the first sign-in. Later teammates are invited from **Settings**.

### Vercel

Connect the GitHub repo. Nitro picks up a Vercel deploy on its own. Set every key from `.env.example`, and set `APP_URL` to `https://inside.saysukii.com`. Attach that domain.

Point these at that same origin:

- `GOOGLE_CALENDAR_REDIRECT_URI`
- `GOOGLE_GMAIL_REDIRECT_URI`
- `SQUARE_REDIRECT_URI`
- `SQUARE_WEBHOOK_URL` → `/api/square/webhook`
- `SQUARE_PAYMENT_REDIRECT_URL`

In Google Cloud, add those callbacks and enable Gmail send, Gmail read, Calendar, and Places. In Square, add the OAuth callback and a `payment.updated` webhook. Generate `INTEGRATION_ENCRYPTION_KEY` and `CRON_SECRET` as long random values. After deploy, connect Google and Square from **Settings**.

### Supabase

Site URL is `https://inside.saysukii.com`.

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

To change the secret later, update it in both places: `select vault.update_secret((select id from vault.secrets where name = 'studio_cron_secret'), '<new secret>');` Allow redirects to `/auth/callback`, `/onboarding`, and `/onboarding?reset=1`.

Google sign-in uses Supabase Auth. Enable the Google provider in the Supabase dashboard, and add `https://<project-ref>.supabase.co/auth/v1/callback` as an authorized redirect on that Google OAuth client.

Auth templates for the magic link, the password reset, and the team invite are edited in the Supabase dashboard, under Authentication → Emails. Those notes are not in this repo.

### Email

Fixed notes and living letters are different. Put a template in the file that already sends that moment.

| Moment                                   | Who receives it                             | Where the words live                                                                                                                                               |
| ---------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Someone finishes `/inquire`              | The studio, at `INQUIRY_NOTIFICATION_EMAIL` | `src/emails/layout.html`, sent from `src/lib/os/inquiry-email.server.ts`                                                                                           |
| A client asks for a change on a proposal | `info@saysukii.com`                         | `src/emails/layout.html`, sent from `src/lib/os/change-request-email.server.ts`                                                                                    |
| A guest books a time                     | The guest                                   | `src/emails/layout.html`, sent from `src/lib/os/booking-email.server.ts`                                                                                           |
| Square confirms the deposit              | The client                                  | `src/emails/layout.html`, sent from `src/routes/api/square/webhook.ts`                                                                                             |
| A reply or a proposal letter             | The client, from studio Gmail               | The composer on the inquiry. Starter letters are `MOCK_TEMPLATES` in `src/components/inquiry/InquiryLeadPane.tsx`. The sign-off is `src/lib/os/mail-signature.ts`. |
| Magic link, password reset, team invite  | The person signing in                       | Supabase → Authentication → Emails                                                                                                                                 |

`RESEND_API_KEY` and `RESEND_FROM_EMAIL` send the fixed notes. Letters from an inquiry go through the connected Gmail account, as plain text, with the signature underneath. A new HTML file will not change those letters until that sender is updated.

`public/email-preview.html` is a picture of the change-request card and a client letter. Nothing sends it.

### A quiet check after deploy

Send a test inquiry, book a test time, send a test letter with a proposal link, and pay a Square sandbox deposit. The inquiry should land on Today, the guest should get the booking note, the letter should arrive from Gmail, and the deposit should open the project.

---

_The studio · Say Sukii × TAĪSTU · October 2026_
