import { serverClient } from "@/lib/supabaseServer"

// Shared ProVisors ingest logic — the SINGLE source of truth used by the public
// /api/provisors/ingest endpoint, the review-queue Approve action, and (later) the
// email cron + Chrome extension. Encodes the rules validated on the VDAM/MMAG rosters.
//
// Rules: dedupe email -> name+company; create-or-update; list supersedes title/company/
// phone/location; firmographics fill gaps only; provisors_member=true; NEVER sets roles;
// group links go only to groups that already exist (unknown groups skipped, never created).

async function findGroupId(sb, name, cache) {
  if (!name) return null
  const key = name.trim()
  if (key in cache) return cache[key]
  const { data } = await sb.from("provisors_groups").select("id").ilike("name", key).limit(1)
  cache[key] = (data && data.length) ? data[0].id : null
  return cache[key]
}

// Resolve an existing person by email, then name+company. Returns the row or null.
export async function matchPerson(sb, { full_name, email, company }) {
  const fullName = (full_name || "").trim()
  const e = (email || "").trim().toLowerCase()
  const co = (company || "").trim()
  if (e) {
    const { data } = await sb.from("people").select("id, email, firmographics, headline, full_name, company").ilike("email", e).limit(1)
    if (data && data.length) return data[0]
  }
  if (fullName && co) {
    const { data } = await sb.from("people").select("id, email, firmographics, headline, full_name, company").ilike("full_name", fullName).ilike("company", co).limit(1)
    if (data && data.length) return data[0]
  }
  return null
}

export async function ingestProvisors(sb, { meetingGroup, source, people } = {}) {
  if (!Array.isArray(people)) throw new Error("people array required")
  const src = source || "photo_list"
  const groupCache = {}
  const created = [], updated = [], skipped = []

  for (const p of people) {
    const fullName = (p.full_name || "").trim()
    if (!fullName) { skipped.push({ reason: "no name", row: p }); continue }
    const email = (p.email || "").trim().toLowerCase()
    const company = (p.company || "").trim()

    const existing = await matchPerson(sb, { full_name: fullName, email, company })

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
      const ins = { full_name: fullName, provisors_member: true, firmographics: fg, source: src }
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

    const names = []
    if (meetingGroup) names.push(meetingGroup)
    for (const gn of (p.groups || [])) names.push(gn)
    for (const gn of names) {
      const gid = await findGroupId(sb, gn, groupCache)
      if (gid) {
        await sb.from("person_provisors_groups")
          .upsert({ person_id: personId, group_id: gid, source: src }, { onConflict: "person_id,group_id", ignoreDuplicates: true })
      }
    }
  }

  return { created, updated, skipped, created_count: created.length, updated_count: updated.length, skipped_count: skipped.length }
}
