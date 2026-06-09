export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"
import { ingestProvisors } from "@/lib/provisorsIngest"

// GET  /api/provisors/review            -> list pending batches (+ optional ?status=)
// POST /api/provisors/review {batch_id, action:'approve'|'dismiss'}
//   approve -> runs the shared ingest on the staged payload, marks batch approved, stores receipt
//   dismiss -> marks batch dismissed (no writes to people)

export async function GET(request) {
  const sb = serverClient()
  const url = new URL(request.url)
  const status = url.searchParams.get("status") || "pending"
  const { data, error } = await sb
    .from("provisor_import_batches")
    .select("id, source, meeting_group, filename, status, summary, created_at, reviewed_at")
    .eq("status", status)
    .order("created_at", { ascending: false })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ batches: data || [] })
}

export async function POST(request) {
  let body
  try { body = await request.json() } catch (e) { return Response.json({ error: "invalid JSON" }, { status: 400 }) }
  const { batch_id, action } = body || {}
  if (!batch_id || !["approve", "dismiss"].includes(action)) {
    return Response.json({ error: "batch_id and action(approve|dismiss) required" }, { status: 400 })
  }
  const sb = serverClient()
  const { data: batch, error: be } = await sb.from("provisor_import_batches").select("*").eq("id", batch_id).single()
  if (be || !batch) return Response.json({ error: "batch not found" }, { status: 404 })
  if (batch.status !== "pending") return Response.json({ error: `batch already ${batch.status}` }, { status: 409 })

  if (action === "dismiss") {
    await sb.from("provisor_import_batches").update({ status: "dismissed", reviewed_at: new Date().toISOString() }).eq("id", batch_id)
    return Response.json({ ok: true, status: "dismissed" })
  }

  const payload = batch.payload || {}
  try {
    const result = await ingestProvisors(sb, {
      meetingGroup: payload.meetingGroup || batch.meeting_group,
      source: batch.source || "email",
      people: payload.people || [],
    })
    await sb.from("provisor_import_batches").update({
      status: "approved", reviewed_at: new Date().toISOString(), ingest_result: result,
    }).eq("id", batch_id)
    return Response.json({ ok: true, status: "approved", ...result })
  } catch (e) {
    await sb.from("provisor_import_batches").update({ error: String(e && e.message || e) }).eq("id", batch_id)
    return Response.json({ error: String(e && e.message || e) }, { status: 500 })
  }
}
