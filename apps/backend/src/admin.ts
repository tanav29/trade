/** Admin privileges are configured by the operator, never by account signup. */
export function isAdmin(userId: number): boolean {
  return (process.env.ADMIN_USER_IDS || "").split(",").some(
    (entry) => entry.trim() !== "" && entry.trim() === String(userId),
  );
}
