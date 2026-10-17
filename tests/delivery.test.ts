import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { claimScheduledDelivery } from "../src/delivery";

const database = env.DB;

beforeEach(async () => {
  await database.prepare("CREATE TABLE IF NOT EXISTS profiles (owner_id TEXT PRIMARY KEY, profile_json TEXT NOT NULL, onboarding_stage TEXT NOT NULL DEFAULT 'new', recap_time TEXT NOT NULL DEFAULT '17:00', last_recap_date TEXT NOT NULL DEFAULT '', last_followup_date TEXT NOT NULL DEFAULT '')").run();
  await database.prepare("DELETE FROM profiles").run();
});

describe("scheduled delivery claim", () => {
  it("allows a single recap claim per owner/date, even for overlapping triggers", async () => {
    await database.prepare(
      "INSERT INTO profiles(owner_id, profile_json, onboarding_stage, recap_time, last_recap_date) VALUES (?, ?, ?, ?, ?)",
    ).bind("owner-a", "{}", "done", "17:00", "").run();

    const claims = await Promise.all([
      claimScheduledDelivery(database, "owner-a", "recap", "2026-10-14"),
      claimScheduledDelivery(database, "owner-a", "recap", "2026-10-14"),
    ]);

    expect(claims.filter(Boolean)).toHaveLength(1);
    const profile = await database.prepare("SELECT last_recap_date FROM profiles WHERE owner_id = ?")
      .bind("owner-a").first<{ last_recap_date: string }>();
    expect(profile?.last_recap_date).toBe("2026-10-14");
  });

  it("tracks reminder claims separately from recap claims", async () => {
    await database.prepare(
      "INSERT INTO profiles(owner_id, profile_json, onboarding_stage, recap_time, last_recap_date, last_followup_date) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind("owner-b", "{}", "done", "17:00", "", "").run();

    expect(await claimScheduledDelivery(database, "owner-b", "followup", "2026-10-14")).toBe(true);
    expect(await claimScheduledDelivery(database, "owner-b", "followup", "2026-10-14")).toBe(false);
    const profile = await database.prepare("SELECT last_recap_date, last_followup_date FROM profiles WHERE owner_id = ?")
      .bind("owner-b").first<{ last_recap_date: string; last_followup_date: string }>();
    expect(profile?.last_recap_date).toBe("");
    expect(profile?.last_followup_date).toBe("2026-10-14");
  });
});
