-- New listings start as Coming Soon, and the listing status moves follow the owner's
-- order with skips allowed (owner choice 2026-10-02, docs/cwr-listing-statuses-plan.md):
--   forward: coming_soon → for_sale / under_contract / sold; for_sale → under_contract / sold;
--            under_contract → sold
--   back:    for_sale → coming_soon; under_contract → for_sale (a deal fell through);
--            sold → for_sale (fixing a mistake)

alter table cwr.listings alter column status set default 'coming_soon';

drop trigger listings_guard_status on cwr.listings;
create trigger listings_guard_status
  before insert or update on cwr.listings
  for each row execute function cwr.guard_workflow_state('status', 'coming_soon');

create or replace function cwr.install_default_workflows(p_tenant_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  with definitions (key, table_name, state_column) as (
    values
      ('listing_status', 'listings', 'status'),
      ('listing_publish', 'listings', 'publish_state'),
      ('inbox_status', 'inbox_threads', 'status'),
      ('chat_policy_status', 'chat_policies', 'status'),
      ('problem_status', 'problem_groups', 'status')
  ),
  created as (
    insert into cwr.workflows (tenant_id, key, table_name, state_column)
    select p_tenant_id, d.key, d.table_name, d.state_column from definitions d
    on conflict (tenant_id, key) do nothing
    returning id, key
  ),
  moves (key, from_state, to_state, allowed_roles) as (
    values
      ('listing_status', 'coming_soon', 'for_sale', '{owner,manager}'),
      ('listing_status', 'coming_soon', 'under_contract', '{owner,manager}'),
      ('listing_status', 'coming_soon', 'sold', '{owner,manager}'),
      ('listing_status', 'for_sale', 'coming_soon', '{owner,manager}'),
      ('listing_status', 'for_sale', 'under_contract', '{owner,manager}'),
      ('listing_status', 'for_sale', 'sold', '{owner,manager}'),
      ('listing_status', 'under_contract', 'for_sale', '{owner,manager}'),
      ('listing_status', 'under_contract', 'sold', '{owner,manager}'),
      ('listing_status', 'sold', 'for_sale', '{owner,manager}'),
      ('listing_publish', 'draft', 'live', '{owner,manager}'),
      ('listing_publish', 'live', 'draft', '{owner,manager}'),
      ('inbox_status', 'new', 'assigned', '{owner,manager}'),
      ('inbox_status', 'new', 'replied', '{owner,manager}'),
      ('inbox_status', 'new', 'closed', '{owner,manager}'),
      ('inbox_status', 'assigned', 'replied', '{owner,manager,staff}'),
      ('inbox_status', 'assigned', 'closed', '{owner,manager,staff}'),
      ('inbox_status', 'replied', 'assigned', '{owner,manager,staff}'),
      ('inbox_status', 'replied', 'closed', '{owner,manager,staff}'),
      ('inbox_status', 'closed', 'assigned', '{owner,manager}'),
      ('chat_policy_status', 'draft', 'published', '{owner}'),
      ('chat_policy_status', 'published', 'archived', '{owner}'),
      -- Owners resolve; a new occurrence reopens (the server, as service role).
      ('problem_status', 'open', 'resolved', '{owner}'),
      ('problem_status', 'resolved', 'open', '{owner}')
  )
  insert into cwr.workflow_transitions (tenant_id, workflow_id, from_state, to_state, allowed_roles)
  select p_tenant_id, c.id, m.from_state, m.to_state, m.allowed_roles::cwr.member_role[]
  from moves m
  join created c on c.key = m.key;
$$;

-- Existing tenants: drop the old listing_status workflow (its moves cascade) and
-- reinstall it, so the move list above stays the single source.
delete from cwr.workflows where key = 'listing_status';
select cwr.install_default_workflows(id) from cwr.tenants;
