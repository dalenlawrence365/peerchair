export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"
import { ingestProvisors } from "@/lib/provisorsIngest"

// POST /api/provisors/ingest — the shared public ingest path (cron / extension / manual).
// Body: { meetingGroup?, source?, people:[{full_name,title,company,email,phone,location,
//         headline,industry,website,address,zip,groups?:[]}] }
export async function POST(request) {
  let body
  try { body = await request.json() } catch (e) { return Response.json({ error: "invalid JSON" }, { status: 400 }) }
  if (!Array.isArray(body.people)) return Response.json({ error: "people array required" }, { status: 400 })
  const sb = serverClient()
  try {
    const result = await ingestProvisors(sb, { meetingGroup: body.meetingGroup, source: body.source, people: body.people })
    return Response.json({ ok: true, ...result })
  } catch (e) {
    return Response.json({ error: String(e && e.message || e) }, { status: 500 })
  }
}
