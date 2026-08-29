-- WordBirds — free-for-all -> Boys vs Girls head-to-head
-- Repo record of what was applied live to project hgbvzuqqdwaobxnxvvsu.
-- Run as one transaction, in this order (functions before dropping the
-- columns they used to reference).

begin;

-- ============================================================
-- 1. New columns
-- ============================================================
alter table public.wb_players add column team text;
alter table public.wb_players
  add constraint wb_players_team_chk check (team is null or team in ('boys','girls'));

alter table public.wb_games add column boys_score  int not null default 0;
alter table public.wb_games add column girls_score int not null default 0;
-- Round N (1-based, = wb_games.round_number) pairs matchup_boys[N] against
-- matchup_girls[N]. Same length by construction. round_number IS the
-- schedule index — there is deliberately no separate matchup_index column;
-- only wb_apply_round_result may advance round_number, and wb_redeal_cards
-- must never touch it.
alter table public.wb_games add column matchup_boys  uuid[] not null default '{}';
alter table public.wb_games add column matchup_girls uuid[] not null default '{}';

-- ============================================================
-- 2. Functions
-- ============================================================

-- 2a. Card generator: drop the vestigial accent-chance param. Must DROP the
-- 3-arg version before creating the 2-arg one, or `wb_generate_cards(x, y)`
-- resolves ambiguously against both (the 3-arg via its own default) and
-- errors "function is not unique".
drop function if exists public.wb_generate_cards(int, int, int);

create function public.wb_generate_cards(p_reverse_chance int, p_round_number int default 8)
returns jsonb language plpgsql as $function$
declare
  v_pool text[] := '{}';
  v_letter text;
  v_count int;
  v_values text[] := '{}';
  v_reds boolean[] := '{}';
  v_used_letters text[] := '{}';
  v_is_red boolean;
  v_tries int;
  v_cards jsonb := '[]'::jsonb;
  v_i int;
  v_j int;
  v_reverse_slot int;
  v_need_red boolean;
  v_required_count int := 0;
  v_forced boolean;
  v_t double precision;
  v_w3 double precision;
  v_w4 double precision;
  v_w5 double precision;
  v_w6 double precision;
  v_total double precision;
  v_r double precision;
  v_rare_letters text[] := array['Q','Z','X','J','K'];
  v_required_rare_count int := 0;
begin
  -- weighted letter pool: rarest 5 weight 1, most common 8 weight 8, remaining 13 weight 4
  foreach v_letter in array array['Q','Z','X','J','K'] loop
    v_pool := v_pool || v_letter;
  end loop;
  foreach v_letter in array array['E','A','R','I','O','T','N','S'] loop
    for v_i in 1..8 loop v_pool := v_pool || v_letter; end loop;
  end loop;
  foreach v_letter in array array['B','C','D','F','G','H','L','M','P','U','V','W','Y'] loop
    for v_i in 1..4 loop v_pool := v_pool || v_letter; end loop;
  end loop;

  -- card count: 3-6, biased toward shorter counts in early rounds, ramping to
  -- fully uniform by round 8 (mirrors the reverse-chance escalation pattern)
  v_t := least(1.0, greatest(0.0, (p_round_number - 1)::double precision / 7));
  v_w3 := 10 - 9 * v_t;
  v_w4 := 6 - 5 * v_t;
  v_w5 := 3 - 2 * v_t;
  v_w6 := 1;
  v_total := v_w3 + v_w4 + v_w5 + v_w6;
  v_r := random() * v_total;
  if v_r < v_w3 then v_count := 3;
  elsif v_r < v_w3 + v_w4 then v_count := 4;
  elsif v_r < v_w3 + v_w4 + v_w5 then v_count := 5;
  else v_count := 6;
  end if;

  -- Roll the reverse special BEFORE assigning letter colors, so we know
  -- which color is "required" (white normally, red when reverse is active)
  -- and can cap it at 3 playable letters while generating, rather than only
  -- being able to check/fix it after the fact.
  if random() * 100 < p_reverse_chance then
    v_reverse_slot := 1 + floor(random() * v_count)::int;
  end if;
  v_need_red := (v_reverse_slot is not null);

  for v_i in 1..v_count loop
    -- The reverse slot doesn't show a letter at all, so it doesn't need one
    -- generated (and doesn't count toward the color cap below).
    if v_i = v_reverse_slot then
      v_values := v_values || ''::text;
      v_reds := v_reds || false;
      continue;
    end if;

    v_tries := 0;
    loop
      v_letter := v_pool[1 + floor(random() * array_length(v_pool, 1))::int];
      -- No duplicate letters anywhere on the board, regardless of color.
      -- The required color is capped at 3 playable cards; once at the cap,
      -- force the non-required color instead.
      if v_required_count >= 3 then
        v_is_red := not v_need_red;
      else
        v_is_red := random() < 0.3;
      end if;
      v_tries := v_tries + 1;
      -- At most one rare letter (Q/Z/X/J/K) is allowed among the required
      -- (must-use) letters — stacking two or more rare consonants into the
      -- must-use set makes forming a real word nearly impossible, since
      -- those letters rarely co-occur in English words regardless of vowels.
      exit when v_tries > 20 or (
        not (v_letter = any(v_used_letters))
        and not (v_is_red = v_need_red and v_letter = any(v_rare_letters) and v_required_rare_count >= 1)
      );
    end loop;
    v_used_letters := v_used_letters || v_letter;
    v_values := v_values || v_letter;
    v_reds := v_reds || v_is_red;
    if v_is_red = v_need_red then
      v_required_count := v_required_count + 1;
      if v_letter = any(v_rare_letters) then
        v_required_rare_count := v_required_rare_count + 1;
      end if;
    end if;
  end loop;

  -- The required color must have at least one surviving letter slot. Force
  -- one if none exists — safe to flip any letter slot's color since letters
  -- are already globally unique, so there's no same-letter red/white
  -- contradiction to worry about (unlike before this rewrite).
  if v_required_count = 0 then
    v_forced := false;
    for v_i in 1..v_count loop
      if v_i is distinct from v_reverse_slot and not v_forced then
        v_reds[v_i] := v_need_red;
        v_forced := true;
      end if;
    end loop;
  end if;

  for v_i in 1..v_count loop
    if v_i = v_reverse_slot then
      v_cards := v_cards || jsonb_build_array(jsonb_build_object('type', 'reverse'));
    else
      v_cards := v_cards || jsonb_build_array(jsonb_build_object('type', 'letter', 'value', v_values[v_i], 'red', v_reds[v_i]));
    end if;
  end loop;

  return v_cards;
end;
$function$;

-- 2b. Start game: validate teams + build the balanced matchup schedule.
--
-- Pairing algorithm (see design notes — the naive "reshuffle both teams each
-- pass" reading breaks fairness: at 2v3 over 2 passes, restarting the
-- smaller team's cycle at each pass boundary can hand the SAME player the
-- extra slot both times, 4 rounds vs their teammate's 2):
--   B = boys, G = girls, M = max(B,G), m = min(B,G)
--   passes = 2 if (B+G <= 6) else 1
--   total  = M * passes
--   larger team:  reshuffled independently EACH pass, concatenated
--                 -> every large-team player appears exactly `passes` times
--   smaller team: shuffled ONCE, then cycled CONTINUOUSLY across all `total`
--                 slots (j % m) -> floor/ceil(total/m) appearances, spread <= 1;
--                 the single up-front shuffle randomises who gets the extras
create or replace function public.wb_start_game(p_code text)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_phase        text;
  v_boys         uuid[];
  v_girls        uuid[];
  v_nb           int;
  v_ng           int;
  v_unteamed     int;
  v_big_is_boys  boolean;
  v_big_src      uuid[];
  v_small_src    uuid[];
  v_m_big        int;
  v_m_small      int;
  v_passes       int;
  v_total        int;
  v_big_seq      uuid[] := '{}';
  v_small_seq    uuid[] := '{}';
  v_pass_shuffle uuid[];
  i int; j int;
begin
  select phase into v_phase from wb_games where code = p_code for update;
  if v_phase is distinct from 'lobby' then return; end if;

  select array_agg(id order by random()) into v_boys
    from wb_players where game_code = p_code and team = 'boys';
  select array_agg(id order by random()) into v_girls
    from wb_players where game_code = p_code and team = 'girls';
  select count(*) into v_unteamed
    from wb_players where game_code = p_code and team is null;

  v_nb := coalesce(array_length(v_boys,  1), 0);
  v_ng := coalesce(array_length(v_girls, 1), 0);

  -- Client disable/hide is UX only; the real minimums are enforced here.
  if v_nb < 2 or v_ng < 2 then
    raise exception 'wb_start_game: need at least 2 per team (boys=%, girls=%)', v_nb, v_ng;
  end if;
  if v_nb + v_ng < 4 then
    raise exception 'wb_start_game: need at least 4 players, got %', v_nb + v_ng;
  end if;
  -- Fail loudly rather than silently dropping a teamless player from the
  -- schedule (e.g. a stale client that joined without picking a side).
  if v_unteamed > 0 then
    raise exception 'wb_start_game: % player(s) have no team', v_unteamed;
  end if;

  v_big_is_boys := (v_nb >= v_ng);
  if v_big_is_boys then
    v_big_src := v_boys;  v_small_src := v_girls;
  else
    v_big_src := v_girls; v_small_src := v_boys;
  end if;
  v_m_big   := greatest(v_nb, v_ng);
  v_m_small := least(v_nb, v_ng);

  -- 2 passes for small groups so 4-6 people get a proper game; 1 otherwise.
  v_passes := case when v_nb + v_ng <= 6 then 2 else 1 end;
  v_total  := v_m_big * v_passes;

  for i in 1..v_passes loop
    select array_agg(x order by random()) into v_pass_shuffle
      from unnest(v_big_src) as t(x);
    v_big_seq := v_big_seq || v_pass_shuffle;
  end loop;

  for j in 0..(v_total - 1) loop
    v_small_seq := v_small_seq || v_small_src[(j % v_m_small) + 1];
  end loop;

  update wb_games
    set phase            = 'playing',
        round_number     = 1,
        matchup_boys     = case when v_big_is_boys then v_big_seq else v_small_seq end,
        matchup_girls    = case when v_big_is_boys then v_small_seq else v_big_seq end,
        boys_score       = 0,
        girls_score      = 0,
        reverse_chance   = 10,
        cards            = wb_generate_cards(10, 1),
        cards_visible_at = now() + interval '3 seconds',
        paused           = false
    where code = p_code and phase = 'lobby';
end;
$function$;

-- 2c. Round result: exactly one winner, +1 to their team. p_round is a
-- fence token — anyone can press "Round Done", so two clients can both
-- confirm the same round; the second call carries a stale p_round and
-- no-ops instead of double-scoring / skipping a matchup.
drop function if exists public.wb_apply_round_result(text, uuid);

create function public.wb_apply_round_result(p_code text, p_winner_id uuid, p_round int)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  g            record;
  v_boy        uuid;
  v_girl       uuid;
  v_boys_d     int := 0;
  v_girls_d    int := 0;
  v_total      int;
  v_next       int;
  v_reverse    int;
begin
  select * into g from wb_games where code = p_code for update;
  if not found or g.phase is distinct from 'playing' then return; end if;

  if p_round is distinct from g.round_number then return; end if;

  v_total := coalesce(array_length(g.matchup_boys, 1), 0);
  if v_total = 0 or g.round_number > v_total then
    update wb_games set phase = 'finished', cards_visible_at = null where code = p_code;
    return;
  end if;

  -- round_number is 1-based and IS the schedule index.
  v_boy  := g.matchup_boys[g.round_number];
  v_girl := g.matchup_girls[g.round_number];

  if    p_winner_id = v_boy  then v_boys_d  := 1;
  elsif p_winner_id = v_girl then v_girls_d := 1;
  else  return;   -- not one of this round's two competitors: ignore
  end if;

  v_next := g.round_number + 1;

  -- Single UPDATE for score + advance so clients get ONE realtime event and
  -- never render "round N with round N's score already bumped".
  if v_next > v_total then
    -- THE ONLY GAME-END CHECK IN THE SCHEMA. The old code duplicated this in
    -- wb_adjust_points; that duplication is gone and must not come back.
    -- The game ends when and only when the matchup schedule is exhausted.
    update wb_games
      set boys_score = boys_score + v_boys_d,
          girls_score = girls_score + v_girls_d,
          phase = 'finished',
          cards_visible_at = null,
          paused = false
      where code = p_code;
  else
    v_reverse := least(g.reverse_chance + 5, 30);
    update wb_games
      set boys_score = boys_score + v_boys_d,
          girls_score = girls_score + v_girls_d,
          round_number = v_next,
          reverse_chance = v_reverse,
          cards = wb_generate_cards(v_reverse, v_next),
          cards_visible_at = now() + interval '3 seconds',
          paused = false
      where code = p_code;
  end if;
end;
$function$;

-- 2d. Manual team-score correction — replaces wb_adjust_points. Deliberately
-- NO game-end / phase-transition logic: nudging a score never starts, ends,
-- or un-ends a game (the old wb_adjust_points duplicated the elimination
-- check from the round-result RPC; that duplication is not reintroduced).
drop function if exists public.wb_adjust_points(text, uuid, int);

create function public.wb_adjust_team_score(p_code text, p_team text, p_delta int)
returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if p_team not in ('boys','girls') then return; end if;
  update wb_games
    set boys_score  = greatest(boys_score  + case when p_team='boys'  then p_delta else 0 end, 0),
        girls_score = greatest(girls_score + case when p_team='girls' then p_delta else 0 end, 0)
    where code = p_code and phase in ('playing','finished');
end;
$function$;

-- 2e. Change Genders — lobby-only. There is no UPDATE policy on wb_players
-- (only read/insert/delete), so a client-side `.update({team})` would
-- silently affect 0 rows; this SECURITY DEFINER RPC is required, and also
-- lets us refuse team changes once the schedule is built (phase <> 'lobby'),
-- which closes off "teams change mid-game" by construction. Do NOT add a
-- blanket UPDATE policy on wb_players to work around this — that would let
-- any client rewrite names and teams mid-game too.
create function public.wb_set_team(p_code text, p_player_id uuid, p_team text)
returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if p_team not in ('boys','girls') then return; end if;
  update wb_players p
    set team = p_team
    where p.id = p_player_id
      and p.game_code = p_code
      and exists (select 1 from wb_games g where g.code = p_code and g.phase = 'lobby');
end;
$function$;

-- 2f. Reset to lobby — teams PERSIST (matches sibling games): players stay
-- on the side they picked and can still hit "Change Genders" in the lobby.
create or replace function public.wb_reset_to_lobby(p_code text)
returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  update wb_games
    set phase = 'lobby', round_number = 0,
        cards = '[]'::jsonb, cards_visible_at = null,
        reverse_chance = 10, paused = false,
        boys_score = 0, girls_score = 0,
        matchup_boys = '{}', matchup_girls = '{}'
    where code = p_code;
end;
$function$;

-- 2g. Redeal cards — drop the accent arg from the wb_generate_cards call.
-- Must NOT touch round_number: it is the matchup schedule index.
create or replace function public.wb_redeal_cards(p_code text)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_reverse int; v_round int;
begin
  select reverse_chance, round_number into v_reverse, v_round
    from wb_games where code = p_code and phase = 'playing';
  if v_reverse is null then return; end if;
  update wb_games
    set cards = wb_generate_cards(v_reverse, v_round),
        cards_visible_at = now() + interval '3 seconds'
    where code = p_code and phase = 'playing';
end;
$function$;

-- 2h. Drop entirely — no longer part of the game.
drop function if exists public.wb_set_starting_points(text, int);

-- ============================================================
-- 3. Drop dead columns (after every function above stopped referencing them)
-- ============================================================
alter table public.wb_players drop column points;
alter table public.wb_players drop column is_eliminated;
alter table public.wb_games   drop column starting_points;
alter table public.wb_games   drop column winner_id;
alter table public.wb_games   drop column accent_chance;   -- was already vestigial

commit;

-- ============================================================
-- Migration 2 — pre-round ready gate + mutual New-Letters confirmation
-- Applied live on top of the migration above. Redefines wb_start_game and
-- wb_apply_round_result (CREATE OR REPLACE, same signatures) so cards are
-- dealt but stay hidden (cards_visible_at null) until both of that round's
-- competitors call wb_mark_ready. New Letters now requires the OTHER
-- competitor's approval via wb_request_redeal / wb_respond_redeal instead
-- of being unilateral.
-- ============================================================
begin;

alter table public.wb_games add column redeal_pending_by uuid;
alter table public.wb_games add column round_ready_ids uuid[] not null default '{}';

create or replace function public.wb_mark_ready(p_code text, p_player_id uuid)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  g record;
  v_boy uuid; v_girl uuid;
  v_ready uuid[];
begin
  select * into g from wb_games where code = p_code for update;
  if not found or g.phase is distinct from 'playing' then return; end if;
  if g.cards_visible_at is not null then return; end if;  -- already started

  v_boy  := g.matchup_boys[g.round_number];
  v_girl := g.matchup_girls[g.round_number];
  if p_player_id is distinct from v_boy and p_player_id is distinct from v_girl then return; end if;

  v_ready := g.round_ready_ids;
  if not (p_player_id = any(v_ready)) then
    v_ready := v_ready || p_player_id;
  end if;

  if v_boy = any(v_ready) and v_girl = any(v_ready) then
    update wb_games set round_ready_ids = v_ready, cards_visible_at = now() + interval '3 seconds' where code = p_code;
  else
    update wb_games set round_ready_ids = v_ready where code = p_code;
  end if;
end;
$function$;

create or replace function public.wb_start_game(p_code text)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_phase        text;
  v_boys         uuid[];
  v_girls        uuid[];
  v_nb           int;
  v_ng           int;
  v_unteamed     int;
  v_big_is_boys  boolean;
  v_big_src      uuid[];
  v_small_src    uuid[];
  v_m_big        int;
  v_m_small      int;
  v_passes       int;
  v_total        int;
  v_big_seq      uuid[] := '{}';
  v_small_seq    uuid[] := '{}';
  v_pass_shuffle uuid[];
  i int; j int;
begin
  select phase into v_phase from wb_games where code = p_code for update;
  if v_phase is distinct from 'lobby' then return; end if;

  select array_agg(id order by random()) into v_boys
    from wb_players where game_code = p_code and team = 'boys';
  select array_agg(id order by random()) into v_girls
    from wb_players where game_code = p_code and team = 'girls';
  select count(*) into v_unteamed
    from wb_players where game_code = p_code and team is null;

  v_nb := coalesce(array_length(v_boys,  1), 0);
  v_ng := coalesce(array_length(v_girls, 1), 0);

  if v_nb < 2 or v_ng < 2 then
    raise exception 'wb_start_game: need at least 2 per team (boys=%, girls=%)', v_nb, v_ng;
  end if;
  if v_nb + v_ng < 4 then
    raise exception 'wb_start_game: need at least 4 players, got %', v_nb + v_ng;
  end if;
  if v_unteamed > 0 then
    raise exception 'wb_start_game: % player(s) have no team', v_unteamed;
  end if;

  v_big_is_boys := (v_nb >= v_ng);
  if v_big_is_boys then
    v_big_src := v_boys;  v_small_src := v_girls;
  else
    v_big_src := v_girls; v_small_src := v_boys;
  end if;
  v_m_big   := greatest(v_nb, v_ng);
  v_m_small := least(v_nb, v_ng);

  v_passes := case when v_nb + v_ng <= 6 then 2 else 1 end;
  v_total  := v_m_big * v_passes;

  for i in 1..v_passes loop
    select array_agg(x order by random()) into v_pass_shuffle
      from unnest(v_big_src) as t(x);
    v_big_seq := v_big_seq || v_pass_shuffle;
  end loop;

  for j in 0..(v_total - 1) loop
    v_small_seq := v_small_seq || v_small_src[(j % v_m_small) + 1];
  end loop;

  update wb_games
    set phase            = 'playing',
        round_number     = 1,
        matchup_boys     = case when v_big_is_boys then v_big_seq else v_small_seq end,
        matchup_girls    = case when v_big_is_boys then v_small_seq else v_big_seq end,
        boys_score       = 0,
        girls_score      = 0,
        reverse_chance   = 10,
        cards            = wb_generate_cards(10, 1),
        cards_visible_at = null,
        round_ready_ids  = '{}',
        redeal_pending_by = null,
        paused           = false
    where code = p_code and phase = 'lobby';
end;
$function$;

create or replace function public.wb_apply_round_result(p_code text, p_winner_id uuid, p_round int)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  g            record;
  v_boy        uuid;
  v_girl       uuid;
  v_boys_d     int := 0;
  v_girls_d    int := 0;
  v_total      int;
  v_next       int;
  v_reverse    int;
begin
  select * into g from wb_games where code = p_code for update;
  if not found or g.phase is distinct from 'playing' then return; end if;

  if p_round is distinct from g.round_number then return; end if;

  v_total := coalesce(array_length(g.matchup_boys, 1), 0);
  if v_total = 0 or g.round_number > v_total then
    update wb_games set phase = 'finished', cards_visible_at = null where code = p_code;
    return;
  end if;

  v_boy  := g.matchup_boys[g.round_number];
  v_girl := g.matchup_girls[g.round_number];

  if    p_winner_id = v_boy  then v_boys_d  := 1;
  elsif p_winner_id = v_girl then v_girls_d := 1;
  else  return;
  end if;

  v_next := g.round_number + 1;

  if v_next > v_total then
    update wb_games
      set boys_score = boys_score + v_boys_d,
          girls_score = girls_score + v_girls_d,
          phase = 'finished',
          cards_visible_at = null,
          paused = false
      where code = p_code;
  else
    v_reverse := least(g.reverse_chance + 5, 30);
    update wb_games
      set boys_score = boys_score + v_boys_d,
          girls_score = girls_score + v_girls_d,
          round_number = v_next,
          reverse_chance = v_reverse,
          cards = wb_generate_cards(v_reverse, v_next),
          cards_visible_at = null,
          round_ready_ids = '{}',
          redeal_pending_by = null,
          paused = false
      where code = p_code;
  end if;
end;
$function$;

-- New Letters now requires the OTHER competitor's approval.
create or replace function public.wb_request_redeal(p_code text, p_player_id uuid)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  g record; v_boy uuid; v_girl uuid;
begin
  select * into g from wb_games where code = p_code for update;
  if not found or g.phase is distinct from 'playing' then return; end if;
  if g.redeal_pending_by is not null then return; end if;  -- one request at a time

  v_boy  := g.matchup_boys[g.round_number];
  v_girl := g.matchup_girls[g.round_number];
  if p_player_id is distinct from v_boy and p_player_id is distinct from v_girl then return; end if;

  update wb_games set redeal_pending_by = p_player_id where code = p_code;
end;
$function$;

create or replace function public.wb_respond_redeal(p_code text, p_player_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  g record; v_boy uuid; v_girl uuid;
begin
  select * into g from wb_games where code = p_code for update;
  if not found or g.redeal_pending_by is null then return; end if;

  v_boy  := g.matchup_boys[g.round_number];
  v_girl := g.matchup_girls[g.round_number];
  -- Only the OTHER competitor (not the requester) can respond.
  if p_player_id = g.redeal_pending_by then return; end if;
  if p_player_id is distinct from v_boy and p_player_id is distinct from v_girl then return; end if;

  if p_accept then
    update wb_games
      set cards = wb_generate_cards(g.reverse_chance, g.round_number),
          cards_visible_at = now() + interval '3 seconds',
          redeal_pending_by = null
      where code = p_code;
  else
    update wb_games set redeal_pending_by = null where code = p_code;
  end if;
end;
$function$;

commit;

-- ============================================================
-- Migration 3 — mutual Round-Result confirmation (any player proposes who
-- won; all OTHER players race to confirm/decline, first response wins, same
-- model as the mutual New-Letters confirmation above) + a redeal_countdown
-- flag so the client can tell "get ready for next round" apart from "new
-- letters incoming" during the shared 3s cards_visible_at countdown.
-- Applied live on top of Migration 2.
-- ============================================================
begin;

alter table public.wb_games add column round_result_pending_by uuid;
alter table public.wb_games add column round_result_pending_winner uuid;
alter table public.wb_games add column redeal_countdown boolean not null default false;

-- Round result: exactly one winner, +1 to their team. p_round is a fence
-- token. Now also clears any pending round-result proposal, and always
-- resets redeal_countdown to false since this transition is never a redeal.
create or replace function public.wb_apply_round_result(p_code text, p_winner_id uuid, p_round int)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  g            record;
  v_boy        uuid;
  v_girl       uuid;
  v_boys_d     int := 0;
  v_girls_d    int := 0;
  v_total      int;
  v_next       int;
  v_reverse    int;
begin
  select * into g from wb_games where code = p_code for update;
  if not found or g.phase is distinct from 'playing' then return; end if;

  if p_round is distinct from g.round_number then return; end if;

  v_total := coalesce(array_length(g.matchup_boys, 1), 0);
  if v_total = 0 or g.round_number > v_total then
    update wb_games
      set phase = 'finished', cards_visible_at = null,
          round_result_pending_by = null, round_result_pending_winner = null
      where code = p_code;
    return;
  end if;

  v_boy  := g.matchup_boys[g.round_number];
  v_girl := g.matchup_girls[g.round_number];

  if    p_winner_id = v_boy  then v_boys_d  := 1;
  elsif p_winner_id = v_girl then v_girls_d := 1;
  else  return;
  end if;

  v_next := g.round_number + 1;

  if v_next > v_total then
    update wb_games
      set boys_score = boys_score + v_boys_d,
          girls_score = girls_score + v_girls_d,
          phase = 'finished',
          cards_visible_at = null,
          paused = false,
          round_result_pending_by = null,
          round_result_pending_winner = null
      where code = p_code;
  else
    v_reverse := least(g.reverse_chance + 5, 30);
    update wb_games
      set boys_score = boys_score + v_boys_d,
          girls_score = girls_score + v_girls_d,
          round_number = v_next,
          reverse_chance = v_reverse,
          cards = wb_generate_cards(v_reverse, v_next),
          cards_visible_at = null,
          round_ready_ids = '{}',
          redeal_pending_by = null,
          redeal_countdown = false,
          paused = false,
          round_result_pending_by = null,
          round_result_pending_winner = null
      where code = p_code;
  end if;
end;
$function$;

-- Ready-gate countdown is never a redeal.
create or replace function public.wb_mark_ready(p_code text, p_player_id uuid)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  g record;
  v_boy uuid; v_girl uuid;
  v_ready uuid[];
begin
  select * into g from wb_games where code = p_code for update;
  if not found or g.phase is distinct from 'playing' then return; end if;
  if g.cards_visible_at is not null then return; end if;  -- already started

  v_boy  := g.matchup_boys[g.round_number];
  v_girl := g.matchup_girls[g.round_number];
  if p_player_id is distinct from v_boy and p_player_id is distinct from v_girl then return; end if;

  v_ready := g.round_ready_ids;
  if not (p_player_id = any(v_ready)) then
    v_ready := v_ready || p_player_id;
  end if;

  if v_boy = any(v_ready) and v_girl = any(v_ready) then
    update wb_games
      set round_ready_ids = v_ready, cards_visible_at = now() + interval '3 seconds', redeal_countdown = false
      where code = p_code;
  else
    update wb_games set round_ready_ids = v_ready where code = p_code;
  end if;
end;
$function$;

-- New Letters countdown IS a redeal.
create or replace function public.wb_respond_redeal(p_code text, p_player_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  g record; v_boy uuid; v_girl uuid;
begin
  select * into g from wb_games where code = p_code for update;
  if not found or g.redeal_pending_by is null then return; end if;

  v_boy  := g.matchup_boys[g.round_number];
  v_girl := g.matchup_girls[g.round_number];
  -- Only the OTHER competitor (not the requester) can respond.
  if p_player_id = g.redeal_pending_by then return; end if;
  if p_player_id is distinct from v_boy and p_player_id is distinct from v_girl then return; end if;

  if p_accept then
    update wb_games
      set cards = wb_generate_cards(g.reverse_chance, g.round_number),
          cards_visible_at = now() + interval '3 seconds',
          redeal_pending_by = null,
          redeal_countdown = true
      where code = p_code;
  else
    update wb_games set redeal_pending_by = null where code = p_code;
  end if;
end;
$function$;

-- Propose a round result — any player may propose (matches the existing
-- "anyone can press Round Done" rule). One proposal pending at a time.
create function public.wb_propose_round_result(p_code text, p_player_id uuid, p_winner_id uuid, p_round int)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare g record; v_boy uuid; v_girl uuid;
begin
  select * into g from wb_games where code = p_code for update;
  if not found or g.phase is distinct from 'playing' then return; end if;
  if p_round is distinct from g.round_number then return; end if;
  if g.round_result_pending_by is not null then return; end if;

  v_boy  := g.matchup_boys[g.round_number];
  v_girl := g.matchup_girls[g.round_number];
  if p_winner_id is distinct from v_boy and p_winner_id is distinct from v_girl then return; end if;

  update wb_games
    set round_result_pending_by = p_player_id, round_result_pending_winner = p_winner_id
    where code = p_code;
end;
$function$;

-- Respond to a pending round-result proposal — any player OTHER than the
-- proposer may respond; first response wins (accept applies the result via
-- wb_apply_round_result, decline just clears the pending proposal).
create function public.wb_respond_round_result(p_code text, p_player_id uuid, p_accept boolean, p_round int)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare g record;
begin
  select * into g from wb_games where code = p_code for update;
  if not found or g.round_result_pending_by is null then return; end if;
  if p_round is distinct from g.round_number then return; end if;
  if p_player_id = g.round_result_pending_by then return; end if;

  if p_accept then
    perform wb_apply_round_result(p_code, g.round_result_pending_winner, p_round);
  else
    update wb_games
      set round_result_pending_by = null, round_result_pending_winner = null
      where code = p_code;
  end if;
end;
$function$;

commit;
