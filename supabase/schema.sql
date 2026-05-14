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
-- Beräknar poäng per användare (2p per 1X2-tips, 2p per bracket-pick)
-- Uppdateras i realtid via SQL VIEW

CREATE OR REPLACE VIEW public.leaderboard_view AS
SELECT
  p.id,
  p.username,
  COALESCE(gt.tip_count, 0) * 2                         AS group_pts,
  COALESCE(bp.pick_count, 0) * 2                        AS bracket_pts,
  COALESCE(gt.tip_count, 0) * 2 + COALESCE(bp.pick_count, 0) * 2  AS total_pts
FROM public.profiles p
LEFT JOIN (
  SELECT user_id, COUNT(*) AS tip_count
  FROM public.group_tips
  GROUP BY user_id
) gt ON gt.user_id = p.id
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
