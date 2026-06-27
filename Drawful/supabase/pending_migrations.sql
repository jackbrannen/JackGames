-- Add ready_player_ids column to track who has pressed Ready on the results screen
ALTER TABLE drawful_games
  ADD COLUMN IF NOT EXISTS ready_player_ids uuid[] DEFAULT '{}';

-- drawful_submit_drawing: player submits their drawing
--   - Updates player's drawing_url
--   - When all drawings submitted, inserts real answers and advances to 'guessing'
CREATE OR REPLACE FUNCTION drawful_submit_drawing(
  p_code text,
  p_player_id uuid,
  p_drawing_url text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_total_players int;
  v_drawings_done int;
  v_player RECORD;
  v_current_phase text;
BEGIN
  -- Only proceed if still in drawing phase
  SELECT phase INTO v_current_phase FROM drawful_games WHERE code = p_code;
  IF v_current_phase != 'drawing' THEN
    RETURN;
  END IF;

  -- Update player's drawing
  UPDATE drawful_players
  SET drawing_url = p_drawing_url
  WHERE game_code = p_code AND id = p_player_id AND drawing_url IS NULL;

  -- Count total players and how many have finished drawing
  SELECT count(*) INTO v_total_players
  FROM drawful_players WHERE game_code = p_code;

  SELECT count(*) INTO v_drawings_done
  FROM drawful_players
  WHERE game_code = p_code AND drawing_url IS NOT NULL;

  -- If all players have submitted drawings, insert real answers and advance to guessing
  IF v_drawings_done >= v_total_players THEN
    -- Insert real answers for each player's prompt
    FOR v_player IN
      SELECT id, prompt
      FROM drawful_players
      WHERE game_code = p_code
        AND prompt IS NOT NULL
        AND trim(prompt) != ''
    LOOP
      INSERT INTO drawful_answers (game_code, drawing_player_id, author_id, text, is_real)
      VALUES (p_code, v_player.id, v_player.id, v_player.prompt, true)
      ON CONFLICT DO NOTHING;
    END LOOP;

    -- Advance to guessing phase
    UPDATE drawful_games
    SET phase = 'guessing', current_drawing_index = 0
    WHERE code = p_code AND phase = 'drawing';
  END IF;
END;
$$;

-- drawful_start_game: start the game by assigning seats, prompts, and setting phase to drawing
CREATE OR REPLACE FUNCTION drawful_start_game(p_code text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_player RECORD;
  v_seat_counter int := 0;
  v_prompt_text text;
  v_random_player_name text;
BEGIN
  -- Assign seats to players (in order of creation)
  FOR v_player IN
    SELECT id FROM drawful_players WHERE game_code = p_code ORDER BY created_at
  LOOP
    UPDATE drawful_players
    SET seat = v_seat_counter
    WHERE id = v_player.id;
    v_seat_counter := v_seat_counter + 1;
  END LOOP;

  -- Assign a random unused prompt to each player
  FOR v_player IN
    SELECT id FROM drawful_players WHERE game_code = p_code
  LOOP
    -- Get a random unused prompt
    SELECT text INTO v_prompt_text
    FROM drawful_prompts
    WHERE used_at IS NULL
    ORDER BY random()
    LIMIT 1;

    -- If prompt contains [Player], replace with a random player's first name
    IF v_prompt_text IS NOT NULL AND v_prompt_text LIKE '%[Player]%' THEN
      SELECT first_name INTO v_random_player_name
      FROM drawful_players
      WHERE game_code = p_code
      ORDER BY random()
      LIMIT 1;

      v_prompt_text := replace(v_prompt_text, '[Player]', v_random_player_name);
    END IF;

    -- Assign it to the player and mark as used
    IF v_prompt_text IS NOT NULL THEN
      UPDATE drawful_players
      SET prompt = v_prompt_text
      WHERE id = v_player.id;

      UPDATE drawful_prompts
      SET used_at = now()
      WHERE text = v_prompt_text AND used_at IS NULL;
    END IF;
  END LOOP;

  -- Set phase to drawing
  -- Real answers are inserted later by drawful_submit_drawing when all drawings are done
  UPDATE drawful_games
  SET phase = 'drawing', current_drawing_index = 0, drawing_started_at = now()
  WHERE code = p_code;
END;
$$;

-- drawful_submit_answer: player submits a fake answer for the current drawing
--   - Validates text is not null or empty
--   - Advances phase to 'voting' when all non-artist players have submitted
CREATE OR REPLACE FUNCTION drawful_submit_answer(
  p_code              text,
  p_drawing_player_id uuid,
  p_author_id         uuid,
  p_text              text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_total_non_artist int;
  v_submitted        int;
BEGIN
  -- Validate text is not null or empty
  IF p_text IS NULL OR trim(p_text) = '' THEN
    RAISE EXCEPTION 'Answer text cannot be empty';
  END IF;

  -- Skip if player already submitted an answer for this drawing
  IF EXISTS (
    SELECT 1 FROM drawful_answers
    WHERE game_code = p_code
      AND drawing_player_id = p_drawing_player_id
      AND author_id = p_author_id
  ) THEN RETURN; END IF;

  -- Insert the fake answer
  INSERT INTO drawful_answers (game_code, drawing_player_id, author_id, text, is_real)
  VALUES (p_code, p_drawing_player_id, p_author_id, trim(p_text), false);

  -- Count how many non-artist players exist
  SELECT count(*) INTO v_total_non_artist
  FROM drawful_players WHERE game_code = p_code AND id != p_drawing_player_id;

  -- Count how many fake answers have been submitted
  SELECT count(*) INTO v_submitted
  FROM drawful_answers
  WHERE game_code = p_code
    AND drawing_player_id = p_drawing_player_id
    AND is_real = false;

  -- If all non-artist players have submitted, advance to voting
  IF v_submitted >= v_total_non_artist THEN
    UPDATE drawful_games SET phase = 'voting' WHERE code = p_code;
  END IF;
END;
$$;

-- drawful_submit_vote: multiple players may vote for the same answer (no exclusivity)
--   - Awards 1 pt to voter for correct guess, 1 pt to fake-answer author per fool
--   - Advances phase to 'results' when all eligible voters have voted
CREATE OR REPLACE FUNCTION drawful_submit_vote(
  p_code              text,
  p_drawing_player_id uuid,
  p_voter_id          uuid,
  p_answer_id         uuid
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_total_non_artist int;
  v_voted            int;
BEGIN
  -- Skip if voter already voted for this drawing
  IF EXISTS (
    SELECT 1 FROM drawful_votes
    WHERE game_code = p_code
      AND drawing_player_id = p_drawing_player_id
      AND voter_id = p_voter_id
  ) THEN RETURN; END IF;

  INSERT INTO drawful_votes (game_code, drawing_player_id, voter_id, answer_id)
  VALUES (p_code, p_drawing_player_id, p_voter_id, p_answer_id);

  SELECT count(*) INTO v_total_non_artist
  FROM drawful_players WHERE game_code = p_code AND id != p_drawing_player_id;

  SELECT count(*) INTO v_voted
  FROM drawful_votes WHERE game_code = p_code AND drawing_player_id = p_drawing_player_id;

  IF v_voted >= v_total_non_artist THEN
    -- 1 pt per correct guess
    UPDATE drawful_players p
    SET score = score + 1
    FROM drawful_votes v
    JOIN drawful_answers a ON a.id = v.answer_id
    WHERE v.game_code = p_code
      AND v.drawing_player_id = p_drawing_player_id
      AND a.is_real = true
      AND p.id = v.voter_id;

    -- 1 pt per vote received on each fake answer
    UPDATE drawful_players p
    SET score = score + (
      SELECT count(*)
      FROM drawful_votes v
      JOIN drawful_answers a ON a.id = v.answer_id
      WHERE v.game_code = p_code
        AND v.drawing_player_id = p_drawing_player_id
        AND a.author_id = p.id
        AND a.is_real = false
    )
    WHERE game_code = p_code AND id != p_drawing_player_id;

    UPDATE drawful_games SET phase = 'results', ready_player_ids = '{}'
    WHERE code = p_code;
  END IF;
END;
$$;

-- drawful_mark_ready: called by each player on the results screen.
-- Once 50%+ of players are ready, advances to the next drawing (or finished).
CREATE OR REPLACE FUNCTION drawful_mark_ready(
  p_code      text,
  p_player_id uuid
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_ready_count int;
  v_total_count int;
BEGIN
  UPDATE drawful_games
  SET ready_player_ids = array_append(COALESCE(ready_player_ids, '{}'), p_player_id)
  WHERE code = p_code
    AND NOT (p_player_id = ANY(COALESCE(ready_player_ids, '{}')));

  SELECT
    COALESCE(array_length(ready_player_ids, 1), 0),
    (SELECT count(*) FROM drawful_players WHERE game_code = p_code)
  INTO v_ready_count, v_total_count
  FROM drawful_games WHERE code = p_code;

  IF v_ready_count * 2 >= v_total_count THEN
    PERFORM drawful_next_drawing(p_code);
    UPDATE drawful_games SET ready_player_ids = '{}' WHERE code = p_code;
  END IF;
END;
$$;

-- drawful_next_drawing: advance to next drawing's guessing phase, or finish the game
CREATE OR REPLACE FUNCTION drawful_next_drawing(p_code text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_next_index   int;
  v_player_count int;
BEGIN
  SELECT current_drawing_index + 1,
         (SELECT count(*) FROM drawful_players WHERE game_code = p_code)
  INTO v_next_index, v_player_count
  FROM drawful_games WHERE code = p_code;

  IF v_next_index >= v_player_count THEN
    UPDATE drawful_games SET phase = 'finished' WHERE code = p_code;
  ELSE
    UPDATE drawful_games
    SET current_drawing_index = v_next_index, phase = 'guessing'
    WHERE code = p_code;
  END IF;
END;
$$;

-- drawful_reset_game: return to lobby and clear all round data
CREATE OR REPLACE FUNCTION drawful_reset_game(p_code text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE drawful_games
  SET phase = 'lobby', current_drawing_index = 0, ready_player_ids = '{}'
  WHERE code = p_code;

  DELETE FROM drawful_answers WHERE game_code = p_code;
  DELETE FROM drawful_votes   WHERE game_code = p_code;

  UPDATE drawful_players
  SET score = 0, drawing_url = NULL, prompt = NULL, seat = NULL
  WHERE game_code = p_code;
END;
$$;
