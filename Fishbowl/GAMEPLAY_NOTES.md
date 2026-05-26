# Fishbowl Gameplay Notes

## Source-of-truth game state
Gameplay state is stored in `public.games`:
- Phase/lifecycle: `phase`, `locked`, `round_index`, `rounds_total`
- Turn control: `turn_team`, `turn_player_id`, `turn_running`, `turn_started_at`
- Timer/carryover: `turn_duration_seconds`, `turn_seconds_remaining`
- Turn-order pointers: `turn_index_team1`, `turn_index_team2`
- Scoring/config: `team1_score`, `team2_score`, `skip_mode`, `skip_limit`, `skip_penalty`, `turn_skips_used`
- Current clue pointer: `active_clue_id`

`public.players` stores `ready`, `team`, and `time_bank_seconds` (carryover bank).

`public.clues` stores `status` (`in_bowl` or `used`), `used_in_round`, and `last_action`.

## RPC/functions
Defined in migration `supabase/migrations/20260220120000_gameplay_state_machine.sql`:
- `start_game_if_locked(p_code)`
  - Initializes scoreboard and turn pointers after lobby lock.
  - Sets game to `between_rounds` with a selected first actor.
- `start_round(p_code)`
  - Moves phase to `play`.
- `start_turn(p_code, p_player_id)`
  - Starts timer for active actor and loads first active clue.
- `score_correct(p_code, p_clue_id, p_team)`
  - Marks clue used and increments score.
- `skip_clue(p_code, p_clue_id)`
  - Applies configured skip behavior and rotates clue.
- `end_turn(p_code, p_reason)`
  - Stops timer, persists remaining seconds to actor `time_bank_seconds`, and picks next player.
- `end_round(p_code)`
  - Moves to between-rounds, advances round, resets clue bowl, or finishes game.

## Turn-order alternation
Turn order alternates teams and cycles deterministically by `players.created_at` within each team.
- Helper `fishbowl_choose_next_player(p_code)` uses `turn_team`, `turn_index_team1`, and `turn_index_team2`.
- On each turn transition, the chosen team index advances modulo team size, then team toggles.

## Timer carryover
Carryover is persisted per player in `players.time_bank_seconds`:
1. `start_turn` loads actor bank into `games.turn_seconds_remaining`.
2. `end_turn` computes elapsed from `turn_started_at` and stores remaining back to actor bank.
3. If turn ends due to `time`, remaining is forced to `0`.
4. If turn ends due to no clues, remaining is preserved for actor's later turn.
