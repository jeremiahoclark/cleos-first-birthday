-- Memory-wall engagement for the party wall. Identity is the player's game_name
-- (this app has no auth), so likes are unique per (submission, username) and
-- comments are attributed by username.
--
-- Note: there is no finished_at column. Speed ranking is computed from per-stage
-- submission timestamps (see getLeaderboard in worker.js), which lets us reward
-- socializing between stage unlocks instead of pure end-to-end grinding.
CREATE TABLE IF NOT EXISTS likes (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(submission_id, user_name)
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_likes_submission ON likes(submission_id);
CREATE INDEX IF NOT EXISTS idx_comments_submission ON comments(submission_id);
