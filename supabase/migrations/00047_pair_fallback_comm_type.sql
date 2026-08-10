-- 00047_pair_fallback_comm_type.sql
-- New transactional email type: sent when a purchase-time configured pair
-- (auto-redeem-pairs.ts) could not be started (out of stock / undispensable
-- destination / a failed pick) and fell back to an open slot. Added in its
-- own migration so the value is committed before any later migration or
-- application code references it (Postgres forbids using a new enum value in
-- the same transaction that added it — see the note in 00037).
alter type comm_type add value if not exists 'pair_fallback';
