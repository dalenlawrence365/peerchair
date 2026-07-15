// Cron audit helper.
// Every cron route calls logCronRun() before each successful return path.
// /api/cron-health then checks recency of these rows to detect stale crons.

import { createClient } from "@supabase/supabase-js"

export async function logCronRun(cronName, summary, errors) {
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: (url, opts = {}) => fetch(url, { ...opts, cache: "no-store" }) } }
    )
    await sb.from("audit_log").insert({
      run_at: new Date().toISOString(),
      audit_type: `cron_run:${cronName}`,
      summary: summary || null,
      errors: errors && errors.length ? errors : null,
    })

    // A cron that fails silently is worse than one that never ran — the Outlook
    // syncs died for hours and only surfaced because a missing email was noticed
    // by hand. Surface failures in the notification badge instead.
    // Deduped per cron per day, so a persistently broken cron tells you once,
    // not every 30 minutes.
    if (errors && errors.length) {
      const today = new Date().toISOString().slice(0, 10)
      await sb.from("notifications").upsert([{
        kind: "cron_failure",
        person_id: null,
        title: `⚠ ${cronName} is failing`,
        body: `${summary || "Cron run failed"} — ${String(errors[0]).slice(0, 180)}`,
        href: "/health",
        dedup_key: `cron:${cronName}:${today}`,
      }], { onConflict: "dedup_key", ignoreDuplicates: true })
    }
  } catch (e) {
    // Don't let an audit failure break the cron itself.
    console.warn(`cron-audit insert failed for ${cronName}:`, e.message)
  }
}
