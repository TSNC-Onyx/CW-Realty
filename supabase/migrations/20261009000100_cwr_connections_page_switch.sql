-- Owner switch to hide or show the public Connections page (docs/cwr-connections-page-switch-plan.md).
-- Lives with the other site-wide settings, so the existing read, edit, and audit rules cover it.
-- Starts out showing, so the website is unchanged until an owner hides the page.
alter table cwr.site_settings
  add column is_connections_page_visible boolean not null default true;

comment on column cwr.site_settings.is_connections_page_visible is
  'false hides the Connections page: left out of menus and the sitemap, and its address sends visitors to Resources.';

-- Owners only, enforced in the database like the chat assistant switch (20261003000100): managers
-- may edit the other site settings, but only an owner of the tenant, or server-side work, may hide
-- or show the page. A new row may only start with the page showing.
create function cwr.guard_connections_page_switch()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if cwr.is_service_context() then
    return new;
  end if;
  if tg_op = 'INSERT' and new.is_connections_page_visible then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.is_connections_page_visible is not distinct from old.is_connections_page_visible then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.tenant_id in (select cwr.owner_tenant_ids()) then
    return new;
  end if;
  raise exception 'Only owners can show or hide the Connections page' using errcode = 'insufficient_privilege';
end;
$$;

create trigger site_settings_guard_connections_page_switch
  before insert or update on cwr.site_settings
  for each row execute function cwr.guard_connections_page_switch();

revoke execute on function cwr.guard_connections_page_switch() from public, anon, authenticated;

-- Problems with the switch are recorded under their own action.
insert into cwr.problem_catalog (action, area, label, section_label, spike_codes) values
  ('connections.set_page_visibility', 'connections', 'Show or hide the Connections page', 'Connections', '{}');
