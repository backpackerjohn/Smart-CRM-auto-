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
