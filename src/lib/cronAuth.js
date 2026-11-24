// Shared secret for Vercel cron jobs and server-to-server calls (Authorization: Bearer <CRON_SECRET>).
// FAIL-CLOSED: when CRON_SECRET is not set this returns a fresh random string on every call,
// so no request can ever match it. There is deliberately no hard-coded fallback: this
// repository is public and a fallback in code is a published password.
export function cronSecret() {
  return process.env.CRON_SECRET || ("unset-" + crypto.randomUUID())
}
