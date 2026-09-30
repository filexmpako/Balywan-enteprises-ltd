-- app_settings stores a mix of admin-only derived caches and a few document
-- keys an Owner's own dashboard genuinely reads (activityRules,
-- weeklyWakalaStatsHistory, weeklyKpiHistory — see OwnerWeeklyCheckpoints.tsx
-- and src/utils/activityRules.ts / weeklyHistory.ts). The previous read
-- policy was fully permissive (USING (true)) for every key. Owner-role
-- accounts are hard-blocked from every #/admin/* route (App.tsx) and never
-- read any other key in this table, so this restricts read access to staff
-- for everything except the confirmed Owner-needed keys.
DROP POLICY IF EXISTS "settings read authenticated" ON public.app_settings;
CREATE POLICY "settings read staff or owner-needed keys" ON public.app_settings
  FOR SELECT TO authenticated USING (
    public.is_staff(auth.uid())
    OR key = ANY (ARRAY['activityRules', 'weeklyWakalaStatsHistory', 'weeklyKpiHistory'])
  );