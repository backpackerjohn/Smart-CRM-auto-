# Smart CRM Auto

Dealership paperwork autofill. Mobile capture + desktop review + AI chat per Deal + PDF autofill.

Stack: **Next.js 15 (PWA) · Supabase (Postgres + Storage + Auth + Realtime) · Gemini (extraction + chat + PDF mapping)**. Single-user v1. Ohio DL primary.

Strategy: `~/.claude/plans/i-want-you-to-linear-pie.md`.

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill in:

- **Supabase**: create a project at https://supabase.com, grab URL + anon key + service role key from Project Settings → API.
- **Gemini**: create a key at https://aistudio.google.com/apikey. Make sure the project is on a tier where your inputs are **not used for training** — credit-app fields (SSN, income) will pass through.

### 3. Supabase schema

Install the Supabase CLI, then:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

This applies `supabase/migrations/20260417000000_initial_schema.sql` which creates:

- tables: `customers`, `vehicles`, `deals`, `captures`, `extractions`, `chat_messages`, `customer_edits`, `pdf_forms`, `pdf_field_mappings`, `filled_pdfs`, `checklist_items`
- RLS: every row is scoped by `owner_id = auth.uid()`
- Storage buckets: `captures`, `pdf-templates`, `pdf-filled` (owner-scoped by first path segment)

Realtime: enable on the `chat_messages` and `extractions` tables in the Supabase dashboard (Database → Replication).

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000. Sign in with a magic link (check your inbox).

---

## Project layout

```
app/
  (routes)                    Server-rendered pages: /, /deals/[id], /capture, /settings/pdf-forms
  api/                        Route handlers
    deals/                    Create deal, advance stage
    captures/                 Upload capture → extract → chat
    chat/                     Grounded in-deal chat
    pdf/upload/               Upload fillable PDF → AI-propose mappings
    pdf/mappings/             Save reviewed mappings
    pdf/fill/                 Deterministic fill + store in Deal

src/
  lib/
    supabase/                 Browser / server / middleware clients
    gemini/                   Client, schemas, extract, chat, pdf-map
    pdf/                      Read field names, deterministic fill (pdf-lib)
    deal/                     Flatten Deal rows into the dot-path shape PDF mappings use
    checklist/                Deterministic checklist computation
    validation/               VIN checksum, Ohio DL format, dates
    utils.ts

  components/                 DealList, ChatThread, ChecklistPanel, ProfilePanel,
                              StageControls, CaptureScreen, PdfFormUpload, PdfMappingReview

  types/                      db.ts (schema mirror), extraction.ts, checklist.ts

supabase/
  migrations/                 Initial schema + RLS
  config.toml                 Project metadata
```

---

## Daily flow

1. **Mobile** `/capture` — tap shutter, quick-pick the deal (recent actives / new / unassigned).
2. Capture uploads to Supabase Storage, creates a `captures` row, triggers Gemini extraction in the background.
3. **Desktop** `/deals/:id` — chat thread + pinned checklist + structured profile. Realtime updates as mobile uploads.
4. **Once per new PDF** `/settings/pdf-forms` — upload fillable PDF, AI proposes field mapping, you confirm once.
5. **Autofill** — `POST /api/pdf/fill { dealId, formIds }`. Filled PDFs land in the Deal, downloadable + printable.
6. Stage progression: **Active → Pending Finance → Delivered → Archived** (24h after delivered).

---

## Not yet wired (post-scaffold TODO)

These are in the strategy doc but not in this commit. Tracked for the next slice:

- **Auto-archive worker.** A Supabase scheduled edge function that flips `delivered → archived` 24h after `delivered_at`.
- **Checklist auto-recompute.** Either a DB trigger on `captures` / `customers` / `deals` inserts/updates, or a `/api/checklist/recompute` endpoint called after mutations. For now `checklist_items` is a table but nothing writes to it — needs to be populated.
- **Customer matching on DL capture.** After DL extraction, search existing customers on `dl_number` and prompt "Use existing customer?" before auto-creating.
- **Source-images gallery** on the desktop Deal page (right-hand column).
- **Typed correction parser.** Detect "address is 123 Oak" patterns in user chat messages and write through to the Customer profile deterministically (not via the chat model).
- **Fill-forms button** wired into the Deal header that calls `/api/pdf/fill` and surfaces the resulting PDFs in the Deal.
- **PWA icons** (placeholder manifest references `/icons/icon-192.png` etc.).
- **Offline queue** in the service worker for captures uploaded without signal.
- **Non-Ohio DL fallback path** + confidence-based warn UI.
- **VIN checksum / Ohio DL format validation** integrated into the extraction review UI.

---

## Verification

Milestone 1 (extraction viability):

- Upload a real (redacted) Ohio DL at `/capture` or via the chat's file attach.
- Check the `extractions` table: `structured_data` should have `firstName / lastName / dlNumber / dob / address*` populated, `latency_ms` under 4000.
- Target: 95%+ field accuracy, p50 latency <4s.

Milestone 2 (MVP):

- Capture DL, registration, insurance on mobile → fields visible on desktop within 5s.
- Map a fillable PDF → confirm mappings → `POST /api/pdf/fill` produces a correctly filled PDF.
- Clock time from "new deal" to "PDFs filled" under 5 minutes.

---

## Security notes

- All Supabase tables are RLS-protected on `owner_id = auth.uid()`.
- Storage paths begin with `{uid}/` — storage policies enforce first-segment match.
- Gemini inputs may include SSN / DL / addresses. **Use an API key on a zero-retention tier.** Verify in Google AI Studio project settings.
- Sensitive fields (`ssn_full`, `monthly_income_cents`) live in Postgres under RLS. No encryption-at-application-layer in v1 — Supabase provides at-rest encryption.
- FTC Safeguards Rule applies to dealer F&I data. This scaffold does not yet implement retention / purge; production deployment must.
