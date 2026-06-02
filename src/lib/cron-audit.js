// Cron audit helper.
// Every cron route calls logCronRun() before each successful return path.
// /api/cron-health then checks recency of these rows to detect stale crons.

import { createClient } from "@supabase/supabase-js"

export async function logCronRun(cronName, summary, errors) {
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
    await sb.from("audit_log").insert({
      run_at: new Date().toISOString(),
      audit_type: `cron_run:${cronName}`,
      summary: summary || null,
      errors: errors && errors.length ? errors : null,
    })
  } catch (e) {
    // Don't let an audit failure break the cron itself.
    console.warn(`cron-audit insert failed for ${cronName}:`, e.message)
  }
}
