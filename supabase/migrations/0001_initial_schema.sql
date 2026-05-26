-- ═══════════════════════════════════════════════════════════════════════════
-- STOOP DATABASE SCHEMA
-- Run this in Supabase SQL Editor on a fresh project
-- ═══════════════════════════════════════════════════════════════════════════

-- ── CITIES ────────────────────────────────────────────────────────────────
CREATE TABLE cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
INSERT INTO cities (slug, name, state) VALUES
  ('nyc', 'New York City', 'NY'),
  ('austin', 'Austin', 'TX');

-- ── NEIGHBORHOODS ─────────────────────────────────────────────────────────
CREATE TABLE neighborhoods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id UUID REFERENCES cities(id) NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  UNIQUE(city_id, slug)
);
INSERT INTO neighborhoods (city_id, slug, name)
SELECT id, 'williamsburg', 'Williamsburg' FROM cities WHERE slug='nyc'
UNION ALL SELECT id, 'west-village', 'West Village' FROM cities WHERE slug='nyc'
UNION ALL SELECT id, 'park-slope', 'Park Slope' FROM cities WHERE slug='nyc'
UNION ALL SELECT id, 'lower-east-side', 'Lower East Side' FROM cities WHERE slug='nyc'
UNION ALL SELECT id, 'astoria', 'Astoria' FROM cities WHERE slug='nyc'
UNION ALL SELECT id, 'bushwick', 'Bushwick' FROM cities WHERE slug='nyc'
UNION ALL SELECT id, 'greenpoint', 'Greenpoint' FROM cities WHERE slug='nyc'
UNION ALL SELECT id, 'harlem', 'Harlem' FROM cities WHERE slug='nyc'
UNION ALL SELECT id, 'east-austin', 'East Austin' FROM cities WHERE slug='austin'
UNION ALL SELECT id, 'south-congress', 'South Congress' FROM cities WHERE slug='austin'
UNION ALL SELECT id, 'mueller', 'Mueller' FROM cities WHERE slug='austin'
UNION ALL SELECT id, 'hyde-park', 'Hyde Park' FROM cities WHERE slug='austin'
UNION ALL SELECT id, 'east-cesar-chavez', 'East Cesar Chavez' FROM cities WHERE slug='austin'
UNION ALL SELECT id, 'clarksville', 'Clarksville' FROM cities WHERE slug='austin';

-- ── PROFILES ──────────────────────────────────────────────────────────────
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 50),
  phone_e164 TEXT UNIQUE NOT NULL,
  phone_verified_at TIMESTAMPTZ,
  city_id UUID REFERENCES cities(id) NOT NULL,
  neighborhood_id UUID REFERENCES neighborhoods(id),
  about TEXT CHECK (length(about) <= 140),
  avatar_bg TEXT DEFAULT '#D4E8D8',
  avatar_fg TEXT DEFAULT '#2A4232',
  initials TEXT,
  is_founding_member BOOLEAN DEFAULT false,
  blocked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── PLANS ─────────────────────────────────────────────────────────────────
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  city_id UUID REFERENCES cities(id) NOT NULL,
  neighborhood_id UUID REFERENCES neighborhoods(id) NOT NULL,
  text TEXT NOT NULL CHECK (length(text) BETWEEN 25 AND 220),
  category TEXT NOT NULL CHECK (category IN ('coffee','outdoors','arts','food','books','music')),
  spot TEXT,
  when_day TEXT NOT NULL,
  when_time TEXT,
  spots_total INTEGER NOT NULL CHECK (spots_total IN (1, 2)),
  spots_left INTEGER NOT NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','full','expired','removed')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_plans_city_status ON plans(city_id, status) WHERE status = 'open';
CREATE INDEX idx_plans_expires ON plans(expires_at) WHERE status = 'open';
CREATE INDEX idx_plans_user ON plans(user_id, created_at DESC);

-- ── CONVERSATIONS ─────────────────────────────────────────────────────────
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES plans(id) ON DELETE CASCADE NOT NULL,
  poster_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  joiner_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','declined')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(plan_id, joiner_id),
  CHECK (poster_id != joiner_id)
);
CREATE INDEX idx_conv_poster ON conversations(poster_id, created_at DESC);
CREATE INDEX idx_conv_joiner ON conversations(joiner_id, created_at DESC);

-- ── MESSAGES ──────────────────────────────────────────────────────────────
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  from_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_messages_conv ON messages(conversation_id, created_at);

-- ── REPORTS ───────────────────────────────────────────────────────────────
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  reported_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','reviewed','actioned','dismissed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── OTP ATTEMPTS (for rate limiting) ──────────────────────────────────────
CREATE TABLE otp_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 TEXT NOT NULL,
  ip_address INET,
  succeeded BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_otp_phone_time ON otp_attempts(phone_e164, created_at DESC);
CREATE INDEX idx_otp_ip_time ON otp_attempts(ip_address, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE neighborhoods ENABLE ROW LEVEL SECURITY;

-- Cities and neighborhoods: public read
CREATE POLICY "Cities readable by all" ON cities FOR SELECT USING (true);
CREATE POLICY "Neighborhoods readable by all" ON neighborhoods FOR SELECT USING (true);

-- Profiles: anyone authenticated reads; user updates their own
CREATE POLICY "Profiles readable by authenticated"
  ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anonymous can read profiles (for plan posters)"
  ON profiles FOR SELECT TO anon USING (true);
CREATE POLICY "Users update own profile"
  ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile"
  ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Plans: anyone reads; users manage own
CREATE POLICY "Plans readable by all"
  ON plans FOR SELECT USING (status != 'removed');
CREATE POLICY "Users insert own plans"
  ON plans FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own plans"
  ON plans FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own plans"
  ON plans FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Conversations: only participants see/modify
CREATE POLICY "Participants read conversations"
  ON conversations FOR SELECT TO authenticated
  USING (auth.uid() = poster_id OR auth.uid() = joiner_id);
CREATE POLICY "Joiner starts conversation"
  ON conversations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = joiner_id);
CREATE POLICY "Poster updates conversation status"
  ON conversations FOR UPDATE TO authenticated
  USING (auth.uid() = poster_id);

-- Messages: only conversation participants
CREATE POLICY "Read messages in own conversations"
  ON messages FOR SELECT TO authenticated USING (
    conversation_id IN (
      SELECT id FROM conversations
      WHERE auth.uid() = poster_id OR auth.uid() = joiner_id
    )
  );
CREATE POLICY "Send to own conversations"
  ON messages FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = from_user_id AND
    conversation_id IN (
      SELECT id FROM conversations
      WHERE auth.uid() = poster_id OR auth.uid() = joiner_id
    )
  );

-- Reports: anyone authenticated can insert; service_role reads
CREATE POLICY "Anyone can submit reports"
  ON reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTIONS AND TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════

-- Auto-decrement spots_left and set status when conversation confirmed
CREATE OR REPLACE FUNCTION handle_conversation_confirmed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'confirmed' AND OLD.status != 'confirmed' THEN
    UPDATE plans
    SET spots_left = GREATEST(0, spots_left - 1),
        status = CASE WHEN spots_left - 1 <= 0 THEN 'full' ELSE status END
    WHERE id = NEW.plan_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_conversation_confirmed
  AFTER UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION handle_conversation_confirmed();

-- Auto-expire old plans (run via Supabase cron daily)
CREATE OR REPLACE FUNCTION expire_old_plans()
RETURNS void AS $$
BEGIN
  UPDATE plans
  SET status = 'expired'
  WHERE expires_at < now() AND status = 'open';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- REALTIME PUBLICATIONS (enables Supabase Realtime for messages)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
