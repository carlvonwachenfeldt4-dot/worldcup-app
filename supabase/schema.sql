-- ═══════════════════════════════════════════════════════════════
-- VM-tippning 2026 – Supabase schema
-- Kör detta i Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Profiler ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Skapa profil automatiskt vid registrering
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email,'@',1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── 2. Grupptips ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.group_tips (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  match_id    TEXT NOT NULL,                       -- t.ex. "A1", "F3"
  tip         TEXT NOT NULL CHECK (tip IN ('1','X','2')),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, match_id)
);

-- ─── 3. Bracket-picks ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bracket_picks (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  slot_id     TEXT NOT NULL,                       -- t.ex. "R32-1", "SF-2", "F"
  team_id     TEXT,                                -- t.ex. "SWE", "ARG"
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, slot_id)
);

-- ─── 4. Spelar-tipsningar ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.player_predictions (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category      TEXT NOT NULL CHECK (category IN ('scorer','assist','yellow','red')),
  player_name   TEXT NOT NULL,
  player_nation TEXT NOT NULL,
  confirmed     BOOLEAN DEFAULT FALSE,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, category)
);

-- Server-side conflictkontroll för egna sparade rader.
-- Om ett senare sparförsök redan har uppdaterat raden, ignoreras den föråldrade skrivningen.
CREATE OR REPLACE FUNCTION public.safe_save_group_tip(
  p_user_id UUID,
  p_match_id TEXT,
  p_tip TEXT
)
RETURNS SETOF public.group_tips
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO public.group_tips (user_id, match_id, tip, updated_at)
  VALUES (p_user_id, p_match_id, p_tip, NOW())
  ON CONFLICT (user_id, match_id)
  DO UPDATE SET tip = EXCLUDED.tip, updated_at = NOW()
  RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION public.safe_save_bracket_pick(
  p_user_id UUID,
  p_slot_id TEXT,
  p_team_id TEXT
)
RETURNS SETOF public.bracket_picks
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO public.bracket_picks (user_id, slot_id, team_id, updated_at)
  VALUES (p_user_id, p_slot_id, p_team_id, NOW())
  ON CONFLICT (user_id, slot_id)
  DO UPDATE SET team_id = EXCLUDED.team_id, updated_at = NOW()
  RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION public.safe_save_player_prediction(
  p_user_id UUID,
  p_category TEXT,
  p_player_name TEXT,
  p_player_nation TEXT,
  p_confirmed BOOLEAN
)
RETURNS SETOF public.player_predictions
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO public.player_predictions (user_id, category, player_name, player_nation, confirmed, updated_at)
  VALUES (p_user_id, p_category, p_player_name, p_player_nation, p_confirmed, NOW())
  ON CONFLICT (user_id, category)
  DO UPDATE SET
    player_name = EXCLUDED.player_name,
    player_nation = EXCLUDED.player_nation,
    confirmed = EXCLUDED.confirmed,
    updated_at = NOW()
  RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION public.safe_save_vm_winner_pick(
  p_user_id UUID,
  p_vm_winner TEXT
)
RETURNS SETOF public.vm_picks
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO public.vm_picks (user_id, vm_winner, updated_at)
  VALUES (p_user_id, btrim(p_vm_winner), NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET vm_winner = btrim(EXCLUDED.vm_winner), updated_at = NOW()
  RETURNING *;
END;
$$;

-- ─── 5. Vännerrum ────────────────────────────────────────────────────────────

-- Private rum och gruppfunktioner har tagits bort. Ingen vänlista används längre.

-- ─── 6. Leaderboard-vy ───────────────────────────────────────────────────────
-- Beräknar poäng per användare baserat på korrekta tips mot faktiska resultat.
--   group_pts:   3p per korrekt 1X2-tips (tip = result i match_results), annars 0
--   bracket_pts: 3p per korrekt 1X2-tips på slutspelsmatcher, samma som group_pts
--   total_pts:   summan av group_pts + bracket_pts

CREATE OR REPLACE VIEW public.leaderboard_view AS
SELECT
  p.id,
  p.username,

  -- group_pts: poäng från gruppspelets 1X2-tips.
  -- Varje tips JOINas mot match_results på match_id.
  -- CASE ger 3 om tipset stämmer med det genererade result-fältet, annars 0.
  -- COALESCE hanterar användare som inte har några tips alls.
  COALESCE(gt.group_pts, 0)                             AS group_pts,

  -- bracket_pts: samma poängmodell som grupptips, men mot bracket_matches.
  COALESCE(bt.bracket_pts, 0)                           AS bracket_pts,

  -- total_pts: summan av de två ovanstående kolumnerna.
  COALESCE(gt.group_pts, 0) + COALESCE(bt.bracket_pts, 0)  AS total_pts

FROM public.profiles p

-- ── Subquery: räknar ut gruppspelspoäng per användare ──────────────────────
-- LEFT JOIN group_tips med match_results på match_id så vi kan jämföra
-- användarens tips mot det faktiska resultatet ('1', 'X' eller '2').
-- match_results.result är ett genererat fält (STORED) som räknas ut ur
-- home_goals/away_goals, så det är NULL tills matchen spelats klart.
LEFT JOIN (
  SELECT
    gt.user_id,
    SUM(
      CASE
        -- Ge 3 poäng om resultatet är känt OCH tipset är korrekt
        WHEN mr.result IS NOT NULL AND gt.tip = mr.result THEN 3
        -- Annars 0 (oavgjord match, ej spelad, eller fel tips)
        ELSE 0
      END
    ) AS group_pts
  FROM public.group_tips gt
  -- INNER-semantik i LEFT JOIN: mr-raden är NULL om matchen saknar resultat
  LEFT JOIN public.match_results mr ON gt.match_id = mr.match_id
  GROUP BY gt.user_id
) gt ON gt.user_id = p.id

-- ── Subquery: räknar ut slutspelspoäng per användare ───────────────────────
-- Samma mönster som grupptips ovan, men mot bracket_matches/bracket_tips.
LEFT JOIN (
  SELECT
    bt.user_id,
    SUM(CASE WHEN bm.result IS NOT NULL AND bt.tip = bm.result THEN 3 ELSE 0 END) AS bracket_pts
  FROM public.bracket_tips bt
  LEFT JOIN public.bracket_matches bm ON bt.match_id = bm.id
  GROUP BY bt.user_id
) bt ON bt.user_id = p.id

ORDER BY total_pts DESC;

-- ─── 7. Row Level Security ───────────────────────────────────────────────────

ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_tips         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bracket_picks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_predictions ENABLE ROW LEVEL SECURITY;

-- Profiler
DROP POLICY IF EXISTS "Profiler synliga för alla"   ON public.profiles;
DROP POLICY IF EXISTS "Skapa egen profil"           ON public.profiles;
DROP POLICY IF EXISTS "Uppdatera egen profil"       ON public.profiles;
DROP POLICY IF EXISTS "Radera egen profil"          ON public.profiles;

CREATE POLICY "Profiler synliga för alla"   ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Skapa egen profil"           ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Uppdatera egen profil"       ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Radera egen profil"          ON public.profiles FOR DELETE USING (auth.uid() = id);

-- Grupptips
DROP POLICY IF EXISTS "Alla kan läsa grupptips"     ON public.group_tips;
DROP POLICY IF EXISTS "Egna grupptips: insert"      ON public.group_tips;
DROP POLICY IF EXISTS "Egna grupptips: update"      ON public.group_tips;
DROP POLICY IF EXISTS "Egna grupptips: delete"      ON public.group_tips;

CREATE POLICY "Alla kan läsa grupptips"     ON public.group_tips FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Egna grupptips: insert"      ON public.group_tips FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Egna grupptips: update"      ON public.group_tips FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Egna grupptips: delete"      ON public.group_tips FOR DELETE USING (auth.uid() = user_id);

-- Bracket
DROP POLICY IF EXISTS "Alla kan läsa bracket"       ON public.bracket_picks;
DROP POLICY IF EXISTS "Egna bracket: insert"        ON public.bracket_picks;
DROP POLICY IF EXISTS "Egna bracket: update"        ON public.bracket_picks;
DROP POLICY IF EXISTS "Egna bracket: delete"        ON public.bracket_picks;

CREATE POLICY "Alla kan läsa bracket"       ON public.bracket_picks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Egna bracket: insert"        ON public.bracket_picks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Egna bracket: update"        ON public.bracket_picks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Egna bracket: delete"        ON public.bracket_picks FOR DELETE USING (auth.uid() = user_id);

-- Spelar-tipsningar
DROP POLICY IF EXISTS "Egna spelartips: select"     ON public.player_predictions;
DROP POLICY IF EXISTS "Alla kan läsa spelartips"    ON public.player_predictions;
DROP POLICY IF EXISTS "Egna spelartips: insert"     ON public.player_predictions;
DROP POLICY IF EXISTS "Egna spelartips: update"     ON public.player_predictions;

-- SELECT öppen för alla – profilsidor visar andras val
CREATE POLICY "Alla kan läsa spelartips"    ON public.player_predictions FOR SELECT USING (true);
CREATE POLICY "Egna spelartips: insert"     ON public.player_predictions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Egna spelartips: update"     ON public.player_predictions FOR UPDATE USING (auth.uid() = user_id);

-- ─── 8. Server-side matchlåsning ────────────────────────────────────────────
-- Triggerfunction som kastar fel om turneringen redan har startat.
-- Skyddar group_tips, bracket_picks och player_predictions mot sena tips
-- även om klientsidans lås kringgås via direkt API-anrop.

CREATE OR REPLACE FUNCTION public.prevent_late_tips()
RETURNS TRIGGER AS $$
DECLARE
  match_start  TIMESTAMPTZ;
  match_status TEXT;
BEGIN
  IF TG_TABLE_NAME = 'group_tips' THEN
    SELECT starts_at INTO match_start
      FROM public.group_match_schedule
     WHERE match_id = NEW.match_id;

    IF match_start IS NULL THEN
      RAISE EXCEPTION 'Matchstart saknas för match %', NEW.match_id;
    END IF;

    IF NOW() >= match_start THEN
      RAISE EXCEPTION 'Tippningen är stängd för match % – den har startat', NEW.match_id;
    END IF;
    RETURN NEW;
  END IF;

  -- Slutspelstips låses när admin sätter matchen som spelad (status = 'finished'),
  -- inte via ett fast klockslag eftersom slutspelets tider beror på gruppspelsresultat.
  IF TG_TABLE_NAME = 'bracket_tips' THEN
    SELECT status INTO match_status
      FROM public.bracket_matches
     WHERE id = NEW.match_id;

    IF match_status IS NULL THEN
      RAISE EXCEPTION 'Okänd slutspelsmatch %', NEW.match_id;
    END IF;

    IF match_status = 'finished' THEN
      RAISE EXCEPTION 'Tippningen är stängd – matchen är redan spelad';
    END IF;
    RETURN NEW;
  END IF;

  -- Övriga typer av tips stängs vid deadline för spelarprediktion och VM-vinnare.
  IF NOW() >= TIMESTAMPTZ '2026-06-12T21:59:00Z' THEN
    RAISE EXCEPTION 'Tippningen är stängd – deadline nådd';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Applicera triggern på alla tipstabeller
DROP TRIGGER IF EXISTS check_tip_time ON public.group_tips;
CREATE TRIGGER check_tip_time
  BEFORE INSERT OR UPDATE ON public.group_tips
  FOR EACH ROW EXECUTE FUNCTION public.prevent_late_tips();

DROP TRIGGER IF EXISTS check_tip_time ON public.bracket_picks;
CREATE TRIGGER check_tip_time
  BEFORE INSERT OR UPDATE ON public.bracket_picks
  FOR EACH ROW EXECUTE FUNCTION public.prevent_late_tips();

DROP TRIGGER IF EXISTS check_tip_time ON public.bracket_tips;
CREATE TRIGGER check_tip_time
  BEFORE INSERT OR UPDATE ON public.bracket_tips
  FOR EACH ROW EXECUTE FUNCTION public.prevent_late_tips();

DROP TRIGGER IF EXISTS check_tip_time ON public.player_predictions;
CREATE TRIGGER check_tip_time
  BEFORE INSERT OR UPDATE ON public.player_predictions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_late_tips();

DROP TRIGGER IF EXISTS check_tip_time ON public.vm_picks;
CREATE TRIGGER check_tip_time
  BEFORE INSERT OR UPDATE ON public.vm_picks
  FOR EACH ROW EXECUTE FUNCTION public.prevent_late_tips();

-- ───────────────────────────────────────────────────────────────────────────
-- Extra schema: match results, spelarstatistik, VM-picks och förbättrad leaderboard
-- Lägg till dessa i Supabase och anpassa RLS beroende på hur ni skriver från server.
-- Rekommendation: använd en server-side sync (cron/edge function) med service role key
-- för att upsert:a `match_results` och `player_stats`.
-- ───────────────────────────────────────────────────────────────────────────

-- Lägg till administratörs-flagga på profiler (valfritt men användbart för RLS)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Matchresultat (canonical results skrivs av server‑sync)
CREATE INDEX IF NOT EXISTS idx_group_tips_user_id ON public.group_tips (user_id);
CREATE INDEX IF NOT EXISTS idx_group_tips_match_id ON public.group_tips (match_id);
CREATE INDEX IF NOT EXISTS idx_bracket_picks_user_id ON public.bracket_picks (user_id);
CREATE INDEX IF NOT EXISTS idx_player_preds_user_id ON public.player_predictions (user_id);

CREATE TABLE IF NOT EXISTS public.match_results (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id    TEXT UNIQUE NOT NULL,       -- t.ex. "A1", "F3"
  api_id      BIGINT,                     -- id från API-Football om tillgängligt
  home_goals  INT,
  away_goals  INT,
  status      TEXT,                       -- NS/1H/HT/2H/FT
  result      TEXT GENERATED ALWAYS AS (
                 CASE
                   WHEN home_goals IS NULL OR away_goals IS NULL THEN NULL
                   WHEN home_goals > away_goals THEN '1'
                   WHEN home_goals < away_goals THEN '2'
                   ELSE 'X' END) STORED,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.match_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Matchresults select" ON public.match_results;
DROP POLICY IF EXISTS "Matchresults admin write" ON public.match_results;
DROP POLICY IF EXISTS "Matchresults admin update" ON public.match_results;
CREATE POLICY "Matchresults select" ON public.match_results FOR SELECT USING (true);
CREATE POLICY "Matchresults admin write" ON public.match_results FOR INSERT WITH CHECK (
  (SELECT coalesce(is_admin, false) FROM public.profiles WHERE id = auth.uid()) = true
);
CREATE POLICY "Matchresults admin update" ON public.match_results FOR UPDATE USING (
  (SELECT coalesce(is_admin, false) FROM public.profiles WHERE id = auth.uid()) = true
);

-- Gruppmatch-schema för matchspecifik låsning av group_tips.
CREATE TABLE IF NOT EXISTS public.group_match_schedule (
  match_id TEXT PRIMARY KEY,
  starts_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.group_match_schedule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Match schedule select" ON public.group_match_schedule;
CREATE POLICY "Match schedule select" ON public.group_match_schedule FOR SELECT USING (true);

INSERT INTO public.group_match_schedule (match_id, starts_at) VALUES
  ('A1','2026-06-11T21:00:00+02:00'),
  ('A2','2026-06-12T04:00:00+02:00'),
  ('A3','2026-06-19T03:00:00+02:00'),
  ('A4','2026-06-19T06:00:00+02:00'),
  ('A5','2026-06-25T03:00:00+02:00'),
  ('A6','2026-06-25T03:00:00+02:00'),
  ('B1','2026-06-12T21:00:00+02:00'),
  ('B2','2026-06-13T21:00:00+02:00'),
  ('B3','2026-06-18T21:00:00+02:00'),
  ('B4','2026-06-19T00:00:00+02:00'),
  ('B5','2026-06-24T21:00:00+02:00'),
  ('B6','2026-06-24T21:00:00+02:00'),
  ('C1','2026-06-14T00:00:00+02:00'),
  ('C2','2026-06-14T03:00:00+02:00'),
  ('C3','2026-06-20T00:00:00+02:00'),
  ('C4','2026-06-20T02:30:00+02:00'),
  ('C5','2026-06-25T00:00:00+02:00'),
  ('C6','2026-06-25T00:00:00+02:00'),
  ('D1','2026-06-13T03:00:00+02:00'),
  ('D2','2026-06-14T06:00:00+02:00'),
  ('D3','2026-06-19T21:00:00+02:00'),
  ('D4','2026-06-20T05:00:00+02:00'),
  ('D5','2026-06-26T04:00:00+02:00'),
  ('D6','2026-06-26T04:00:00+02:00'),
  ('E1','2026-06-14T19:00:00+02:00'),
  ('E2','2026-06-15T01:00:00+02:00'),
  ('E3','2026-06-20T22:00:00+02:00'),
  ('E4','2026-06-21T02:00:00+02:00'),
  ('E5','2026-06-25T22:00:00+02:00'),
  ('E6','2026-06-25T22:00:00+02:00'),
  ('F1','2026-06-14T22:00:00+02:00'),
  ('F2','2026-06-15T04:00:00+02:00'),
  ('F3','2026-06-20T19:00:00+02:00'),
  ('F4','2026-06-21T06:00:00+02:00'),
  ('F5','2026-06-26T01:00:00+02:00'),
  ('F6','2026-06-26T01:00:00+02:00'),
  ('G1','2026-06-15T21:00:00+02:00'),
  ('G2','2026-06-16T03:00:00+02:00'),
  ('G3','2026-06-21T21:00:00+02:00'),
  ('G4','2026-06-22T03:00:00+02:00'),
  ('G5','2026-06-27T03:00:00+02:00'),
  ('G6','2026-06-27T03:00:00+02:00'),
  ('H1','2026-06-15T18:00:00+02:00'),
  ('H2','2026-06-16T00:00:00+02:00'),
  ('H3','2026-06-21T18:00:00+02:00'),
  ('H4','2026-06-22T00:00:00+02:00'),
  ('H5','2026-06-27T02:00:00+02:00'),
  ('H6','2026-06-27T02:00:00+02:00'),
  ('I1','2026-06-16T21:00:00+02:00'),
  ('I2','2026-06-17T00:00:00+02:00'),
  ('I3','2026-06-22T23:00:00+02:00'),
  ('I4','2026-06-23T02:00:00+02:00'),
  ('I5','2026-06-26T21:00:00+02:00'),
  ('I6','2026-06-26T21:00:00+02:00'),
  ('J1','2026-06-17T03:00:00+02:00'),
  ('J2','2026-06-17T06:00:00+02:00'),
  ('J3','2026-06-22T19:00:00+02:00'),
  ('J4','2026-06-23T05:00:00+02:00'),
  ('J5','2026-06-28T04:00:00+02:00'),
  ('J6','2026-06-28T04:00:00+02:00'),
  ('K1','2026-06-17T19:00:00+02:00'),
  ('K2','2026-06-18T04:00:00+02:00'),
  ('K3','2026-06-23T19:00:00+02:00'),
  ('K4','2026-06-24T04:00:00+02:00'),
  ('K5','2026-06-28T01:30:00+02:00'),
  ('K6','2026-06-28T01:30:00+02:00'),
  ('L1','2026-06-17T22:00:00+02:00'),
  ('L2','2026-06-18T01:00:00+02:00'),
  ('L3','2026-06-23T22:00:00+02:00'),
  ('L4','2026-06-24T01:00:00+02:00'),
  ('L5','2026-06-28T21:00:00+02:00'),
  ('L6','2026-06-28T21:00:00+02:00')
ON CONFLICT (match_id) DO NOTHING;

-- Spelarstatistik (toppskytt, assistkung, kortstatistik) – skrivs av server‑sync
CREATE TABLE IF NOT EXISTS public.player_stats (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  api_player_id TEXT,                    -- ev. unik id från API
  category      TEXT NOT NULL CHECK (category IN ('scorer','assist','yellow','red')),
  player_name   TEXT NOT NULL,
  player_nation TEXT,
  value         INT DEFAULT 0,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE c.conname = 'player_stats_category_name_unique'
      AND n.nspname = 'public'
  ) THEN
    ALTER TABLE public.player_stats
      ADD CONSTRAINT player_stats_category_name_unique UNIQUE (category, player_name);
  END IF;
END
$$;

ALTER TABLE public.player_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Playerstats select" ON public.player_stats;
DROP POLICY IF EXISTS "Playerstats admin write" ON public.player_stats;
DROP POLICY IF EXISTS "Playerstats admin update" ON public.player_stats;
CREATE POLICY "Playerstats select" ON public.player_stats FOR SELECT USING (true);
CREATE POLICY "Playerstats admin write" ON public.player_stats FOR INSERT WITH CHECK (
  (SELECT coalesce(is_admin, false) FROM public.profiles WHERE id = auth.uid()) = true
);
CREATE POLICY "Playerstats admin update" ON public.player_stats FOR UPDATE USING (
  (SELECT coalesce(is_admin, false) FROM public.profiles WHERE id = auth.uid()) = true
);

-- Användares VM-vinnare (om ni vill spara den server-side istället för localStorage)
CREATE TABLE IF NOT EXISTS public.vm_picks (
  user_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vm_winner TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id)
);

ALTER TABLE public.vm_picks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Vinnarpicks select" ON public.vm_picks;
DROP POLICY IF EXISTS "Vinnarpicks own upsert" ON public.vm_picks;
DROP POLICY IF EXISTS "Vinnarpicks own update" ON public.vm_picks;
DROP POLICY IF EXISTS "Vinnarpicks own delete" ON public.vm_picks;
-- SELECT öppen för alla – profilsidor visar andras VM-vinnartips
CREATE POLICY "Alla kan läsa vinnarpicks"  ON public.vm_picks FOR SELECT USING (true);
CREATE POLICY "Vinnarpicks own upsert" ON public.vm_picks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Vinnarpicks own update" ON public.vm_picks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Vinnarpicks own delete" ON public.vm_picks FOR DELETE USING (auth.uid() = user_id);

-- Spara turneringens officiella vinnare (endast admin/server skriver)
CREATE TABLE IF NOT EXISTS public.tournament_results (
  id    INT PRIMARY KEY DEFAULT 1,
  winner TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO public.tournament_results (id, winner) VALUES (1, '') ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.tournament_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tournament select" ON public.tournament_results;
DROP POLICY IF EXISTS "Tournament admin upsert" ON public.tournament_results;
CREATE POLICY "Tournament select" ON public.tournament_results FOR SELECT USING (true);
CREATE POLICY "Tournament admin upsert" ON public.tournament_results FOR UPDATE USING (
  (SELECT coalesce(is_admin, false) FROM public.profiles WHERE id = auth.uid()) = true
);

-- ───────────────────────────────────────────────────────────────────────────
-- Slutspel 2.0: bracket_matches + bracket_tips.
-- Slutspelsfliken fungerar nu exakt som grupptipset – riktiga lagnamn hämtas
-- från bracket_matches (satta av admin när de är klara) och användarna tippar
-- 1X2 precis som på gruppspelsmatcher. Den gamla "gissa lag till slot"-tabellen
-- (bracket_picks) används inte längre av klienten men behålls i databasen.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bracket_matches (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sort_order  INT NOT NULL,                          -- visningsordning i fliken
  round       TEXT,                                  -- t.ex. "Åttondelsfinal", "Final"
  home_team   TEXT NOT NULL,
  away_team   TEXT NOT NULL,
  starts_at   TIMESTAMPTZ,
  status      TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','finished')),
  home_goals  INT,
  away_goals  INT,
  result      TEXT GENERATED ALWAYS AS (
                 CASE
                   WHEN home_goals IS NULL OR away_goals IS NULL THEN NULL
                   WHEN home_goals > away_goals THEN '1'
                   WHEN home_goals < away_goals THEN '2'
                   ELSE 'X' END) STORED,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bracket_matches_sort_order ON public.bracket_matches (sort_order);

ALTER TABLE public.bracket_matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Bracket-matcher select" ON public.bracket_matches;
DROP POLICY IF EXISTS "Bracket-matcher admin write" ON public.bracket_matches;
DROP POLICY IF EXISTS "Bracket-matcher admin update" ON public.bracket_matches;
CREATE POLICY "Bracket-matcher select" ON public.bracket_matches FOR SELECT USING (true);
CREATE POLICY "Bracket-matcher admin write" ON public.bracket_matches FOR INSERT WITH CHECK (
  (SELECT coalesce(is_admin, false) FROM public.profiles WHERE id = auth.uid()) = true
);
CREATE POLICY "Bracket-matcher admin update" ON public.bracket_matches FOR UPDATE USING (
  (SELECT coalesce(is_admin, false) FROM public.profiles WHERE id = auth.uid()) = true
);

CREATE TABLE IF NOT EXISTS public.bracket_tips (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  match_id    UUID NOT NULL REFERENCES public.bracket_matches(id) ON DELETE CASCADE,
  tip         TEXT NOT NULL CHECK (tip IN ('1','X','2')),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, match_id)
);

CREATE INDEX IF NOT EXISTS idx_bracket_tips_user_id ON public.bracket_tips (user_id);
CREATE INDEX IF NOT EXISTS idx_bracket_tips_match_id ON public.bracket_tips (match_id);

ALTER TABLE public.bracket_tips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Egna bracket-tips: select" ON public.bracket_tips;
DROP POLICY IF EXISTS "Egna bracket-tips: insert" ON public.bracket_tips;
DROP POLICY IF EXISTS "Egna bracket-tips: update" ON public.bracket_tips;
DROP POLICY IF EXISTS "Egna bracket-tips: delete" ON public.bracket_tips;
CREATE POLICY "Egna bracket-tips: select" ON public.bracket_tips FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Egna bracket-tips: insert" ON public.bracket_tips FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Egna bracket-tips: update" ON public.bracket_tips FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Egna bracket-tips: delete" ON public.bracket_tips FOR DELETE USING (auth.uid() = user_id);

-- Server-side konfliktkontroll, samma mönster som safe_save_group_tip.
CREATE OR REPLACE FUNCTION public.safe_save_bracket_tip(
  p_user_id UUID,
  p_match_id UUID,
  p_tip TEXT
)
RETURNS SETOF public.bracket_tips
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO public.bracket_tips (user_id, match_id, tip, updated_at)
  VALUES (p_user_id, p_match_id, p_tip, NOW())
  ON CONFLICT (user_id, match_id)
  DO UPDATE SET tip = EXCLUDED.tip, updated_at = NOW()
  RETURNING *;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Ny, utökad leaderboard som inkluderar matchpoäng (3p), slutspelspoäng (3p),
-- spelarpoäng (scorer/assist/gula/röda) och VM-vinnare (20p).
-- Den här vyn förutsätter att `match_results`, `player_stats` och `vm_picks`
-- är synkade av servern.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.leaderboard_full_view AS
SELECT
  p.id,
  p.username,
  COALESCE(m.match_pts, 0)       AS match_pts,
  COALESCE(b.bracket_pts, 0)    AS bracket_pts,
  COALESCE(pl.player_pts, 0)    AS player_pts,
  COALESCE(v.vm_pts, 0)         AS vm_pts,
  COALESCE(m.match_pts, 0) + COALESCE(b.bracket_pts, 0) + COALESCE(pl.player_pts, 0) + COALESCE(v.vm_pts, 0) AS total_pts
FROM public.profiles p
LEFT JOIN (
  SELECT gt.user_id,
         SUM(CASE WHEN gt.tip IS NOT NULL AND mr.result IS NOT NULL AND gt.tip = mr.result THEN 3 ELSE 0 END) AS match_pts
  FROM public.group_tips gt
  LEFT JOIN public.match_results mr ON gt.match_id = mr.match_id
  GROUP BY gt.user_id
) m ON m.user_id = p.id
LEFT JOIN (
  SELECT bt.user_id,
         SUM(CASE WHEN bt.tip IS NOT NULL AND bm.result IS NOT NULL AND bt.tip = bm.result THEN 3 ELSE 0 END) AS bracket_pts
  FROM public.bracket_tips bt
  LEFT JOIN public.bracket_matches bm ON bt.match_id = bm.id
  GROUP BY bt.user_id
) b ON b.user_id = p.id
LEFT JOIN (
  SELECT pp.user_id,
    SUM(
      CASE
        WHEN pp.category = 'scorer' AND lower(pp.player_name) = lower(ps.player_name) THEN 10
        WHEN pp.category = 'assist' AND lower(pp.player_name) = lower(ps.player_name) THEN 12
        WHEN pp.category = 'yellow' AND lower(pp.player_name) = lower(ps.player_name) THEN 8
        WHEN pp.category = 'red' AND lower(pp.player_name) = lower(ps.player_name) THEN 10
        ELSE 0 END
    ) AS player_pts
  FROM public.player_predictions pp
  LEFT JOIN public.player_stats ps ON lower(pp.player_name) = lower(ps.player_name) AND pp.category = ps.category
  GROUP BY pp.user_id
) pl ON pl.user_id = p.id
LEFT JOIN (
  SELECT vp.user_id, SUM(CASE WHEN lower(vp.vm_winner) = lower(tr.winner) THEN 20 ELSE 0 END) AS vm_pts
  FROM public.vm_picks vp
  LEFT JOIN public.tournament_results tr ON tr.id = 1
  GROUP BY vp.user_id
) v ON v.user_id = p.id
WHERE (
  EXISTS (SELECT 1 FROM public.group_tips gt WHERE gt.user_id = p.id)
  OR EXISTS (SELECT 1 FROM public.bracket_tips bt WHERE bt.user_id = p.id)
  OR EXISTS (SELECT 1 FROM public.player_predictions pp WHERE pp.user_id = p.id)
  OR EXISTS (SELECT 1 FROM public.vm_picks vp WHERE vp.user_id = p.id)
)
ORDER BY total_pts DESC;

CREATE OR REPLACE FUNCTION public.get_leaderboard()
RETURNS TABLE(
  id UUID,
  username TEXT,
  match_pts INT,
  bracket_pts INT,
  player_pts INT,
  vm_pts INT,
  total_pts INT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
SELECT
  p.id,
  p.username,
  COALESCE(m.match_pts, 0)       AS match_pts,
  COALESCE(b.bracket_pts, 0)    AS bracket_pts,
  COALESCE(pl.player_pts, 0)    AS player_pts,
  COALESCE(v.vm_pts, 0)         AS vm_pts,
  COALESCE(m.match_pts, 0) + COALESCE(b.bracket_pts, 0) + COALESCE(pl.player_pts, 0) + COALESCE(v.vm_pts, 0) AS total_pts
FROM public.profiles p
LEFT JOIN (
  SELECT gt.user_id,
         SUM(CASE WHEN gt.tip IS NOT NULL AND mr.result IS NOT NULL AND gt.tip = mr.result THEN 3 ELSE 0 END) AS match_pts
  FROM public.group_tips gt
  LEFT JOIN public.match_results mr ON gt.match_id = mr.match_id
  GROUP BY gt.user_id
) m ON m.user_id = p.id
LEFT JOIN (
  SELECT bt.user_id,
         SUM(CASE WHEN bt.tip IS NOT NULL AND bm.result IS NOT NULL AND bt.tip = bm.result THEN 3 ELSE 0 END) AS bracket_pts
  FROM public.bracket_tips bt
  LEFT JOIN public.bracket_matches bm ON bt.match_id = bm.id
  GROUP BY bt.user_id
) b ON b.user_id = p.id
LEFT JOIN (
  SELECT pp.user_id,
    SUM(
      CASE
        WHEN pp.category = 'scorer' AND lower(pp.player_name) = lower(ps.player_name) THEN 10
        WHEN pp.category = 'assist' AND lower(pp.player_name) = lower(ps.player_name) THEN 12
        WHEN pp.category = 'yellow' AND lower(pp.player_name) = lower(ps.player_name) THEN 8
        WHEN pp.category = 'red' AND lower(pp.player_name) = lower(ps.player_name) THEN 10
        ELSE 0 END
    ) AS player_pts
  FROM public.player_predictions pp
  LEFT JOIN public.player_stats ps ON lower(pp.player_name) = lower(ps.player_name) AND pp.category = ps.category
  GROUP BY pp.user_id
) pl ON pl.user_id = p.id
LEFT JOIN (
  SELECT vp.user_id, SUM(CASE WHEN lower(vp.vm_winner) = lower(tr.winner) THEN 20 ELSE 0 END) AS vm_pts
  FROM public.vm_picks vp
  LEFT JOIN public.tournament_results tr ON tr.id = 1
  GROUP BY vp.user_id
) v ON v.user_id = p.id
WHERE (
  EXISTS (SELECT 1 FROM public.group_tips gt WHERE gt.user_id = p.id)
  OR EXISTS (SELECT 1 FROM public.bracket_tips bt WHERE bt.user_id = p.id)
  OR EXISTS (SELECT 1 FROM public.player_predictions pp WHERE pp.user_id = p.id)
  OR EXISTS (SELECT 1 FROM public.vm_picks vp WHERE vp.user_id = p.id)
)
ORDER BY total_pts DESC;
$$;

