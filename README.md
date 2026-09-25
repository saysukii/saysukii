# Say Sukii OS

Say Sukii OS is the internal studio operating system for Say Sukii, a Miami floral and
experiential design studio. It brings inquiries, proposals, projects, clients, and the
studio's creative library into one calm, branded workspace.

## V1

- Role-aware workspaces for administrators and team members
- A daily overview of work that needs attention
- Inquiry and proposal management
- Project and client records
- A shared studio library
- Square-powered payment workflows

## Stack

- [Cursor](https://cursor.com) for development
- [TanStack Start](https://tanstack.com/start) and React
- Tailwind CSS
- [Supabase](https://supabase.com) for Postgres, authentication, storage, and RLS
- [Square](https://squareup.com) for payments
- Resend for studio email
- Server-side PDF generation for proposal documents

## Development

Install Node.js and npm, then run:

```sh
git clone <this-repository-url>
cd <repository-name>
npm install
cp .env.example .env
npm run dev
```

Apply `supabase/migrations/20260828150000_say_sukii_os_v1.sql` to a fresh or
intentionally reset Supabase project before signing in. The migration replaces
the prototype schema, so do not run it against data you need to preserve.

Create the first Admin by inviting the account in Supabase Auth, then insert its
`auth.users.id`, email, and the `admin` role into `public.profiles`. Future team
members can be invited from Settings.

Configure Square and Google callback URLs exactly as listed in `.env.example`.
Configure Square's `payment.updated` webhook to use `/api/square/webhook`. Keep
service-role, OAuth, webhook, Resend, and encryption secrets server-only.

Useful checks:

```sh
npm run lint
npm run build
```

## Deployment

The application builds for the Cloudflare module preset. Before deploying:

1. Apply the production Supabase migration and create the first Admin.
2. Add every server and Vite environment variable from `.env.example`.
3. Replace localhost values with the production HTTPS origin.
4. Connect Square and Google Calendar from Admin Settings.
5. Submit a test inquiry, send and accept a test proposal, then complete a
   Square sandbox deposit to verify project creation and Calendar sync.
