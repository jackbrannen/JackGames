-- Decrypto schema + RPCs (applied live; this file is the repo record)

CREATE TABLE IF NOT EXISTS dc_words (id serial PRIMARY KEY, word text NOT NULL UNIQUE);
-- dc_words seeded from the So Clover word pool (2000 single nouns).

CREATE TABLE IF NOT EXISTS dc_games (
  code text PRIMARY KEY,
  phase text NOT NULL DEFAULT 'lobby',          -- lobby | playing | finished
  round_phase text,                             -- clue | guess | reveal
  is_dummy boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  turn_number int NOT NULL DEFAULT 0,           -- each team-clue is a turn; round = ceil(turn/2)
  active_team text,                             -- boys | girls
  boys_ids uuid[] NOT NULL DEFAULT '{}',
  girls_ids uuid[] NOT NULL DEFAULT '{}',
  boys_keywords text[], girls_keywords text[],
  boys_encryptor_idx int NOT NULL DEFAULT 0,
  girls_encryptor_idx int NOT NULL DEFAULT 0,
  current_code int[],                           -- length 3; secret to encryptor (UI-gated)
  boys_intercepts int NOT NULL DEFAULT 0, girls_intercepts int NOT NULL DEFAULT 0,
  boys_miscomms int NOT NULL DEFAULT 0, girls_miscomms int NOT NULL DEFAULT 0,
  boys_pending_guess int[], girls_pending_guess int[],   -- live tentative guess (team-only)
  winner_team text, win_reason text
);

CREATE TABLE IF NOT EXISTS dc_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_code text NOT NULL REFERENCES dc_games(code) ON DELETE CASCADE,
  name text NOT NULL, first_name text, last_name text,
  team text, is_bot boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dc_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_code text NOT NULL REFERENCES dc_games(code) ON DELETE CASCADE,
  turn_number int NOT NULL, clue_team text NOT NULL, encryptor_id uuid,
  code int[], clues text[], revealed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dc_guesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_code text NOT NULL REFERENCES dc_games(code) ON DELETE CASCADE,
  turn_number int NOT NULL, team text NOT NULL, is_intercept boolean NOT NULL,
  guess int[] NOT NULL, submitted_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_code, turn_number, team)
);

ALTER TABLE dc_games REPLICA IDENTITY FULL;
ALTER TABLE dc_players REPLICA IDENTITY FULL;
ALTER TABLE dc_rounds REPLICA IDENTITY FULL;
ALTER TABLE dc_guesses REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE dc_games, dc_players, dc_rounds, dc_guesses;

-- RPCs applied via MCP (see live DB for full bodies):
--   dc_start_game(code)               deal 4 keywords/team, random first team + code
--   dc_set_pending_guess(code,team,guess[])    live tentative guess (team-only)
--   dc_submit_clues(code,player,clues[])        encryptor-gated -> guess phase
--   dc_submit_guess(code,player,guess[],is_intercept)  resolve + tokens + win (atomic claim)
--   dc_next_round(code)               rotate team/encryptor, new code; 16-turn cap + tiebreak
--   dc_reset_to_lobby(code)           keep players+teams, clear game state
