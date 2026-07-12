-- ============================================================
-- Sound Board — schema
-- ============================================================

CREATE TABLE IF NOT EXISTS sb_games (
  code               text PRIMARY KEY,
  phase              text NOT NULL DEFAULT 'lobby', -- lobby, submit, board, countdown, sounds, guessing, results, gameover
  first_team         text NOT NULL DEFAULT 'girls', -- 'boys' | 'girls'
  win_score          int  NOT NULL DEFAULT 16,
  boys_score         int  NOT NULL DEFAULT 0,
  girls_score        int  NOT NULL DEFAULT 0,
  boys_order         uuid[] NOT NULL DEFAULT '{}',
  girls_order        uuid[] NOT NULL DEFAULT '{}',
  boys_idx           int  NOT NULL DEFAULT 0,
  girls_idx          int  NOT NULL DEFAULT 0,
  active_team        text,
  current_player_id  uuid,
  round_number       int  NOT NULL DEFAULT 0,
  it_selection       uuid[] NOT NULL DEFAULT '{}',
  phase_deadline_at  timestamptz,
  pool_needs_topup   boolean NOT NULL DEFAULT false,
  last_results       jsonb,
  winner             text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sb_players (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_code          text NOT NULL REFERENCES sb_games(code) ON DELETE CASCADE,
  name               text NOT NULL,
  first_name         text NOT NULL,
  last_name          text NOT NULL,
  team               text NOT NULL, -- 'boys' | 'girls'
  words_submitted    boolean NOT NULL DEFAULT false,
  topup_submitted    boolean NOT NULL DEFAULT false,
  guess_submitted    boolean NOT NULL DEFAULT false,
  guess_selection    uuid[] NOT NULL DEFAULT '{}',
  results_dismissed  boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sb_words (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_code      text NOT NULL REFERENCES sb_games(code) ON DELETE CASCADE,
  text           text NOT NULL,
  author_id      uuid REFERENCES sb_players(id) ON DELETE SET NULL,
  status         text NOT NULL DEFAULT 'pool', -- pool, board, removed
  value          int  NOT NULL DEFAULT 1,
  board_position int,
  scored_by      uuid[] NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sb_players_game_idx ON sb_players(game_code);
CREATE INDEX IF NOT EXISTS sb_words_game_idx ON sb_words(game_code);
CREATE INDEX IF NOT EXISTS sb_words_game_status_idx ON sb_words(game_code, status);

ALTER TABLE sb_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE sb_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE sb_words ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon all" ON sb_games;
CREATE POLICY "anon all" ON sb_games FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon all" ON sb_players;
CREATE POLICY "anon all" ON sb_players FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon all" ON sb_words;
CREATE POLICY "anon all" ON sb_words FOR ALL USING (true) WITH CHECK (true);

-- REPLICA IDENTITY FULL so realtime DELETE/UPDATE events carry full row data
-- when subscribed with a non-PK filter (game_code). See project memory:
-- realtime subscriptions on a non-PK filter need this or events drop.
ALTER TABLE sb_players REPLICA IDENTITY FULL;
ALTER TABLE sb_words REPLICA IDENTITY FULL;

-- ============================================================
-- RPCs
-- ============================================================

-- Start the game: validates team sizes, freezes roster order (join order),
-- sets active team from settings. Words are collected in the following
-- 'submit' phase before the first board is drawn (see sb_submit_words).
CREATE OR REPLACE FUNCTION sb_start_game(p_code text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_boys uuid[];
  v_girls uuid[];
  v_first text;
BEGIN
  SELECT array_agg(id ORDER BY created_at) INTO v_boys FROM sb_players WHERE game_code = p_code AND team = 'boys';
  SELECT array_agg(id ORDER BY created_at) INTO v_girls FROM sb_players WHERE game_code = p_code AND team = 'girls';
  IF coalesce(array_length(v_boys,1),0) < 2 OR coalesce(array_length(v_girls,1),0) < 2 THEN
    RAISE EXCEPTION 'Each team needs at least 2 players';
  END IF;
  SELECT first_team INTO v_first FROM sb_games WHERE code = p_code;

  UPDATE sb_games SET
    phase = 'submit',
    boys_order = v_boys,
    girls_order = v_girls,
    active_team = v_first,
    boys_idx = 0,
    girls_idx = 0,
    round_number = 0
  WHERE code = p_code;
END;
$$;

-- Draw words from the pool into random unused board positions, filling as
-- many of p_positions as possible. Returns how many were actually filled.
CREATE OR REPLACE FUNCTION sb_fill_positions(p_code text, p_positions int[])
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  v_pos int;
  v_word_id uuid;
  v_filled int := 0;
BEGIN
  FOREACH v_pos IN ARRAY p_positions LOOP
    SELECT id INTO v_word_id FROM sb_words
      WHERE game_code = p_code AND status = 'pool'
      ORDER BY random() LIMIT 1;
    IF v_word_id IS NULL THEN
      EXIT;
    END IF;
    UPDATE sb_words SET status = 'board', value = 1, board_position = v_pos WHERE id = v_word_id;
    v_filled := v_filled + 1;
  END LOOP;
  RETURN v_filled;
END;
$$;

-- Each player submits their 5 starting words. Once everyone has, draw the
-- initial 3x3 board and kick off the first turn.
CREATE OR REPLACE FUNCTION sb_submit_words(p_code text, p_player_id uuid, p_words text[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_word text;
  v_total int;
  v_done int;
  v_current uuid;
  v_pool_count int;
BEGIN
  FOREACH v_word IN ARRAY p_words LOOP
    INSERT INTO sb_words (game_code, text, author_id, status) VALUES (p_code, v_word, p_player_id, 'pool');
  END LOOP;
  UPDATE sb_players SET words_submitted = true WHERE id = p_player_id;

  SELECT count(*), count(*) FILTER (WHERE words_submitted) INTO v_total, v_done FROM sb_players WHERE game_code = p_code;
  IF v_done < v_total THEN
    RETURN;
  END IF;

  PERFORM sb_fill_positions(p_code, ARRAY[0,1,2,3,4,5,6,7,8]);
  SELECT count(*) INTO v_pool_count FROM sb_words WHERE game_code = p_code AND status = 'pool';

  SELECT (CASE WHEN active_team = 'boys' THEN boys_order[1] ELSE girls_order[1] END)
    INTO v_current FROM sb_games WHERE code = p_code;

  UPDATE sb_games SET
    phase = 'board',
    round_number = 1,
    current_player_id = v_current,
    pool_needs_topup = (v_pool_count < 3)
  WHERE code = p_code;
END;
$$;

-- The "it" player locks in 1-3 words and the synced 3-2-1 countdown begins.
CREATE OR REPLACE FUNCTION sb_lock_selection(p_code text, p_player_id uuid, p_word_ids uuid[])
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE sb_games SET
    it_selection = p_word_ids,
    phase = 'countdown',
    phase_deadline_at = now() + interval '3 seconds'
  WHERE code = p_code AND current_player_id = p_player_id AND phase = 'board';
END;
$$;

-- Countdown finished -> show the "Sounds!" screen for 4 seconds.
CREATE OR REPLACE FUNCTION sb_advance_to_sounds(p_code text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE sb_games SET phase = 'sounds', phase_deadline_at = now() + interval '4 seconds'
  WHERE code = p_code AND phase = 'countdown';
END;
$$;

-- "Sounds!" screen finished -> open guessing for the active team's other players.
CREATE OR REPLACE FUNCTION sb_advance_to_guessing(p_code text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE sb_players SET guess_submitted = false, guess_selection = '{}'
  WHERE game_code = p_code AND team = (SELECT active_team FROM sb_games WHERE code = p_code)
    AND id <> (SELECT current_player_id FROM sb_games WHERE code = p_code);

  UPDATE sb_games SET phase = 'guessing', phase_deadline_at = null
  WHERE code = p_code AND phase = 'sounds';
END;
$$;

-- Live update of a guesser's in-progress selection (visible to teammates).
CREATE OR REPLACE FUNCTION sb_update_guess_selection(p_code text, p_player_id uuid, p_word_ids uuid[])
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE sb_players SET guess_selection = p_word_ids
  WHERE id = p_player_id AND game_code = p_code AND guess_submitted = false;
END;
$$;

-- A teammate submits their final guess. Once every eligible guesser has
-- submitted, scores the whole turn, mutates the board, and advances the turn.
CREATE OR REPLACE FUNCTION sb_submit_guess(p_code text, p_player_id uuid, p_word_ids uuid[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_active text;
  v_current uuid;
  v_total int;
  v_done int;
  v_it_selection uuid[];
  v_results jsonb := '{}'::jsonb;
  v_player record;
  v_word record;
  v_correct jsonb; v_missed jsonb; v_wrong jsonb;
  v_total_delta int; v_team_delta int := 0;
  v_removed_positions int[] := '{}';
  v_filled int;
  v_pool_count int;
  v_boys_score int; v_girls_score int; v_win int;
  v_next_idx int; v_next_team text; v_next_player uuid;
BEGIN
  UPDATE sb_players SET guess_selection = p_word_ids, guess_submitted = true
  WHERE id = p_player_id AND game_code = p_code;

  SELECT active_team, current_player_id, it_selection INTO v_active, v_current, v_it_selection
  FROM sb_games WHERE code = p_code;

  SELECT count(*), count(*) FILTER (WHERE guess_submitted) INTO v_total, v_done
  FROM sb_players WHERE game_code = p_code AND team = v_active AND id <> v_current;

  IF v_done < v_total THEN
    RETURN; -- still waiting on teammates
  END IF;

  -- Snapshot current board word values/text before any mutation this turn.
  FOR v_player IN SELECT id, guess_selection FROM sb_players WHERE game_code = p_code AND team = v_active AND id <> v_current LOOP
    v_correct := '[]'::jsonb; v_missed := '[]'::jsonb; v_wrong := '[]'::jsonb; v_total_delta := 0;

    FOR v_word IN SELECT id, text, value FROM sb_words WHERE id = ANY(v_it_selection) LOOP
      IF v_word.id = ANY(v_player.guess_selection) THEN
        v_correct := v_correct || jsonb_build_object('id', v_word.id, 'text', v_word.text, 'value', v_word.value);
        v_total_delta := v_total_delta + v_word.value;
      ELSE
        v_missed := v_missed || jsonb_build_object('id', v_word.id, 'text', v_word.text, 'value', v_word.value);
        v_total_delta := v_total_delta - v_word.value;
      END IF;
    END LOOP;

    FOR v_word IN SELECT id, text, value FROM sb_words WHERE id = ANY(v_player.guess_selection) AND NOT (id = ANY(v_it_selection)) LOOP
      v_wrong := v_wrong || jsonb_build_object('id', v_word.id, 'text', v_word.text, 'value', v_word.value);
      v_total_delta := v_total_delta - v_word.value;
    END LOOP;

    v_team_delta := v_team_delta + v_total_delta;
    v_results := v_results || jsonb_build_object(v_player.id::text, jsonb_build_object(
      'correct', v_correct, 'missed', v_missed, 'wrong', v_wrong, 'total', v_total_delta
    ));

    -- Credit correctly-guessed words with this scorer.
    UPDATE sb_words SET scored_by = scored_by || v_player.id
    WHERE id = ANY(v_it_selection) AND id = ANY(v_player.guess_selection);
  END LOOP;

  -- Remove words that at least one teammate correctly identified.
  SELECT array_agg(board_position) INTO v_removed_positions
  FROM sb_words w WHERE w.id = ANY(v_it_selection) AND w.game_code = p_code
    AND EXISTS (
      SELECT 1 FROM sb_players p WHERE p.game_code = p_code AND p.team = v_active AND p.id <> v_current
        AND w.id = ANY(p.guess_selection)
    );

  UPDATE sb_words SET status = 'removed', board_position = null
  WHERE id = ANY(v_it_selection) AND game_code = p_code
    AND EXISTS (
      SELECT 1 FROM sb_players p WHERE p.game_code = p_code AND p.team = v_active AND p.id <> v_current
        AND sb_words.id = ANY(p.guess_selection)
    );

  -- Bump surviving board words (cap at 9).
  UPDATE sb_words SET value = LEAST(value + 1, 9)
  WHERE game_code = p_code AND status = 'board';

  -- Refill vacated slots with fresh words from the pool.
  v_filled := 0;
  IF v_removed_positions IS NOT NULL THEN
    v_filled := sb_fill_positions(p_code, v_removed_positions);
  END IF;
  SELECT count(*) INTO v_pool_count FROM sb_words WHERE game_code = p_code AND status = 'pool';

  -- Apply team score delta.
  IF v_active = 'boys' THEN
    UPDATE sb_games SET boys_score = boys_score + v_team_delta WHERE code = p_code;
  ELSE
    UPDATE sb_games SET girls_score = girls_score + v_team_delta WHERE code = p_code;
  END IF;

  SELECT boys_score, girls_score, win_score INTO v_boys_score, v_girls_score, v_win FROM sb_games WHERE code = p_code;

  -- Advance turn order (independent per-team roster cycling).
  IF v_active = 'boys' THEN
    SELECT boys_idx INTO v_next_idx FROM sb_games WHERE code = p_code;
    v_next_idx := v_next_idx + 1;
    v_next_team := 'girls';
    UPDATE sb_games SET boys_idx = v_next_idx WHERE code = p_code;
    SELECT girls_order[(girls_idx % greatest(array_length(girls_order,1),1)) + 1] INTO v_next_player FROM sb_games WHERE code = p_code;
  ELSE
    SELECT girls_idx INTO v_next_idx FROM sb_games WHERE code = p_code;
    v_next_idx := v_next_idx + 1;
    v_next_team := 'boys';
    UPDATE sb_games SET girls_idx = v_next_idx WHERE code = p_code;
    SELECT boys_order[(boys_idx % greatest(array_length(boys_order,1),1)) + 1] INTO v_next_player FROM sb_games WHERE code = p_code;
  END IF;

  UPDATE sb_games SET
    active_team = v_next_team,
    current_player_id = v_next_player,
    round_number = round_number + 1,
    it_selection = '{}',
    phase_deadline_at = null,
    pool_needs_topup = (v_pool_count < 3),
    winner = CASE WHEN v_boys_score >= v_win THEN 'boys' WHEN v_girls_score >= v_win THEN 'girls' ELSE null END,
    last_results = jsonb_build_object(
      'it_player_id', v_current,
      'active_team', v_active,
      'it_selection', to_jsonb(v_it_selection),
      'per_player', v_results,
      'team_delta', v_team_delta
    ),
    phase = 'results'
  WHERE code = p_code;
END;
$$;

CREATE OR REPLACE FUNCTION sb_maybe_finish_turn(p_code text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_winner text;
  v_needs_topup boolean;
  v_all_dismissed boolean;
  v_all_topped_up boolean;
BEGIN
  SELECT winner, pool_needs_topup INTO v_winner, v_needs_topup FROM sb_games WHERE code = p_code;
  SELECT bool_and(results_dismissed) INTO v_all_dismissed FROM sb_players WHERE game_code = p_code;

  IF NOT coalesce(v_all_dismissed, false) THEN
    RETURN;
  END IF;

  IF v_winner IS NOT NULL THEN
    UPDATE sb_games SET phase = 'gameover' WHERE code = p_code;
    RETURN;
  END IF;

  IF v_needs_topup THEN
    SELECT bool_and(topup_submitted) INTO v_all_topped_up FROM sb_players WHERE game_code = p_code;
    IF NOT coalesce(v_all_topped_up, false) THEN
      RETURN;
    END IF;
  END IF;

  UPDATE sb_players SET results_dismissed = false, topup_submitted = false WHERE game_code = p_code;
  UPDATE sb_games SET phase = 'board', pool_needs_topup = false WHERE code = p_code;
END;
$$;

-- Any player dismisses their results modal. Once everyone has (and the pool
-- doesn't need a top-up), moves on to the board or game over.
CREATE OR REPLACE FUNCTION sb_dismiss_results(p_code text, p_player_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE sb_players SET results_dismissed = true WHERE id = p_player_id AND game_code = p_code;
  PERFORM sb_maybe_finish_turn(p_code);
END;
$$;

-- A player tops up the word pool with 3 more words when it's run low.
CREATE OR REPLACE FUNCTION sb_submit_topup_words(p_code text, p_player_id uuid, p_words text[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_word text;
BEGIN
  FOREACH v_word IN ARRAY p_words LOOP
    INSERT INTO sb_words (game_code, text, author_id, status) VALUES (p_code, v_word, p_player_id, 'pool');
  END LOOP;
  UPDATE sb_players SET topup_submitted = true WHERE id = p_player_id AND game_code = p_code;
  PERFORM sb_maybe_finish_turn(p_code);
END;
$$;
