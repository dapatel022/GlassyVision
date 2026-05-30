-- rx_files RLS previously exposed only a founder/reviewer SELECT policy,
-- leaving INSERT/UPDATE/DELETE with no policy at all — the policy set
-- disagreed with the real access paths. All app writes go through the
-- service-role client (which bypasses RLS), but the policy set should still
-- reflect intended access for defense in depth. Grant founder/reviewer full
-- management; every other role (and anon) is denied by default.
drop policy if exists "Founder/reviewer read rx_files" on rx_files;

create policy "Founder/reviewer manage rx_files"
  on rx_files for all
  using (public.has_role(array['founder', 'reviewer']::user_role[]))
  with check (public.has_role(array['founder', 'reviewer']::user_role[]));
