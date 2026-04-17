-- High-stakes field confirmation. When an extraction writes a value, the rep
-- must explicitly confirm it for fields like VIN, DL#, DOB, payoff, SSN.
-- confirmed_fields is a jsonb map of "<scope>.<field>" -> true.

alter table public.deals
  add column if not exists confirmed_fields jsonb not null default '{}'::jsonb;
