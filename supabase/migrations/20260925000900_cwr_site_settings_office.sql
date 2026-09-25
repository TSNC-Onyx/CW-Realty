-- Office address and firm license for the footer and Contact page (Admin §4: edited
-- once, used everywhere). Expand-only: new nullable columns, no existing data changed.
-- Seeds the CWR contact details shown on the current live site; the manager can
-- change them in the admin portal. Existing rows are never overwritten.

alter table cwr.site_settings
  add column office_address_line1 text check (length(trim(office_address_line1)) between 1 and 200),
  add column office_address_line2 text check (length(trim(office_address_line2)) between 1 and 200),
  add column office_city text check (length(trim(office_city)) between 1 and 100),
  add column office_state text check (office_state ~ '^[A-Z]{2}$'),
  add column office_postal_code text check (office_postal_code ~ '^[0-9]{5}$'),
  add column license_number text check (license_number ~ '^[A-Z0-9-]{1,20}$');

insert into cwr.site_settings (
  tenant_id, phone, email,
  office_address_line1, office_address_line2, office_city, office_state, office_postal_code,
  license_number
)
select
  t.id, '+13367080560', 'charlie@charliewardrealty.com',
  '806 Green Valley Road', 'Suite 200', 'Greensboro', 'NC', '27408',
  'C31457'
from cwr.tenants t
where t.slug = 'cwr'
on conflict (tenant_id) do nothing;
