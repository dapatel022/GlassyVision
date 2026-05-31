# Customer Accounts (Subscription-Aware) — Sub-project 0 Design

- **Status:** Approved (brainstorm complete). Ready for implementation plan.
- **Date:** 2026-05-31
- **Parent:** [`2026-05-31-subscription-overview-design.md`](./2026-05-31-subscription-overview-design.md) — this is **sub-project 0**, the prerequisite that everything subscription depends on (Keystone 2).
- **Why first:** A 12-month subscription is managed across devices over the year. Today customers are anonymous (order# + URL token); `/track` and `/thanks` have no auth; Supabase Auth is staff-only. None of that can carry a real entitlement. This sub-project builds the customer identity foundation so the subscription core can sit on it.

## 1. Scope (locked decisions)

| Decision | Choice |
|---|---|
| **Build width** | **General identity foundation, subscription-only surface.** Build the auth/identity layer properly; ship only the `/account` shell + login + claim now. Order history, saved-Rx library, saved addresses layer on later with no identity rework. |
| **Auth method** | **Supabase Auth magic-link (passwordless OTP).** Lowest friction for a few-times-a-year cadence; dovetails with the post-purchase claim. Social/password can be added later against the same `auth.users` with no rework. |
| **Claim flow** | **Token-based, gift-ready.** Ownership decided by whoever redeems a claim token (default delivered to the checkout email), not by hard-binding owner = purchaser email. **No gift UI in phase 1**, but no retrofit needed to add it. |
| **Deletion policy** | **Anonymize PII, retain Rx for the 3-year window, then purge.** Full executor built now; wired to the Shopify `customers/redact` webhook. |
| **Join gating** | **Open join.** Anyone can buy + claim. Invite/drop/waitlist gating left as a later config toggle (infra already exists). |

## 2. Identity & auth model

The clean separation — **no `user_role` enum change required**:

- Customers authenticate via **Supabase Auth magic-link** (`signInWithOtp`) → an `auth.users` row, **no `profiles` row**. `getCurrentUser()` requires a profile, so customers are automatically rejected from `/admin` and `/lab`. Staff and customer identities cannot cross over.
- **`customers.auth_user_id uuid references auth.users(id) on delete set null`** (nullable, unique) — the one new column linking the CRM `customers` row to the authenticated identity.
- **`getCurrentCustomer()`** (new `src/lib/auth/customer.ts`): `auth.getUser()` → look up `customers` by `auth_user_id` → returns the customer or `null`. Mirrors the staff middleware. Staff middleware untouched.

## 3. Post-purchase claim flow

1. Checkout on Shopify → return to `/thanks/[orderId]` → *"Create your account to manage your purchase."*
2. Issue a **stateless HMAC claim token** (new `src/lib/auth/claim-token.ts`, mirroring `rx-token.ts`) encoding `customer_id` + expiry under `CLAIM_TOKEN_SECRET`. Email a `/account/claim?token=…` link to the checkout email via the existing comms infra.
3. Click → if not signed in, magic-link sign-in to an email the user controls → **redeem token**: bind `customers.auth_user_id = auth.uid()`. Idempotent ("claimed" state *is* `auth_user_id` being set), so re-issuing a link is just regenerating the HMAC — no token storage table.

**Gift-ready seam:** ownership = token redeemer, not purchaser email. Adding gifting later = let the buyer send the link elsewhere; no redesign.

**Reconciliation & edge cases:**
- **Returning customer** (email already maps to a claimed account): new order auto-attaches via `sync.ts` email/`shopify_customer_id` match — no claim needed.
- **Auth email ≠ checkout email — HARD REJECT in phase 1 (security-hardened).** Because there is no gifting in phase 1, the claimer is always the buyer, so we require the signed-in email to equal the checkout email. A leaked claim link alone therefore cannot bind another account (the link is not sufficient authorization). Gift-readiness stays at the architecture level (token-based claim); a future gift flow routes cross-email claims through an explicit re-verification step (one-time code to the original email). *(Original design allowed bind-and-flag; changed after automated security review flagged it as an account-takeover vector.)*
- **Atomic bind:** the claim updates `auth_user_id` only `where auth_user_id is null` and checks the returned row count, closing the check-then-update race.
- **Token hygiene:** claim token TTL is 14 days (re-issuable on demand), not 90. The claim helpers are server-only (not `'use server'` actions) to keep them off the client RPC surface.
- **Claim never hard-expires for a paid purchase:** re-issuable on demand via an email-entry page (which must enforce CAPTCHA + per-IP/per-email rate limiting before calling the server-only `resendClaimLink`); unclaimed paid orders get reminder nudges via the existing cadence engine.
- **Lost email / duplicate-account-from-different-checkout-email:** admin-mediated merge — flagged, tooling deferred.

## 4. Data model & RLS

**Migration:**
- `customers.auth_user_id` + unique index. No new tables (claim token is stateless HMAC).
- SQL helper `current_customer_id()` → returns `customers.id` for `auth.uid()` (keeps future membership/redemption policies one-liners).

**RLS — first customer-facing policies in the codebase:**
- `customers`: `SELECT` where `auth.uid() = auth_user_id`.
- **All mutations stay service-role** (server actions only). RLS is defense-in-depth, matching the `rx_files` posture.

## 5. Deletion — GDPR/CCPA vs FTC retention

On a deletion request: **anonymize PII** (name, email, contact) on the `customers` row, delete/unlink the `auth.users` identity (`auth_user_id → null`), but **retain `rx_files` + dispensed-order compliance records** in restricted storage until the 3-year window lapses, then purge. Wire the currently-unhandled Shopify **`customers/redact` / `shop/redact`** webhooks to set `deletion_requested_at` and drive the executor.

## 6. The `/account` surface (built now)

- **`/account/login`** — magic-link entry, distinct from staff `/login`.
- **`/account/claim?token=…`** — verify token, ensure signed in, bind `auth_user_id` (idempotent; flag mismatch).
- **`/account`** — minimal authenticated landing (welcome, email, sign-out) + re-send-claim-link path.
- Identity plumbing: `auth_user_id` migration, `getCurrentCustomer()`, customer RLS, claim-token lib, `customers/redact` webhook + anonymize/purge executor.

**Honest dependency:** `/account/subscription` (slot cards, Rx status, tracking, expiry countdown) needs the membership/redemption tables that don't exist until sub-project 1. Sub-project 0 ships the foundation + logged-in `/account` shell; the subscription dashboard proper is built in sub-project 1 on this foundation. This keeps sub-project 0 independently testable.

## 7. Out of scope (deferred, additive — no rework)

Order history, saved-Rx library, saved addresses, gift UI, admin account-merge tooling, invite/drop/waitlist gating, social/password auth.

## 8. Done-criteria (TDD)

- **Unit:** claim-token sign/verify/expire/re-issue; `getCurrentCustomer`; deletion anonymizer (PII scrubbed, `rx_files` retained).
- **RLS:** customer reads own `customers` row; **cannot** read another's; customer/anon role cannot mutate.
- **Integration:** claim binds `auth_user_id`; idempotent re-claim; email-mismatch flags for admin; `customers/redact` → `deletion_requested_at` → anonymize executor.
- **Auth:** magic-link sign-in (Supabase Auth, mocked).
- Full suite green, lint + `tsc` clean; external code review before merge.

## 9. Open items to confirm during planning

- Supabase Auth email/redirect config (magic-link sender, allowed redirect URLs) — implementation detail for the plan.
- Exact anonymization field list on `customers` (name, email, first/last, internal_notes? — keep `flags`/compliance links).
- Whether the `/account` shell shows anything beyond identity (kept empty by the scope decision; revisit only if it harms UX).
