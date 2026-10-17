import { reset } from "cloudflare:test";
import { beforeEach } from "vitest";
import { env } from "cloudflare:workers";

const schema = [
  `CREATE TABLE IF NOT EXISTS profiles (owner_id TEXT PRIMARY KEY, profile_json TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS notes (owner_id TEXT NOT NULL, id TEXT NOT NULL, created_at TEXT NOT NULL, note_json TEXT NOT NULL, PRIMARY KEY(owner_id, id), FOREIGN KEY(owner_id) REFERENCES profiles(owner_id))`,
  `CREATE INDEX IF NOT EXISTS notes_by_owner_created ON notes(owner_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS processed_updates (update_id INTEGER PRIMARY KEY, created_at TEXT NOT NULL)`,
];

beforeEach(async () => {
  await reset();
  for (const statement of schema) await env.DB.prepare(statement).run();
});
