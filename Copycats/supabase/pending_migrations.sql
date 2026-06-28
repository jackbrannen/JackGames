-- Add is_dummy column to cc_games table
ALTER TABLE cc_games
ADD COLUMN IF NOT EXISTS is_dummy BOOLEAN DEFAULT false;

-- Update cc_start_game to reset questions_submitted flag and clean up old data
CREATE OR REPLACE FUNCTION cc_start_game(p_code text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_player_count int;
  v_player_ids uuid[];
BEGIN
  -- Delete old answers and votes from previous games
  DELETE FROM cc_answers WHERE game_code = p_code;
  DELETE FROM cc_votes WHERE game_code = p_code;

  -- Get all player IDs in random order
  SELECT array_agg(id ORDER BY random())
  INTO v_player_ids
  FROM cc_players
  WHERE game_code = p_code;

  v_player_count := array_length(v_player_ids, 1);

  -- Assign targets (each player gets the next player in the shuffled order)
  FOR i IN 1..v_player_count LOOP
    UPDATE cc_players
    SET target_id = v_player_ids[(i % v_player_count) + 1],
        questions_submitted = false  -- Reset submission flag
    WHERE id = v_player_ids[i];
  END LOOP;

  -- Update game to question_writing phase with player order
  UPDATE cc_games
  SET phase = 'question_writing',
      player_order = v_player_ids,
      current_round = 0
  WHERE code = p_code;
END;
$$;

-- Update cc_submit_answer to auto-advance to voting when all answers are in
DROP FUNCTION IF EXISTS cc_submit_answer(text, uuid, integer, text);

CREATE OR REPLACE FUNCTION cc_submit_answer(
  p_code text,
  p_player_id uuid,
  p_round int,
  p_answer text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_player_count int;
  v_answer_count int;
  v_inserted boolean := false;
BEGIN
  -- Validate answer is not empty
  IF p_answer IS NULL OR trim(p_answer) = '' THEN
    RAISE EXCEPTION 'Answer cannot be empty';
  END IF;

  -- Insert answer (with conflict handling for re-submissions)
  INSERT INTO cc_answers (game_code, player_id, round, answer)
  VALUES (p_code, p_player_id, p_round, trim(p_answer))
  ON CONFLICT (game_code, player_id, round)
  DO UPDATE SET answer = trim(p_answer);

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Count total players
  SELECT count(*) INTO v_player_count
  FROM cc_players
  WHERE game_code = p_code;

  -- Count submitted answers for this round
  SELECT count(*) INTO v_answer_count
  FROM cc_answers
  WHERE game_code = p_code AND round = p_round;

  -- If all players have answered, advance to voting
  IF v_answer_count >= v_player_count THEN
    UPDATE cc_games
    SET phase = 'voting'
    WHERE code = p_code;
  END IF;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'player_count', v_player_count,
    'answer_count', v_answer_count,
    'phase_changed', (v_answer_count >= v_player_count)
  );
END;
$$;

-- Fix rounds being skipped: advance only when ALL players are ready (was half),
-- and make the round increment atomic so duplicate/concurrent triggers advance once.
CREATE OR REPLACE FUNCTION cc_mark_ready(p_code text, p_player_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_ready int;
  v_total int;
BEGIN
  UPDATE cc_games
  SET ready_player_ids = array_append(COALESCE(ready_player_ids, '{}'), p_player_id)
  WHERE code = p_code AND NOT (p_player_id = ANY(COALESCE(ready_player_ids, '{}')));

  SELECT COALESCE(array_length(ready_player_ids, 1), 0),
         (SELECT count(*) FROM cc_players WHERE game_code = p_code)
  INTO v_ready, v_total
  FROM cc_games WHERE code = p_code;

  IF v_total > 0 AND v_ready >= v_total THEN
    PERFORM cc_next_round(p_code);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION cc_next_round(p_code text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_round int;
  v_total int;
BEGIN
  SELECT current_round INTO v_round FROM cc_games WHERE code = p_code;
  SELECT count(*) INTO v_total FROM cc_players WHERE game_code = p_code;

  IF v_round + 1 < v_total THEN
    UPDATE cc_games
    SET phase = 'answering', current_round = v_round + 1, ready_player_ids = '{}'
    WHERE code = p_code AND current_round = v_round;
  ELSE
    UPDATE cc_games
    SET phase = 'finished', ready_player_ids = '{}'
    WHERE code = p_code AND current_round = v_round;
  END IF;
END;
$$;

-- cc_submit_vote: claim the voting->results transition atomically so the round's
-- scoring runs exactly once (a double-clicked final vote was scoring twice).
-- Full body applied via DB; see DB for the complete scoring logic.
