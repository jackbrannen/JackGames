-- Typecast — schema + RPCs (applied live to the Games project; this file is the repo record)
-- Cooperative. Every player assigns words to people SIMULTANEOUSLY (one matchup each),
-- then the group guesses each player's board back-to-back. Score = correct placements.
-- Words drawn from the shared dc_words pool (single nouns).

CREATE TABLE IF NOT EXISTS tc_games (
  code text PRIMARY KEY,
  phase text NOT NULL DEFAULT 'lobby',     -- lobby | assign | guess | reveal | finished
  is_dummy boolean NOT NULL DEFAULT false,
  order_ids uuid[] NOT NULL DEFAULT '{}',   -- order the matchups are guessed in
  guess_index int NOT NULL DEFAULT 0,       -- which matchup is currently being guessed
  pending text[] NOT NULL DEFAULT '{}',     -- group's live shared guess for the current matchup
  score int NOT NULL DEFAULT 0,
  last_correct int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tc_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_code text NOT NULL REFERENCES tc_games(code) ON DELETE CASCADE,
  name text NOT NULL, first_name text, last_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One matchup per player: their word pool (incl. extras), who they cast onto, their answer.
CREATE TABLE IF NOT EXISTS tc_matchups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_code text NOT NULL REFERENCES tc_games(code) ON DELETE CASCADE,
  matcher_id uuid NOT NULL REFERENCES tc_players(id) ON DELETE CASCADE,
  slot_ids uuid[] NOT NULL DEFAULT '{}',     -- people this matcher casts onto (3-4 players incl self; 5+ others)
  words text[] NOT NULL DEFAULT '{}',        -- assign pool: 2 x player count (matcher uses slot_ids-many, rest are spares)
  key text[],                                -- aligned to slot_ids: chosen word per slot
  used_words text[] NOT NULL DEFAULT '{}',   -- shuffled chosen words (the guess pool); at 3 players, includes 1 unchosen decoy word so guessing isn't a coin flip
  submitted boolean NOT NULL DEFAULT false,
  UNIQUE (game_code, matcher_id)
);

ALTER TABLE tc_games REPLICA IDENTITY FULL;
ALTER TABLE tc_players REPLICA IDENTITY FULL;
ALTER TABLE tc_matchups REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE tc_games, tc_players, tc_matchups;

-- RPCs (full bodies applied via MCP; see live DB):
--   tc_start_game(code)                   >=3 players; deal each player a matchup (slots + extra words); phase=assign
--   tc_submit_key(code, matcher, key[])   store a matcher's assignment (at 3 players, adds 1 decoy word to used_words); when ALL in -> phase=guess (first matchup)
--   tc_set_pending(code, pending[])       live shared group guess for the current matchup
--   tc_submit_guess(code)                 score += correct placements -> phase=reveal
--   tc_next_round(code)                   advance to next matchup, or finish
--   tc_reset_to_lobby(code)
