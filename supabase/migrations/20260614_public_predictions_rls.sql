-- ─── Migration: Öppna SELECT-policies för player_predictions och vm_picks ────
-- Tillåter alla (inloggade eller ej) att läsa andras spelar-tipsningar och
-- VM-vinnartips, så att profilsidor i leaderboard kan visa dem.
-- INSERT/UPDATE/DELETE-regler är oförändrade (användare skriver bara egna rader).

-- player_predictions: öppna SELECT
DROP POLICY IF EXISTS "Egna spelartips: select" ON public.player_predictions;
CREATE POLICY "Alla kan läsa spelartips"
  ON public.player_predictions FOR SELECT USING (true);

-- vm_picks: öppna SELECT
DROP POLICY IF EXISTS "Vinnarpicks select" ON public.vm_picks;
CREATE POLICY "Alla kan läsa vinnarpicks"
  ON public.vm_picks FOR SELECT USING (true);
