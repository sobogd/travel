import { resolveOwner, isAllowed } from "@/lib/auth";

// Admin = any user that passes the Telegram allowlist (ALLOWED_TG_IDS). Returns
// true when the request is from such a user. Same gate as the rest of the app —
// there is no separate admin tier.
export function isAdminRequest(req: Request): boolean {
  const owner = resolveOwner(req);
  return !!owner && isAllowed(owner);
}

// Never expose the full key to the client — show only the last 4 chars.
export function maskKey(key: string): string {
  return key.length <= 4 ? "••••" : `••••${key.slice(-4)}`;
}
