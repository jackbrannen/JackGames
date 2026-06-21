-- What On Earth Database Schema

-- Games table
CREATE TABLE IF NOT EXISTS woe_games (
  code TEXT PRIMARY KEY,
  phase TEXT NOT NULL DEFAULT 'lobby',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_dummy BOOLEAN NOT NULL DEFAULT FALSE,

  -- Settings
  turn_duration_seconds INTEGER NOT NULL DEFAULT 30,

  -- Game state
  rotation JSONB, -- Array of {round, primary_id, backup_id}
  current_round INTEGER DEFAULT 1,
  current_attempt INTEGER DEFAULT 1, -- 1, 2, or 3
  current_word TEXT,
  current_letters TEXT, -- Letter sequence for active attempt

  -- Previous round tracking
  previous_word TEXT,
  previous_earthling_id UUID,
  previous_alien_id UUID, -- NULL if no one guessed

  -- Timer
  attempt_start_at TIMESTAMPTZ,
  attempt_duration_seconds INTEGER
);

-- Players table
CREATE TABLE IF NOT EXISTS woe_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_code TEXT NOT NULL REFERENCES woe_games(code) ON DELETE CASCADE,
  name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  score INTEGER NOT NULL DEFAULT 0,
  ready BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Word pool table
CREATE TABLE IF NOT EXISTS woe_words (
  id SERIAL PRIMARY KEY,
  word TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS woe_players_game_code_idx ON woe_players(game_code);
CREATE INDEX IF NOT EXISTS woe_words_created_at_idx ON woe_words(created_at);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE woe_games;
ALTER PUBLICATION supabase_realtime ADD TABLE woe_players;

-- RPC Functions

-- Start game: generate rotation and set first word
CREATE OR REPLACE FUNCTION woe_start_game(p_code TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_player_ids UUID[];
  v_rotation JSONB;
  v_round INTEGER;
  v_primary_id UUID;
  v_backup_id UUID;
  v_attempts JSONB[];
  v_used_pairs JSONB;
  v_word TEXT;
BEGIN
  -- Get all player IDs in random order
  SELECT array_agg(id ORDER BY random())
  INTO v_player_ids
  FROM woe_players
  WHERE game_code = p_code;

  IF array_length(v_player_ids, 1) < 3 THEN
    RAISE EXCEPTION 'Need at least 3 players';
  END IF;

  -- Build rotation: each player primary once, backup once
  -- Try to avoid consecutive earthling turns for same player
  v_rotation := '[]'::jsonb;
  v_used_pairs := '{}'::jsonb;

  FOR v_round IN 1..array_length(v_player_ids, 1) LOOP
    -- Simple approach: round robin with offset
    v_primary_id := v_player_ids[v_round];
    v_backup_id := v_player_ids[(v_round % array_length(v_player_ids, 1)) + 1];

    v_rotation := v_rotation || jsonb_build_object(
      'round', v_round,
      'primary_id', v_primary_id,
      'backup_id', v_backup_id
    );
  END LOOP;

  -- Get first word
  SELECT word INTO v_word
  FROM woe_words
  ORDER BY random()
  LIMIT 1;

  IF v_word IS NULL THEN
    RAISE EXCEPTION 'No words available in pool';
  END IF;

  DELETE FROM woe_words WHERE word = v_word;

  -- Update game
  UPDATE woe_games
  SET
    phase = 'ready',
    rotation = v_rotation,
    current_round = 1,
    current_attempt = 1,
    current_word = v_word,
    current_letters = NULL,
    attempt_start_at = NULL
  WHERE code = p_code;
END;
$$;

-- Generate translator letters
CREATE OR REPLACE FUNCTION woe_generate_letters(p_attempt INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_common TEXT[] := ARRAY['E','T','A','O','I','N','S','H','R'];
  v_medium TEXT[] := ARRAY['D','L','C','U','M','W','F','G','Y','P','B'];
  v_rare TEXT[] := ARRAY['V','K','Z'];
  v_length INTEGER;
  v_blanks INTEGER;
  v_letters TEXT := '';
  v_i INTEGER;
  v_pool TEXT[];
  v_letter TEXT;
BEGIN
  -- Random length 7-10
  v_length := 7 + floor(random() * 4)::int;

  -- Blanks: 3 for attempt 1, 4 for attempt 2, 5 for attempt 3
  v_blanks := 2 + p_attempt;

  -- Generate weighted random letters
  FOR v_i IN 1..(v_length - v_blanks) LOOP
    -- Build weighted pool
    v_pool := ARRAY[]::TEXT[];

    -- Add common letters (60% weight = 6 copies each)
    FOR v_letter IN SELECT unnest(v_common) LOOP
      v_pool := v_pool || ARRAY[v_letter, v_letter, v_letter, v_letter, v_letter, v_letter];
    END LOOP;

    -- Add medium letters (30% weight = 3 copies each)
    FOR v_letter IN SELECT unnest(v_medium) LOOP
      v_pool := v_pool || ARRAY[v_letter, v_letter, v_letter];
    END LOOP;

    -- Add rare letters (10% weight = 1 copy each)
    FOR v_letter IN SELECT unnest(v_rare) LOOP
      v_pool := v_pool || ARRAY[v_letter];
    END LOOP;

    -- Pick random from pool
    v_letters := v_letters || v_pool[1 + floor(random() * array_length(v_pool, 1))::int];
  END LOOP;

  -- Insert blanks at random positions
  FOR v_i IN 1..v_blanks LOOP
    v_letters := overlay(v_letters placing '_' from (1 + floor(random() * (length(v_letters) + 1))::int) for 0);
  END LOOP;

  RETURN v_letters;
END;
$$;

-- Mark ready and start countdown
CREATE OR REPLACE FUNCTION woe_mark_ready(p_code TEXT, p_player_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_phase TEXT;
  v_rotation JSONB;
  v_current_round INTEGER;
  v_primary_id UUID;
  v_is_dummy BOOLEAN;
  v_ready_count INTEGER;
  v_total_count INTEGER;
BEGIN
  SELECT phase, rotation, current_round, is_dummy
  INTO v_phase, v_rotation, v_current_round, v_is_dummy
  FROM woe_games
  WHERE code = p_code;

  IF v_phase != 'ready' THEN
    RETURN;
  END IF;

  -- Mark player ready
  UPDATE woe_players
  SET ready = TRUE
  WHERE id = p_player_id AND game_code = p_code;

  -- Check if enough ready
  SELECT COUNT(*) FILTER (WHERE ready), COUNT(*)
  INTO v_ready_count, v_total_count
  FROM woe_players
  WHERE game_code = p_code;

  -- Dummy games: only need 1 ready
  -- Regular games: need 50%+ ready
  IF (v_is_dummy AND v_ready_count >= 1) OR (NOT v_is_dummy AND v_ready_count >= (v_total_count / 2.0)) THEN
    -- Start countdown
    UPDATE woe_games
    SET phase = 'countdown'
    WHERE code = p_code;

    -- Reset ready flags
    UPDATE woe_players
    SET ready = FALSE
    WHERE game_code = p_code;
  END IF;
END;
$$;

-- Start playing (after countdown)
CREATE OR REPLACE FUNCTION woe_start_playing(p_code TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_letters TEXT;
  v_duration INTEGER;
  v_is_dummy BOOLEAN;
BEGIN
  SELECT turn_duration_seconds, is_dummy
  INTO v_duration, v_is_dummy
  FROM woe_games
  WHERE code = p_code AND phase = 'countdown';

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Generate letters for attempt 1
  v_letters := woe_generate_letters(1);

  -- Dummy games: 3 second timer
  IF v_is_dummy THEN
    v_duration := 3;
  END IF;

  UPDATE woe_games
  SET
    phase = 'playing',
    current_letters = v_letters,
    attempt_start_at = CASE WHEN v_duration > 0 THEN NOW() ELSE NULL END,
    attempt_duration_seconds = v_duration
  WHERE code = p_code;
END;
$$;

-- End attempt early
CREATE OR REPLACE FUNCTION woe_end_attempt_early(p_code TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE woe_games
  SET attempt_start_at = NOW() - INTERVAL '1 hour' -- Force timer to 0
  WHERE code = p_code AND phase = 'playing';
END;
$$;

-- Award points and advance
CREATE OR REPLACE FUNCTION woe_award_points(
  p_code TEXT,
  p_alien_id UUID DEFAULT NULL -- NULL = no one guessed
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rotation JSONB;
  v_current_round INTEGER;
  v_current_attempt INTEGER;
  v_current_word TEXT;
  v_primary_id UUID;
  v_backup_id UUID;
  v_earthling_id UUID;
  v_points INTEGER;
  v_total_rounds INTEGER;
  v_next_word TEXT;
BEGIN
  SELECT rotation, current_round, current_attempt, current_word
  INTO v_rotation, v_current_round, v_current_attempt, v_current_word
  FROM woe_games
  WHERE code = p_code AND phase = 'playing';

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_total_rounds := jsonb_array_length(v_rotation);

  -- Get primary and backup for current round
  v_primary_id := (v_rotation->((v_current_round - 1)::text)->>'primary_id')::uuid;
  v_backup_id := (v_rotation->((v_current_round - 1)::text)->>'backup_id')::uuid;

  -- Determine active earthling
  IF v_current_attempt = 2 THEN
    v_earthling_id := v_backup_id;
  ELSE
    v_earthling_id := v_primary_id;
  END IF;

  -- Award points if someone guessed
  IF p_alien_id IS NOT NULL THEN
    v_points := 4 - v_current_attempt; -- 3, 2, or 1

    UPDATE woe_players
    SET score = score + v_points
    WHERE id IN (v_earthling_id, p_alien_id);

    -- Advance to next round
    IF v_current_round >= v_total_rounds THEN
      -- Game over
      UPDATE woe_games
      SET phase = 'finished'
      WHERE code = p_code;
      RETURN;
    ELSE
      -- Get next word
      SELECT word INTO v_next_word
      FROM woe_words
      ORDER BY random()
      LIMIT 1;

      IF v_next_word IS NOT NULL THEN
        DELETE FROM woe_words WHERE word = v_next_word;
      ELSE
        RAISE EXCEPTION 'No words left in pool';
      END IF;

      UPDATE woe_games
      SET
        phase = 'ready',
        current_round = current_round + 1,
        current_attempt = 1,
        current_word = v_next_word,
        current_letters = NULL,
        attempt_start_at = NULL,
        previous_word = v_current_word,
        previous_earthling_id = v_earthling_id,
        previous_alien_id = p_alien_id
      WHERE code = p_code;
    END IF;
  ELSE
    -- No one guessed - advance to next attempt or round
    IF v_current_attempt < 3 THEN
      -- Move to next attempt (intermediate screen)
      UPDATE woe_games
      SET phase = 'intermediate'
      WHERE code = p_code;
    ELSE
      -- All 3 attempts failed - move to next round
      IF v_current_round >= v_total_rounds THEN
        UPDATE woe_games
        SET phase = 'finished'
        WHERE code = p_code;
      ELSE
        SELECT word INTO v_next_word
        FROM woe_words
        ORDER BY random()
        LIMIT 1;

        IF v_next_word IS NOT NULL THEN
          DELETE FROM woe_words WHERE word = v_next_word;
        ELSE
          RAISE EXCEPTION 'No words left in pool';
        END IF;

        UPDATE woe_games
        SET
          phase = 'ready',
          current_round = current_round + 1,
          current_attempt = 1,
          current_word = v_next_word,
          current_letters = NULL,
          attempt_start_at = NULL,
          previous_word = v_current_word,
          previous_earthling_id = NULL,
          previous_alien_id = NULL
        WHERE code = p_code;
      END IF;
    END IF;
  END IF;
END;
$$;

-- Advance from intermediate to next attempt
CREATE OR REPLACE FUNCTION woe_advance_attempt(p_code TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_attempt INTEGER;
  v_letters TEXT;
  v_duration INTEGER;
  v_is_dummy BOOLEAN;
BEGIN
  SELECT current_attempt, turn_duration_seconds, is_dummy
  INTO v_current_attempt, v_duration, v_is_dummy
  FROM woe_games
  WHERE code = p_code AND phase = 'intermediate';

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Generate letters for next attempt
  v_letters := woe_generate_letters(v_current_attempt + 1);

  IF v_is_dummy THEN
    v_duration := 3;
  END IF;

  UPDATE woe_games
  SET
    phase = 'playing',
    current_attempt = current_attempt + 1,
    current_letters = v_letters,
    attempt_start_at = CASE WHEN v_duration > 0 THEN NOW() ELSE NULL END,
    attempt_duration_seconds = v_duration
  WHERE code = p_code;
END;
$$;

-- Reset to lobby (Play Again)
CREATE OR REPLACE FUNCTION woe_reset_to_lobby(p_code TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE woe_games
  SET
    phase = 'lobby',
    rotation = NULL,
    current_round = 1,
    current_attempt = 1,
    current_word = NULL,
    current_letters = NULL,
    attempt_start_at = NULL
  WHERE code = p_code;

  UPDATE woe_players
  SET score = 0, ready = FALSE
  WHERE game_code = p_code;
END;
$$;
