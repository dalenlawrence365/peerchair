export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const maxDuration = 60
import { serverClient } from "@/lib/supabaseServer"

// POST /api/linkedin-messaging/import
// Body: { rows: [{ thread_id, participant_url, participant_name, direction: "IN"|"OUT", body, sent_at, folder }], source? }
// Every row goes through ingest_linkedin_message — the single write path for LinkedIn messages.
// It is idempotent: re-sending rows that already exist merges instead of duplicating, so the
// same LinkedIn data export can be uploaded repeatedly (monthly audit) without side effects.
// Auth: covered by the default-deny middleware (session cookie or CRON_SECRET bearer).

const MAX_ROWS = 200
const CONCURRENCY = 8

export async function POST(req) {
  let payload
  try { payload = await req.json() } catch (e) { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }
  const rows = Array.isArray(payload && payload.rows) ? payload.rows : null
  if (!rows) return Response.json({ error: "rows[] required" }, { status: 400 })
  if (rows.length > MAX_ROWS) return Response.json({ error: "Max " + MAX_ROWS + " rows per request" }, { status: 400 })
  const source = String((payload && payload.source) || "linkedin_export").slice(0, 40)

  const sb = serverClient()
  const result = { received: rows.length, inserted: 0, merged: 0, matched: 0, unmatched: 0, invalid: 0, errors: [] }
  let next = 0

  async function worker() {
    for (;;) {
      const i = next++
      if (i >= rows.length) return
      const r = rows[i] || {}
      const direction = String(r.direction || "").toUpperCase()
      const sentAt = r.sent_at ? new Date(r.sent_at) : null
      if (!r.thread_id || (direction !== "IN" && direction !== "OUT") || !sentAt || isNaN(sentAt.getTime()) || !String(r.body || "").trim()) {
        result.invalid++
        continue
      }
      const { data, error } = await sb.rpc("ingest_linkedin_message", {
        p: {
          thread_id: String(r.thread_id),
          participant_url: r.participant_url || null,
          participant_name: r.participant_name || null,
          direction,
          body: String(r.body),
          sent_at: sentAt.toISOString(),
          folder: r.folder || null,
          source,
        },
      })
      if (error) {
        if (result.errors.length < 5) result.errors.push({ row: i, message: error.message })
        continue
      }
      if (data && data.action === "inserted") result.inserted++
      else if (data && data.action === "merged") result.merged++
      if (data && data.matched) result.matched++
      else result.unmatched++
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return Response.json(result)
}
