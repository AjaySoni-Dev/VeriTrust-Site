-- Deterministic, non-production seed data for local and staging smoke tests.
-- No user, billing, provider credential, or production configuration data is included.

insert into public.plans (id, code, name, monthly_scan_limit, daily_scan_limit)
values ('00000000-0000-4000-8000-000000000001', 'development', 'Development', 100, 25)
on conflict (code) do nothing;

-- Runtime provider paths remain server-only environment configuration. These
-- rows provide stable application keys and foreign-key targets only.
insert into public.model_catalog (key, scan_type, display_name, provider, provider_model, is_active, is_default, metadata)
values
  ('pixel', 'deepfake', 'VeriTrust Pixel', 'hf-inference', 'deepfake_pixel', true, true, '{"runtime_configured":true}'::jsonb),
  ('prism', 'deepfake', 'VeriTrust Prism', 'hf-inference', 'deepfake_prism', true, false, '{"runtime_configured":true}'::jsonb),
  ('mailguard', 'phishing', 'VeriTrust MailGuard', 'hf-inference', 'phishing_mailguard', true, true, '{"runtime_configured":true}'::jsonb),
  ('cortex', 'phishing', 'VeriTrust Cortex', 'featherless-ai', 'phishing_cortex', true, false, '{"runtime_configured":true}'::jsonb),
  ('swift', 'link', 'VeriTrust Swift', 'hf-inference', 'link_swift', true, true, '{"runtime_configured":true}'::jsonb)
on conflict (key) do update set
  scan_type = excluded.scan_type,
  display_name = excluded.display_name,
  provider = excluded.provider,
  provider_model = excluded.provider_model,
  is_active = excluded.is_active,
  is_default = excluded.is_default,
  metadata = excluded.metadata;
