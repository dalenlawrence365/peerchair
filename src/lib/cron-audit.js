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
    // A single failed run is usually a transient blip (e.g. a Microsoft 504) that the next run's
    // lookback window covers. Only alert when the previous run of this cron (within 2h) also failed
    // or when there's no recent successful run to lean on.
    let blip = false
    if (errors && errors.length) {
      const { data: prev } = await sb.from("audit_log").select("run_at, errors")
        .eq("audit_type", `cron_run:${cronName}`).order("run_at", { ascending: false }).range(1, 1)
      const p0 = prev && prev[0]
      blip = !!(p0 && !(p0.errors && p0.errors.length) && Date.now() - new Date(p0.run_at).getTime() < 2 * 60 * 60 * 1000)
    }
    if (errors && errors.length && !blip) {
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
