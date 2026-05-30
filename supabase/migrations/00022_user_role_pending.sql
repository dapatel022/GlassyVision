-- A neutral, zero-access role. A freshly-provisioned auth user (or any account
-- created before its invitation role is applied) lands here with NO lab/admin
-- access. isLabRole()/isAdminRole() in src/lib/auth/middleware.ts deliberately
-- exclude 'pending'.
--
-- NOTE: `alter type ... add value` must run in its own migration/transaction —
-- the new value cannot be USED (e.g. as a column default) in the same
-- transaction that adds it. The default is set in 00023.
alter type user_role add value if not exists 'pending';
