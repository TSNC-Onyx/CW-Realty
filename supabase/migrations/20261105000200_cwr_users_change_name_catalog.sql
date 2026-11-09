-- Owners correct people's names on Users & roles (623Summit repo, docs/owner-names-plan.md; owner
-- approved 2026-11-05). Catalog only; mirrors src/lib/observability/problem-catalog.ts (CI compares
-- the two). Undo: delete from cwr.problem_catalog where action = 'users.change_name';

insert into cwr.problem_catalog (action, area, label, section_label, spike_codes) values
  ('users.change_name', 'users', 'Change a user''s name', 'Users', '{}');
