-- ============================================================
-- Exquisite Corpse
-- ============================================================

CREATE TABLE IF NOT EXISTS ec_games (
  code text PRIMARY KEY,
  phase text NOT NULL DEFAULT 'lobby',  -- lobby | play | reveal | finished
  host_id uuid,
  is_dummy boolean NOT NULL DEFAULT false,
  total_rounds int NOT NULL DEFAULT 0,
  current_round int NOT NULL DEFAULT 0,
  reveal_order text[] NOT NULL DEFAULT '{}',
  current_reveal_chain int NOT NULL DEFAULT 0,
  current_reveal_step int NOT NULL DEFAULT -1,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ec_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_code text REFERENCES ec_games(code) ON DELETE CASCADE,
  name text,
  first_name text,
  last_name text,
  seat int,
  is_bot boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- One drawing per player per chain per round.
-- chain_owner_id: which player's chain this drawing belongs to
-- round_number: 0-indexed; round 0 = chain owner's first drawing
-- fold_pct: 0.70–0.90; controls how much the next player sees as peek strip
-- content: public URL to JPEG in Supabase storage (drawings bucket)
CREATE TABLE IF NOT EXISTS ec_drawings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_code text REFERENCES ec_games(code) ON DELETE CASCADE,
  chain_owner_id uuid REFERENCES ec_players(id) ON DELETE CASCADE,
  round_number int NOT NULL,
  content text,
  fold_pct float NOT NULL DEFAULT 0.8,
  author_id uuid REFERENCES ec_players(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(game_code, chain_owner_id, round_number)
);

-- RLS
ALTER TABLE ec_games ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON ec_games;
CREATE POLICY "allow all" ON ec_games FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE ec_players ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON ec_players;
CREATE POLICY "allow all" ON ec_players FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE ec_drawings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow all" ON ec_drawings;
CREATE POLICY "allow all" ON ec_drawings FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── RPC: ec_start_game ────────────────────────────────────────────────────────
-- Assigns random seats, sets phase=play, total_rounds=player_count.

CREATE OR REPLACE FUNCTION ec_start_game(p_code text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_player_ids uuid[];
  v_count int;
  v_i int;
BEGIN
  SELECT ARRAY(
    SELECT id FROM ec_players
    WHERE game_code = p_code
    ORDER BY random()
  ) INTO v_player_ids;

  v_count := array_length(v_player_ids, 1);

  FOR v_i IN 0..v_count-1 LOOP
    UPDATE ec_players SET seat = v_i WHERE id = v_player_ids[v_i + 1];
  END LOOP;

  UPDATE ec_games
  SET phase = 'play',
      total_rounds = v_count,
      current_round = 0
  WHERE code = p_code;
END;
$$;

-- ── RPC: ec_submit_drawing ────────────────────────────────────────────────────
-- Records a player's drawing for a round.
-- When all players have submitted for this round:
--   - if more rounds remain: advance current_round
--   - if last round: transition to reveal phase with random reveal order

CREATE OR REPLACE FUNCTION ec_submit_drawing(
  p_code text,
  p_chain_owner_id uuid,
  p_round_number int,
  p_content text,
  p_fold_pct float,
  p_author_id uuid
)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_total int;
  v_submitted int;
BEGIN
  INSERT INTO ec_drawings (game_code, chain_owner_id, round_number, content, fold_pct, author_id)
  VALUES (p_code, p_chain_owner_id, p_round_number, p_content, p_fold_pct, p_author_id)
  ON CONFLICT (game_code, chain_owner_id, round_number) DO NOTHING;

  SELECT total_rounds INTO v_total FROM ec_games WHERE code = p_code;

  SELECT COUNT(*) INTO v_submitted
  FROM ec_drawings
  WHERE game_code = p_code AND round_number = p_round_number;

  IF v_submitted >= v_total THEN
    IF p_round_number + 1 >= v_total THEN
      -- All rounds done — move to reveal
      UPDATE ec_games
      SET phase = 'reveal',
          current_round = p_round_number + 1,
          reveal_order = ARRAY(
            SELECT id::text FROM ec_players
            WHERE game_code = p_code AND is_bot = false
            ORDER BY random()
          ),
          current_reveal_chain = 0,
          current_reveal_step = -1
      WHERE code = p_code AND current_round = p_round_number;
    ELSE
      -- Advance to next round
      UPDATE ec_games
      SET current_round = p_round_number + 1
      WHERE code = p_code AND current_round = p_round_number;
    END IF;
  END IF;
END;
$$;

-- ── RPC: ec_advance_reveal ────────────────────────────────────────────────────
-- Presenter taps Reveal to show next layer, or Next chain to advance.
-- When p_new_reveal_chain >= length of reveal_order, transitions to 'finished'.

CREATE OR REPLACE FUNCTION ec_advance_reveal(
  p_code text,
  p_new_reveal_step int,
  p_new_reveal_chain int
)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_reveal_count int;
BEGIN
  SELECT array_length(reveal_order, 1) INTO v_reveal_count FROM ec_games WHERE code = p_code;

  IF p_new_reveal_chain >= v_reveal_count THEN
    UPDATE ec_games SET phase = 'finished' WHERE code = p_code;
  ELSE
    UPDATE ec_games
    SET current_reveal_step = p_new_reveal_step,
        current_reveal_chain = p_new_reveal_chain
    WHERE code = p_code;
  END IF;
END;
$$;

-- ── RPC: ec_reset_game ────────────────────────────────────────────────────────
-- Resets to lobby for play-again. Removes all players and drawings.

CREATE OR REPLACE FUNCTION ec_reset_game(p_code text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM ec_drawings WHERE game_code = p_code;
  DELETE FROM ec_players WHERE game_code = p_code;
  UPDATE ec_games
  SET phase = 'lobby',
      total_rounds = 0,
      current_round = 0,
      reveal_order = '{}',
      current_reveal_chain = 0,
      current_reveal_step = -1
  WHERE code = p_code;
END;
$$;

-- ── Realtime ──────────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE ec_games;
ALTER PUBLICATION supabase_realtime ADD TABLE ec_players;
ALTER PUBLICATION supabase_realtime ADD TABLE ec_drawings;
