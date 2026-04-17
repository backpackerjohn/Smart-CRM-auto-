-- Smart CRM Auto — initial schema
-- v1 is single-user: every top-level table carries owner_id and RLS enforces owner_id = auth.uid().
-- Schema is shaped so adding multi-user later is additive, not a rewrite.

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ─────────────────────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────────────────────

create type deal_stage as enum (
  'active',
  'pending_finance',
  'delivered',
  'archived'
);

create type capture_kind as enum (
  'dl_front',
  'dl_back',
  'insurance_card',
  'registration',
  'title',
  'payoff_letter',
  'stock_sheet',
  'dms_screenshot',
  'other'
);

create type capture_owner as enum (
  'primary',
  'co_buyer',
  'trade',
  'vehicle_of_interest',
  'unassigned'
);

create type chat_role as enum (
  'user',
  'assistant',
  'system'
);

create type checklist_state as enum (
  'missing',
  'complete',
  'manual',
  'warn'
);

create type pdf_mapping_status as enum (
  'ai_proposed',
  'user_confirmed',
  'user_overridden'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Owner helper: every row has owner_id defaulting to auth.uid().
-- RLS policies below restrict reads/writes to rows owned by the caller.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── customers ───────────────────────────────────────────────────────────────
create table customers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  first_name text,
  middle_name text,
  last_name text,
  dob date,

  address_line1 text,
  address_line2 text,
  city text,
  state text,
  zip text,

  phone text,
  email citext,

  dl_number text,
  dl_state text,
  dl_expiration date,

  -- Sensitive fields used for credit-app autofill. User-typed.
  ssn_last4 text,                -- short-form for display; full SSN lives in ssn_full if user types it.
  ssn_full text,                 -- see retention + Gemini-zero-retention notes in the plan.
  employer text,
  employer_phone text,
  occupation text,
  monthly_income_cents bigint,
  years_at_address numeric(4,1),
  years_employed numeric(4,1),

  notes text
);

create index customers_owner_idx on customers(owner_id);
create index customers_dl_number_idx on customers(owner_id, dl_number);
create index customers_last_name_idx on customers(owner_id, last_name);

-- ─── vehicles ────────────────────────────────────────────────────────────────
create table vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),

  vin text,
  year int,
  make text,
  model text,
  trim text,
  color text,
  mileage int,
  stock_number text
);

create index vehicles_owner_idx on vehicles(owner_id);
create index vehicles_vin_idx on vehicles(owner_id, vin);

-- ─── deals ───────────────────────────────────────────────────────────────────
create table deals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary_customer_id uuid references customers(id) on delete set null,
  co_buyer_customer_id uuid references customers(id) on delete set null,

  vehicle_of_interest_id uuid references vehicles(id) on delete set null,
  trade_vehicle_id uuid references vehicles(id) on delete set null,

  trade_payoff_amount_cents bigint,
  trade_payoff_good_through date,
  trade_payoff_lender text,

  insurance_carrier text,
  insurance_policy text,
  insurance_effective date,
  insurance_expires date,

  stage deal_stage not null default 'active',
  stage_changed_at timestamptz not null default now(),
  delivered_at timestamptz,
  archived_at timestamptz,

  title text,    -- denormalized display title, e.g. "Smith — 2024 Tacoma"
  notes text
);

create index deals_owner_stage_idx on deals(owner_id, stage, updated_at desc);
create index deals_primary_customer_idx on deals(primary_customer_id);

-- ─── captures ────────────────────────────────────────────────────────────────
-- An uploaded image (photo or PDF page rendered to image) attached to a deal.
-- A capture may be unassigned initially and reassigned later.
create table captures (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),

  deal_id uuid references deals(id) on delete cascade,           -- null == in Unassigned inbox
  storage_path text not null,                                    -- path in Supabase Storage
  mime_type text not null,
  filename text,
  kind capture_kind not null default 'other',
  assigned_to capture_owner not null default 'unassigned',
  device text,                                                   -- 'mobile' | 'desktop'
  bytes int
);

create index captures_deal_idx on captures(deal_id, created_at desc);
create index captures_owner_inbox_idx on captures(owner_id) where deal_id is null;

-- ─── extractions ─────────────────────────────────────────────────────────────
-- One row per AI structured extraction attempt on a capture.
create table extractions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),

  capture_id uuid not null references captures(id) on delete cascade,
  doc_type capture_kind not null,
  structured_data jsonb not null default '{}'::jsonb,
  confidence jsonb not null default '{}'::jsonb,                 -- { fieldPath: 0.0..1.0 }
  model text not null,
  model_version text,
  latency_ms int,
  raw_response jsonb,
  error text
);

create index extractions_capture_idx on extractions(capture_id, created_at desc);

-- ─── chat_messages ───────────────────────────────────────────────────────────
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),

  deal_id uuid not null references deals(id) on delete cascade,
  role chat_role not null,
  content text not null,
  capture_id uuid references captures(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb                    -- extraction_id, correction writes, etc.
);

create index chat_messages_deal_idx on chat_messages(deal_id, created_at);

-- ─── customer_edits (audit) ──────────────────────────────────────────────────
create table customer_edits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),

  customer_id uuid not null references customers(id) on delete cascade,
  deal_id uuid references deals(id) on delete set null,
  field_path text not null,
  old_value jsonb,
  new_value jsonb,
  source text not null                                           -- 'chat' | 'profile' | 'extraction' | 'system'
);

create index customer_edits_customer_idx on customer_edits(customer_id, created_at desc);

-- ─── pdf_forms ───────────────────────────────────────────────────────────────
-- Fillable PDF templates uploaded by the user. One-time setup per PDF.
create table pdf_forms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  name text not null,                                            -- e.g. "Ohio retail delivery"
  description text,
  storage_path text not null,                                    -- template PDF in Storage
  form_set text,                                                 -- grouping, e.g. "retail_delivery"
  bytes int,
  field_count int
);

create index pdf_forms_owner_idx on pdf_forms(owner_id);

-- ─── pdf_field_mappings ──────────────────────────────────────────────────────
-- One row per named form field in the PDF. AI proposes, user confirms once.
create table pdf_field_mappings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  pdf_form_id uuid not null references pdf_forms(id) on delete cascade,
  pdf_field_name text not null,                                  -- native field name in the PDF
  pdf_field_type text,                                           -- 'text' | 'checkbox' | 'radio' | 'date' etc.

  target_path text,                                              -- dot path: "primary.firstName", "coBuyer.ssnFull"
  transform text,                                                -- 'none' | 'uppercase' | 'date:MM/DD/YYYY' | 'currency'
  default_value text,                                            -- if no target data available

  status pdf_mapping_status not null default 'ai_proposed',
  ai_confidence numeric(3,2),
  ai_rationale text,

  unique (pdf_form_id, pdf_field_name)
);

create index pdf_field_mappings_form_idx on pdf_field_mappings(pdf_form_id);

-- ─── filled_pdfs ─────────────────────────────────────────────────────────────
create table filled_pdfs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),

  deal_id uuid not null references deals(id) on delete cascade,
  pdf_form_id uuid not null references pdf_forms(id) on delete restrict,
  storage_path text not null,
  bytes int,
  fields_filled int,
  fields_blank int
);

create index filled_pdfs_deal_idx on filled_pdfs(deal_id, created_at desc);

-- ─── checklist_items ─────────────────────────────────────────────────────────
-- Derived but materialized. Recomputed on deal mutation via a trigger or edge function.
create table checklist_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  deal_id uuid not null references deals(id) on delete cascade,
  kind text not null,                                            -- 'primary_dl' | 'insurance' | 'trade_payoff' | etc.
  label text not null,
  state checklist_state not null default 'missing',
  source_capture_id uuid references captures(id) on delete set null,
  message text,                                                  -- warn/detail message, e.g. "expires 2026-05-01"
  sort_order int not null default 0,

  unique (deal_id, kind)
);

create index checklist_deal_idx on checklist_items(deal_id, sort_order);

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at trigger
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger customers_updated_at before update on customers
  for each row execute function set_updated_at();
create trigger deals_updated_at before update on deals
  for each row execute function set_updated_at();
create trigger pdf_forms_updated_at before update on pdf_forms
  for each row execute function set_updated_at();
create trigger pdf_field_mappings_updated_at before update on pdf_field_mappings
  for each row execute function set_updated_at();
create trigger checklist_items_updated_at before update on checklist_items
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: owner_id = auth.uid() everywhere
-- ─────────────────────────────────────────────────────────────────────────────

alter table customers enable row level security;
alter table vehicles enable row level security;
alter table deals enable row level security;
alter table captures enable row level security;
alter table extractions enable row level security;
alter table chat_messages enable row level security;
alter table customer_edits enable row level security;
alter table pdf_forms enable row level security;
alter table pdf_field_mappings enable row level security;
alter table filled_pdfs enable row level security;
alter table checklist_items enable row level security;

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'customers','vehicles','deals','captures','extractions',
    'chat_messages','customer_edits','pdf_forms','pdf_field_mappings',
    'filled_pdfs','checklist_items'
  ])
  loop
    execute format($p$create policy %I_owner_select on %I for select using (owner_id = auth.uid())$p$, t, t);
    execute format($p$create policy %I_owner_insert on %I for insert with check (owner_id = auth.uid())$p$, t, t);
    execute format($p$create policy %I_owner_update on %I for update using (owner_id = auth.uid()) with check (owner_id = auth.uid())$p$, t, t);
    execute format($p$create policy %I_owner_delete on %I for delete using (owner_id = auth.uid())$p$, t, t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Storage buckets (created via Supabase CLI or dashboard; the SQL below ensures they exist)
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values
  ('captures', 'captures', false),
  ('pdf-templates', 'pdf-templates', false),
  ('pdf-filled', 'pdf-filled', false)
on conflict (id) do nothing;

-- Storage RLS: each object's first path segment must match the caller's auth.uid()
-- Expected layout: captures/{uid}/{deal_id}/{capture_id}.jpg, etc.
create policy "owner read captures" on storage.objects for select
  using (bucket_id = 'captures' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner write captures" on storage.objects for insert
  with check (bucket_id = 'captures' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner update captures" on storage.objects for update
  using (bucket_id = 'captures' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner delete captures" on storage.objects for delete
  using (bucket_id = 'captures' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "owner read pdf-templates" on storage.objects for select
  using (bucket_id = 'pdf-templates' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner write pdf-templates" on storage.objects for insert
  with check (bucket_id = 'pdf-templates' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner update pdf-templates" on storage.objects for update
  using (bucket_id = 'pdf-templates' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner delete pdf-templates" on storage.objects for delete
  using (bucket_id = 'pdf-templates' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "owner read pdf-filled" on storage.objects for select
  using (bucket_id = 'pdf-filled' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner write pdf-filled" on storage.objects for insert
  with check (bucket_id = 'pdf-filled' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner update pdf-filled" on storage.objects for update
  using (bucket_id = 'pdf-filled' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner delete pdf-filled" on storage.objects for delete
  using (bucket_id = 'pdf-filled' and (storage.foldername(name))[1] = auth.uid()::text);
-- Auto-archive worker: flip delivered → archived 24 hours after delivered_at.
-- Uses pg_cron (available on Supabase). Runs every 15 minutes.
--
-- Safe semantics: idempotent (only affects rows that haven't archived yet),
-- bypasses RLS because it runs as the postgres superuser in the cron context.

create extension if not exists pg_cron;

-- Idempotent schedule creation.
-- If a job with this name already exists (e.g. re-applying the migration),
-- unschedule it first so we can re-register with fresh SQL.
do $$
declare
  existing_jobid bigint;
begin
  select jobid into existing_jobid from cron.job where jobname = 'auto-archive-deals';
  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

select cron.schedule(
  'auto-archive-deals',
  '*/15 * * * *',
  $job$
    update public.deals
    set stage = 'archived',
        archived_at = now(),
        stage_changed_at = now()
    where stage = 'delivered'
      and delivered_at is not null
      and delivered_at < now() - interval '24 hours';
  $job$
);
-- High-stakes field confirmation. When an extraction writes a value, the rep
-- must explicitly confirm it for fields like VIN, DL#, DOB, payoff, SSN.
-- confirmed_fields is a jsonb map of "<scope>.<field>" -> true.

alter table public.deals
  add column if not exists confirmed_fields jsonb not null default '{}'::jsonb;
-- Retention policy (per strategy doc §8):
--   source images  → 90 days (captures row + storage object)
--   structured data (extractions) → indefinite
--   filled PDFs   → indefinite
--
-- Structured field values on customers / deals / vehicles stay forever —
-- only the raw photos get purged. The extraction row keeps the parsed fields
-- for audit, and customer_edits preserves provenance.
--
-- Runs daily at 03:17 UTC. Safe + idempotent.

do $$
declare
  existing_jobid bigint;
begin
  select jobid into existing_jobid from cron.job where jobname = 'purge-old-captures';
  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;
end $$;

-- Function that deletes capture rows older than 90 days AND their storage objects.
create or replace function public.purge_old_captures()
returns void
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  obsolete record;
begin
  for obsolete in
    select id, storage_path
    from public.captures
    where created_at < now() - interval '90 days'
  loop
    -- Remove the storage object first (best-effort; if the object is already
    -- missing, the row delete still proceeds).
    begin
      delete from storage.objects
      where bucket_id = 'captures'
        and name = obsolete.storage_path;
    exception when others then
      -- swallow: we don't want a storage glitch to block row cleanup
      null;
    end;

    delete from public.captures where id = obsolete.id;
  end loop;
end $$;

select cron.schedule(
  'purge-old-captures',
  '17 3 * * *',
  $job$ select public.purge_old_captures(); $job$
);
