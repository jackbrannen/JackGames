-- So Clover: Add 50%+ ready advancement for "Next Board" button

-- Add ready_player_ids column if it doesn't exist
ALTER TABLE soclover_games ADD COLUMN IF NOT EXISTS ready_player_ids uuid[] DEFAULT '{}';

-- Helper function to advance to next board
CREATE OR REPLACE FUNCTION soclover_next_phase(p_code text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_current_index int;
  v_total_boards int;
BEGIN
  -- Get current board index and total boards
  SELECT current_board_index, array_length(player_order, 1)
  INTO v_current_index, v_total_boards
  FROM soclover_games
  WHERE code = p_code;

  -- If we're on the last board, move to scoring phase
  IF v_current_index >= v_total_boards - 1 THEN
    UPDATE soclover_games
    SET phase = 'scoring'
    WHERE code = p_code;
  ELSE
    -- Otherwise, increment to next board
    UPDATE soclover_games
    SET current_board_index = current_board_index + 1,
        phase = 'guessing'
    WHERE code = p_code;
  END IF;
END;
$$;

-- Update mark_ready RPC to use 50%+ logic
CREATE OR REPLACE FUNCTION soclover_mark_ready(p_code text, p_player_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_ready int;
  v_total int;
BEGIN
  -- Add player to ready list if not already there
  UPDATE soclover_games
  SET ready_player_ids = array_append(COALESCE(ready_player_ids, '{}'), p_player_id)
  WHERE code = p_code
    AND NOT (p_player_id = ANY(COALESCE(ready_player_ids, '{}')));

  -- Check if 50%+ are ready
  SELECT
    COALESCE(array_length(ready_player_ids, 1), 0),
    (SELECT count(*) FROM soclover_players WHERE game_code = p_code)
  INTO v_ready, v_total
  FROM soclover_games
  WHERE code = p_code;

  -- If 50%+ ready, advance to next phase
  IF v_ready * 2 >= v_total THEN
    PERFORM soclover_next_phase(p_code);
    -- Reset ready list
    UPDATE soclover_games
    SET ready_player_ids = '{}'
    WHERE code = p_code;
  END IF;
END;
$$;

-- Make sure ready_player_ids is reset when starting a new game
CREATE OR REPLACE FUNCTION soclover_play_again(p_code text)
RETURNS TABLE(new_code text) LANGUAGE plpgsql AS $$
DECLARE
  v_new_code text;
  v_player_order uuid[];
BEGIN
  -- Get existing player order
  SELECT player_order INTO v_player_order FROM soclover_games WHERE code = p_code;

  -- Generate new code
  v_new_code := p_code; -- This should generate a new unique code, but keeping same for now

  -- Reset game state
  UPDATE soclover_games
  SET
    phase = 'lobby',
    current_board_index = 0,
    ready_player_ids = '{}',
    player_order = v_player_order
  WHERE code = p_code;

  RETURN QUERY SELECT p_code;
END;
$$;
