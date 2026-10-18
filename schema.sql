CREATE TABLE IF NOT EXISTS profiles (
  owner_id TEXT PRIMARY KEY,
  profile_json TEXT NOT NULL,
  onboarding_stage TEXT NOT NULL DEFAULT 'new',
  recap_time TEXT NOT NULL DEFAULT '17:00',
  last_recap_date TEXT NOT NULL DEFAULT '',
  last_followup_date TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS profiles_recap_schedule
  ON profiles(onboarding_stage, recap_time, last_recap_date);
CREATE INDEX IF NOT EXISTS profiles_followup_schedule
  ON profiles(onboarding_stage, last_followup_date);

CREATE TABLE IF NOT EXISTS notes (
  owner_id TEXT NOT NULL,
  id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  note_json TEXT NOT NULL,
  PRIMARY KEY (owner_id, id),
  FOREIGN KEY (owner_id) REFERENCES profiles(owner_id)
);
CREATE INDEX IF NOT EXISTS notes_by_owner_created ON notes(owner_id, created_at);

CREATE TABLE IF NOT EXISTS user_activity (
  owner_id TEXT PRIMARY KEY,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS user_activity_by_last_seen
  ON user_activity(last_seen_at);

CREATE TABLE IF NOT EXISTS user_days (
  owner_id TEXT NOT NULL,
  day TEXT NOT NULL,
  PRIMARY KEY (owner_id, day)
);
CREATE INDEX IF NOT EXISTS user_days_by_day
  ON user_days(day);

-- Backfill: one row per owner per day a note was created, so usage that
-- predates user_days stays countable. Idempotent; safe to re-apply.
INSERT OR IGNORE INTO user_days(owner_id, day)
  SELECT DISTINCT owner_id, substr(created_at, 1, 10) FROM notes;

CREATE TABLE IF NOT EXISTS processed_updates (
  update_id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS processed_updates_by_created ON processed_updates(created_at);
