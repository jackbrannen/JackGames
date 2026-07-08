# Harvesting player-submitted words

Some games let players write free-text words/clues as their actual submission (not answers to a specific prompt): **FirstToWorst**, **Fishbowl**, and **ReverseCharades**. Nothing ever deletes these rows from their game tables, so every word anyone has ever typed is still sitting in the database. This setup just gives you an easy way to periodically comb through them and pull good ones into `JackGames/random_ideas.json` (or wherever else you use them).

No app code, no deploys — this all lives in Supabase (project id `hgbvzuqqdwaobxnxvvsu`), set up 2026-07-04.

## What exists

- **`harvested_words`** — a view that unions the raw submission tables: `ftw_words` (FirstToWorst), `clues` (Fishbowl), `reversecharades_clues` (ReverseCharades). Columns: `game`, `word`, `submitted_at`.
- **`reviewed_words`** — a table you write to, marking `(game, word)` pairs you've already dealt with (imported or intentionally skipped).
- **`words_to_review`** — the view you actually query. Distinct words per game that aren't in `reviewed_words` yet, with `times_submitted` (how many times that exact word has been submitted across games) and `first_submitted_at`.

## How to run these queries

Either:
- Supabase dashboard → SQL Editor for project `hgbvzuqqdwaobxnxvvsu`, or
- Ask Claude to run it via the Supabase MCP tool (`mcp__plugin_supabase_supabase__execute_sql`, same project id).

## Monthly workflow

**1. See what's new:**
```sql
SELECT * FROM words_to_review ORDER BY times_submitted DESC, game;
```
Or scope to one game at a time:
```sql
SELECT * FROM words_to_review WHERE game = 'firsttoworst' ORDER BY times_submitted DESC;
```

**2. Copy whatever's good into `JackGames/random_ideas.json`** (or the relevant per-game word bank) by hand.

**3. Clear everything you just looked at out of the queue** — whether you imported it or decided to skip it, this marks it reviewed so it won't show up again:
```sql
INSERT INTO reviewed_words (game, word)
SELECT game, word FROM words_to_review
ON CONFLICT (game, word) DO NOTHING;
```

That's the whole loop: query → copy the good ones → run the one INSERT to clear the queue. Repeat whenever.

## If you want to skip a specific word without reviewing everything else

```sql
INSERT INTO reviewed_words (game, word) VALUES ('fishbowl', 'banana')
ON CONFLICT (game, word) DO NOTHING;
```

## Adding more games later

GameOfWhat, Copycats, and SamePage also collect player-submitted text (`gow_questions`/`gow_answers`, `cc_answers`, `sp_answers`), but those are answers to a specific written prompt rather than standalone words — left out on purpose. To fold one in, add a `UNION ALL` branch to `harvested_words`:

```sql
CREATE OR REPLACE VIEW harvested_words AS
  SELECT 'firsttoworst' AS game, text AS word, created_at AS submitted_at FROM ftw_words
  UNION ALL
  SELECT 'fishbowl' AS game, text AS word, created_at AS submitted_at FROM clues
  UNION ALL
  SELECT 'reversecharades' AS game, text AS word, created_at AS submitted_at FROM reversecharades_clues
  UNION ALL
  SELECT 'gameofwhat' AS game, text AS word, created_at AS submitted_at FROM gow_questions; -- example addition
```

## Heads up

The first batch will include some old dev/test junk (literal words like `"1"`, `"2"`, `"3"` from early testing sessions) mixed in with real submissions — just clear those out with everything else on your first pass.
