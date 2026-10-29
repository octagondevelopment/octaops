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

## Security

This repository is public. It must never contain service keys, personal data, client names or store addresses. Every Supabase table has Row Level Security enabled.
