-- Listing statuses become Coming Soon, For Sale, Under Contract, Sold (owner choice
-- 2026-10-02, docs/cwr-listing-statuses-plan.md). Renaming keeps every existing row;
-- the enum order is the order visitors see on /listings.
-- 'coming_soon' is added here and first used in the next migration, because a new
-- enum value cannot be used in the transaction that adds it.

alter type cwr.listing_status rename value 'active' to 'for_sale';
alter type cwr.listing_status rename value 'pending' to 'under_contract';
alter type cwr.listing_status add value 'coming_soon' before 'for_sale';
