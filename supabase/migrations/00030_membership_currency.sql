-- Subscription review fixes (00030).
--
-- (1) Memberships must carry the order's settlement currency so a redemption's
--     synthesized fulfillment order is created in the right currency (USD vs CAD).
--     Previously start-redemption / confirm-addon-payment SELECTed a `currency`
--     column that did not exist, silently yielding an empty/wrong currency.
alter table subscription_memberships
  add column currency text not null default 'usd'
  check (currency in ('usd', 'cad'));

-- (2) The authoritative premium-frame surcharge amount, so the expected-surcharge
--     computed at claim time INCLUDES the premium frame's surcharge (not just lens
--     add-ons). Set post-deploy alongside `subscription_surcharge_variant_id`.
alter table product_metadata
  add column subscription_surcharge_price numeric(10, 2) not null default 0;
