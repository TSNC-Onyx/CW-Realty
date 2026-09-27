-- /services is now the Services overview page (owner choice 2026-09-26,
-- docs/cwr-site-review-round-plan.md), so the legacy redirect to CWR TouchUp is retired.
-- /cwrtouchup keeps redirecting to /services/cwr-touchup.

delete from cwr.redirects
where source_path = '/services'
  and target_path = '/services/cwr-touchup'
  and origin = 'legacy';
