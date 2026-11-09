# OctaOps

Mobile-first Field Service Management PWA for a small espresso machine repair team in Vancouver, BC.

It replaces a WhatsApp approval loop and manual invoice checking with:

- job dispatch and assignment to technicians
- a technician report form (time in/out, work performed, parts used, photos, notes)
- admin review and approval, with an automatic email to accounting
- a billing alert for jobs approaching the 90-day expiry
- parts lookup shared with the catalog app

See [OCTAOPS.md](OCTAOPS.md) for the full product brief and [IDEAS.md](IDEAS.md) for out-of-scope ideas.

## Stack

PWA frontend, Supabase (Postgres, Auth, RLS, Edge Functions), Resend for email, Vercel or Netlify for hosting.

## Setup

Copy `.env.example` to `.env` and fill in your own Supabase URL and anon key. Never commit `.env` or any service key.

## Tests

The app has no build step. The tests are dev-only:

```
npm install
npm test            # unit tests (paste reader, timesheet helpers)
npm run test:rls    # applies every migration to a throwaway Postgres and checks who can read and write what
```

Database changes live in `supabase/migrations`, numbered in the order they must be run in the Supabase SQL Editor.

## Security

This repository is public. It must never contain service keys, personal data, client names or store addresses. Every Supabase table has Row Level Security enabled.
