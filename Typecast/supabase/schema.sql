-- Typecast — schema + RPCs (applied live to the Games project; this file is the repo record)
-- Cooperative. Every player assigns words to people SIMULTANEOUSLY (one matchup each),
-- then the group guesses each player's board back-to-back. Score = correct placements.
-- Words drawn from the shared dc_words pool (single nouns).

CREATE TABLE IF NOT EXISTS tc_games (
  code text PRIMARY KEY,
  phase text NOT NULL DEFAULT 'lobby',     -- lobby | roster | assign | guess | reveal | finished
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

-- Optional non-player targets a host can add during the 'roster' phase to pad
-- out a small group (e.g. an absent friend, a fictional character). Only
-- addable while total targets (players + these) stays under 4 — see
-- tc_check_custom_target_limit below. Never a matcher, only ever a target.
CREATE TABLE IF NOT EXISTS tc_custom_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_code text NOT NULL REFERENCES tc_games(code) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One matchup per player: their word pool (incl. extras), who they cast onto, their answer.
CREATE TABLE IF NOT EXISTS tc_matchups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_code text NOT NULL REFERENCES tc_games(code) ON DELETE CASCADE,
  matcher_id uuid NOT NULL REFERENCES tc_players(id) ON DELETE CASCADE,
  slot_ids uuid[] NOT NULL DEFAULT '{}',     -- targets this matcher casts onto, drawn from players + tc_custom_targets combined (<=4 total targets: everyone incl self; 5+ real players, never any custom targets by then: capped at 4, via a fixed rotation over the randomized target order so every target is cast onto as evenly as possible)
  words text[] NOT NULL DEFAULT '{}',        -- assign pool: 2 x this matcher's own slot count (not total players — matcher uses slot_ids-many, rest are spares)
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
--   tc_open_roster(code)                  >=3 players; phase=lobby->roster. If players already >=4 (no room to
--                                          add any custom target under the 4-total cap), skips straight through
--                                          to tc_lock_roster instead of showing the roster screen at all.
--   tc_lock_roster(code)                  deal each player a matchup from players + tc_custom_targets (slots +
--                                          extra words, sized off each matcher's own slot count; 5+ real players
--                                          capped at 4 evenly-balanced targets); phase=roster->assign
--   tc_check_custom_target_limit()        BEFORE INSERT trigger on tc_custom_targets; rejects once
--                                          players + existing custom targets >= 4
--   tc_submit_key(code, matcher, key[])   store a matcher's assignment (at 3 total targets, adds 1 decoy word to used_words); when ALL in -> phase=guess (first matchup)
--   tc_set_pending(code, pending[])       live shared group guess for the current matchup
--   tc_submit_guess(code)                 score += correct placements -> phase=reveal
--   tc_next_round(code)                   advance to next matchup, or finish
--   tc_reset_to_lobby(code)
