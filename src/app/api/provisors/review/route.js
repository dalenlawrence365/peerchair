export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"
import { ingestProvisors, matchPerson } from "@/lib/provisorsIngest"

// GET  /api/provisors/review            -> list pending batches (+ optional ?status=)
// POST /api/provisors/review {batch_id, action:'approve'|'dismiss', selected?: number[]}
//   approve -> ingests the staged payload, marks batch approved, stores receipt
//   dismiss -> marks batch dismissed (no writes to people)
//
// `selected` is an array of row indices into payload.people. Approve used to be
// all-or-nothing: one roster, one button, 31 people. If a single row was wrong
// the only options were to accept it or reject the whole roster — so a bad row
// held 30 good ones hostage. Omit `selected` and every row is included, which
// keeps older callers working.
//
// Rows NOT selected are recorded on the batch rather than silently dropped:
// "I chose not to import this" is a decision worth being able to look up.

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
  const { batch_id, action, selected } = body || {}
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
  const allPeople = Array.isArray(payload.people) ? payload.people : []

  // Resolve the selection. No `selected` key => everything (back-compatible).
  let chosen = allPeople
  let excluded = []
  if (Array.isArray(selected)) {
    const keep = new Set(selected.map(Number).filter(function (n) { return Number.isInteger(n) }))
    chosen = allPeople.filter(function (_p, i) { return keep.has(i) })
    excluded = allPeople
      .map(function (p, i) { return { i: i, p: p } })
      .filter(function (x) { return !keep.has(x.i) })
      .map(function (x) {
        return { index: x.i, full_name: x.p.full_name || null, email: x.p.email || null, status: x.p._status || null }
      })
    if (!chosen.length) {
      return Response.json({ error: "Nothing selected — pick at least one person, or Dismiss the batch." }, { status: 400 })
    }
  }

  try {
    const result = await ingestProvisors(sb, {
      meetingGroup: payload.meetingGroup || batch.meeting_group,
      source: batch.source || "email",
      people: chosen,
    })

    // Record meeting attendance — rides on the approval. Needs a date + a known group.
    let attendance = null
    const mGroup = payload.meetingGroup || batch.meeting_group
    const mDate = payload.meetingDate || null
    if (mGroup && mDate) {
      // Exact match against a single tracked group — true for most rosters.
      const { data: grp } = await sb.from("provisors_groups").select("id").ilike("name", mGroup).limit(1)
      const groupId = grp && grp.length ? grp[0].id : null
      // JOINT sessions (multiple groups meeting together, e.g. "T&T, VDAM and
      // DAM, Joint In-Person") never match a single canonical group name —
      // the parser deliberately leaves meetingGroup as the free-text header
      // in that case (see provisorsParse.js PROMPT). This whole block used to
      // require groupId to be truthy, so a joint meeting silently got NO
      // provisors_meetings row and NO attendance recorded at all — the import
      // itself succeeded (people created/updated, individually tagged with
      // their real tracked groups), but the meeting instance just vanished,
      // with nothing logged to explain why. group_id on provisors_meetings is
      // nullable specifically so a meeting can exist without one canonical
      // group; find-or-create now runs regardless, keyed on (group_id, date)
      // when there IS a match, or (label, date) when there isn't — so a joint
      // meeting still gets its own row, still gets a roll call, and shows up
      // in Meetings with its real free-text name instead of not existing.
      let meetingQuery = sb.from("provisors_meetings").select("id").eq("meeting_date", mDate)
      meetingQuery = groupId ? meetingQuery.eq("group_id", groupId) : meetingQuery.is("group_id", null).eq("label", `${mGroup} — ${mDate}`)
      {
        let meetingId = null
        const { data: existingM } = await meetingQuery.limit(1)
        if (existingM && existingM.length) meetingId = existingM[0].id
        else {
          const { data: newM } = await sb.from("provisors_meetings")
            .insert({ group_id: groupId, meeting_date: mDate, label: `${mGroup} — ${mDate}`, source: batch.source || "email" })
            .select("id").single()
          meetingId = newM ? newM.id : null
        }
        if (meetingId) {
          // Roll call is a FACT off the roster; the import veto is a DECISION
          // about whether to write someone's profile. They are not the same
          // question, and deriving attendance from created+updated silently
          // let one answer the other: unticking a duplicate erased a person
          // from a meeting they demonstrably attended, and the owner — skipped
          // so his own record is never rewritten — never got recorded at all.
          //
          // So: everyone ON THE ROSTER who resolves to a person is marked
          // present, whether or not you chose to touch their profile.
          const presentIds = new Set()
          const unresolved = []
          for (const row of allPeople) {
            const nm = (row.full_name || "").trim()
            if (!nm) continue
            let pid = row._match && row._match.id ? row._match.id : null
            if (!pid) {
              // Resolve live — the payload is a snapshot from parse time and a
              // person may have been merged or aliased since it was staged.
              const m = await matchPerson(sb, {
                full_name: nm,
                email: (row.email || "").trim().toLowerCase(),
                company: (row.company || "").trim(),
                linkedin_url: (row.linkedin_url || "").trim(),
              })
              if (m) pid = m.id
            }
            if (pid) presentIds.add(pid)
            else unresolved.push(nm)
          }
          // Anyone newly created by this import was on the roster too.
          for (const c of (result.created || [])) if (c.id) presentIds.add(c.id)

          const ids = Array.from(presentIds)
          if (ids.length) {
            await sb.from("meeting_attendance").upsert(
              ids.map(pid => ({ meeting_id: meetingId, person_id: pid })),
              { onConflict: "meeting_id,person_id", ignoreDuplicates: true }
            )
          }
          attendance = {
            meeting_id: meetingId,
            recorded: ids.length,
            roster_size: allPeople.length,
            // Named, not swallowed: a roster row we can't tie to anyone is the
            // one case where attendance genuinely cannot be recorded.
            not_recorded: unresolved,
          }
        }
      }
    }

    await sb.from("provisor_import_batches").update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      ingest_result: Object.assign({}, result, {
        selected_count: chosen.length,
        total_rows: allPeople.length,
        excluded_by_reviewer: excluded,
      }),
    }).eq("id", batch_id)
    return Response.json({
      ok: true, status: "approved", ...result, attendance,
      selected_count: chosen.length, total_rows: allPeople.length,
      excluded_count: excluded.length,
    })
  } catch (e) {
    await sb.from("provisor_import_batches").update({ error: String(e && e.message || e) }).eq("id", batch_id)
    return Response.json({ error: String(e && e.message || e) }, { status: 500 })
  }
}
