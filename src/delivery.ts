export async function claimScheduledDelivery(
  database: D1Database,
  ownerId: string,
  delivery: "recap" | "followup",
  date: string,
): Promise<boolean> {
  const column = delivery === "recap" ? "last_recap_date" : "last_followup_date";
  const result = await database.prepare(
    `UPDATE profiles SET ${column} = ? WHERE owner_id = ? AND ${column} != ?`,
  ).bind(date, ownerId, date).run();
  return result.meta.changes === 1;
}
