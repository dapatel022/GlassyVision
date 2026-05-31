-- Add subscription-driven inventory adjustment reasons in their own migration.
-- Postgres `ALTER TYPE ... ADD VALUE` cannot be used in the same transaction that
-- later references the new value, so these are committed before 00029 uses them.
alter type adjustment_reason add value if not exists 'subscription_reserved';
alter type adjustment_reason add value if not exists 'subscription_release';
