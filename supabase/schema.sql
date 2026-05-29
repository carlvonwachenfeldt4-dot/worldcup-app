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

-- ─── 5. Vännerrum ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.friend_rooms (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code        CHAR(6) UNIQUE NOT NULL,
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.room_members (
  room_id    UUID NOT NULL REFERENCES public.friend_rooms(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (room_id, user_id)
);

-- ─── 6. Leaderboard-vy ───────────────────────────────────────────────────────
-- Beräknar poäng per användare baserat på korrekta tips mot faktiska resultat.
--   group_pts:   3p per korrekt 1X2-tips (tip = result i match_results), annars 0
--   bracket_pts: 2p per sparad bracket-pick (ingen resultatjämförelse ännu)
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

  -- bracket_pts: tills vidare 2p per sparad pick (ingen facit-tabell ännu).
  COALESCE(bp.pick_count, 0) * 2                        AS bracket_pts,

  -- total_pts: summan av de två ovanstående kolumnerna.
  COALESCE(gt.group_pts, 0) + COALESCE(bp.pick_count, 0) * 2  AS total_pts

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

-- ── Subquery: räknar bracket-picks per användare ───────────────────────────
LEFT JOIN (
  SELECT user_id, COUNT(*) AS pick_count
  FROM public.bracket_picks
  GROUP BY user_id
) bp ON bp.user_id = p.id

ORDER BY total_pts DESC;

-- ─── 7. Row Level Security ───────────────────────────────────────────────────

ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_tips         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bracket_picks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_rooms       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_members       ENABLE ROW LEVEL SECURITY;

-- Profiler
DROP POLICY IF EXISTS "Profiler synliga för alla"   ON public.profiles;
DROP POLICY IF EXISTS "Skapa egen profil"           ON public.profiles;
DROP POLICY IF EXISTS "Uppdatera egen profil"       ON public.profiles;

CREATE POLICY "Profiler synliga för alla"   ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Skapa egen profil"           ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Uppdatera egen profil"       ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Grupptips
DROP POLICY IF EXISTS "Alla kan läsa grupptips"     ON public.group_tips;
DROP POLICY IF EXISTS "Egna grupptips: insert"      ON public.group_tips;
DROP POLICY IF EXISTS "Egna grupptips: update"      ON public.group_tips;
DROP POLICY IF EXISTS "Egna grupptips: delete"      ON public.group_tips;

CREATE POLICY "Alla kan läsa grupptips"     ON public.group_tips FOR SELECT USING (true);
CREATE POLICY "Egna grupptips: insert"      ON public.group_tips FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Egna grupptips: update"      ON public.group_tips FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Egna grupptips: delete"      ON public.group_tips FOR DELETE USING (auth.uid() = user_id);

-- Bracket
DROP POLICY IF EXISTS "Alla kan läsa bracket"       ON public.bracket_picks;
DROP POLICY IF EXISTS "Egna bracket: insert"        ON public.bracket_picks;
DROP POLICY IF EXISTS "Egna bracket: update"        ON public.bracket_picks;
DROP POLICY IF EXISTS "Egna bracket: delete"        ON public.bracket_picks;

CREATE POLICY "Alla kan läsa bracket"       ON public.bracket_picks FOR SELECT USING (true);
CREATE POLICY "Egna bracket: insert"        ON public.bracket_picks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Egna bracket: update"        ON public.bracket_picks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Egna bracket: delete"        ON public.bracket_picks FOR DELETE USING (auth.uid() = user_id);

-- Spelar-tipsningar
DROP POLICY IF EXISTS "Egna spelartips: select"     ON public.player_predictions;
DROP POLICY IF EXISTS "Egna spelartips: insert"     ON public.player_predictions;
DROP POLICY IF EXISTS "Egna spelartips: update"     ON public.player_predictions;

CREATE POLICY "Egna spelartips: select"     ON public.player_predictions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Egna spelartips: insert"     ON public.player_predictions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Egna spelartips: update"     ON public.player_predictions FOR UPDATE USING (auth.uid() = user_id);

-- Vännerrum
DROP POLICY IF EXISTS "Rum synliga för alla"        ON public.friend_rooms;
DROP POLICY IF EXISTS "Inloggade kan skapa rum"     ON public.friend_rooms;

CREATE POLICY "Rum synliga för alla"        ON public.friend_rooms FOR SELECT USING (true);
CREATE POLICY "Inloggade kan skapa rum"     ON public.friend_rooms FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Rumsmedlemmar
DROP POLICY IF EXISTS "Rumsmedlemmar synliga"       ON public.room_members;
DROP POLICY IF EXISTS "Gå med i rum"               ON public.room_members;
DROP POLICY IF EXISTS "Lämna rum"                  ON public.room_members;

CREATE POLICY "Rumsmedlemmar synliga"       ON public.room_members FOR SELECT USING (true);
CREATE POLICY "Gå med i rum"               ON public.room_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Lämna rum"                  ON public.room_members FOR DELETE USING (auth.uid() = user_id);

-- ─── 8. Server-side matchlåsning ────────────────────────────────────────────
-- Triggerfunction som kastar fel om turneringen redan har startat.
-- Skyddar group_tips, bracket_picks och player_predictions mot sena tips
-- även om klientsidans lås kringgås via direkt API-anrop.

CREATE OR REPLACE FUNCTION public.prevent_late_tips()
RETURNS TRIGGER AS $$
BEGIN
  -- Turneringen startar 2026-06-11 19:00 UTC (21:00 CEST)
  IF NOW() >= TIMESTAMPTZ '2026-06-11T19:00:00Z' THEN
    RAISE EXCEPTION 'Tippningen är stängd – turneringen har startat';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Applicera triggern på alla tre tipstabeller
DROP TRIGGER IF EXISTS check_tip_time ON public.group_tips;
CREATE TRIGGER check_tip_time
  BEFORE INSERT OR UPDATE ON public.group_tips
  FOR EACH ROW EXECUTE FUNCTION public.prevent_late_tips();

DROP TRIGGER IF EXISTS check_tip_time ON public.bracket_picks;
CREATE TRIGGER check_tip_time
  BEFORE INSERT OR UPDATE ON public.bracket_picks
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
CREATE POLICY "Matchresults select" ON public.match_results FOR SELECT USING (true);
CREATE POLICY "Matchresults admin write" ON public.match_results FOR INSERT WITH CHECK (
  (SELECT coalesce(is_admin, false) FROM public.profiles WHERE id = auth.uid()) = true
);
CREATE POLICY "Matchresults admin update" ON public.match_results FOR UPDATE USING (
  (SELECT coalesce(is_admin, false) FROM public.profiles WHERE id = auth.uid()) = true
);

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

ALTER TABLE public.player_stats ENABLE ROW LEVEL SECURITY;
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
CREATE POLICY "Vinnarpicks select" ON public.vm_picks FOR SELECT USING (true);
CREATE POLICY "Vinnarpicks own upsert" ON public.vm_picks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Vinnarpicks own update" ON public.vm_picks FOR UPDATE USING (auth.uid() = user_id);

-- Spara turneringens officiella vinnare (endast admin/server skriver)
CREATE TABLE IF NOT EXISTS public.tournament_results (
  id    INT PRIMARY KEY DEFAULT 1,
  winner TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO public.tournament_results (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.tournament_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tournament select" ON public.tournament_results FOR SELECT USING (true);
CREATE POLICY "Tournament admin upsert" ON public.tournament_results FOR UPDATE USING (
  (SELECT coalesce(is_admin, false) FROM public.profiles WHERE id = auth.uid()) = true
);

-- ───────────────────────────────────────────────────────────────────────────
-- Ny, utökad leaderboard som inkluderar matchpoäng (3p), bracket-picks (2p),
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
  SELECT user_id, COUNT(*) * 2 AS bracket_pts FROM public.bracket_picks GROUP BY user_id
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
ORDER BY total_pts DESC;

