-- Old Wix URLs → new pages, from docs/reference/site/navigation-reconciliation.md
-- ("Pages and redirects"). Stored normalized; every redirect is one permanent hop.
-- /home is handled by URL normalization in the middleware, so it is not stored.
-- Existing rows are never overwritten.

insert into cwr.redirects (tenant_id, source_path, target_path, origin)
select t.id, r.source_path, r.target_path, 'legacy'
from cwr.tenants t
cross join (
  values
    ('/about-us', '/about'),
    ('/support-team', '/team'),
    ('/charlie-ward', '/team/charlie-ward'),
    ('/copy-of-russell-casey', '/team/ashley-edwards'),
    ('/jerome-pappas-broker', '/team/jerome-pappas'),
    ('/ryan-dixon-cwr', '/team/ryan-dixon'),
    ('/cherri-dixon-cwr', '/team/cherri-dixon'),
    ('/herita-jones', '/team/herita-jones'),
    ('/copy-of-princess-garner', '/team/princess-garner'),
    ('/richard-chitman', '/team/richard-chitman'),
    ('/jayne-trinette-cwr', '/team/jayne-trinette'),
    ('/russell-casey', '/team/russell-casey'),
    ('/5423pineleveldr', '/listings/5423-pine-level-dr-browns-summit-nc'),
    ('/1514woodridgeave', '/listings/1514-woodridge-ave-greensboro-nc'),
    ('/rocky-meadows-lane', '/listings/912-rocky-meadows-ln'),
    ('/3826-burlington-rd-greensboro-nc-27405', '/listings/3826-burlington-rd-greensboro-nc'),
    ('/listings/3826-burlington-rd-greensboro-nc-27405', '/listings/3826-burlington-rd-greensboro-nc'),
    ('/cwrtouchup', '/services/cwr-touchup'),
    ('/services', '/services/cwr-touchup'),
    ('/sell', '/connections'),
    ('/faq', '/resources')
) as r (source_path, target_path)
where t.slug = 'cwr'
on conflict (tenant_id, source_path) do nothing;
