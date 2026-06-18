export const dynamic = "force-dynamic"
export const maxDuration = 120
import { serverClient } from "@/lib/supabaseServer"
import { parseAndStageRoster } from "@/lib/provisorsParse"

// POST /api/provisors/parse — manual roster intake. A ProVisors roster PDF comes
// in (base64); the shared core extracts attendees, runs the dedupe analysis, and
// drops a PENDING batch into provisor_import_batches for one-click review/approve.
// The hourly Outlook cron (/api/provisors/poll-email) uses the same core.
// Body: { pdf_base64, filename?, source?, sourceMessageId? }
export async function POST(request) {
  let body
  try { body = await request.json() } catch (e) { return Response.json({ error: "invalid JSON" }, { status: 400 }) }
  if (!body.pdf_base64) return Response.json({ error: "pdf_base64 required" }, { status: 400 })
  try {
    const sb = serverClient()
    const result = await parseAndStageRoster(sb, {
      pdf_base64: body.pdf_base64,
      filename: body.filename || null,
      source: body.source || "email",
      sourceMessageId: body.sourceMessageId || null,
    })
    if (result.duplicate) return Response.json({ ok: true, duplicate: true, batch_id: result.batch_id, status: result.status })
    return Response.json({ ok: true, batch_id: result.batch_id, meetingGroup: result.meetingGroup, summary: result.summary })
  } catch (e) {
    return Response.json({ error: String(e && e.message || e) }, { status: 502 })
  }
}
