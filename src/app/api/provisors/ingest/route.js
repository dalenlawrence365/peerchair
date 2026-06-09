export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// POST /api/provisors/ingest
// The ONE shared path for adding ProVisors to PeerChair — targeted by the email-roster
// cron, the Chrome extension, and manual entry. Encodes the rules we validated by hand
// on the VDAM and MMAG rosters.
//
// Body: {
//   meetingGroup?: "Middle Market Affinity Group",   // header group every attendee inherits
//   source?: "photo_list" | "chrome_extension" | "manual",
//   people: [{ full_name, title, company, email, phone, location, headline,
//              industry, website, address, zip, groups?: ["Transactions & Transitions", ...] }]
// }
//
// Rules: dedupe email -> name+company; create-or-update; list supersedes title/company/
// phone/location; firmographics fill gaps only; provisors_member=true; NEVER sets roles
// (referral_partner is earned, cfo is granted deliberately). Group links go only to groups
// that already exist (no auto-create of arbitrary affinity groups); unknown groups are skipped.

async function findGroupId(sb, name, cache) {
  if (!name) return null
  const key = name.trim()
  if (key in cache) return cache[key]
  const { data } = await sb.from("provisors_groups").select("id").ilike("name", key).limit(1)
  cache[key] = (data && data.length) ? data[0].id : null
  return cache[key]
}

export async function POST(request) {
  let body
  try { body = await request.json() } catch (e) { return Response.json({ error: "invalid JSON" }, { status: 400 }) }
  const people = Array.isArray(body.people) ? body.people : null
  if (!people) return Response.json({ error: "people array required" }, { status: 400 })

  const sb = serverClient()
  const source = body.source || "photo_list"
  const groupCache = {}
  const created = [], updated = [], skipped = []

  for (const p of people) {
    const fullName = (p.full_name || "").trim()
    if (!fullName) { skipped.push({ reason: "no name", row: p }); continue }
    const email = (p.email || "").trim().toLowerCase()
    const company = (p.company || "").trim()

    // Dedupe: email first, then name + company (catches no-email / mangled-name records)
    let existing = null
    if (email) {
      const { data } = await sb.from("people").select("id, email, firmographics, headline").ilike("email", email).limit(1)
      if (data && data.length) existing = data[0]
    }
    if (!existing && fullName && company) {
      const { data } = await sb.from("people").select("id, email, firmographics, headline").ilike("full_name", fullName).ilike("company", company).limit(1)
      if (data && data.length) existing = data[0]
    }

    // firmographics: fill gaps only (never clobber)
    const fg = Object.assign({}, (existing && existing.firmographics) || {})
    for (const [k, v] of [["industry", p.industry], ["website", p.website], ["address", p.address], ["zip", p.zip]]) {
      if ((fg[k] === undefined || fg[k] === null || fg[k] === "") && v) fg[k] = v
    }

    let personId
    if (existing) {
      const patch = { provisors_member: true, firmographics: fg, updated_at: new Date().toISOString() }
      if (p.title) patch.title = p.title
      if (company) patch.company = company
      if (p.phone) patch.phone = p.phone
      if (p.location) patch.location = p.location
      if (email && !existing.email) patch.email = email
      if (p.headline && (!existing.headline || existing.headline === "")) patch.headline = p.headline
      const { error } = await sb.from("people").update(patch).eq("id", existing.id)
      if (error) { skipped.push({ reason: error.message, name: fullName }); continue }
      personId = existing.id
      updated.push({ id: personId, name: fullName })
    } else {
      const ins = { full_name: fullName, provisors_member: true, firmographics: fg, source }
      if (p.title) ins.title = p.title
      if (company) ins.company = company
      if (email) ins.email = email
      if (p.phone) ins.phone = p.phone
      if (p.location) ins.location = p.location
      if (p.headline) ins.headline = p.headline
      const { data: row, error } = await sb.from("people").insert(ins).select("id").single()
      if (error || !row) { skipped.push({ reason: error ? error.message : "insert failed", name: fullName }); continue }
      personId = row.id
      created.push({ id: personId, name: fullName })
    }

    // Group links: header (meeting) group + any groups on the person's card. Existing groups only.
    const names = []
    if (body.meetingGroup) names.push(body.meetingGroup)
    for (const gn of (p.groups || [])) names.push(gn)
    for (const gn of names) {
      const gid = await findGroupId(sb, gn, groupCache)
      if (gid) {
        await sb.from("person_provisors_groups")
          .upsert({ person_id: personId, group_id: gid, source }, { onConflict: "person_id,group_id", ignoreDuplicates: true })
      }
    }
  }

  return Response.json({
    ok: true,
    created_count: created.length,
    updated_count: updated.length,
    skipped_count: skipped.length,
    created, updated, skipped,
  })
}
