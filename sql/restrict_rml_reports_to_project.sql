-- Restrict Rhein-Main-Link report type to exactly one project.
-- Run in Supabase SQL editor.

-- 1) Optional: inspect existing violating rows first.
-- select id, report_type, project_id from public.reports
-- where report_type = 'tagesbericht_rhein_main_link'
--   and project_id is distinct from 'c1f7568a-8bb8-4f64-9ff5-749758a731ff'::uuid;
--
-- select id, report_type, project_id from public.drafts
-- where report_type = 'tagesbericht_rhein_main_link'
--   and project_id is distinct from 'c1f7568a-8bb8-4f64-9ff5-749758a731ff'::uuid;

alter table if exists public.reports
  add constraint reports_rml_project_guard
  check (
    report_type <> 'tagesbericht_rhein_main_link'
    or project_id = 'c1f7568a-8bb8-4f64-9ff5-749758a731ff'::uuid
  ) not valid;

alter table if exists public.drafts
  add constraint drafts_rml_project_guard
  check (
    report_type <> 'tagesbericht_rhein_main_link'
    or project_id = 'c1f7568a-8bb8-4f64-9ff5-749758a731ff'::uuid
  ) not valid;

-- 2) Validate later once old data is cleaned up:
-- alter table public.reports validate constraint reports_rml_project_guard;
-- alter table public.drafts validate constraint drafts_rml_project_guard;
