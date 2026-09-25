-- Test helpers shared by every pgTAP file. Runs first (file name order) and is
-- committed on purpose: it only installs the `cwr_test` helper schema, never data.
-- `cwr_test` exists only in local and CI test databases, never in migrations.

create extension if not exists pgtap with schema extensions;
create schema if not exists cwr_test;

-- Fixed IDs so tests read by name: cwr_test.id('owner'), cwr_test.id('tenant_a') ...
create or replace function cwr_test.id(p_name text)
returns uuid
language sql
immutable
as $$
  select case p_name
    when 'tenant_a' then 'aaaaaaaa-0000-0000-0000-000000000001'
    when 'tenant_b' then 'bbbbbbbb-0000-0000-0000-000000000001'
    when 'owner' then '11111111-1111-1111-1111-111111111111'
    when 'manager' then '22222222-2222-2222-2222-222222222222'
    when 'staff' then '33333333-3333-3333-3333-333333333333'
    when 'other_staff' then '44444444-4444-4444-4444-444444444444'
    when 'outsider' then '55555555-5555-5555-5555-555555555555'
    when 'live_listing' then 'c0000000-0000-0000-0000-000000000001'
    when 'draft_listing' then 'c0000000-0000-0000-0000-000000000002'
    when 'tenant_b_listing' then 'c0000000-0000-0000-0000-000000000003'
    when 'staff_thread' then 'd0000000-0000-0000-0000-000000000001'
    when 'other_thread' then 'd0000000-0000-0000-0000-000000000002'
    when 'draft_policy' then 'e0000000-0000-0000-0000-000000000001'
  end::uuid;
$$;

-- Switch the JWT claims; the caller then runs `set local role authenticated`.
create or replace function cwr_test.sign_in(p_name text, p_aal text default 'aal2')
returns void
language sql
as $$
  select set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', cwr_test.id(p_name), 'role', 'authenticated', 'aal', p_aal)::text,
    true
  );
$$;

create or replace function cwr_test.sign_out()
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('role', 'anon')::text, true);
$$;

create or replace function cwr_test.create_users()
returns void
language sql
as $$
  insert into auth.users (id, email)
  select cwr_test.id(name), name || '@test.cwr'
  from unnest(array['owner', 'manager', 'staff', 'other_staff', 'outsider']) as name;
$$;

create or replace function cwr_test.create_tenants()
returns void
language sql
as $$
  insert into cwr.tenants (id, slug, name) values
    (cwr_test.id('tenant_a'), 'test-a', 'Test Tenant A'),
    (cwr_test.id('tenant_b'), 'test-b', 'Test Tenant B');
  insert into cwr.memberships (tenant_id, user_id, role) values
    (cwr_test.id('tenant_a'), cwr_test.id('owner'), 'owner'),
    (cwr_test.id('tenant_a'), cwr_test.id('manager'), 'manager'),
    (cwr_test.id('tenant_a'), cwr_test.id('staff'), 'staff'),
    (cwr_test.id('tenant_a'), cwr_test.id('other_staff'), 'staff'),
    (cwr_test.id('tenant_b'), cwr_test.id('outsider'), 'owner');
$$;

create or replace function cwr_test.create_listings()
returns void
language plpgsql
as $$
begin
  insert into cwr.listings (id, tenant_id, slug, street_address, city, postal_code, price_cents, description)
  values
    (cwr_test.id('live_listing'), cwr_test.id('tenant_a'), '100-main-st-greensboro-nc',
     '100 Main St', 'Greensboro', '27401', 30000000, 'A live listing'),
    (cwr_test.id('draft_listing'), cwr_test.id('tenant_a'), '200-oak-ave-greensboro-nc',
     '200 Oak Ave', 'Greensboro', '27401', 25000000, 'A draft listing'),
    (cwr_test.id('tenant_b_listing'), cwr_test.id('tenant_b'), '300-elm-st-greensboro-nc',
     '300 Elm St', 'Greensboro', '27401', 20000000, 'Another tenant''s draft');
  insert into cwr.listing_photos (tenant_id, listing_id, storage_path, alt_text, width, height)
  values (cwr_test.id('tenant_a'), cwr_test.id('live_listing'), 'test-a/100-main/front.avif',
          'Front of 100 Main St', 1600, 1067);
  perform cwr.transition('listing_publish', cwr_test.id('live_listing'), 'live');
end;
$$;

create or replace function cwr_test.create_inbox()
returns void
language plpgsql
as $$
begin
  insert into cwr.inbox_threads (id, tenant_id, source, contact_name, contact_email, assignee_id)
  values
    (cwr_test.id('staff_thread'), cwr_test.id('tenant_a'), 'contact', 'Visitor One',
     'one@example.com', cwr_test.id('staff')),
    (cwr_test.id('other_thread'), cwr_test.id('tenant_a'), 'contact', 'Visitor Two',
     'two@example.com', cwr_test.id('other_staff'));
  perform cwr.transition('inbox_status', cwr_test.id('staff_thread'), 'assigned');
  perform cwr.transition('inbox_status', cwr_test.id('other_thread'), 'assigned');
end;
$$;

-- Builds the whole fixture as the database owner (a trusted server context).
create or replace function cwr_test.create_fixture()
returns void
language sql
as $$
  select cwr_test.create_users();
  select cwr_test.create_tenants();
  select cwr_test.create_listings();
  select cwr_test.create_inbox();
  insert into cwr.chat_policies (id, tenant_id, body)
  values (cwr_test.id('draft_policy'), cwr_test.id('tenant_a'), 'Policy text, version 1');
$$;

-- Tests look up fixture IDs while acting as a visitor or signed-in user.
grant usage on schema cwr_test to anon, authenticated;
revoke execute on all functions in schema cwr_test from public;
grant execute on function cwr_test.id(text) to anon, authenticated;

select plan(1);
select has_function('cwr_test', 'create_fixture', 'test helpers are installed');
select * from finish();
