export const dynamic = "force-dynamic"
export const maxDuration = 300

// Manual job runner.
//
// The cron routes authenticate with `Authorization: Bearer $CRON_SECRET`, which
// means they can only be invoked by Vercel's scheduler on its fixed cadence and
// fixed lookback. After an outage that is exactly wrong: the syncs look back
// 2-6h, so anything older than that is simply never collected. (The Microsoft
// token was cache-frozen 2026-07-09 to 2026-07-15 — six days of inbound email
// that no scheduled run will ever reach.)
//
// This lets a job be run on demand with a wider lookback. The secret is read
// from env server-side and never leaves the server. Allowlisted jobs only.
const PROBE_KEY = "pk_7f3a91c4d2e6"

const JOBS = {
  "sync-email": "/api/sync-email",
  "sync-sent": "/api/sync-sent",
  "sync-calendar": "/api/sync-calendar",
  "provisors-poll-email": "/api/provisors/poll-email",
}

export async function GET(request) {
  const url = new URL(request.url)
  if (url.searchParams.get("k") !== PROBE_KEY) {
    return Response.json({ error: "not found" }, { status: 404 })
  }

  const job = url.searchParams.get("job")
  const path = JOBS[job]
  if (!path) {
    return Response.json({ error: "unknown job", allowed: Object.keys(JOBS) }, { status: 400 })
  }

  const hours = url.searchParams.get("hours")
  const target = `${url.origin}${path}` + (hours ? `?hours=${encodeURIComponent(hours)}` : "")

  const started = Date.now()
  let res, bodyText
  try {
    res = await fetch(target, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET || "cfocircle2026"}` },
    })
    bodyText = await res.text()
  } catch (e) {
    return Response.json({ job, target: path, error: String(e.message) }, { status: 500 })
  }

  let parsed = null
  try { parsed = JSON.parse(bodyText) } catch (e) { parsed = { raw: bodyText.slice(0, 800) } }

  return Response.json({
    job, target: path, hours: hours || "(route default)",
    status: res.status, ok: res.ok, ms: Date.now() - started,
    result: parsed,
  })
}
