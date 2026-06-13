-- Make order_line_items.shopify_line_item_id unique so order sync can UPSERT on
-- it instead of delete-and-reinsert (2026-06-12 audit HIGH).
--
-- Shopify line item ids are globally unique within a shop, so a single-column
-- unique constraint is correct. This is the conflict target for the upsert in
-- syncShopifyOrder, which keeps row ids stable across webhooks and avoids both
-- the FK-violation-on-delete and the duplicate-rows-on-reinsert bugs.
alter table order_line_items
  add constraint order_line_items_shopify_line_item_id_key unique (shopify_line_item_id);
