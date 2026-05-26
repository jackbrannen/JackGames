-- ============================================================
-- SHARED: random_ideas table (used by Game of What & First to Worst)
-- ============================================================

CREATE TABLE IF NOT EXISTS random_ideas (
  id   serial PRIMARY KEY,
  idea text UNIQUE NOT NULL
);

INSERT INTO random_ideas (idea) VALUES
  ('commute'),
  ('housework'),
  ('nap'),
  ('grocery shopping'),
  ('moving day'),
  ('laundry'),
  ('dishes'),
  ('parking'),
  ('waiting'),
  ('bedtime'),
  ('morning routine'),
  ('lunch break'),
  ('traffic'),
  ('trash day'),
  ('mail'),
  ('homework'),
  ('deadline'),
  ('chores'),
  ('overtime'),
  ('weekend'),
  ('vacation'),
  ('errand'),
  ('schedule'),
  ('routine'),
  ('habit'),
  ('alarm'),
  ('snooze'),
  ('breakfast'),
  ('dinner'),
  ('leftovers'),
  ('microwave'),
  ('couch'),
  ('remote'),
  ('nap time'),
  ('walk'),
  ('jog'),
  ('stretch'),
  ('shower'),
  ('shave'),
  ('haircut'),
  ('dentist'),
  ('doctor'),
  ('pharmacy'),
  ('receipt'),
  ('bill'),
  ('budget'),
  ('tip'),
  ('refund'),
  ('warranty'),
  ('password'),
  ('update'),
  ('landlord'),
  ('intern'),
  ('crossing guard'),
  ('surgeon'),
  ('twin'),
  ('lifeguard'),
  ('wedding DJ'),
  ('substitute teacher'),
  ('personal trainer'),
  ('telemarketer'),
  ('plumber'),
  ('electrician'),
  ('babysitter'),
  ('neighbor'),
  ('roommate'),
  ('boss'),
  ('coworker'),
  ('stranger'),
  ('tourist'),
  ('volunteer'),
  ('mentor'),
  ('therapist'),
  ('coach'),
  ('referee'),
  ('cashier'),
  ('waiter'),
  ('librarian'),
  ('janitor'),
  ('pilot'),
  ('conductor'),
  ('mechanic'),
  ('firefighter'),
  ('detective'),
  ('judge'),
  ('mayor'),
  ('professor'),
  ('student'),
  ('retiree'),
  ('newlywed'),
  ('teenager'),
  ('basement'),
  ('petting zoo'),
  ('rooftop'),
  ('storage unit'),
  ('cemetery'),
  ('DMV'),
  ('cruise ship'),
  ('laundromat'),
  ('airport security'),
  ('waiting room'),
  ('gym'),
  ('office'),
  ('hospital'),
  ('school'),
  ('playground'),
  ('parking lot'),
  ('highway'),
  ('rest stop'),
  ('campsite'),
  ('cabin'),
  ('hotel'),
  ('motel'),
  ('hostel'),
  ('lighthouse'),
  ('stadium'),
  ('arena'),
  ('theater'),
  ('museum'),
  ('gallery'),
  ('library'),
  ('bookstore'),
  ('hardware store'),
  ('pharmacy'),
  ('diner'),
  ('food truck'),
  ('rooftop bar'),
  ('fire escape'),
  ('subway'),
  ('bus stop'),
  ('elevator'),
  ('stairwell'),
  ('attic'),
  ('garage'),
  ('porch'),
  ('backyard'),
  ('front yard'),
  ('cul-de-sac'),
  ('suburb'),
  ('downtown'),
  ('alley'),
  ('sushi'),
  ('nachos'),
  ('soup'),
  ('birthday cake'),
  ('leftovers'),
  ('sandwich'),
  ('pizza'),
  ('taco'),
  ('burger'),
  ('hot dog'),
  ('pasta'),
  ('salad'),
  ('steak'),
  ('chicken'),
  ('tofu'),
  ('noodles'),
  ('rice'),
  ('bread'),
  ('butter'),
  ('cheese'),
  ('egg'),
  ('bacon'),
  ('pancake'),
  ('waffle'),
  ('donut'),
  ('muffin'),
  ('cookie'),
  ('brownie'),
  ('pie'),
  ('ice cream'),
  ('coffee'),
  ('tea'),
  ('juice'),
  ('soda'),
  ('beer'),
  ('wine'),
  ('cocktail'),
  ('smoothie'),
  ('milkshake'),
  ('energy drink'),
  ('fondue'),
  ('casserole'),
  ('stew'),
  ('chili'),
  ('dim sum'),
  ('ramen'),
  ('pho'),
  ('curry'),
  ('hummus'),
  ('pigeon'),
  ('horse'),
  ('hamster'),
  ('dolphin'),
  ('crow'),
  ('raccoon'),
  ('flamingo'),
  ('golden retriever'),
  ('moth'),
  ('sea cucumber'),
  ('goat'),
  ('llama'),
  ('peacock'),
  ('sloth'),
  ('penguin'),
  ('panda'),
  ('koala'),
  ('platypus'),
  ('otter'),
  ('ferret'),
  ('iguana'),
  ('parrot'),
  ('toucan'),
  ('moose'),
  ('bison'),
  ('armadillo'),
  ('capybara'),
  ('hedgehog'),
  ('meerkat'),
  ('narwhal'),
  ('manatee'),
  ('walrus'),
  ('pelican'),
  ('stork'),
  ('heron'),
  ('crane'),
  ('vulture'),
  ('hyena'),
  ('warthog'),
  ('tapir'),
  ('okapi'),
  ('axolotl'),
  ('salamander'),
  ('gecko'),
  ('chameleon'),
  ('mantis shrimp'),
  ('first day'),
  ('road trip'),
  ('power outage'),
  ('blind date'),
  ('job interview'),
  ('first date'),
  ('moving in'),
  ('moving out'),
  ('graduation'),
  ('retirement'),
  ('proposal'),
  ('funeral'),
  ('reunion'),
  ('birthday'),
  ('holiday dinner'),
  ('camping trip'),
  ('long flight'),
  ('layover'),
  ('getting lost'),
  ('running late'),
  ('calling in sick'),
  ('returning something'),
  ('meeting the parents'),
  ('starting over'),
  ('going back'),
  ('showing up'),
  ('stepping up'),
  ('walking away'),
  ('staying put'),
  ('trying again'),
  ('starting fresh'),
  ('checking in'),
  ('checking out'),
  ('settling down'),
  ('branching out'),
  ('fitting in'),
  ('standing out'),
  ('catching up'),
  ('falling behind'),
  ('extension cord'),
  ('umbrella'),
  ('ladder'),
  ('safe'),
  ('fanny pack'),
  ('pool noodle'),
  ('traffic cone'),
  ('whiteboard'),
  ('treadmill'),
  ('stapler'),
  ('binder'),
  ('lanyard'),
  ('clipboard'),
  ('sticky note'),
  ('filing cabinet'),
  ('surge protector'),
  ('paper shredder'),
  ('label maker'),
  ('bubble wrap'),
  ('packing tape'),
  ('moving box'),
  ('garden hose'),
  ('rake'),
  ('shovel'),
  ('wheelbarrow'),
  ('toolbox'),
  ('duct tape'),
  ('zip tie'),
  ('bungee cord'),
  ('flashlight'),
  ('candle'),
  ('lighter'),
  ('matches'),
  ('first aid kit'),
  ('fire extinguisher'),
  ('smoke detector'),
  ('plunger'),
  ('wrench'),
  ('hammer'),
  ('drill'),
  ('level'),
  ('measuring tape'),
  ('key'),
  ('padlock'),
  ('doorbell'),
  ('welcome mat'),
  ('mailbox'),
  ('fence'),
  ('gate'),
  ('reputation'),
  ('tradition'),
  ('loyalty'),
  ('ambition'),
  ('compromise'),
  ('peer pressure'),
  ('FOMO'),
  ('getting older'),
  ('being broke'),
  ('expectations'),
  ('responsibility'),
  ('independence'),
  ('nostalgia'),
  ('jealousy'),
  ('patience'),
  ('trust'),
  ('guilt'),
  ('pride'),
  ('regret'),
  ('hope'),
  ('routine'),
  ('change'),
  ('transition'),
  ('belonging'),
  ('identity'),
  ('confidence'),
  ('doubt'),
  ('momentum'),
  ('closure'),
  ('perspective'),
  ('boundaries'),
  ('balance'),
  ('sacrifice'),
  ('accountability'),
  ('gratitude'),
  ('resentment'),
  ('forgiveness'),
  ('competition'),
  ('comparison'),
  ('growth'),
  ('reinvention'),
  ('stability'),
  ('uncertainty'),
  ('opportunity'),
  ('failure'),
  ('success'),
  ('pressure'),
  ('freedom'),
  ('commitment'),
  ('obligation'),
  ('wedding'),
  ('funeral'),
  ('graduation'),
  ('birthday party'),
  ('reunion'),
  ('first day of school'),
  ('retirement party'),
  ('baby shower'),
  ('housewarming'),
  ('holiday party'),
  ('office party'),
  ('prom'),
  ('field trip'),
  ('road trip'),
  ('camping trip'),
  ('concert'),
  ('game night'),
  ('trivia night'),
  ('karaoke'),
  ('potluck'),
  ('picnic'),
  ('barbecue'),
  ('tailgate'),
  ('parade'),
  ('festival'),
  ('fair'),
  ('farmers market'),
  ('flea market'),
  ('garage sale'),
  ('open house'),
  ('job fair'),
  ('orientation'),
  ('interview'),
  ('presentation'),
  ('performance'),
  ('recital'),
  ('tournament'),
  ('tryout'),
  ('audition'),
  ('election'),
  ('debate'),
  ('summit'),
  ('conference'),
  ('workshop'),
  ('seminar'),
  ('retreat'),
  ('staycation'),
  ('honeymoon'),
  ('anniversary'),
  ('sermon'),
  ('small group'),
  ('church discipline'),
  ('baptism'),
  ('communion'),
  ('tithing'),
  ('mission trip'),
  ('worship team'),
  ('youth group'),
  ('prayer request'),
  ('Bible study'),
  ('accountability partner'),
  ('calling'),
  ('testimony'),
  ('discernment'),
  ('stewardship'),
  ('fellowship'),
  ('elder'),
  ('deacon'),
  ('pastor'),
  ('outreach'),
  ('discipleship'),
  ('conversion'),
  ('sanctification'),
  ('devotional'),
  ('quiet time'),
  ('sanctuary'),
  ('Sunday school'),
  ('potluck'),
  ('revival'),
  ('retreat'),
  ('praise band'),
  ('offering'),
  ('benediction'),
  ('altar call'),
  ('church planting'),
  ('seminary'),
  ('denomination'),
  ('slingshot'),
  ('jaywalking'),
  ('prison'),
  ('detention'),
  ('curfew'),
  ('grounding'),
  ('time-out'),
  ('warning'),
  ('citation'),
  ('suspension'),
  ('expulsion'),
  ('probation'),
  ('parole'),
  ('loophole'),
  ('alibi'),
  ('accomplice'),
  ('getaway'),
  ('lookout'),
  ('dare'),
  ('bet'),
  ('prank'),
  ('vandalism'),
  ('trespassing'),
  ('shoplifting'),
  ('speeding ticket'),
  ('parking ticket'),
  ('noise complaint'),
  ('broken window'),
  ('missing homework'),
  ('late fee'),
  ('overdue library book'),
  ('banned'),
  ('blacklisted'),
  ('caught'),
  ('confession'),
  ('apology'),
  ('consequence'),
  ('hall pass'),
  ('tattletale'),
  ('snitch'),
  ('locker search'),
  ('principal''s office'),
  ('community service'),
  ('house arrest'),
  ('bail'),
  ('fine'),
  ('mugshot'),
  ('rap sheet'),
  ('escape'),
  ('knitting'),
  ('woodworking'),
  ('painting'),
  ('sketching'),
  ('photography'),
  ('hiking'),
  ('birdwatching'),
  ('gardening'),
  ('fishing'),
  ('hunting'),
  ('rock climbing'),
  ('kayaking'),
  ('cycling'),
  ('running'),
  ('swimming'),
  ('yoga'),
  ('meditation'),
  ('journaling'),
  ('reading'),
  ('book club'),
  ('cooking'),
  ('baking'),
  ('brewing'),
  ('wine tasting'),
  ('pottery'),
  ('sculpting'),
  ('weaving'),
  ('embroidery'),
  ('scrapbooking'),
  ('model building'),
  ('board games'),
  ('card games'),
  ('chess'),
  ('video games'),
  ('podcasting'),
  ('blogging'),
  ('vlogging'),
  ('genealogy'),
  ('stargazing'),
  ('metal detecting'),
  ('coin collecting'),
  ('stamp collecting'),
  ('antiquing'),
  ('thrifting'),
  ('volunteering'),
  ('fostering'),
  ('beekeeping'),
  ('composting'),
  ('foraging'),
  ('geocaching'),
  ('sunburn'),
  ('blister'),
  ('sprain'),
  ('black eye'),
  ('broken bone'),
  ('stitches'),
  ('concussion'),
  ('food poisoning'),
  ('hangover'),
  ('hiccups'),
  ('insomnia'),
  ('jet lag'),
  ('motion sickness'),
  ('allergies'),
  ('brain freeze'),
  ('charley horse'),
  ('paper cut'),
  ('splinter'),
  ('pinched nerve'),
  ('pulled muscle'),
  ('dislocated shoulder'),
  ('pink eye'),
  ('strep throat'),
  ('mono'),
  ('shin splints'),
  ('carpal tunnel'),
  ('tennis elbow'),
  ('plantar fasciitis'),
  ('heat exhaustion'),
  ('frostbite'),
  ('poison ivy'),
  ('bee sting'),
  ('kidney stone'),
  ('migraine'),
  ('laryngitis'),
  ('vertigo'),
  ('nosebleed'),
  ('earache'),
  ('toothache'),
  ('cold sore'),
  ('canker sore'),
  ('heartburn'),
  ('back pain'),
  ('neck pain'),
  ('growing pains'),
  ('hypochondria'),
  ('hypoglycemia'),
  ('dehydration'),
  ('fatigue'),
  ('burnout'),
  ('haunted house'),
  ('ghost'),
  ('serial killer'),
  ('zombie'),
  ('monster under the bed'),
  ('vampire'),
  ('werewolf'),
  ('spaceship'),
  ('time machine'),
  ('robot uprising'),
  ('alien invasion'),
  ('teleportation device'),
  ('mad scientist'),
  ('secret laboratory'),
  ('forbidden forest'),
  ('enchanted object'),
  ('evil queen'),
  ('dragon'),
  ('treasure map'),
  ('lost civilization'),
  ('desert island'),
  ('doomsday bunker'),
  ('spy gadget'),
  ('car chase'),
  ('heist crew'),
  ('safe house'),
  ('undercover cop'),
  ('hitman'),
  ('femme fatale'),
  ('corrupt politician'),
  ('small town secret'),
  ('abandoned hospital'),
  ('cursed artifact'),
  ('ancient tomb'),
  ('prophecy'),
  ('chosen warrior'),
  ('magic sword'),
  ('dark tower'),
  ('siren'),
  ('sea monster'),
  ('runaway train'),
  ('ticking bomb'),
  ('double cross'),
  ('hidden door'),
  ('secret passage'),
  ('unrequited love'),
  ('rival families'),
  ('star-crossed lovers'),
  ('fake death'),
  ('surprise heir')
ON CONFLICT (idea) DO NOTHING;

-- ============================================================
-- First to Worst: game tables
-- ============================================================

CREATE TABLE IF NOT EXISTS ftw_games (
  code                text PRIMARY KEY,
  phase               text NOT NULL DEFAULT 'lobby',
  round_phase         text,
  host_id             uuid,
  guessing_player_ids uuid[] NOT NULL DEFAULT '{}',
  guessing_index      int   NOT NULL DEFAULT 0,
  guess_order         uuid[] NOT NULL DEFAULT '{}',
  dragging_player_id  uuid,
  group_score         int NOT NULL DEFAULT 0,
  game_score          int NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ftw_players (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_code         text NOT NULL REFERENCES ftw_games(code) ON DELETE CASCADE,
  name              text NOT NULL,
  first_name        text,
  last_name         text,
  words_submitted   bool NOT NULL DEFAULT false,
  ranking_locked    bool NOT NULL DEFAULT false,
  guessing_ready    bool NOT NULL DEFAULT false,
  assigned_word_ids uuid[] NOT NULL DEFAULT '{}',
  ranking           uuid[] NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ftw_words (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_code text NOT NULL REFERENCES ftw_games(code) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES ftw_players(id) ON DELETE CASCADE,
  text      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable realtime (already applied — safe to skip if tables are already in publication)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'ftw_games'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ftw_games;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'ftw_players'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ftw_players;
  END IF;
END $$;

-- ============================================================
-- New columns (add if not exist)
-- ============================================================

ALTER TABLE ftw_games
  ADD COLUMN IF NOT EXISTS theme             text NOT NULL DEFAULT 'random',
  ADD COLUMN IF NOT EXISTS word_distribution text NOT NULL DEFAULT 'random',
  ADD COLUMN IF NOT EXISTS word_assignments  jsonb,
  ADD COLUMN IF NOT EXISTS next_round_votes  uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_move         jsonb;

ALTER TABLE ftw_words
  ADD COLUMN IF NOT EXISTS for_player_id uuid REFERENCES ftw_players(id) ON DELETE CASCADE;

ALTER TABLE ftw_players
  ADD COLUMN IF NOT EXISTS is_bot bool NOT NULL DEFAULT false;

-- ============================================================
-- RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION ftw_start_game(
  p_code             text,
  p_host_id          uuid,
  p_word_assignments jsonb DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE ftw_games
  SET phase = 'submitting', host_id = p_host_id, word_assignments = p_word_assignments
  WHERE code = p_code AND phase = 'lobby';
END;
$$;

-- Submit words; handles both random and personal distribution
CREATE OR REPLACE FUNCTION ftw_submit_words(
  p_code           text,
  p_player_id      uuid,
  p_words          text[],
  p_for_player_ids uuid[] DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_i               int;
  v_player_count    int;
  v_submitted_count int;
  v_player          record;
  v_assigned        uuid[];
  v_dist            text;
BEGIN
  IF array_length(p_words, 1) != 5 THEN
    RAISE EXCEPTION 'Must submit exactly 5 words';
  END IF;

  SELECT word_distribution INTO v_dist FROM ftw_games WHERE code = p_code;

  FOR v_i IN 1..5 LOOP
    INSERT INTO ftw_words (game_code, player_id, text, for_player_id)
    VALUES (
      p_code,
      p_player_id,
      p_words[v_i],
      CASE WHEN v_dist = 'personal' AND p_for_player_ids IS NOT NULL
           THEN p_for_player_ids[v_i] ELSE NULL END
    );
  END LOOP;

  UPDATE ftw_players SET words_submitted = true WHERE id = p_player_id;

  SELECT count(*) INTO v_player_count    FROM ftw_players WHERE game_code = p_code;
  SELECT count(*) INTO v_submitted_count FROM ftw_players WHERE game_code = p_code AND words_submitted = true;

  IF v_submitted_count < v_player_count THEN RETURN; END IF;

  -- Assign words to players
  IF v_dist = 'personal' THEN
    FOR v_player IN SELECT id FROM ftw_players WHERE game_code = p_code LOOP
      SELECT array_agg(id ORDER BY random())
      INTO v_assigned
      FROM ftw_words
      WHERE game_code = p_code AND for_player_id = v_player.id;
      UPDATE ftw_players SET assigned_word_ids = v_assigned WHERE id = v_player.id;
    END LOOP;
  ELSE
    FOR v_player IN SELECT id FROM ftw_players WHERE game_code = p_code LOOP
      SELECT array_agg(id)
      INTO v_assigned
      FROM (
        SELECT id FROM ftw_words
        WHERE game_code = p_code AND player_id != v_player.id
        ORDER BY random()
        LIMIT 5
      ) sub;
      UPDATE ftw_players SET assigned_word_ids = v_assigned WHERE id = v_player.id;
    END LOOP;
  END IF;

  UPDATE ftw_games SET phase = 'ranking' WHERE code = p_code AND phase = 'submitting';
END;
$$;

-- Lock in a player's ranking; transitions to guessing when all players done
CREATE OR REPLACE FUNCTION ftw_lock_ranking(
  p_code      text,
  p_player_id uuid,
  p_ranking   uuid[]
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_player_count  int;
  v_locked_count  int;
  v_player_ids    uuid[];
  v_first_subject uuid;
  v_initial_order uuid[];
BEGIN
  UPDATE ftw_players SET ranking = p_ranking, ranking_locked = true WHERE id = p_player_id;

  SELECT count(*) INTO v_player_count FROM ftw_players WHERE game_code = p_code;
  SELECT count(*) INTO v_locked_count FROM ftw_players WHERE game_code = p_code AND ranking_locked = true;

  IF v_locked_count < v_player_count THEN RETURN; END IF;

  SELECT array_agg(id ORDER BY random())
  INTO v_player_ids
  FROM ftw_players WHERE game_code = p_code;

  v_first_subject := v_player_ids[1];

  WITH shuffled AS (
    SELECT wid, random() AS r
    FROM unnest((SELECT assigned_word_ids FROM ftw_players WHERE id = v_first_subject)) AS wid
  )
  SELECT array_agg(wid ORDER BY r) INTO v_initial_order FROM shuffled;

  UPDATE ftw_games SET
    phase               = 'guessing',
    round_phase         = 'intro',
    guessing_player_ids = v_player_ids,
    guessing_index      = 0,
    guess_order         = v_initial_order,
    dragging_player_id  = null,
    next_round_votes    = '{}'
  WHERE code = p_code;
END;
$$;

-- Advance from intro to dragging
CREATE OR REPLACE FUNCTION ftw_start_dragging(p_code text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE ftw_games SET round_phase = 'dragging' WHERE code = p_code AND round_phase = 'intro';
END;
$$;

-- Update guess order and reset all players' ready state
CREATE OR REPLACE FUNCTION ftw_update_guess_order(p_code text, p_order uuid[])
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE ftw_games SET guess_order = p_order WHERE code = p_code;
  UPDATE ftw_players SET guessing_ready = false WHERE game_code = p_code;
END;
$$;

-- Mark a player ready; calculates score and reveals when all non-subject players ready
CREATE OR REPLACE FUNCTION ftw_submit_ready(
  p_code      text,
  p_player_id uuid
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_subject_id        uuid;
  v_non_subject_count int;
  v_ready_count       int;
  v_true_ranking      uuid[];
  v_guess             uuid[];
  v_correct           int := 0;
  i                   int;
BEGIN
  UPDATE ftw_players SET guessing_ready = true WHERE id = p_player_id;

  SELECT guessing_player_ids[guessing_index + 1]
  INTO v_subject_id
  FROM ftw_games WHERE code = p_code;

  SELECT count(*) INTO v_non_subject_count
  FROM ftw_players WHERE game_code = p_code AND id != v_subject_id;

  SELECT count(*) INTO v_ready_count
  FROM ftw_players WHERE game_code = p_code AND id != v_subject_id AND guessing_ready = true;

  IF v_ready_count < v_non_subject_count THEN RETURN; END IF;

  SELECT ranking     INTO v_true_ranking FROM ftw_players WHERE id = v_subject_id;
  SELECT guess_order INTO v_guess        FROM ftw_games   WHERE code = p_code;

  FOR i IN 1..5 LOOP
    IF v_true_ranking[i] = v_guess[i] THEN
      v_correct := v_correct + 1;
    END IF;
  END LOOP;

  UPDATE ftw_games SET
    round_phase = 'reveal',
    group_score = group_score + v_correct,
    game_score  = game_score  + (5 - v_correct)
  WHERE code = p_code;
END;
$$;

-- Vote to advance to next round; advances when >= 50% of players have voted
CREATE OR REPLACE FUNCTION ftw_vote_advance(p_code text, p_player_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_votes       uuid[];
  v_vote_count  int;
  v_total_count int;
BEGIN
  -- Add vote, avoid duplicates
  UPDATE ftw_games
  SET next_round_votes = array_append(next_round_votes, p_player_id)
  WHERE code = p_code AND NOT (next_round_votes @> ARRAY[p_player_id]);

  SELECT next_round_votes INTO v_votes FROM ftw_games WHERE code = p_code;
  v_vote_count := coalesce(array_length(v_votes, 1), 0);

  SELECT count(*) INTO v_total_count FROM ftw_players WHERE game_code = p_code;

  IF v_vote_count * 2 >= v_total_count THEN
    UPDATE ftw_games SET next_round_votes = '{}' WHERE code = p_code;
    PERFORM ftw_advance_round(p_code);
  END IF;
END;
$$;

-- Advance to next round or end the game
CREATE OR REPLACE FUNCTION ftw_advance_round(p_code text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_current_index int;
  v_total_players int;
  v_next_subject  uuid;
  v_new_order     uuid[];
BEGIN
  SELECT guessing_index, array_length(guessing_player_ids, 1)
  INTO v_current_index, v_total_players
  FROM ftw_games WHERE code = p_code;

  IF v_current_index + 1 >= v_total_players THEN
    UPDATE ftw_games SET phase = 'finished', round_phase = null, next_round_votes = '{}' WHERE code = p_code;
    RETURN;
  END IF;

  SELECT guessing_player_ids[v_current_index + 2]
  INTO v_next_subject
  FROM ftw_games WHERE code = p_code;

  WITH shuffled AS (
    SELECT wid, random() AS r
    FROM unnest((SELECT assigned_word_ids FROM ftw_players WHERE id = v_next_subject)) AS wid
  )
  SELECT array_agg(wid ORDER BY r) INTO v_new_order FROM shuffled;

  UPDATE ftw_games SET
    guessing_index     = v_current_index + 1,
    round_phase        = 'intro',
    guess_order        = v_new_order,
    dragging_player_id = null,
    next_round_votes   = '{}',
    last_move          = null
  WHERE code = p_code;

  UPDATE ftw_players SET guessing_ready = false WHERE game_code = p_code;
END;
$$;

-- Fetch N random ideas, excluding already-shown ones
CREATE OR REPLACE FUNCTION get_random_ideas(
  p_count   int    DEFAULT 6,
  p_exclude text[] DEFAULT '{}'
) RETURNS text[] LANGUAGE sql AS $$
  SELECT array_agg(idea)
  FROM (
    SELECT idea FROM random_ideas
    WHERE NOT (idea = ANY(p_exclude))
    ORDER BY random()
    LIMIT p_count
  ) t;
$$;

-- Reset game to lobby with same players (keeps theme/word_distribution settings)
CREATE OR REPLACE FUNCTION ftw_new_game(p_code text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM ftw_words WHERE game_code = p_code;

  UPDATE ftw_players SET
    words_submitted   = false,
    ranking_locked    = false,
    guessing_ready    = false,
    assigned_word_ids = '{}',
    ranking           = '{}'
  WHERE game_code = p_code;

  UPDATE ftw_games SET
    phase               = 'lobby',
    round_phase         = null,
    guessing_player_ids = '{}',
    guessing_index      = 0,
    guess_order         = '{}',
    dragging_player_id  = null,
    group_score         = 0,
    game_score          = 0,
    host_id             = null,
    word_assignments    = null,
    next_round_votes    = '{}',
    last_move           = null
  WHERE code = p_code;
END;
$$;
