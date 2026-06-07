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
