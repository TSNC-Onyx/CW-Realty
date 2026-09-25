-- Reordering for the admin portal (Admin §2, §3): moves one listing, team member, or
-- listing photo up or down by one place in a single transaction (Infra §3).
-- SECURITY INVOKER: the caller's own Row Level Security applies, and only owners and
-- managers (editors) may reorder. The list is renumbered 1..n first, so rows that
-- share a sort order (for example, newly added ones) still move predictably.

create function cwr.move_item(p_table text, p_id uuid, p_direction text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_step integer := case p_direction when 'up' then -1 when 'down' then 1 end;
  v_scope_column text := case p_table when 'listing_photos' then 'listing_id' else 'tenant_id' end;
  v_scope_value uuid;
  v_tenant_id uuid;
  v_position integer;
  v_neighbor_id uuid;
begin
  if p_table not in ('listings', 'team_members', 'listing_photos') then
    raise exception 'This list cannot be reordered' using errcode = 'invalid_parameter_value';
  end if;
  if v_step is null then
    raise exception 'Direction must be up or down' using errcode = 'invalid_parameter_value';
  end if;

  execute format('select %I, tenant_id from cwr.%I where id = $1 and deleted_at is null', v_scope_column, p_table)
    into v_scope_value, v_tenant_id using p_id;
  if v_scope_value is null then
    raise exception 'Item not found' using errcode = 'no_data_found';
  end if;
  if not cwr.is_service_context() and v_tenant_id not in (select cwr.editor_tenant_ids()) then
    raise exception 'Your role cannot reorder this list' using errcode = 'insufficient_privilege';
  end if;

  execute format('select 1 from cwr.%I where %I = $1 and deleted_at is null for update', p_table, v_scope_column)
    using v_scope_value;
  execute format(
    'update cwr.%1$I t set sort_order = o.position
     from (select id, row_number() over (order by sort_order, id)::integer as position
           from cwr.%1$I where %2$I = $1 and deleted_at is null) o
     where t.id = o.id and t.sort_order <> o.position',
    p_table, v_scope_column
  ) using v_scope_value;

  execute format('select sort_order from cwr.%I where id = $1', p_table) into v_position using p_id;
  execute format('select id from cwr.%I where %I = $1 and deleted_at is null and sort_order = $2', p_table, v_scope_column)
    into v_neighbor_id using v_scope_value, v_position + v_step;
  if v_neighbor_id is null then
    return;
  end if;

  execute format(
    'update cwr.%I set sort_order = case when id = $1 then $3 else $4 end where id in ($1, $2)',
    p_table
  ) using p_id, v_neighbor_id, v_position + v_step, v_position;
end;
$$;

-- New functions are executable by everyone by default; only signed-in users may call this.
revoke execute on function cwr.move_item(text, uuid, text) from public, anon;
grant execute on function cwr.move_item(text, uuid, text) to authenticated, service_role;
