-- Deterministic, non-production seed data for local and staging smoke tests.
-- No user, billing, provider, or production configuration data is included.

insert into public.plans (id, code, name, monthly_scan_limit, daily_scan_limit)
values ('00000000-0000-4000-8000-000000000001', 'development', 'Development', 100, 25)
on conflict (code) do nothing;
