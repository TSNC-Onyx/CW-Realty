-- Parts of a public page that could not load (the page still shows, with that part missing)
-- are recorded as website-visitor problems (docs/visitor-audit-fixes-plan.md step 3.1; owner
-- approved 2026-10-29). Catalog only; mirrors src/lib/observability/problem-catalog.ts
-- (CI compares the two).

insert into cwr.problem_catalog (action, area, label, section_label, spike_codes) values
  ('site.page_load', 'site', 'Load part of a website page', 'Website visitors', '{}');
