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

    // Record meeting attendance — rides on the approval. Needs a date + a known group.
    let attendance = null
    const mGroup = payload.meetingGroup || batch.meeting_group
    const mDate = payload.meetingDate || null
    if (mGroup && mDate) {
      const { data: grp } = await sb.from("provisors_groups").select("id").ilike("name", mGroup).limit(1)
      const groupId = grp && grp.length ? grp[0].id : null
      if (groupId) {
        // find-or-create the meeting for (group, date)
        let meetingId = null
        const { data: existingM } = await sb.from("provisors_meetings").select("id").eq("group_id", groupId).eq("meeting_date", mDate).limit(1)
        if (existingM && existingM.length) meetingId = existingM[0].id
        else {
          const { data: newM } = await sb.from("provisors_meetings")
            .insert({ group_id: groupId, meeting_date: mDate, label: `${mGroup} — ${mDate}`, source: batch.source || "email" })
            .select("id").single()
          meetingId = newM ? newM.id : null
        }
        if (meetingId) {
          const ids = [...(result.created || []), ...(result.updated || [])].map(x => x.id).filter(Boolean)
          if (ids.length) {
            await sb.from("meeting_attendance").upsert(
              ids.map(pid => ({ meeting_id: meetingId, person_id: pid })),
              { onConflict: "meeting_id,person_id", ignoreDuplicates: true }
            )
          }
          attendance = { meeting_id: meetingId, recorded: ids.length }
        }
      }
    }

    await sb.from("provisor_import_batches").update({
      status: "approved", reviewed_at: new Date().toISOString(), ingest_result: result,
    }).eq("id", batch_id)
    return Response.json({ ok: true, status: "approved", ...result, attendance })
  } catch (e) {
    await sb.from("provisor_import_batches").update({ error: String(e && e.message || e) }).eq("id", batch_id)
    return Response.json({ error: String(e && e.message || e) }, { status: 500 })
  }
}
