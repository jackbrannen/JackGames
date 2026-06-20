-- Alpha Jam Database Schema

-- Games table
CREATE TABLE IF NOT EXISTS alphajam_games (
  code text PRIMARY KEY,
  phase text NOT NULL DEFAULT 'lobby',
  is_dummy boolean NOT NULL DEFAULT false,
  rounds_per_matchup int NOT NULL DEFAULT 1,
  current_matchup_index int,
  current_round int,
  matchup_pairs jsonb,
  letter_start text,
  letter_end text,
  reveal_at timestamptz,
  winner_player_id uuid,
  ready_player_ids uuid[] DEFAULT '{}',
  used_letter_pairs text[] DEFAULT '{}',
  new_letters_requests uuid[] DEFAULT '{}',
  pending_winner_claim uuid,
  created_at timestamptz DEFAULT now()
);

-- Players table
CREATE TABLE IF NOT EXISTS alphajam_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_code text NOT NULL REFERENCES alphajam_games(code) ON DELETE CASCADE,
  name text NOT NULL,
  first_name text,
  last_name text,
  score int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Matchup results table
CREATE TABLE IF NOT EXISTS alphajam_matchup_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_code text NOT NULL REFERENCES alphajam_games(code) ON DELETE CASCADE,
  matchup_index int NOT NULL,
  round_number int NOT NULL,
  player1_id uuid NOT NULL REFERENCES alphajam_players(id) ON DELETE CASCADE,
  player2_id uuid NOT NULL REFERENCES alphajam_players(id) ON DELETE CASCADE,
  winner_id uuid REFERENCES alphajam_players(id) ON DELETE CASCADE,
  letter_start text NOT NULL,
  letter_end text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- RPC: Start game (generate round-robin matchups)
CREATE OR REPLACE FUNCTION aj_start_game(
  p_code text,
  p_rounds_per_matchup int
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_player_ids uuid[];
  v_player_count int;
  v_matchups jsonb := '[]'::jsonb;
  i int;
  j int;
BEGIN
  -- Get all players
  SELECT array_agg(id ORDER BY created_at)
  INTO v_player_ids
  FROM alphajam_players
  WHERE game_code = p_code;

  v_player_count := array_length(v_player_ids, 1);

  IF v_player_count < 3 THEN
    RAISE EXCEPTION 'Need at least 3 players';
  END IF;

  -- Generate round-robin matchups (each player vs every other player)
  FOR i IN 1..v_player_count LOOP
    FOR j IN (i+1)..v_player_count LOOP
      v_matchups := v_matchups || jsonb_build_object(
        'player1_id', v_player_ids[i],
        'player2_id', v_player_ids[j]
      );
    END LOOP;
  END LOOP;

  -- Update game to matchup_preview phase
  UPDATE alphajam_games
  SET
    phase = 'matchup_preview',
    rounds_per_matchup = p_rounds_per_matchup,
    current_matchup_index = 0,
    current_round = 1,
    matchup_pairs = v_matchups,
    ready_player_ids = '{}',
    reveal_at = NULL
  WHERE code = p_code;

  -- Generate first letters
  PERFORM aj_generate_letters(p_code);
END;
$$;

-- RPC: Generate random letters (excluding used pairs)
-- When called during active play (from new letters request), goes to countdown
-- When called at start of matchup, goes to matchup_preview
CREATE OR REPLACE FUNCTION aj_generate_letters(p_code text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_used_pairs text[];
  v_start text;
  v_end text;
  v_allowed_start text[] := ARRAY['A','B','C','D','E','F','G','H','I','L','M','N','O','P','R','S','T','U','W','Y'];
  v_allowed_end text[] := ARRAY['A','B','C','D','E','F','G','H','I','L','M','N','O','P','Q','R','S','T','U','W','X','Y','Z'];
  v_pair text;
  v_attempts int := 0;
  v_current_phase text;
  v_is_dummy boolean;
  v_countdown_seconds int;
BEGIN
  SELECT used_letter_pairs, phase, is_dummy INTO v_used_pairs, v_current_phase, v_is_dummy FROM alphajam_games WHERE code = p_code;

  LOOP
    v_start := v_allowed_start[1 + floor(random() * array_length(v_allowed_start, 1))::int];
    v_end := v_allowed_end[1 + floor(random() * array_length(v_allowed_end, 1))::int];
    v_pair := v_start || '-' || v_end;

    IF NOT (v_pair = ANY(v_used_pairs)) THEN
      EXIT;
    END IF;

    v_attempts := v_attempts + 1;
    IF v_attempts > 100 THEN
      RAISE EXCEPTION 'Could not generate unique letter pair';
    END IF;
  END LOOP;

  -- If called during active play (countdown or playing), go directly to countdown
  -- Otherwise go to matchup_preview (normal start of matchup)
  IF v_current_phase IN ('countdown', 'playing') THEN
    -- Dummy games skip countdown (0 seconds), real games have 3 second countdown
    v_countdown_seconds := CASE WHEN v_is_dummy THEN 0 ELSE 3 END;

    UPDATE alphajam_games
    SET
      letter_start = v_start,
      letter_end = v_end,
      used_letter_pairs = array_append(v_used_pairs, v_pair),
      new_letters_requests = '{}',
      phase = 'countdown',
      reveal_at = now() + (v_countdown_seconds || ' seconds')::interval
    WHERE code = p_code;
  ELSE
    UPDATE alphajam_games
    SET
      letter_start = v_start,
      letter_end = v_end,
      used_letter_pairs = array_append(v_used_pairs, v_pair),
      new_letters_requests = '{}',
      ready_player_ids = '{}',
      phase = 'matchup_preview',
      reveal_at = NULL
    WHERE code = p_code;
  END IF;
END;
$$;

-- RPC: Mark player as winner
CREATE OR REPLACE FUNCTION aj_mark_winner(
  p_code text,
  p_player_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_matchup jsonb;
  v_matchup_index int;
  v_current_round int;
  v_rounds_per_matchup int;
  v_player1_id uuid;
  v_player2_id uuid;
  v_letter_start text;
  v_letter_end text;
  v_phase_changed int;
  v_is_dummy boolean;
  v_countdown_seconds int;
BEGIN
  -- Atomically transition from 'countdown' or 'playing' to 'processing' to prevent double-clicks
  UPDATE alphajam_games
  SET phase = 'processing'
  WHERE code = p_code AND phase IN ('countdown', 'playing');

  GET DIAGNOSTICS v_phase_changed = ROW_COUNT;

  -- If phase wasn't 'playing', another click already won - exit silently
  IF v_phase_changed = 0 THEN
    RETURN;
  END IF;

  SELECT
    current_matchup_index,
    current_round,
    rounds_per_matchup,
    letter_start,
    letter_end,
    is_dummy
  INTO
    v_matchup_index,
    v_current_round,
    v_rounds_per_matchup,
    v_letter_start,
    v_letter_end,
    v_is_dummy
  FROM alphajam_games
  WHERE code = p_code;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT
    (matchup_pairs->v_matchup_index->>'player1_id')::uuid,
    (matchup_pairs->v_matchup_index->>'player2_id')::uuid
  INTO v_player1_id, v_player2_id
  FROM alphajam_games
  WHERE code = p_code;

  -- Record the result
  INSERT INTO alphajam_matchup_results (
    game_code,
    matchup_index,
    round_number,
    player1_id,
    player2_id,
    winner_id,
    letter_start,
    letter_end
  ) VALUES (
    p_code,
    v_matchup_index,
    v_current_round,
    v_player1_id,
    v_player2_id,
    p_player_id,
    v_letter_start,
    v_letter_end
  );

  -- Increment winner's score
  UPDATE alphajam_players
  SET score = score + 1
  WHERE id = p_player_id;

  -- Check if matchup is complete
  IF v_current_round >= v_rounds_per_matchup THEN
    -- Move to next matchup
    PERFORM aj_next_matchup(p_code);
  ELSE
    -- Next round of same matchup
    -- Dummy games skip countdown (0 seconds), real games have 3 second countdown
    v_countdown_seconds := CASE WHEN v_is_dummy THEN 0 ELSE 3 END;

    UPDATE alphajam_games
    SET
      current_round = current_round + 1,
      phase = 'countdown',
      reveal_at = now() + (v_countdown_seconds || ' seconds')::interval
    WHERE code = p_code;

    PERFORM aj_generate_letters(p_code);
  END IF;
END;
$$;

-- RPC: Move to next matchup
CREATE OR REPLACE FUNCTION aj_next_matchup(p_code text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_matchups int;
  v_current_index int;
BEGIN
  SELECT
    jsonb_array_length(matchup_pairs),
    current_matchup_index
  INTO v_total_matchups, v_current_index
  FROM alphajam_games
  WHERE code = p_code;

  IF v_current_index + 1 >= v_total_matchups THEN
    -- Tournament complete, check for ties
    PERFORM aj_check_tiebreaker(p_code);
  ELSE
    -- Next matchup - go to matchup_preview for Ready stage
    UPDATE alphajam_games
    SET
      current_matchup_index = current_matchup_index + 1,
      current_round = 1
    WHERE code = p_code;

    PERFORM aj_generate_letters(p_code);
  END IF;
END;
$$;

-- RPC: Check if tiebreaker is needed
CREATE OR REPLACE FUNCTION aj_check_tiebreaker(p_code text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_max_score int;
  v_tied_count int;
  v_tied_players uuid[];
BEGIN
  -- Find max score
  SELECT MAX(score) INTO v_max_score
  FROM alphajam_players
  WHERE game_code = p_code;

  -- Count players with max score
  SELECT array_agg(id), count(*)
  INTO v_tied_players, v_tied_count
  FROM alphajam_players
  WHERE game_code = p_code AND score = v_max_score;

  IF v_tied_count = 1 THEN
    -- We have a winner
    UPDATE alphajam_games
    SET phase = 'finished'
    WHERE code = p_code;
  ELSIF v_tied_count = 2 THEN
    -- Best of 3 tiebreaker
    PERFORM aj_start_tiebreaker(p_code, v_tied_players, 3);
  ELSE
    -- Round-robin tiebreaker
    PERFORM aj_start_tiebreaker(p_code, v_tied_players, 1);
  END IF;
END;
$$;

-- RPC: Start tiebreaker
CREATE OR REPLACE FUNCTION aj_start_tiebreaker(
  p_code text,
  p_player_ids uuid[],
  p_rounds int
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_matchups jsonb := '[]'::jsonb;
  v_count int;
  i int;
  j int;
BEGIN
  v_count := array_length(p_player_ids, 1);

  -- Generate matchups
  FOR i IN 1..v_count LOOP
    FOR j IN (i+1)..v_count LOOP
      v_matchups := v_matchups || jsonb_build_object(
        'player1_id', p_player_ids[i],
        'player2_id', p_player_ids[j]
      );
    END LOOP;
  END LOOP;

  -- Go to tiebreaker_preview to show explanation and scores
  UPDATE alphajam_games
  SET
    phase = 'tiebreaker_preview',
    matchup_pairs = v_matchups,
    current_matchup_index = 0,
    current_round = 1,
    rounds_per_matchup = p_rounds,
    ready_player_ids = '{}'
  WHERE code = p_code;

  PERFORM aj_generate_letters(p_code);
END;
$$;

-- RPC: Mark player as ready for tiebreaker (atomic append)
CREATE OR REPLACE FUNCTION aj_tiebreaker_ready(
  p_code text,
  p_player_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE alphajam_games
  SET ready_player_ids = array_append(ready_player_ids, p_player_id)
  WHERE code = p_code
    AND phase = 'tiebreaker_preview'
    AND NOT (p_player_id = ANY(ready_player_ids));
END;
$$;

-- RPC: Request new letters
CREATE OR REPLACE FUNCTION aj_request_new_letters(
  p_code text,
  p_player_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_requests uuid[];
  v_player1_id uuid;
  v_player2_id uuid;
  v_matchup_index int;
BEGIN
  SELECT current_matchup_index INTO v_matchup_index
  FROM alphajam_games
  WHERE code = p_code AND phase IN ('countdown', 'playing');

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT
    (matchup_pairs->v_matchup_index->>'player1_id')::uuid,
    (matchup_pairs->v_matchup_index->>'player2_id')::uuid
  INTO v_player1_id, v_player2_id
  FROM alphajam_games
  WHERE code = p_code;

  -- Add request
  UPDATE alphajam_games
  SET new_letters_requests = array_append(new_letters_requests, p_player_id)
  WHERE code = p_code
  RETURNING new_letters_requests INTO v_requests;

  -- Check if both players requested
  IF v_player1_id = ANY(v_requests) AND v_player2_id = ANY(v_requests) THEN
    PERFORM aj_generate_letters(p_code);
  END IF;
END;
$$;

-- RPC: Adjust player score (from settings)
CREATE OR REPLACE FUNCTION aj_adjust_score(
  p_player_id uuid,
  p_delta int
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE alphajam_players
  SET score = GREATEST(0, score + p_delta)
  WHERE id = p_player_id;
END;
$$;

-- RPC: Reset game to lobby (from menu)
CREATE OR REPLACE FUNCTION aj_reset_to_lobby(p_code text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Reset all player scores
  UPDATE alphajam_players
  SET score = 0
  WHERE game_code = p_code;

  -- Reset game state to lobby
  UPDATE alphajam_games
  SET
    phase = 'lobby',
    current_matchup_index = NULL,
    current_round = NULL,
    matchup_pairs = NULL,
    letter_start = NULL,
    letter_end = NULL,
    reveal_at = NULL,
    winner_player_id = NULL,
    ready_player_ids = '{}',
    used_letter_pairs = '{}',
    new_letters_requests = '{}',
    pending_winner_claim = NULL
  WHERE code = p_code;
END;
$$;

-- RPC: Claim win (sets pending_winner_claim for opponent to confirm)
CREATE OR REPLACE FUNCTION aj_claim_win(
  p_code text,
  p_player_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE alphajam_games
  SET pending_winner_claim = p_player_id
  WHERE code = p_code AND phase IN ('countdown', 'playing') AND pending_winner_claim IS NULL;
END;
$$;

-- RPC: Confirm win claim (opponent confirms the claim)
CREATE OR REPLACE FUNCTION aj_confirm_win(
  p_code text,
  p_confirmed boolean
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_winner_id uuid;
BEGIN
  SELECT pending_winner_claim INTO v_winner_id
  FROM alphajam_games
  WHERE code = p_code;

  -- Clear the pending claim
  UPDATE alphajam_games
  SET pending_winner_claim = NULL
  WHERE code = p_code;

  -- If confirmed, mark winner
  IF p_confirmed AND v_winner_id IS NOT NULL THEN
    PERFORM aj_mark_winner(p_code, v_winner_id);
  END IF;
END;
$$;

-- RPC: Mark player as ready (atomic append)
CREATE OR REPLACE FUNCTION aj_mark_ready(
  p_code text,
  p_player_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE alphajam_games
  SET ready_player_ids = array_append(ready_player_ids, p_player_id)
  WHERE code = p_code
    AND NOT (p_player_id = ANY(ready_player_ids));
END;
$$;

-- Trigger to check when both players are ready in matchup_preview or tiebreaker_preview
CREATE OR REPLACE FUNCTION check_matchup_ready()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_player1_id uuid;
  v_player2_id uuid;
  v_ready_ids uuid[];
  v_countdown_seconds int;
BEGIN
  IF NEW.phase IN ('matchup_preview', 'tiebreaker_preview') AND NEW.ready_player_ids IS NOT NULL THEN
    -- Get current matchup players
    SELECT
      (NEW.matchup_pairs->NEW.current_matchup_index->>'player1_id')::uuid,
      (NEW.matchup_pairs->NEW.current_matchup_index->>'player2_id')::uuid
    INTO v_player1_id, v_player2_id;

    v_ready_ids := NEW.ready_player_ids;

    -- Check if both players are ready
    IF v_player1_id = ANY(v_ready_ids) AND v_player2_id = ANY(v_ready_ids) THEN
      -- Dummy games skip countdown (0 seconds), real games have 3 second countdown
      v_countdown_seconds := CASE WHEN NEW.is_dummy THEN 0 ELSE 3 END;

      NEW.phase := 'countdown';
      NEW.reveal_at := now() + (v_countdown_seconds || ' seconds')::interval;
      NEW.ready_player_ids := '{}';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS matchup_ready_trigger ON alphajam_games;
CREATE TRIGGER matchup_ready_trigger
BEFORE UPDATE ON alphajam_games
FOR EACH ROW
EXECUTE FUNCTION check_matchup_ready();

-- Enable RLS
ALTER TABLE alphajam_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE alphajam_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE alphajam_matchup_results ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Public read" ON alphajam_games FOR SELECT USING (true);
CREATE POLICY "Public insert" ON alphajam_games FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update" ON alphajam_games FOR UPDATE USING (true);

CREATE POLICY "Public read" ON alphajam_players FOR SELECT USING (true);
CREATE POLICY "Public insert" ON alphajam_players FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update" ON alphajam_players FOR UPDATE USING (true);
CREATE POLICY "Public delete" ON alphajam_players FOR DELETE USING (true);

CREATE POLICY "Public read" ON alphajam_matchup_results FOR SELECT USING (true);
CREATE POLICY "Public insert" ON alphajam_matchup_results FOR INSERT WITH CHECK (true);
