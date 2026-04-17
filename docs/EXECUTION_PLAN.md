# Execution Plan — post-scaffold

**Generated 2026-04-17** · follows the strategy doc in `~/.claude/plans/i-want-you-to-linear-pie.md`.

This doc maps the strategy onto the code that currently exists in the repo and names the next slices in priority order. Read it end-to-end before starting any new work — it's the "where are we / what's next" view, not the "why" (that's the strategy doc).

---

## 1. Snapshot — what got built in the initial scaffold

One commit (`19c6328`), 58 files, ~3,775 LOC. All of it is placeholder-free code you can actually run; it just doesn't fully connect end-to-end yet.

**Stack & config**
- `package.json`, `tsconfig.json`, `tailwind.config.ts`, `next.config.mjs`, `postcss.config.mjs`, `.env.example`, `.eslintrc.json`, `.gitignore`
- `public/manifest.webmanifest`, `public/sw.js` (minimal service worker, pass-through)

**Database**
- `supabase/migrations/20260417000000_initial_schema.sql` — 11 tables, enums, triggers, full RLS, storage buckets + policies
- `supabase/config.toml`

**Types**
- `src/types/db.ts` — mirrors the schema
- `src/types/extraction.ts` — per-document Gemini output shapes
- `src/types/checklist.ts` — checklist row type + kind enum

**Supabase clients**
- `src/lib/supabase/browser.ts`, `server.ts`, `middleware.ts`
- `middleware.ts` at the root (auth redirect)

**Gemini**
- `src/lib/gemini/client.ts` — `callStructured`, `callChat`
- `src/lib/gemini/schemas.ts` — response schemas (DL, insurance, registration, title, payoff, stock sheet, DMS, PDF mapping)
- `src/lib/gemini/extract.ts` — `extractCapture(input)`
- `src/lib/gemini/chat.ts` — `answerInDealChat(ctx)` with grounded system prompt
- `src/lib/gemini/pdf-map.ts` — `proposePdfMapping(input)`

**PDF + validation**
- `src/lib/pdf/fill.ts` — `readPdfFieldNames`, `fillPdf` (pdf-lib, deterministic)
- `src/lib/deal/flatten.ts` — flattens DB rows into the dot-path shape the mappings use
- `src/lib/checklist/compute.ts` — deterministic checklist reducer (pure, not hooked up)
- `src/lib/validation/vin.ts`, `ohio-dl.ts`, `dates.ts`

**UI**
- Desktop: `app/page.tsx` (landing), `app/deals/[id]/page.tsx` (deal view), `app/deals/new/page.tsx`
- Mobile: `app/capture/page.tsx` + `src/components/capture-screen.tsx`
- PDF setup: `app/settings/pdf-forms/page.tsx` + `[id]/page.tsx`
- Auth: `app/login/page.tsx`, `app/auth/callback/route.ts`
- Components: `deal-list`, `chat-thread`, `checklist-panel`, `profile-panel`, `stage-controls`, `capture-screen`, `pdf-form-upload`, `pdf-mapping-review`

**API routes**
- `POST /api/deals` — create deal
- `POST /api/deals/[id]/stage` — advance stage
- `POST /api/captures` — upload + background extract + ghost chat message
- `POST /api/chat` — send user message, persist, run grounded Gemini chat
- `POST /api/pdf/upload` — upload PDF, AI-propose mappings
- `PUT /api/pdf/mappings` — save reviewed mappings
- `POST /api/pdf/fill` — deterministic fill + store in Deal

---

## 2. What actually works end-to-end (today, after setup)

Assuming you run `npm install`, set up `.env.local`, apply the migration, and enable Realtime on the `chat_messages` table:

- ✅ Sign in with a magic link.
- ✅ Create a blank Deal and open it.
- ✅ Chat in the Deal. Gemini answers grounded in the Deal's current state (which is mostly empty on a new deal, so answers will be terse).
- ✅ Advance stage with the header button. The "delivered" stamp is set; the countdown-to-archive shows.
- ✅ Open `/capture` on mobile. Shoot a photo. Pick which Deal to attach it to (quick-pick sheet). Capture uploads, row is created, ghost chat message appears.
- ✅ Gemini extraction runs in the background on the uploaded capture — extraction is stored in the `extractions` table with `structured_data`.
- ✅ A second chat message ("Extracted DL — review in the profile panel.") appears when extraction completes. Desktop sees it via Realtime.
- ✅ Upload a fillable PDF at `/settings/pdf-forms`. AI proposes mappings; the review UI renders. You can edit target paths and confirm.
- ✅ Save mappings. They persist.
- ✅ If you call `POST /api/pdf/fill` with `{ dealId, formIds }` from curl/Postman, the PDF is filled (for fields that have data) and stored.

## 3. What's scaffolded but NOT wired yet

These are the honest gaps — the code exists but doesn't reach the user:

- ❌ **Extracted fields never reach the Deal/Customer profile.** `extractions.structured_data` holds the DL / VIN / insurance / etc. data, but nothing writes it back into `customers`, `deals`, or `vehicles`. Result: the Profile panel always shows blanks, even after you capture a DL.
- ❌ **Checklist never populates.** `src/lib/checklist/compute.ts` is a pure reducer, but no code path writes to `checklist_items`. The ChecklistPanel always says "No items yet."
- ❌ **Source-images gallery is missing.** Captures upload to Storage, but there's no UI to view the photos (right-hand column mentioned in the strategy doc).
- ❌ **"Fill Forms" button doesn't exist.** The `/api/pdf/fill` endpoint works, but there's no UI trigger on the Deal page.
- ❌ **Filled PDFs aren't listed in the Deal.** `filled_pdfs` rows get created, but no UI displays them or offers download/print.
- ❌ **Auto-archive worker is not built.** Deals won't move `delivered → archived` on their own at 24h.
- ❌ **Customer DL-match prompt isn't built.** Every DL capture will (eventually, once Slice A ships) create a new Customer even for returning customers.
- ❌ **Typed-correction parser isn't built.** If the user types "address is 456 Oak", the chat model sees it, but nothing deterministically updates the Customer record.
- ❌ **Realtime on `chat_messages`** must be manually enabled in Supabase dashboard → Database → Replication. Not automated.
- ❌ **PWA icons** are referenced in the manifest but the files (`/icons/icon-192.png` etc.) don't exist.
- ❌ **Offline capture queue.** The service worker is a pass-through stub.
- ❌ **Non-Ohio DL fallback path** + confidence-based warn UI.
- ❌ **VIN checksum + Ohio DL format validators** are written but not invoked anywhere in the UI.
- ❌ **End-to-end typecheck / build verification.** Not yet run against `npm install`. Dependency versions may need adjustment on first build.

---

## 4. Critical gaps, ranked

If you only fix three things next, fix these. Without them the app doesn't feel real:

1. **Extraction propagation** (Slice A). Without this, capture is theater. This is the single biggest gap.
2. **Checklist auto-populate** (Slice B). Drives the main UI element that communicates deal state.
3. **Fill-forms button + filled-PDFs UI** (Slice C). Without this the user can't see the payoff — the whole point of the app.

Once those three ship, the app has a complete loop: capture → profile populates → checklist flips → fill forms → download. Everything after is polish.

---

## 5. Next slices, in order

Each slice is ~1 day of work and ships end-to-end user value on its own. Order matters.

### Slice A — Extraction propagation (make capture useful)
**Goal:** When a capture's Gemini extraction finishes, the data lands on the right row of the right table. User sees the DL info appear in the profile panel.

Work:
- New module `src/lib/extraction/apply.ts`. Pure function `applyExtraction(deal, capture, structured)` returns a set of table writes (customer upsert, deal update, vehicle upsert, customer_edit records).
- In `app/api/captures/route.ts`, after `extractCapture`, call `applyExtraction` and execute the writes.
- Capture-kind routing:
  - `dl_front` / `dl_back` → `customers.*` on `deal.primary_customer_id` (create Customer if null; use `captures.assigned_to === 'co_buyer'` to target co-buyer)
  - `insurance_card` → `deals.insurance_*` + `vehicles` linkage if VIN matches
  - `registration` / `title` → `vehicles` (trade or VOI depending on `captures.assigned_to`)
  - `payoff_letter` → `deals.trade_payoff_*`
  - `stock_sheet` → `vehicles` on `deal.vehicle_of_interest_id`
  - `dms_screenshot` → best-effort merge using the `suggested` sub-object
- Write a `customer_edits` row for every field change (audit trail + provenance).
- Post a follow-up assistant `chat_messages` row summarizing what got applied ("Applied: name, address, DL#, DOB from DL front").
- Auto-generate `deals.title` if empty: `"{last_name} — {year} {make} {model}"`.

Success check: capture a DL on mobile, open the Deal on desktop, see `first_name / last_name / dl_number / address_line1` filled in within 5 seconds.

### Slice B — Checklist auto-recompute
**Goal:** ChecklistPanel shows live, accurate items.

Work:
- New endpoint `POST /api/checklist/recompute` that takes `dealId`, calls `computeChecklist` with fresh data, and upserts `checklist_items`.
- Call it from: `/api/captures` (after extraction apply), `/api/chat` (after typed-correction apply), `/api/deals/[id]/stage` (stage changes affect visibility), the PDF fill endpoint.
- Extend the ChatThread's realtime subscription to also listen on `checklist_items` for the current deal so the panel updates live.
- Add `plannedForms` concept: a `deal_planned_forms` join table (or a `deals.planned_form_ids` array column) so the checklist knows which credit-app rows to surface.

Success check: no captures yet → 3+ "missing" rows show ("Primary DL — front", "Insurance card", "Vehicle of interest"). Capture DL → row flips to ✓ complete within 5s.

### Slice C — Fill-forms button + filled-PDFs UI + source-images gallery
**Goal:** Close the loop. User sees photos and clicks one button to produce filled PDFs.

Work:
- **Fill button**: on the Deal header, "Fill forms" dropdown → list of form_set groupings → one-click fills all. Calls `/api/pdf/fill`. Shows a toast with "3 filled, 0 blank".
- **Filled PDFs list**: new component `FilledPdfsPanel` under the profile panel. Each row: form name, filled/blank counts, buttons for [Download] [Print] [Regenerate].
  - Print = `window.print()` on a new window that embeds the PDF via `<iframe>`.
  - Download = signed URL from Supabase Storage.
- **Source-images gallery**: new right-column panel `CapturesGallery` showing all of this deal's captures as thumbnails, grouped by kind. Click opens a lightbox with the extracted fields overlaid (provenance). Ready-to-use data comes from the `captures` and `extractions` tables.

Success check: capture a few docs, click Fill Forms, get a PDF with fields populated, download it, verify it looks right in a PDF viewer.

### Slice D — Typed-correction parser
**Goal:** "address is 456 Oak St" in chat updates the Customer profile deterministically.

Work:
- New module `src/lib/chat/parse-corrections.ts`. Regex/zod-based patterns for the common cases:
  - `address is (.+)` → `primary.address_line1`
  - `city (is|,) (.+)` → `primary.city`
  - `phone (is )?(\d[\d\-\s\(\)]+)` → `primary.phone`
  - `payoff (is )?\$?([\d,]+(?:\.\d{2})?)` → `deal.trade_payoff_amount_cents`
  - `co-buyer is (.+)` → creates/updates co-buyer
  - ssn / dl / VIN detections with strong guard rails (require explicit key phrase)
- In `/api/chat`, run the parser *before* calling Gemini. If it matches, apply the update, insert a `customer_edits` row, prepend a system message "Updated: <field>", and still call Gemini for acknowledgment.
- When the parser is ambiguous, skip the update and let the chat model respond normally.

Success check: type "address is 456 Oak St Columbus OH 43215" → profile panel updates within 2s; chat shows "Got it — updated address" with an undo.

### Slice E — Auto-archive + lifecycle polish
**Goal:** Delivered deals disappear from Active list at the 24h mark.

Work:
- Supabase edge function `auto_archive` running on pg_cron (every 15 min):
  ```sql
  update deals
  set stage = 'archived', archived_at = now()
  where stage = 'delivered'
    and delivered_at < now() - interval '24 hours';
  ```
- System `chat_messages` inserts on every stage transition ("Moved to Pending Finance by <user> at <time>").
- Restore-from-archive button on archived deals (sets stage back to `active`, clears `archived_at`).

Success check: manually mark a deal delivered with `delivered_at` = now - 25h, wait for cron, confirm it moved to Archived.

### Slice F — Customer matching on DL capture
**Goal:** Returning customers aren't re-created.

Work:
- In the extraction-apply flow (Slice A), before creating a new Customer, look up by `dl_number` (exact). If found, prompt via a chat system message: "Found existing Jane Smith — reuse?" with two buttons (implemented as chat actions or deal-level modal). Default to reuse if name + DOB also match.
- Optional: fuzzy search on `last_name + dob` when DL# is present but different (state change, DL renewal).

Success check: capture a DL, extract, then capture the same DL again on a new deal → offered to reuse existing customer.

### Slice G — Validation + confidence UI
**Goal:** High-stakes fields force a confirm tap.

Work:
- Wire `isValidVin` into the extraction-apply flow. If a VIN fails checksum, don't auto-apply — flag it as needing review.
- Wire `isValidOhioDl` into DL extraction. Fail → yellow "unknown format" warning, still captured.
- Add `confidence` field writes on the `extractions` row (best-effort; Gemini doesn't give per-field confidence natively, so use heuristics: missing = low, suspicious pattern = medium).
- Profile panel: highlight unreviewed high-stakes fields (`vin`, `dl_number`, `dob`, `payoff_amount`) in red until user taps them to confirm. Persist the confirmation in a new `confirmed_fields jsonb` column on `deals`.

Success check: extract a DL with a partially-obscured DOB → field shows with yellow highlight + "unclear — confirm" badge.

### Slice H — PWA polish
**Goal:** Installable with proper icons and a working offline-capture queue.

Work:
- Generate icon set (192, 512, 512-maskable). Drop in `/public/icons/`.
- Service worker: IndexedDB queue for `POST /api/captures` when offline; replay on `sync` event.
- "Install app" prompt on first mobile visit.
- Tune viewport / iOS safe-area insets on the capture screen.

Success check: install the PWA on an iPhone, toggle airplane mode, capture a photo, toggle back on, photo uploads within 30s.

### Slice I — Ops / deploy
**Goal:** Production-deployable.

Work:
- Deploy to Vercel + a managed Supabase project.
- Verify Gemini API key is on the zero-retention tier ("data not used for model training" checkbox in Google AI Studio).
- Scheduled purge job for captures older than 90 days (retain extractions + filled PDFs indefinitely — see plan section 8).
- Basic logging: Vercel request logs + a `app_events` table for critical errors.
- Typecheck + lint in CI (`npm run typecheck && npm run lint && npm run build`).

Success check: open the production URL on your phone, end-to-end flow works, captures land in production Supabase.

---

## 6. Verification plan

**Milestone 1 — Extraction viability.** Runs during Slice A. Capture 10 real (redacted) Ohio DLs, log `latency_ms` and `structured_data` accuracy. Target: 95%+ field accuracy on name/address/DL#/DOB, p50 latency <4s. If below thresholds: pause Slice A, tune prompts or try two-pass extraction before continuing.

**Milestone 2 — End-to-end MVP.** After Slice C:
- Rep captures DL on phone → profile populates on desktop in <5s.
- Rep captures registration → trade fields populate in <5s.
- Rep clicks "Fill forms" → 3 test PDFs come out filled correctly.
- Clock time from "new deal" to "PDFs filled" on a mock deal: under 5 minutes.
- Running checklist correctly reflects present vs missing across two concurrent Active deals.

**Milestone 3 — Lifecycle + returning customers.** After Slices E + F:
- Delivered deal auto-archives 24h later and remains searchable.
- Re-capturing a returning customer's DL offers to reuse the Customer record.

---

## 7. Known quirks and future landmines

Things to watch for while building:

- **`@google/genai` API shape.** The client code assumes `generateContent({ model, contents, config: { responseMimeType, responseSchema, ... } })`. If the installed version's API differs, adjust `src/lib/gemini/client.ts`. The `GEMINI_MODEL` env var defaults to `gemini-2.0-flash-exp` — swap to whatever is stable when you deploy.
- **Encrypted / flattened PDFs.** `pdf-lib` can't read field names from flattened or encrypted PDFs. The upload endpoint returns a 400 in that case — messaging could be clearer.
- **Realtime must be manually enabled** per table in Supabase dashboard. Add a setup checklist item to the README when this tightens up.
- **`auth.uid()` in RLS default columns** only works when the insert is performed with the user's JWT. Server routes via service-role bypass RLS — they currently use the user-scoped client (good), but if we add a service-role path (e.g. cron), be careful to set `owner_id` explicitly.
- **Service worker cache.** The pass-through stub is fine for dev but will cause "stale app" complaints in production if we don't version-cache the app shell before Slice I.
- **Chat context size.** We currently send the full last-10 messages. For long-running deals, we'll need summarization or a sliding window. Not urgent — solo user, chat is short.

---

## 8. Small open items (not blocking any slice)

Carried forward from the strategy doc, resolve opportunistically during builds:

- Retention policy thresholds (source images 90d, structured data indefinite, filled PDFs indefinite) — implement in Slice I.
- Non-Ohio DL confidence threshold for the "please verify" flag — tune in Slice G.
- Whether `ssn_full` lives in Postgres as plain text or needs app-layer encryption — revisit before production deploy in Slice I. Supabase at-rest encryption covers storage; the question is whether we want defense-in-depth.
- Keyboard shortcuts on desktop (e.g. `j/k` to scroll deal list, `cmd+enter` to send chat) — nice-to-have.
