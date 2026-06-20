-- A non-Rx subscription redemption that has a synthesized order + reserved
-- inventory but has not yet been released to the lab. It is COMMITTED (money
-- captured / inventory held) and must block a terminal membership transition,
-- exactly like awaiting_rx — but it routes through the non-Rx admin queue, not
-- the Rx queue. Distinct from in_production, which means the lab is already
-- cutting. Added in its own migration so the value is committed before any
-- later migration references it (Postgres forbids using a new enum value in the
-- same transaction that added it).
alter type redemption_status add value if not exists 'awaiting_fulfillment';
