-- Same Page — schema + RPCs (applied live to the Games project; this file is the repo record)
-- A cooperative "herd mentality" game: everyone answers the same 3 lettered prompts;
-- the group needs at least one all-group match per round; surplus matches bank.

CREATE TABLE IF NOT EXISTS sp_games (
  code text PRIMARY KEY,
  phase text NOT NULL DEFAULT 'lobby',            -- lobby | answering | reveal | resolving | finished
  is_dummy boolean NOT NULL DEFAULT false,
  rounds_total int NOT NULL DEFAULT 8,
  round_index int NOT NULL DEFAULT 0,
  bank int NOT NULL DEFAULT 0,                     -- banked surplus matches
  match_threshold int NOT NULL DEFAULT 2,          -- how many players must match per prompt (human-verified)
  outcome text,                                    -- win | loss | null
  prompts jsonb,                                   -- [{text, letter} x3] for current round
  match_flags boolean[] NOT NULL DEFAULT ARRAY[false,false,false],
  used_prompts text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sp_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_code text NOT NULL REFERENCES sp_games(code) ON DELETE CASCADE,
  name text NOT NULL, first_name text, last_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sp_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_code text NOT NULL REFERENCES sp_games(code) ON DELETE CASCADE,
  round_index int NOT NULL,
  prompt_index int NOT NULL,
  player_id uuid NOT NULL REFERENCES sp_players(id) ON DELETE CASCADE,
  text text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_code, round_index, prompt_index, player_id)
);

CREATE TABLE IF NOT EXISTS sp_prompts (id serial PRIMARY KEY, text text NOT NULL UNIQUE);

ALTER TABLE sp_games REPLICA IDENTITY FULL;
ALTER TABLE sp_players REPLICA IDENTITY FULL;
ALTER TABLE sp_answers REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE sp_games, sp_players, sp_answers;

-- RPCs (full bodies applied via MCP; see live DB):
--   sp_generate_round(code)                pick 3 prompts (prefer unused) + 3 letters (weighted toward common word-initial letters; J/Q/X/Y/Z excluded), reset flags
--   sp_start_game(code, rounds)            require >=3 players, clamp rounds 4-12, deal round 1
--   sp_submit_answers(code, player, text[])  upsert a player's 3 answers; -> reveal when all in
--   sp_toggle_match(code, index, value)    set match_flags[index] (reveal only)
--   sp_resolve_round(code)                 bank += matches-1; bank<0 loss; last round win; else next round
--   sp_reset_to_lobby(code)                clear back to lobby
