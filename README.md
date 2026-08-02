# Dispatch — Service Marketing

WhatsApp + email campaigns for **service businesses** — bookings, consultations, offers, and client follow-ups (Meta Cloud API + SMTP).

## Features

- **Overview** — channel status, clients, campaigns, messages, unread inbox
- **Inbox** — WhatsApp 24h client replies + email threads
- **Campaigns** — promote services, book consultations, send reminders
- **Clients** — phone and/or email, CSV import
- **Templates** — service-marketing samples; sync Meta for live WhatsApp
- **Analytics** — sent / delivered / read / failed
- **Settings** — WhatsApp (Meta) + Email (SMTP)
- **Auth** — single admin (team roles ready in schema)

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- PostgreSQL + Prisma
- Redis + BullMQ (campaign queue)
- NextAuth (credentials)

## Quick start

### 1. Start infrastructure

**Option A — Docker**

```bash
docker compose up -d
```

**Option B — Homebrew (macOS)**

```bash
brew services start postgresql@16
brew services start redis
createdb whatsapp_bulk   # once
```

Then set in `.env`:

```
DATABASE_URL=postgresql://YOUR_USER@localhost:5432/whatsapp_bulk?schema=public
```

### 2. Configure env

```bash
cp .env.example .env
# Edit AUTH_SECRET, ADMIN_PASSWORD, and Meta keys when ready
```

### 3. Database

```bash
npm run db:push
npm run db:seed
```

### 4. Run app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

Default login (from `.env`):

- Email: `admin@example.com`
- Password: `ChangeMe123!`

### 5. Campaign worker (separate terminal)

```bash
npm run worker
```

### 6. Lead scraper (optional, separate terminal)

```bash
npm run scraper   # serves on http://127.0.0.1:8787
```

Then use **Lead Finder** in the app to search any area and get name/phone/email leads.

## Deploy to Railway

The repo ships with config-as-code for **three services**:

| Service | Root | Build | Start |
|---------|------|-------|-------|
| `web` | `/` | `railway.json` → `npm run build` | `npm run start` (pushes DB schema + seeds admin, then `next start`) |
| `worker` | `/` | `worker.railway.json` → `prisma generate` | `npm run worker` (Baileys WhatsApp session + BullMQ workers) |
| `scraper` | `Gmap-scrapper/` | `Gmap-scrapper/railway.json` → Dockerfile (Playwright + Chromium) | `python server.py` |

### 1. Create a project

On [railway.app](https://railway.app) click **+ New Project** → **Empty Project**.

### 2. Add databases

- **+ New → Database → PostgreSQL**
- **+ New → Database → Redis**

Railway exposes `DATABASE_URL` and `REDIS_URL` on each.

### 3. Add the three services

Click **+ New → GitHub Repo**, pick this repo, and connect. You'll deploy the app three times, once per service. For each, set the **Root Directory** and **config file**:

- **web** — Root Directory `/`, config file `/railway.json`. Generate a public domain (Settings → Networking). The healthcheck is `/login`.
- **worker** — Root Directory `/`, config file `/worker.railway.json`. No public domain needed.
- **scraper** — Root Directory `Gmap-scrapper`, config file `Gmap-scrapper/railway.json`. It's picked up automatically; generate a public domain only if you want external access.

### 4. Variables (apply to web and worker)

Reference the services so they share Postgres + Redis:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
AUTH_SECRET=<generate a long random string>
AUTH_TRUST_HOST=true
NEXT_PUBLIC_APP_URL=<your web domain, e.g. https://xxx.up.railway.app>
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=<choose a strong one>
```

On the **web** service add the scraper reference and set the scraper's fixed internal port:

```
SCRAPER_URL=http://scraper.railway.internal:8787
```

Then on the **scraper** service add a `PORT` variable with value `8787` so the internal URL above is stable.

The Meta vars (`META_*`) are optional — the app pairs WhatsApp over QR from **Settings** (no Meta app needed). The email campaign SMTP settings are also entered in **Settings**.

### 5. Keep the WhatsApp session alive across deploys

The Baileys session is stored in `/.baileys`, which is ephemeral. On the **worker** service:

1. Settings → **Volumes** → Add Volume
2. Mount path: `/app/.baileys`

Without this you'll re-pair WhatsApp after every deploy.

### 6. First login

The `npm run start` script pushes the Prisma schema and seeds the admin user on boot, so after the web service is healthy, log in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you set.

## Meta setup checklist

1. Create a Meta app with **WhatsApp** product
2. Copy **Phone number ID**, **WABA ID**, and a **permanent System User token**
3. Paste them in **Settings** (or `.env`)
4. Expose local webhook: `ngrok http 3000`
5. In Meta → WhatsApp → Configuration:
   - Callback URL: `https://YOUR_NGROK/api/webhooks/whatsapp`
   - Verify token: same as Settings / `META_WEBHOOK_VERIFY_TOKEN`
   - Subscribe to `messages`

## Important WhatsApp rules

- Outside the 24h window you can only send **approved templates**
- Marketing / utility / auth templates are billed per delivery by Meta
- Replies inside the open window are free service messages
- Contacts texting `STOP` / `unsubscribe` are auto opted-out

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Next.js dev server |
| `npm run worker` | Campaign queue worker |
| `npm run scraper` | Google Maps lead scraper service (:8787) |
| `npm run db:push` | Push Prisma schema |
| `npm run db:seed` | Seed admin user |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:studio` | Prisma Studio |
