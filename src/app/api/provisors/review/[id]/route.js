export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// GET /api/provisors/review/[id] — full review detail for one pending batch.
// Returns each rostered person and, for EXISTING matches, the exact field-level
// changes Approve will apply — computed with the SAME write-rules as
// ingestProvisors (list supersedes title/company/phone/location; email/linkedin/
// headline fill only when blank; firmographics gap-fill; group links are additive).
// This is what makes Approve a real decision instead of a rubber stamp.

const norm = (v) => String(v == null ? "" : v).trim()
const changed = (from, to) => norm(to) && norm(from) !== norm(to)

export async function GET(_request, { params }) {
  const { id } = await params
  const sb = serverClient()

  const { data: batch, error } = await sb.from("provisor_import_batches").select("*").eq("id", id).single()
  if (error || !batch) return Response.json({ error: "batch not found" }, { status: 404 })

  const payload = batch.payload || {}
  const meetingGroup = payload.meetingGroup || batch.meeting_group || null
  const people = Array.isArray(payload.people) ? payload.people : []

  // Batches staged before the owner flag existed carry no _status:'self', so
  // resolve the owner here too and let the flag apply retroactively.
  const { data: owners } = await sb.from("people").select("id").eq("is_owner", true)
  const ownerIds = new Set((owners || []).map(function (o) { return o.id }))

  // Pull current DB state for matched (existing) people in one shot.
  const ids = [...new Set(people.map(p => p._match && p._match.id).filter(Boolean))]
  const curById = {}
  const groupsByPerson = {}
  if (ids.length) {
    const { data: rows } = await sb.from("people")
      .select("id, title, company, phone, location, email, linkedin_url, headline, firmographics").in("id", ids)
    for (const r of (rows || [])) curById[r.id] = r
    const { data: links } = await sb.from("person_provisors_groups").select("person_id, group_id").in("person_id", ids)
    // Resolve group ids -> names for "already linked" comparison
    const gids = [...new Set((links || []).map(l => l.group_id))]
    const gname = {}
    if (gids.length) {
      const { data: grps } = await sb.from("provisors_groups").select("id, name").in("id", gids)
      for (const g of (grps || [])) gname[g.id] = g.name
    }
    for (const l of (links || [])) {
      (groupsByPerson[l.person_id] = groupsByPerson[l.person_id] || new Set()).add(gname[l.group_id] || l.group_id)
    }
  }

  let withChanges = 0, unchanged = 0, newCount = 0, selfCount = 0
  const enriched = people.map((p, i) => {
    // The owner is on every roster he attends. Never importable.
    if (p._status === "self" || (p._match && p._match.is_owner) || ownerIds.has(p._match && p._match.id)) {
      selfCount++
      return { ...p, _index: i, _status: "self", _changes: null }
    }
    if (p._status === "new" || !(p._match && p._match.id)) {
      newCount++
      return { ...p, _index: i, _status: "new", _changes: null }
    }
    const cur = curById[p._match.id] || {}
    const changes = []
    if (changed(cur.title, p.title)) changes.push({ field: "Title", from: cur.title || "", to: p.title })
    if (changed(cur.company, p.company)) changes.push({ field: "Company", from: cur.company || "", to: p.company })
    if (changed(cur.phone, p.phone)) changes.push({ field: "Phone", from: cur.phone || "", to: p.phone })
    if (changed(cur.location, p.location)) changes.push({ field: "Location", from: cur.location || "", to: p.location })
    // fill-only fields
    if (!norm(cur.email) && norm(p.email)) changes.push({ field: "Email", from: "", to: p.email, fill: true })
    if (!norm(cur.linkedin_url) && norm(p.linkedin_url)) changes.push({ field: "LinkedIn", from: "", to: p.linkedin_url, fill: true })
    if (!norm(cur.headline) && norm(p.headline)) changes.push({ field: "Headline", from: "", to: p.headline, fill: true })
    // firmographics gap-fill
    const fg = cur.firmographics || {}
    for (const [label, val] of [["Industry", p.industry], ["Address", p.address], ["Zip", p.zip], ["Website", p.website]]) {
      const k = label.toLowerCase()
      if ((fg[k] == null || fg[k] === "") && norm(val)) changes.push({ field: label, from: "", to: val, fill: true })
    }
    // additive group links
    const already = groupsByPerson[p._match.id] || new Set()
    const wantGroups = [meetingGroup, ...(p.groups || [])].filter(Boolean)
    const newGroups = [...new Set(wantGroups)].filter(g => !already.has(g))
    if (newGroups.length) changes.push({ field: "Groups", addGroups: newGroups })

    if (changes.length) withChanges++; else unchanged++
    return { ...p, _index: i, _status: "existing", _changes: changes }
  })

  return Response.json({
    batch: { id: batch.id, meeting_group: meetingGroup, meetingDate: payload.meetingDate || null, filename: batch.filename, source: batch.source, status: batch.status, created_at: batch.created_at },
    summary: { total: people.length, new: newCount, existing: withChanges + unchanged, withChanges, unchanged, self: selfCount },
    people: enriched,
  })
}
