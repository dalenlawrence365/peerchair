// Cron health monitor.
// Runs hourly. For each tracked cron, reads the most recent
// audit_log row of type cron_run:<name>. If the gap exceeds the
// route's threshold, emails an alert via Resend.
//
// Dedupe: only sends one alert per 6h window for the same set of
// stale crons. Subsequent cron-health runs during an outage still
// write audit rows (with "(dedup'd)" suffix) but skip the email.

export const dynamic = "force-dynamic"

import { adminClient } from "@/lib/supabaseServer"
import { sendAlert } from "@/lib/notify"
import { logCronRun } from "@/lib/cron-audit"

// Each entry: cron audit name, the route's published schedule, and the
// max acceptable gap (hours) between successful audit rows before we alert.
const EXPECTED = {
  "sync-sent":         { schedule: "every 30 min",       maxGapHours: 2.5 },
  "sync-email":        { schedule: "every 30 min",       maxGapHours: 2.5 },
  "sync-calendar":     { schedule: "every 30 min",       maxGapHours: 2.5 },
  "sync-calendar":     { schedule: "every 30 min",       maxGapHours: 2.5 },
  "scheduled-send":    { schedule: "16:00 and 20:00 UTC", maxGapHours: 26 },
  "microsoft-refresh": { schedule: "14:00 UTC daily",     maxGapHours: 26 },
}

export async function GET(request) {
  const auth = request.headers.get("authorization") || ""
  const expected = `Bearer ${process.env.CRON_SECRET || "cfocircle2026"}`
  if (auth !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const sb = adminClient()

  const now = Date.now()
  const checks = {}

  for (const [name, cfg] of Object.entries(EXPECTED)) {
    const { data, error } = await sb.from("audit_log")
      .select("run_at")
      .eq("audit_type", `cron_run:${name}`)
      .order("run_at", { ascending: false })
      .limit(1)

    if (error) {
      checks[name] = { status: "check_error", error: error.message, max_gap_hours: cfg.maxGapHours }
      continue
    }
    if (!data || !data.length) {
      checks[name] = { status: "never_ran", schedule: cfg.schedule, max_gap_hours: cfg.maxGapHours }
      continue
    }

    const gapHours = (now - new Date(data[0].run_at).getTime()) / (60 * 60 * 1000)
    const stale = gapHours > cfg.maxGapHours
    checks[name] = {
      status: stale ? "stale" : "ok",
      last_run: data[0].run_at,
      gap_hours: Number(gapHours.toFixed(2)),
      max_gap_hours: cfg.maxGapHours,
      schedule: cfg.schedule,
    }
  }

  const stale = Object.entries(checks).filter(([_, c]) => c.status !== "ok")

  if (stale.length === 0) {
    await logCronRun("cron-health", `All ${Object.keys(EXPECTED).length} crons fresh`)
    return Response.json({ status: "ok", checks })
  }

  // Dedupe: if cron-health already wrote a row with errors within the
  // last 6h, skip the email but still record this check.
  const sixHoursAgo = new Date(now - 6 * 60 * 60 * 1000).toISOString()
  const { data: recentAlerts } = await sb.from("audit_log")
    .select("id")
    .eq("audit_type", "cron_run:cron-health")
    .gte("run_at", sixHoursAgo)
    .not("errors", "is", null)
    .limit(1)

  const alreadyAlerted = recentAlerts && recentAlerts.length > 0

  if (!alreadyAlerted) {
    const subject = `⚠️ PeerChair cron stale — ${stale.map(([n]) => n).join(", ")}`
    const lines = stale.map(([name, c]) => {
      if (c.status === "never_ran") {
        return `• ${name} — never recorded a run (${c.schedule})`
      }
      if (c.status === "check_error") {
        return `• ${name} — health check itself errored: ${c.error}`
      }
      return `• ${name} — ${c.gap_hours}h since last run (threshold ${c.max_gap_hours}h, schedule "${c.schedule}")`
    })
    const body =
      "One or more PeerChair crons have not written audit rows within their expected window:\n\n" +
      lines.join("\n") +
      "\n\nCheck https://vercel.com/dalenlawrence365s-projects/peerchair/observability/crons for status codes and durations.\n\nThis is the first alert for this outage; you won't get another email about the same crons within 6 hours."

    const html =
      `<div style="font-family:sans-serif;max-width:520px;padding:20px">
        <h2 style="color:#c0392b;margin:0 0 12px">⚠️ PeerChair cron stale</h2>
        <ul style="font-size:14px;line-height:1.6;margin:0 0 16px;padding-left:20px">
          ${lines.map(l => `<li>${l.replace(/^• /,'')}</li>`).join("")}
        </ul>
        <a href="https://vercel.com/dalenlawrence365s-projects/peerchair/observability/crons" style="background:#c0392b;color:#fff;padding:10px 20px;border-radius:5px;text-decoration:none;font-weight:bold">Open Vercel Crons →</a>
        <p style="font-size:12px;color:#888;margin-top:16px">First alert for this outage. No further emails for these crons within 6 hours.</p>
      </div>`

    await sendAlert(subject, body, html)
  }

  await logCronRun(
    "cron-health",
    `STALE: ${stale.map(([n, c]) => `${n}(${c.gap_hours ?? "?"}h)`).join(", ")}${alreadyAlerted ? " — dedup'd" : " — alerted"}`,
    stale.map(([n]) => n)
  )

  return Response.json({
    status: "stale",
    alerted: !alreadyAlerted,
    stale_count: stale.length,
    checks,
  })
}
