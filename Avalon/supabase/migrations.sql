-- ============================================================
-- Avalon: tables
-- ============================================================

create table if not exists public.avalon_games (
  code          text        primary key,
  phase         text        not null default 'lobby',
  -- lobby | role_reveal | propose | vote | mission | result | assassination | finished
  player_count  int,
  quest_number  int         not null default 1,   -- 1-5
  reject_count  int         not null default 0,   -- consecutive rejections
  leader_id     uuid,
  proposed_ids  uuid[]      not null default '{}',
  quest_results text[]      not null default '{}', -- 'success'|'fail' per quest
  winning_team  text,                               -- 'good'|'evil'
  created_at    timestamptz not null default now()
);

create table if not exists public.avalon_players (
  id             uuid        primary key default gen_random_uuid(),
  game_code      text        not null references public.avalon_games(code) on delete cascade,
  name           text        not null,
  first_name     text,
  last_name      text,
  role           text,   -- merlin|percival|loyal|assassin|morgana|minion
  team           text,   -- good|evil
  seat           int,    -- turn order (1..n)
  submitted_card text,   -- null|success|fail (current mission only)
  created_at     timestamptz not null default now()
);

-- RLS: allow all (party game, server-side logic enforces rules)
alter table public.avalon_games  enable row level security;
alter table public.avalon_players enable row level security;

create policy "allow all" on public.avalon_games  for all using (true) with check (true);
create policy "allow all" on public.avalon_players for all using (true) with check (true);

-- ============================================================
-- start_avalon_game: assign roles, seats, set phase = role_reveal
-- ============================================================
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

  -- Build roles array
  roles := array['assassin', 'morgana'];
  for i in 3..evil_n loop roles := roles || 'minion'::text; end loop;
  roles := roles || 'merlin'::text || 'percival'::text;
  for i in 3..good_n loop roles := roles || 'loyal'::text; end loop;

  -- Fisher-Yates shuffle roles
  for i in reverse n..2 loop
    j := floor(random() * i + 1)::int;
    tmp_text := roles[i]; roles[i] := roles[j]; roles[j] := tmp_text;
  end loop;

  -- Build seats 1..n then shuffle
  seats := array[]::int[];
  for i in 1..n loop seats := seats || i; end loop;
  for i in reverse n..2 loop
    j := floor(random() * i + 1)::int;
    tmp_int := seats[i]; seats[i] := seats[j]; seats[j] := tmp_int;
  end loop;

  -- Assign roles, teams, seats to players
  for i in 1..n loop
    update public.avalon_players set
      role           = roles[i],
      team           = case when roles[i] in ('assassin', 'morgana', 'minion') then 'evil' else 'good' end,
      seat           = seats[i],
      submitted_card = null
    where id = pids[i];
  end loop;

  -- Leader is the player assigned seat 1
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
    winning_team  = null
  where code = p_code;
end;
$$;

-- ============================================================
-- begin_avalon_quests: role_reveal -> propose
-- ============================================================
create or replace function public.begin_avalon_quests(p_code text)
returns void language plpgsql security definer as $$
begin
  update public.avalon_games set phase = 'propose'
  where code = p_code and phase = 'role_reveal';
end;
$$;

-- ============================================================
-- submit_avalon_proposal: leader picks team, propose -> vote
-- ============================================================
create or replace function public.submit_avalon_proposal(
  p_code       text,
  p_leader_id  uuid,
  p_player_ids uuid[]
)
returns void language plpgsql security definer as $$
declare
  g          record;
  quest_sizes int[];
  quest_size  int;
begin
  select * into g from public.avalon_games where code = p_code and phase = 'propose' for update;
  if not found then return; end if;
  if g.leader_id <> p_leader_id then return; end if;

  quest_sizes := case g.player_count
    when 5  then array[2,3,2,3,3]
    when 6  then array[2,3,4,3,4]
    when 7  then array[2,3,3,4,4]
    when 8  then array[3,4,4,5,5]
    when 9  then array[3,4,4,5,5]
    when 10 then array[3,4,4,5,5]
    else array[2,3,2,3,3]
  end;
  quest_size := quest_sizes[g.quest_number];

  if coalesce(array_length(p_player_ids, 1), 0) <> quest_size then return; end if;

  update public.avalon_games set
    proposed_ids = p_player_ids,
    phase        = 'vote'
  where code = p_code;
end;
$$;

-- ============================================================
-- resolve_avalon_vote: leader records in-person vote result
-- ============================================================
create or replace function public.resolve_avalon_vote(
  p_code     text,
  p_approved bool
)
returns void language plpgsql security definer as $$
declare
  g           record;
  cur_seat    int;
  next_seat   int;
  next_leader uuid;
begin
  select * into g from public.avalon_games where code = p_code and phase = 'vote' for update;
  if not found then return; end if;

  if not p_approved then
    if g.reject_count + 1 >= 5 then
      update public.avalon_games set phase = 'finished', winning_team = 'evil' where code = p_code;
      return;
    end if;

    select seat into cur_seat from public.avalon_players where id = g.leader_id;
    next_seat := (cur_seat % g.player_count) + 1;
    select id into next_leader
    from public.avalon_players where game_code = p_code and seat = next_seat;

    update public.avalon_games set
      reject_count = reject_count + 1,
      leader_id    = next_leader,
      proposed_ids = '{}',
      phase        = 'propose'
    where code = p_code;
    return;
  end if;

  -- Approved: clear cards and move to mission
  update public.avalon_players set submitted_card = null where game_code = p_code;
  update public.avalon_games set phase = 'mission' where code = p_code;
end;
$$;

-- ============================================================
-- submit_avalon_card: mission member plays a card
-- auto-advances to result when all proposed players submit
-- ============================================================
create or replace function public.submit_avalon_card(
  p_code      text,
  p_player_id uuid,
  p_card      text   -- 'success' or 'fail'
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

  -- Good players can only succeed
  if p.team = 'good' then p_card := 'success'; end if;
  if p_card not in ('success', 'fail') then return; end if;

  update public.avalon_players set submitted_card = p_card where id = p_player_id;

  quest_size := array_length(g.proposed_ids, 1);
  select count(*) into submitted_n
  from public.avalon_players
  where game_code = p_code and id = any(g.proposed_ids) and submitted_card is not null;

  -- +1 for the card we just inserted (count may not have flushed yet)
  if submitted_n < quest_size then return; end if;

  -- All submitted: count fails
  select count(*) into fail_n
  from public.avalon_players
  where game_code = p_code and id = any(g.proposed_ids) and submitted_card = 'fail';

  min_fails := 1;
  if g.quest_number = 4 and g.player_count >= 7 then min_fails := 2; end if;

  result := case when fail_n >= min_fails then 'fail' else 'success' end;

  update public.avalon_games set
    phase         = 'result',
    quest_results = quest_results || result
  where code = p_code;
end;
$$;

-- ============================================================
-- advance_avalon_quest: result -> next propose / assassination / finished
-- ============================================================
create or replace function public.advance_avalon_quest(p_code text)
returns void language plpgsql security definer as $$
declare
  g           record;
  good_wins   int;
  evil_wins   int;
  cur_seat    int;
  next_seat   int;
  next_leader uuid;
begin
  select * into g from public.avalon_games where code = p_code and phase = 'result' for update;
  if not found then return; end if;

  good_wins := (select count(*) from unnest(g.quest_results) r where r = 'success');
  evil_wins := (select count(*) from unnest(g.quest_results) r where r = 'fail');

  if good_wins >= 3 then
    update public.avalon_games set phase = 'assassination' where code = p_code;
    return;
  end if;

  if evil_wins >= 3 then
    update public.avalon_games set phase = 'finished', winning_team = 'evil' where code = p_code;
    return;
  end if;

  -- Next quest
  select seat into cur_seat from public.avalon_players where id = g.leader_id;
  next_seat := (cur_seat % g.player_count) + 1;
  select id into next_leader
  from public.avalon_players where game_code = p_code and seat = next_seat;

  update public.avalon_players set submitted_card = null where game_code = p_code;

  update public.avalon_games set
    phase         = 'propose',
    quest_number  = quest_number + 1,
    reject_count  = 0,
    leader_id     = next_leader,
    proposed_ids  = '{}'
  where code = p_code;
end;
$$;

-- ============================================================
-- submit_avalon_assassination: assassin picks target
-- ============================================================
create or replace function public.submit_avalon_assassination(
  p_code      text,
  p_target_id uuid
)
returns void language plpgsql security definer as $$
declare
  target_role text;
begin
  perform 1 from public.avalon_games where code = p_code and phase = 'assassination' for update;
  if not found then return; end if;

  select role into target_role
  from public.avalon_players where id = p_target_id and game_code = p_code;
  if not found then return; end if;

  if target_role = 'merlin' then
    update public.avalon_games set phase = 'finished', winning_team = 'evil' where code = p_code;
  else
    update public.avalon_games set phase = 'finished', winning_team = 'good' where code = p_code;
  end if;
end;
$$;
