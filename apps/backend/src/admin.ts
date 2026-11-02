/** Admin privileges are configured by the operator, never by account signup. */
export function isAdmin(userId: number, email: string): boolean {
  return (process.env.ADMIN_USER_IDS || "").split(",").some(
    (entry) => entry.trim() !== "" && entry.trim() === String(userId),
  ) || (process.env.ADMIN_EMAILS || "").split(",").some(
    (entry) => entry.trim() !== "" && entry.trim().toLowerCase() === email.trim().toLowerCase(),
  );
}
