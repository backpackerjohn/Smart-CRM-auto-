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
