-- ============================================================
-- Run all of these together in the Supabase SQL editor.
-- ============================================================

-- 1. Add ready column to players (role reveal flow)
alter table public.avalon_players
  add column if not exists ready boolean not null default false;

-- 2. Add reveal_at column to games (synchronized card reveal)
alter table public.avalon_games
  add column if not exists reveal_at timestamptz;

-- 3. start_avalon_game: only Merlin + Assassin as specials, reset ready
create or replace function public.start_avalon_game(p_code text)
returns void language plpgsql security definer as $$
declare
  pids         uuid[];
  n            int;
  good_n       int;
  evil_n       int;
  roles        text[];
  seats        int[];
  i            int;
  j            int;
  tmp_text     text;
  tmp_int      int;
  first_leader uuid;
begin
  perform 1 from public.avalon_games where code = p_code and phase = 'lobby' for update;
  if not found then return; end if;

  select array_agg(id order by created_at) into pids
  from public.avalon_players where game_code = p_code;
  n := coalesce(array_length(pids, 1), 0);
  if n < 5 or n > 10 then return; end if;

  case n
    when 5  then good_n := 3; evil_n := 2;
    when 6  then good_n := 4; evil_n := 2;
    when 7  then good_n := 4; evil_n := 3;
    when 8  then good_n := 5; evil_n := 3;
    when 9  then good_n := 6; evil_n := 3;
    when 10 then good_n := 6; evil_n := 4;
  end case;

  -- Assassin + (evil_n-1) generic minions; Merlin + (good_n-1) loyal servants
  roles := array['assassin'];
  for i in 2..evil_n loop roles := roles || 'minion'::text; end loop;
  roles := roles || 'merlin'::text;
  for i in 2..good_n loop roles := roles || 'loyal'::text; end loop;

  for i in reverse n..2 loop
    j := floor(random() * i + 1)::int;
    tmp_text := roles[i]; roles[i] := roles[j]; roles[j] := tmp_text;
  end loop;

  seats := array[]::int[];
  for i in 1..n loop seats := seats || i; end loop;
  for i in reverse n..2 loop
    j := floor(random() * i + 1)::int;
    tmp_int := seats[i]; seats[i] := seats[j]; seats[j] := tmp_int;
  end loop;

  for i in 1..n loop
    update public.avalon_players set
      role           = roles[i],
      team           = case when roles[i] in ('assassin', 'minion') then 'evil' else 'good' end,
      seat           = seats[i],
      submitted_card = null,
      ready          = false
    where id = pids[i];
  end loop;

  select id into first_leader
  from public.avalon_players where game_code = p_code and seat = 1;

  update public.avalon_games set
    phase         = 'role_reveal',
    player_count  = n,
    quest_number  = 1,
    reject_count  = 0,
    leader_id     = first_leader,
    proposed_ids  = '{}',
    quest_results = '{}',
    winning_team  = null,
    reveal_at     = null
  where code = p_code;
end;
$$;

-- 4. mark_avalon_ready: player marks ready; auto-advances when all ready
create or replace function public.mark_avalon_ready(p_code text, p_player_id uuid)
returns void language plpgsql security definer as $$
declare
  total_n int;
  ready_n int;
begin
  perform 1 from public.avalon_games where code = p_code and phase = 'role_reveal' for update;
  if not found then return; end if;

  update public.avalon_players set ready = true
  where id = p_player_id and game_code = p_code;

  select count(*) into total_n from public.avalon_players where game_code = p_code;
  select count(*) into ready_n from public.avalon_players where game_code = p_code and ready = true;

  if ready_n >= total_n then
    update public.avalon_games set phase = 'propose' where code = p_code;
  end if;
end;
$$;

-- 5. submit_avalon_card: set reveal_at 2s in future when advancing to result
--    (all clients wait for that timestamp before playing the flip animation)
create or replace function public.submit_avalon_card(
  p_code      text,
  p_player_id uuid,
  p_card      text
)
returns void language plpgsql security definer as $$
declare
  g            record;
  p            record;
  submitted_n  int;
  quest_size   int;
  fail_n       int;
  min_fails    int;
  result       text;
begin
  select * into g from public.avalon_games where code = p_code and phase = 'mission' for update;
  if not found then return; end if;

  select * into p from public.avalon_players
  where id = p_player_id and game_code = p_code;
  if not found then return; end if;
  if not (p_player_id = any(g.proposed_ids)) then return; end if;
  if p.submitted_card is not null then return; end if;

  if p.team = 'good' then p_card := 'success'; end if;
  if p_card not in ('success', 'fail') then return; end if;

  update public.avalon_players set submitted_card = p_card where id = p_player_id;

  quest_size := array_length(g.proposed_ids, 1);
  select count(*) into submitted_n
  from public.avalon_players
  where game_code = p_code and id = any(g.proposed_ids) and submitted_card is not null;

  if submitted_n < quest_size then return; end if;

  select count(*) into fail_n
  from public.avalon_players
  where game_code = p_code and id = any(g.proposed_ids) and submitted_card = 'fail';

  min_fails := 1;
  if g.quest_number = 4 and g.player_count >= 7 then min_fails := 2; end if;

  result := case when fail_n >= min_fails then 'fail' else 'success' end;

  update public.avalon_games set
    phase         = 'result',
    quest_results = quest_results || result,
    reveal_at     = now() + interval '2 seconds'
  where code = p_code;
end;
$$;
