-- What On Earth Database Schema

-- Games table
CREATE TABLE IF NOT EXISTS woe_games (
  code TEXT PRIMARY KEY,
  phase TEXT NOT NULL DEFAULT 'lobby',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_dummy BOOLEAN NOT NULL DEFAULT FALSE,

  -- Settings
  turn_duration_seconds INTEGER NOT NULL DEFAULT 90,

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
  attempt_duration_seconds INTEGER,

  -- Pause
  paused BOOLEAN NOT NULL DEFAULT FALSE,
  paused_by UUID REFERENCES woe_players(id),
  paused_at TIMESTAMPTZ,

  -- Awarding points
  awarding_points_by UUID REFERENCES woe_players(id)
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

  -- Blanks: 0 for attempt 1, 2 for attempt 2, 4 for attempt 3
  IF p_attempt = 1 THEN
    v_blanks := 0;
  ELSIF p_attempt = 2 THEN
    v_blanks := 2;
  ELSE
    v_blanks := 4;
  END IF;

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

  -- If no blanks, return letters directly
  IF v_blanks = 0 THEN
    RETURN v_letters;
  END IF;

  -- Create array for final sequence and place blanks with spacing
  DECLARE
    v_result TEXT[];
    v_total_slots INTEGER;
    v_blank_positions INTEGER[];
    v_pos INTEGER;
    v_attempts INTEGER;
  BEGIN
    v_total_slots := v_length;
    v_result := ARRAY_FILL(NULL::TEXT, ARRAY[v_total_slots]);
    v_blank_positions := ARRAY[]::INTEGER[];

    -- Pick positions ensuring at least 1 space between blanks
    v_attempts := 0;
    WHILE array_length(v_blank_positions, 1) IS NULL OR array_length(v_blank_positions, 1) < v_blanks LOOP
      v_pos := 1 + floor(random() * v_total_slots)::int;

      IF NOT (v_pos = ANY(v_blank_positions)) THEN
        IF array_length(v_blank_positions, 1) IS NULL OR
           (NOT ((v_pos - 1) = ANY(v_blank_positions)) AND NOT ((v_pos + 1) = ANY(v_blank_positions))) THEN
          v_blank_positions := v_blank_positions || v_pos;
        END IF;
      END IF;

      v_attempts := v_attempts + 1;
      IF v_attempts > 1000 THEN
        EXIT;
      END IF;
    END LOOP;

    -- Fill in blanks
    FOR v_i IN 1..array_length(v_blank_positions, 1) LOOP
      v_result[v_blank_positions[v_i]] := '_';
    END LOOP;

    -- Fill in letters
    v_i := 1;
    FOR v_pos IN 1..v_total_slots LOOP
      IF v_result[v_pos] IS NULL THEN
        v_result[v_pos] := substring(v_letters, v_i, 1);
        v_i := v_i + 1;
      END IF;
    END LOOP;

    RETURN array_to_string(v_result, '');
  END;
END;
$$;

-- Mark ready and start playing (only primary player has ready button)
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
BEGIN
  SELECT phase, rotation, current_round, is_dummy
  INTO v_phase, v_rotation, v_current_round, v_is_dummy
  FROM woe_games
  WHERE code = p_code;

  IF v_phase != 'ready' THEN
    RETURN;
  END IF;

  -- Get primary for current round
  v_primary_id := (v_rotation->(v_current_round - 1)->>'primary_id')::uuid;

  -- Only the primary player should be clicking Ready
  IF p_player_id != v_primary_id THEN
    RETURN;
  END IF;

  -- Go to intermediate phase first (will auto-advance after 2 seconds)
  UPDATE woe_games
  SET phase = 'intermediate'
  WHERE code = p_code;
END;
$$;

-- Start playing (from intermediate) - handles both first attempt and subsequent attempts
CREATE OR REPLACE FUNCTION woe_start_playing(p_code TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_phase TEXT;
  v_current_attempt INTEGER;
  v_turn_duration INTEGER;
  v_letters TEXT;
BEGIN
  SELECT phase, current_attempt, turn_duration_seconds
  INTO v_phase, v_current_attempt, v_turn_duration
  FROM woe_games WHERE code = p_code;

  IF v_phase != 'intermediate' THEN
    RETURN;
  END IF;

  -- Generate letters for current attempt (already set correctly in intermediate)
  v_letters := woe_generate_letters(v_current_attempt);

  UPDATE woe_games
  SET
    phase = 'playing',
    current_letters = v_letters,
    attempt_start_at = CASE WHEN v_turn_duration > 0 THEN NOW() ELSE NULL END,
    attempt_duration_seconds = v_turn_duration
  WHERE code = p_code AND phase = 'intermediate';
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
  SET
    attempt_start_at = NOW() - INTERVAL '1 hour', -- Force timer to 0
    paused = FALSE,
    paused_by = NULL,
    paused_at = NULL
  WHERE code = p_code AND phase = 'playing';
END;
$$;

-- Award points and advance (with logging)
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

  -- Get primary and backup for current round (use integer indexing, not string)
  v_primary_id := (v_rotation->(v_current_round - 1)->>'primary_id')::uuid;
  v_backup_id := (v_rotation->(v_current_round - 1)->>'backup_id')::uuid;

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
    WHERE id IN (v_earthling_id, p_alien_id) AND game_code = p_code;

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
        previous_alien_id = p_alien_id,
        awarding_points_by = NULL
      WHERE code = p_code;
    END IF;
  ELSE
    -- No one guessed - advance to next attempt or round
    IF v_current_attempt < 3 THEN
      -- Increment attempt and move to intermediate screen
      UPDATE woe_games
      SET
        phase = 'intermediate',
        current_attempt = current_attempt + 1,
        awarding_points_by = NULL
      WHERE code = p_code;
    ELSE
      -- All 3 attempts failed - move to next round
      IF v_current_round >= v_total_rounds THEN
        UPDATE woe_games
        SET phase = 'finished', awarding_points_by = NULL
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
          previous_earthling_id = v_earthling_id,
          previous_alien_id = NULL,
          awarding_points_by = NULL
        WHERE code = p_code;
      END IF;
    END IF;
  END IF;
END;
$$;

-- Advance from intermediate to next attempt
-- Pause game
CREATE OR REPLACE FUNCTION woe_pause_game(p_code TEXT, p_player_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE woe_games
  SET
    paused = TRUE,
    paused_by = p_player_id,
    paused_at = NOW()
  WHERE code = p_code AND phase = 'playing' AND NOT paused;
END;
$$;

-- Resume game
CREATE OR REPLACE FUNCTION woe_resume_game(p_code TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_paused_duration INTERVAL;
BEGIN
  SELECT NOW() - paused_at INTO v_paused_duration
  FROM woe_games
  WHERE code = p_code AND phase = 'playing' AND paused;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Adjust attempt_start_at to account for pause duration
  UPDATE woe_games
  SET
    paused = FALSE,
    paused_by = NULL,
    paused_at = NULL,
    attempt_start_at = attempt_start_at + v_paused_duration
  WHERE code = p_code AND paused = TRUE;
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
    attempt_start_at = NULL,
    paused = FALSE,
    paused_by = NULL,
    paused_at = NULL
  WHERE code = p_code;

  UPDATE woe_players
  SET score = 0, ready = FALSE
  WHERE game_code = p_code;
END;
$$;

-- Score adjustment function
CREATE OR REPLACE FUNCTION woe_adjust_score(p_player_id UUID, p_delta INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE woe_players
  SET score = GREATEST(0, COALESCE(score, 0) + p_delta)
  WHERE id = p_player_id;
END;
$$;
