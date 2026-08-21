-- ============================================================
-- Hearing Voices — Full Schema
-- Run this once on the Games Supabase project.
-- ============================================================

create table public.hv_games (
  code                  text primary key,
  phase                 text not null default 'lobby',   -- lobby | playing | finished
  rounds_total          int not null default 4,
  round_index           int not null default 0,
  turn_duration_seconds int not null default 45,
  wrong_points          int not null default -1,        -- points lost on an incorrect guess (host-configurable, -3..0)
  correct_points        int not null default 2,          -- points gained on a correct guess (host-configurable, 1..3)
  active_team           text,                             -- 'boys' | 'girls'
  clue_giver_id         uuid,                              -- FK added below, after hv_players exists
  boys_order            uuid[] not null default '{}',      -- team roster snapshot, ordered by join time at start
  girls_order           uuid[] not null default '{}',
  turn_started_at       timestamptz,
  paused                boolean not null default false,
  paused_by             uuid,
  paused_at             timestamptz,
  current_emoji         text,
  card_pool             text[] not null default '{}',      -- 8 voice-card slugs, fixed for the whole turn
  guess_nonce           int not null default 0,            -- bumps on every new emoji/assignment; clue-giver
                                                             -- client refetches /api/hv-secret when this changes
  selected_card_slug    text,                               -- shared live team selection
  selected_by           uuid,
  selected_at           timestamptz,
  last_result           boolean,                            -- correct/incorrect flash for the guess just submitted
  last_result_at        timestamptz,
  score_boys            int not null default 0,
  score_girls           int not null default 0,
  replay_code           text,                               -- set once someone taps "Play Again"; every
                                                              -- other client redirects here on the next patch
  replay_of             text,                                -- the game this replay was created from (unused by
                                                              -- the client today, kept for traceability)
  end_round_votes       uuid[] not null default '{}',        -- players who've tapped "End Round" this turn;
                                                              -- reset to '{}' whenever hv_end_turn actually runs
  round_history         jsonb not null default '[]',         -- this turn's guesses so far: [{emoji, slug, correct,
                                                              -- player_id, points}, ...] — shown on the Time's Up
                                                              -- screen, reset to '[]' whenever hv_end_turn runs
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()  -- touched by trigger below on
                                                              -- every update; the client uses
                                                              -- this to discard any incoming
                                                              -- row that isn't actually newer
                                                              -- than what it already has,
                                                              -- regardless of which path
                                                              -- delivered it (realtime,
                                                              -- gossip-triggered refetch, or a
                                                              -- post-RPC verify fetch) or what
                                                              -- order they arrive in
);

create table public.hv_players (
  id          uuid primary key default gen_random_uuid(),
  game_code   text not null references public.hv_games(code) on delete cascade,
  name        text not null,
  first_name  text,
  last_name   text,
  team        text,                                        -- 'boys' | 'girls' | null (unchosen)
  created_at  timestamptz not null default now()
);

alter table public.hv_games
  add constraint hv_games_clue_giver_id_fkey
  foreign key (clue_giver_id) references public.hv_players(id);

-- The correct-card answer. Deliberately its OWN table, never realtime-subscribed, and
-- (see RLS section below) never readable by anon/authenticated clients — only through
-- SECURITY DEFINER RPCs and the /api/hv-secret route (service-role key). This is what
-- keeps the clue-giver's answer hidden from teammates and the other team; keeping it on
-- hv_games instead would leak it to every realtime subscriber regardless of any
-- client-side .select() projection, since postgres_changes payloads carry full rows.
create table public.hv_secrets (
  game_code           text primary key references public.hv_games(code) on delete cascade,
  correct_card_slug   text not null
);

-- ============================================================
-- Freshness guard trigger
-- ============================================================
create or replace function public.hv_games_touch_updated_at()
returns trigger language plpgsql as $$
begin
  -- clock_timestamp(), NOT now()/transaction_timestamp() — now() is frozen for the whole
  -- transaction, so two UPDATEs to this table within the same RPC call (e.g.
  -- hv_vote_end_round's own vote-append UPDATE immediately followed by hv_end_turn's
  -- transition UPDATE, both in one transaction) got the IDENTICAL updated_at. The client's
  -- freshness guard (applyGameRow) rejects anything not strictly newer than what it already
  -- applied, so the real transition — arriving with the same timestamp as the vote-count
  -- update just before it — was silently discarded forever, even on a fresh refetch, since
  -- every read of the row carried that same frozen timestamp. clock_timestamp() actually
  -- advances between statements, so this can no longer happen.
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger hv_games_touch_updated_at
before update on public.hv_games
for each row execute function public.hv_games_touch_updated_at();

-- ============================================================
-- Realtime
-- ============================================================
ALTER TABLE hv_players REPLICA IDENTITY FULL; -- subscribed by game_code, not its own PK — see project memory
                                                -- on realtime replica identity (non-PK filter needs this or
                                                -- UPDATE/DELETE events drop).
ALTER PUBLICATION supabase_realtime ADD TABLE hv_games, hv_players;
-- hv_secrets is intentionally NOT added to supabase_realtime.

-- ============================================================
-- RLS
-- ============================================================
alter table public.hv_games   enable row level security;
alter table public.hv_players enable row level security;
alter table public.hv_secrets enable row level security;

create policy "anon all" on public.hv_games   for all using (true) with check (true);
create policy "anon all" on public.hv_players for all using (true) with check (true);

-- hv_secrets: DELIBERATE exception to this codebase's usual "anon all" convention.
-- No policies are created here, so RLS denies every direct client read/write. The
-- SECURITY DEFINER RPCs below and the /api/hv-secret route (service-role key) both
-- bypass RLS and are the only legitimate access paths. Do NOT add a permissive policy
-- to this table — that would leak the correct-card answer to every player.
revoke all on public.hv_secrets from anon, authenticated;

-- ============================================================
-- RPC: hv_start_game
-- ============================================================
create or replace function public.hv_start_game(
  p_code text,
  p_rounds_total int,
  p_turn_duration_seconds int,
  p_card_pool text[],
  p_first_emoji text,
  p_wrong_points int,
  p_correct_points int
)
returns void language plpgsql security definer as $$
declare
  g record;
  v_boys_order uuid[];
  v_girls_order uuid[];
  v_clue_giver uuid;
  v_correct text;
begin
  select * into g from public.hv_games where code = p_code for update;
  if not found or g.phase <> 'lobby' then return; end if;
  if array_length(p_card_pool, 1) <> 8 then return; end if;

  -- Ordered randomly (not by created_at) so that, combined with the modulo rotation in
  -- this function and hv_end_turn, an uneven smaller team's "extra" turns land on
  -- randomly-chosen players rather than always whoever joined first.
  select array_agg(id order by random()) into v_boys_order
    from public.hv_players where game_code = p_code and team = 'boys';
  select array_agg(id order by random()) into v_girls_order
    from public.hv_players where game_code = p_code and team = 'girls';

  -- Client `disabled` is UX only — server re-validates the real minimum (2 per team).
  if v_boys_order is null or array_length(v_boys_order, 1) < 2 then return; end if;
  if v_girls_order is null or array_length(v_girls_order, 1) < 2 then return; end if;

  v_clue_giver := v_boys_order[1];
  v_correct := p_card_pool[1 + floor(random() * 8)::int];

  update public.hv_games set
    phase = 'playing',
    rounds_total = p_rounds_total,
    turn_duration_seconds = p_turn_duration_seconds,
    wrong_points = p_wrong_points,
    correct_points = p_correct_points,
    round_index = 1,
    active_team = 'boys',
    boys_order = v_boys_order,
    girls_order = v_girls_order,
    clue_giver_id = v_clue_giver,
    card_pool = p_card_pool,
    current_emoji = p_first_emoji,
    guess_nonce = 1,
    selected_card_slug = null,
    selected_by = null,
    selected_at = null,
    last_result = null,
    last_result_at = null,
    score_boys = 0,
    score_girls = 0,
    -- Left null — round 1 waits for the clue-giver to explicitly tap Start (hv_begin_turn),
    -- same as every later turn waits for "Begin Next Round", rather than auto-revealing
    -- into the countdown after a fixed delay.
    turn_started_at = null,
    paused = false,
    paused_by = null,
    paused_at = null,
    round_history = '[]'
  where code = p_code;

  insert into public.hv_secrets (game_code, correct_card_slug)
  values (p_code, v_correct)
  on conflict (game_code) do update set correct_card_slug = excluded.correct_card_slug;
end;
$$;

-- ============================================================
-- RPC: hv_select_card
-- ============================================================
create or replace function public.hv_select_card(
  p_code text,
  p_player_id uuid,
  p_card_slug text
)
returns void language plpgsql security definer as $$
declare
  g record;
  v_team text;
begin
  select * into g from public.hv_games where code = p_code for update;
  if not found or g.phase <> 'playing' or g.paused then return; end if;
  if g.clue_giver_id = p_player_id then return; end if;
  if g.selected_card_slug is not distinct from p_card_slug then return; end if; -- no-op on re-tap

  select team into v_team from public.hv_players where id = p_player_id and game_code = p_code;
  if v_team is distinct from g.active_team then return; end if;

  update public.hv_games set
    selected_card_slug = p_card_slug,
    selected_by = p_player_id,
    selected_at = now()
  where code = p_code;
end;
$$;

-- ============================================================
-- RPC: hv_submit_guess
-- ============================================================
create or replace function public.hv_submit_guess(
  p_code text,
  p_player_id uuid,
  p_next_emoji text
)
returns void language plpgsql security definer as $$
declare
  g record;
  v_team text;
  v_correct_slug text;
  v_is_correct boolean;
  v_next_correct text;
  v_points int;
  v_history_entry jsonb;
begin
  select * into g from public.hv_games where code = p_code for update;
  if not found or g.phase <> 'playing' or g.paused then return; end if;
  if g.clue_giver_id = p_player_id then return; end if;
  if g.selected_card_slug is null then return; end if;

  select team into v_team from public.hv_players where id = p_player_id and game_code = p_code;
  if v_team is distinct from g.active_team then return; end if;

  select correct_card_slug into v_correct_slug from public.hv_secrets where game_code = p_code;
  v_is_correct := (g.selected_card_slug = v_correct_slug);
  -- Excludes the card that was just the correct answer from the next pick — picking
  -- uniformly across all 8 pool cards including the one just used could (and, per report,
  -- visibly did) hand the clue-giver the SAME card again right after it was just guessed.
  -- Picking from the other 7 instead guarantees the assignment actually changes every
  -- single guess while staying uniform among the real candidates.
  select slug into v_next_correct
  from unnest(g.card_pool) as slug
  where slug is distinct from v_correct_slug
  order by random() limit 1;
  v_points := case when v_is_correct then g.correct_points else g.wrong_points end;

  update public.hv_secrets set correct_card_slug = v_next_correct where game_code = p_code;

  -- Recorded for the Time's Up recap — which emoji/card, right or wrong, who submitted,
  -- how many points it was worth, and the actual correct card (round_history is a public
  -- column; revealing which card was right AFTER a guess already resolved and its
  -- Correct/Incorrect flash already showed to everyone doesn't expose anything new).
  -- Reset to '[]' whenever hv_end_turn actually runs.
  v_history_entry := jsonb_build_object(
    'emoji', g.current_emoji,
    'slug', g.selected_card_slug,
    'correct_slug', v_correct_slug,
    'correct', v_is_correct,
    'player_id', p_player_id,
    'points', v_points
  );

  update public.hv_games set
    score_boys = score_boys + case when g.active_team = 'boys' then v_points else 0 end,
    score_girls = score_girls + case when g.active_team = 'girls' then v_points else 0 end,
    last_result = v_is_correct,
    last_result_at = now(),
    current_emoji = p_next_emoji,
    selected_card_slug = null,
    selected_by = null,
    selected_at = null,
    guess_nonce = guess_nonce + 1,
    round_history = round_history || v_history_entry
  where code = p_code;
end;
$$;

-- ============================================================
-- RPC: hv_pause_game / hv_resume_game
-- ============================================================
create or replace function public.hv_pause_game(p_code text, p_player_id uuid)
returns void language plpgsql security definer as $$
declare g record;
begin
  select * into g from public.hv_games where code = p_code for update;
  if not found or g.phase <> 'playing' or g.paused then return; end if;
  update public.hv_games set paused = true, paused_by = p_player_id, paused_at = now()
    where code = p_code;
end;
$$;

create or replace function public.hv_resume_game(p_code text)
returns void language plpgsql security definer as $$
declare g record;
begin
  select * into g from public.hv_games where code = p_code for update;
  if not found or g.phase <> 'playing' or not g.paused then return; end if;
  -- Shift the turn's anchor forward by exactly how long it was paused, so the remaining
  -- time survives resume without loss or gain — same approach as WhatOnEarth's pause RPC.
  update public.hv_games set
    turn_started_at = turn_started_at + (now() - g.paused_at),
    paused = false,
    paused_by = null,
    paused_at = null
  where code = p_code;
end;
$$;

-- ============================================================
-- RPC: hv_end_turn
-- ============================================================
create or replace function public.hv_end_turn(
  p_code text,
  p_next_card_pool text[],
  p_next_emoji text
)
returns void language plpgsql security definer as $$
declare
  g record;
  v_new_team text;
  v_new_round int;
  v_order uuid[];
  v_clue_giver uuid;
  v_correct text;
begin
  select * into g from public.hv_games where code = p_code for update;
  if not found or g.phase <> 'playing' or g.paused then return; end if;
  if g.turn_started_at is null then return; end if;
  -- Server re-validates the clock itself — never trust a client-supplied "time's up".
  -- 2s grace tolerance for clock skew between the calling client and this server —
  -- without it, a browser clock running even slightly fast shows the "time's up" button
  -- while the server's own now() still disagrees, silently rejecting the call.
  if now() < g.turn_started_at + (g.turn_duration_seconds || ' seconds')::interval - interval '2 seconds' then return; end if;

  if g.active_team = 'boys' then
    v_new_team := 'girls';
    v_new_round := g.round_index;
  else
    if g.round_index >= g.rounds_total then
      update public.hv_games set phase = 'finished', end_round_votes = '{}' where code = p_code;
      return;
    end if;
    v_new_team := 'boys';
    v_new_round := g.round_index + 1;
  end if;

  if array_length(p_next_card_pool, 1) <> 8 then return; end if;

  v_order := case when v_new_team = 'boys' then g.boys_order else g.girls_order end;
  v_clue_giver := v_order[1 + ((v_new_round - 1) % array_length(v_order, 1))];
  v_correct := p_next_card_pool[1 + floor(random() * 8)::int];

  update public.hv_games set
    active_team = v_new_team,
    round_index = v_new_round,
    clue_giver_id = v_clue_giver,
    card_pool = p_next_card_pool,
    current_emoji = p_next_emoji,
    selected_card_slug = null,
    selected_by = null,
    selected_at = null,
    -- Left null — every round transition (not just round 1) now waits for the incoming
    -- clue-giver to explicitly tap Start (hv_begin_turn). There is deliberately no
    -- timer-based auto-reveal anywhere in this game; the interstitial never advances on
    -- its own.
    turn_started_at = null,
    guess_nonce = guess_nonce + 1,
    end_round_votes = '{}',
    round_history = '[]'
  where code = p_code;

  insert into public.hv_secrets (game_code, correct_card_slug)
  values (p_code, v_correct)
  on conflict (game_code) do update set correct_card_slug = excluded.correct_card_slug;
end;
$$;

-- ============================================================
-- RPC: hv_vote_end_round
-- ============================================================
-- Records this player's vote to end the round; once 50%+ of all players (not just the
-- active team — anyone can want to move on) have voted, performs the actual transition via
-- hv_end_turn in the same call. p_next_card_pool/p_next_emoji are always supplied (cheap to
-- generate) in case this vote happens to be the tipping one.
create or replace function public.hv_vote_end_round(
  p_code text,
  p_player_id uuid,
  p_next_card_pool text[],
  p_next_emoji text
)
returns void language plpgsql security definer as $$
declare
  g record;
  v_new_votes uuid[];
  v_total int;
  v_threshold int;
begin
  select * into g from public.hv_games where code = p_code for update;
  if not found or g.phase <> 'playing' or g.paused then return; end if;
  if g.turn_started_at is null then return; end if;
  if now() < g.turn_started_at + (g.turn_duration_seconds || ' seconds')::interval - interval '2 seconds' then return; end if;
  if p_player_id = any(g.end_round_votes) then return; end if;

  v_new_votes := array_append(g.end_round_votes, p_player_id);
  update public.hv_games set end_round_votes = v_new_votes where code = p_code;

  select count(*) into v_total from public.hv_players where game_code = p_code;
  v_threshold := ceil(v_total / 2.0);

  if array_length(v_new_votes, 1) >= v_threshold then
    perform public.hv_end_turn(p_code, p_next_card_pool, p_next_emoji);
  end if;
end;
$$;

-- ============================================================
-- RPC: hv_begin_turn
-- ============================================================
-- Round 1's card_pool/emoji/clue_giver_id are already fixed by hv_start_game — this just
-- lifts the "waiting for the clue-giver" gate by setting turn_started_at, so it doesn't
-- need any of hv_end_turn's rotation/next-card-pool logic.
create or replace function public.hv_begin_turn(p_code text)
returns void language plpgsql security definer as $$
declare g record;
begin
  select * into g from public.hv_games where code = p_code for update;
  if not found or g.phase <> 'playing' or g.paused then return; end if;
  if g.turn_started_at is not null then return; end if;
  update public.hv_games set turn_started_at = now() where code = p_code;
end;
$$;

-- ============================================================
-- RPC: hv_create_replay
-- ============================================================
-- Mirrors woe_create_replay's pattern (see WhatOnEarth) — race-safe: if two players tap
-- "Play Again" at once, only the first UPDATE (guarded by "replay_code is null") wins, and
-- the loser deletes its own just-inserted row and returns the winner's code instead, so
-- everyone converges on the same new lobby. Also carries every player's team choice into
-- the fresh lobby (every HV player always has one, so no conditional needed) — the cascade
-- delete on hv_players.game_code cleans these up automatically if this call loses the race.
create or replace function public.hv_create_replay(p_code text)
returns text language plpgsql security definer as $$
declare
  v_existing text;
  v_new_code text;
  v_claimed text;
  v_turn_dur int;
begin
  select replay_code, turn_duration_seconds into v_existing, v_turn_dur from public.hv_games where code = p_code;
  if v_existing is not null then return v_existing; end if;

  loop
    v_new_code := upper(substr(md5(random()::text), 1, 6));
    exit when not exists (select 1 from public.hv_games where code = v_new_code);
  end loop;

  insert into public.hv_games (code, phase, replay_of, turn_duration_seconds)
  values (v_new_code, 'lobby', p_code, v_turn_dur);

  insert into public.hv_players (game_code, name, first_name, last_name, team)
  select v_new_code, name, first_name, last_name, team
  from public.hv_players where game_code = p_code;

  update public.hv_games set replay_code = v_new_code where code = p_code and replay_code is null;

  select replay_code into v_claimed from public.hv_games where code = p_code;
  if v_claimed <> v_new_code then
    delete from public.hv_games where code = v_new_code;
    return v_claimed;
  end if;
  return v_new_code;
end;
$$;

-- ============================================================
-- RPC: hv_reset_to_lobby
-- ============================================================
-- For Menu's "Back to Lobby" tile. Keeps players/teams/settings intact — just resets the
-- game row back to a fresh lobby state.
create or replace function public.hv_reset_to_lobby(p_code text)
returns void language plpgsql security definer as $$
begin
  update public.hv_games set
    phase = 'lobby',
    round_index = 0,
    active_team = null,
    clue_giver_id = null,
    card_pool = '{}',
    current_emoji = null,
    guess_nonce = 0,
    selected_card_slug = null,
    selected_by = null,
    selected_at = null,
    last_result = null,
    last_result_at = null,
    score_boys = 0,
    score_girls = 0,
    turn_started_at = null,
    paused = false,
    paused_by = null,
    paused_at = null,
    end_round_votes = '{}',
    round_history = '[]'
  where code = p_code;
end;
$$;

-- ============================================================
-- Pin search_path on every SECURITY DEFINER function (closes the
-- "Function Search Path Mutable" advisor warning / search_path hijacking class of bug)
-- ============================================================
alter function public.hv_start_game(text, int, int, text[], text, int, int) set search_path = public;
alter function public.hv_select_card(text, uuid, text) set search_path = public;
alter function public.hv_submit_guess(text, uuid, text) set search_path = public;
alter function public.hv_pause_game(text, uuid) set search_path = public;
alter function public.hv_resume_game(text) set search_path = public;
alter function public.hv_end_turn(text, text[], text) set search_path = public;
alter function public.hv_vote_end_round(text, uuid, text[], text) set search_path = public;
alter function public.hv_begin_turn(text) set search_path = public;
alter function public.hv_create_replay(text) set search_path = public;
alter function public.hv_reset_to_lobby(text) set search_path = public;
