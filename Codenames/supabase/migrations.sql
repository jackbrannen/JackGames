-- ============================================================
-- Codenames: tables
-- ============================================================

create table if not exists public.codenames_games (
  code                  text        primary key,
  phase                 text        not null default 'lobby',  -- lobby | play | finished
  turn_team             text,                                   -- red | blue
  turn_phase            text        not null default 'clue',   -- clue | guess
  current_clue_word     text,
  current_clue_number   int,
  guesses_used          int         not null default 0,
  first_turn_team       text        not null default 'red',
  winning_team          text,                                   -- red | blue
  turn_selected_card_id uuid,
  last_used_words       text[]      not null default '{}',
  created_at            timestamptz not null default now()
);

create table if not exists public.codenames_players (
  id           uuid        primary key default gen_random_uuid(),
  game_code    text        not null references public.codenames_games(code) on delete cascade,
  name         text        not null,
  first_name   text,
  last_name    text,
  team         text,                    -- red | blue | null (not yet chosen)
  is_cluegiver bool        not null default false,
  ready        bool        not null default false,
  created_at   timestamptz not null default now()
);

create table if not exists public.codenames_cards (
  id         uuid        primary key default gen_random_uuid(),
  game_code  text        not null references public.codenames_games(code) on delete cascade,
  word       text        not null,
  position   int         not null,   -- 0-24
  color      text        not null,   -- red | blue | black | tan
  revealed   bool        not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Set a player as cluegiver (enforces one per team)
-- ============================================================
create or replace function public.set_codenames_cluegiver(
  p_code        text,
  p_player_id   uuid,
  p_is_cluegiver bool
)
returns void language plpgsql security definer as $$
declare
  p_team text;
begin
  select team into p_team
  from public.codenames_players
  where id = p_player_id and game_code = p_code;

  if not found or p_team is null then return; end if;

  if p_is_cluegiver then
    -- Clear any existing cluegiver on this team first
    update public.codenames_players
    set is_cluegiver = false
    where game_code = p_code and team = p_team and is_cluegiver = true;
    -- Set this player
    update public.codenames_players
    set is_cluegiver = true
    where id = p_player_id;
  else
    update public.codenames_players
    set is_cluegiver = false
    where id = p_player_id;
  end if;
end;
$$;

-- ============================================================
-- Start game: assign colors to words, create card rows
-- p_words: exactly 25 words chosen by the client
-- ============================================================
create or replace function public.start_codenames_game(
  p_code  text,
  p_words text[]
)
returns void language plpgsql security definer as $$
declare
  g          record;
  colors     text[] := array[]::text[];
  tmp        text;
  i          int;
  j          int;
  red_count  int;
  blue_count int;
begin
  select * into g from public.codenames_games where code = p_code for update;
  if not found or g.phase not in ('lobby', 'finished') then return; end if;
  if array_length(p_words, 1) <> 25 then return; end if;

  -- Determine card counts based on who goes first
  if g.first_turn_team = 'red' then
    red_count  := 9; blue_count := 8;
  else
    red_count  := 8; blue_count := 9;
  end if;

  -- Build color array: red × N, blue × N, 1 black, 7 tan
  for i in 1..red_count  loop colors := colors || 'red'::text;   end loop;
  for i in 1..blue_count loop colors := colors || 'blue'::text;  end loop;
  colors := colors || 'black'::text;
  for i in 1..7          loop colors := colors || 'tan'::text;   end loop;

  -- Fisher-Yates shuffle
  for i in 1..25 loop
    j := floor(random() * (26 - i) + i)::int;
    if i <> j then
      tmp := colors[i]; colors[i] := colors[j]; colors[j] := tmp;
    end if;
  end loop;

  -- Replace old cards
  delete from public.codenames_cards where game_code = p_code;
  for i in 1..25 loop
    insert into public.codenames_cards (game_code, word, position, color)
    values (p_code, p_words[i], i - 1, colors[i]);
  end loop;

  -- Update game state
  update public.codenames_games set
    phase               = 'play',
    turn_team           = g.first_turn_team,
    turn_phase          = 'clue',
    current_clue_word   = null,
    current_clue_number = null,
    guesses_used        = 0,
    winning_team        = null,
    turn_selected_card_id = null,
    last_used_words     = p_words
  where code = p_code;
end;
$$;

-- ============================================================
-- Cluegiver submits a clue word + number
-- ============================================================
create or replace function public.submit_codenames_clue(
  p_code      text,
  p_player_id uuid,
  p_word      text,
  p_number    int
)
returns void language plpgsql security definer as $$
declare
  g record;
  p_team text;
begin
  select * into g from public.codenames_games where code = p_code for update;
  if not found or g.phase <> 'play' or g.turn_phase <> 'clue' then return; end if;

  -- Must be the cluegiver of the current turn team
  select team into p_team
  from public.codenames_players
  where id = p_player_id and game_code = p_code and is_cluegiver = true;
  if not found or p_team <> g.turn_team then return; end if;

  if p_number < 1 or p_number > 9 then return; end if;

  update public.codenames_games set
    current_clue_word   = upper(trim(p_word)),
    current_clue_number = p_number,
    guesses_used        = 0,
    turn_phase          = 'guess',
    turn_selected_card_id = null
  where code = p_code;
end;
$$;

-- ============================================================
-- Active team submits the currently-selected card as a guess
-- ============================================================
create or replace function public.submit_codenames_guess(
  p_code      text,
  p_player_id uuid
)
returns void language plpgsql security definer as $$
declare
  g          record;
  card       record;
  p_team     text;
  other_team text;
  team_total int;
  team_revealed int;
begin
  select * into g from public.codenames_games where code = p_code for update;
  if not found or g.phase <> 'play' or g.turn_phase <> 'guess' then return; end if;
  if g.turn_selected_card_id is null then return; end if;

  -- Validate: player is on active team and NOT the cluegiver
  select team into p_team
  from public.codenames_players
  where id = p_player_id and game_code = p_code and is_cluegiver = false;
  if not found or p_team <> g.turn_team then return; end if;

  -- Get the card (must be unrevealed)
  select * into card
  from public.codenames_cards
  where id = g.turn_selected_card_id and game_code = p_code and revealed = false;
  if not found then return; end if;

  -- Reveal it and clear selection
  update public.codenames_cards set revealed = true where id = card.id;
  update public.codenames_games set turn_selected_card_id = null where code = p_code;

  other_team := case when g.turn_team = 'red' then 'blue' else 'red' end;

  -- Black card: current team loses instantly
  if card.color = 'black' then
    update public.codenames_games set
      phase        = 'finished',
      winning_team = other_team
    where code = p_code;
    return;
  end if;

  -- Wrong color (other team's card or tan): end turn
  if card.color = other_team or card.color = 'tan' then
    -- Check if the other team just won by having their last card revealed
    if card.color = other_team then
      select count(*) into team_total    from public.codenames_cards where game_code = p_code and color = other_team;
      select count(*) into team_revealed from public.codenames_cards where game_code = p_code and color = other_team and revealed = true;
      if team_revealed >= team_total then
        update public.codenames_games set phase = 'finished', winning_team = other_team where code = p_code;
        return;
      end if;
    end if;
    -- End turn
    update public.codenames_games set
      turn_team           = other_team,
      turn_phase          = 'clue',
      current_clue_word   = null,
      current_clue_number = null,
      guesses_used        = 0
    where code = p_code;
    return;
  end if;

  -- Correct guess (current team's color)
  select count(*) into team_total    from public.codenames_cards where game_code = p_code and color = g.turn_team;
  select count(*) into team_revealed from public.codenames_cards where game_code = p_code and color = g.turn_team and revealed = true;

  if team_revealed >= team_total then
    -- Current team wins
    update public.codenames_games set phase = 'finished', winning_team = g.turn_team where code = p_code;
    return;
  end if;

  -- Increment guesses_used; if exhausted, client shows "All guesses used" — turn ends via end_codenames_turn
  update public.codenames_games set guesses_used = guesses_used + 1 where code = p_code;
end;
$$;

-- ============================================================
-- End the current team's turn (used by guessers)
-- ============================================================
create or replace function public.end_codenames_turn(
  p_code      text,
  p_player_id uuid
)
returns void language plpgsql security definer as $$
declare
  g          record;
  p_team     text;
  other_team text;
begin
  select * into g from public.codenames_games where code = p_code for update;
  if not found or g.phase <> 'play' or g.turn_phase <> 'guess' then return; end if;

  -- Any player on the active team may end the turn (cluegiver or not — the guard is in the UI)
  select team into p_team
  from public.codenames_players
  where id = p_player_id and game_code = p_code;
  if not found or p_team <> g.turn_team then return; end if;

  other_team := case when g.turn_team = 'red' then 'blue' else 'red' end;

  update public.codenames_games set
    turn_team             = other_team,
    turn_phase            = 'clue',
    current_clue_word     = null,
    current_clue_number   = null,
    guesses_used          = 0,
    turn_selected_card_id = null
  where code = p_code;
end;
$$;

-- ============================================================
-- Reset game to lobby for Play Again (keeps players & teams)
-- ============================================================
create or replace function public.reset_codenames_game(p_code text)
returns void language plpgsql security definer as $$
begin
  update public.codenames_games set
    phase               = 'lobby',
    turn_team           = null,
    turn_phase          = 'clue',
    current_clue_word   = null,
    current_clue_number = null,
    guesses_used        = 0,
    winning_team        = null,
    turn_selected_card_id = null
  where code = p_code;

  -- Unready everyone so they must confirm again
  update public.codenames_players
  set ready = false
  where game_code = p_code;

  -- Delete old cards; new ones generated on next start
  delete from public.codenames_cards where game_code = p_code;
end;
$$;
