// first-degree network view: list sourced from people.linkedin_connected (redeploy bump 2)
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

import { serverClient } from "@/lib/supabaseServer"
import { parseCsv, normalizeLinkedInUrl, pickField } from "@/lib/csv"
import { isLinkedInConnectionsEnabled } from "@/lib/features"

function flagged() {
  return Response.json({ error: "LinkedIn Connections module not enabled" }, { status: 404 })
}

// GET — paginated list of first-degree people (linkedin_connected), filtered by ROLE.
// Sources from the people table (the unified superset), NOT the frozen linkedin_connections
// snapshot. Counts use head:true so they are not capped at Supabase's 1000-row .select() limit.
const SEL = "id, full_name, linkedin_url, title, company, headline, location, roles, provisors_member, cfo_circle_member, sponsor_state, cfo_state, referral_state, source, linkedin_connected, inbound_request"

function applyRole(query, role) {
  switch (role) {
    case "provisor":   return query.eq("provisors_member", true)
    case "cfo_circle": return query.eq("cfo_circle_member", true)
    case "sponsor":    return query.contains("roles", ["sponsor_contact"])
    case "cfo":        return query.contains("roles", ["cfo"])
    case "referral":   return query.contains("roles", ["referral_partner"])
    case "none":       return query.eq("provisors_member", false).eq("cfo_circle_member", false).or("roles.is.null,roles.eq.{}")
    default:           return query // "all"
  }
}

export async function GET(request) {
  if (!isLinkedInConnectionsEnabled()) return flagged()
  const sb = serverClient()
  const url = new URL(request.url)
  const role   = url.searchParams.get("role") || "all"
  const q      = url.searchParams.get("q")
  const limit  = Math.min(Number(url.searchParams.get("limit")) || 100, 500)
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0)

  const HOSP_TAG = "hospitality_restaurant"
  const isHosp = role === "hospitality"

  let query
  if (isHosp) {
    query = sb.from("people")
      .select(`${SEL}, person_status_tags!inner(tag, removed_at)`, { count: "exact" })
      .eq("linkedin_connected", true)
      .eq("person_status_tags.tag", HOSP_TAG)
      .is("person_status_tags.removed_at", null)
  } else {
    query = sb.from("people").select(SEL, { count: "exact" }).eq("linkedin_connected", true)
    query = applyRole(query, role)
  }
  if (q) query = query.or(`full_name.ilike.%${q}%,company.ilike.%${q}%,title.ilike.%${q}%`)
  query = query.order("full_name", { ascending: true }).range(offset, offset + limit - 1)

  const { data, count, error } = await query
  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Attach the hospitality_restaurant flag for the pill.
  let items
  if (isHosp) {
    items = (data || []).map(function(d){ const { person_status_tags, ...rest } = d; return { ...rest, hospitality_restaurant: true } })
  } else {
    const ids = (data || []).map(function(d){ return d.id })
    let hospSet = new Set()
    if (ids.length) {
      const { data: tags } = await sb.from("person_status_tags")
        .select("person_id").eq("tag", HOSP_TAG).is("removed_at", null).in("person_id", ids)
      hospSet = new Set((tags || []).map(function(t){ return t.person_id }))
    }
    items = (data || []).map(function(d){ return { ...d, hospitality_restaurant: hospSet.has(d.id) } })
  }

  // Filter-chip counts — head:true so they reflect the true totals, not a 1000-row cap.
  async function cnt(r) {
    let qq = sb.from("people").select("id", { count: "exact", head: true }).eq("linkedin_connected", true)
    qq = applyRole(qq, r)
    const { count } = await qq
    return count || 0
  }
  async function hospCnt() {
    const { count } = await sb.from("person_status_tags")
      .select("person_id, people!inner(linkedin_connected)", { count: "exact", head: true })
      .eq("tag", HOSP_TAG).is("removed_at", null).eq("people.linkedin_connected", true)
    return count || 0
  }
  const [all, provisor, sponsor, cfo, referral, cfo_circle, none, hospitality] = await Promise.all([
    cnt("all"), cnt("provisor"), cnt("sponsor"), cnt("cfo"), cnt("referral"), cnt("cfo_circle"), cnt("none"), hospCnt(),
  ])

  return Response.json({
    items: items,
    total_filtered: count || 0,
    counts: { all, provisor, sponsor, cfo, referral, cfo_circle, none, hospitality },
  })
}

// POST — import a CSV file. multipart/form-data with field "file" + optional "source" + optional "default_relevance"
export async function POST(request) {
  if (!isLinkedInConnectionsEnabled()) return flagged()
  const sb = serverClient()

  const form = await request.formData()
  const file = form.get("file")
  const sourceLabel = (form.get("source") || "").toString().trim() || "linkedin_organic"
  const defaultRelevance = (form.get("default_relevance") || "unrated").toString().trim()
  const filename = (file && typeof file !== "string" && file.name) || "upload.csv"

  if (!file || typeof file === "string") {
    return Response.json({ error: "No file in form data (field 'file')" }, { status: 400 })
  }

  const validRelevance = ["cfo_circle", "stalliant", "network_visibility", "legacy", "unrated"]
  if (!validRelevance.includes(defaultRelevance)) {
    return Response.json({ error: "Invalid default_relevance" }, { status: 400 })
  }

  const text = await file.text()
  const { headers, rows } = parseCsv(text)
  if (rows.length === 0) return Response.json({ error: "CSV has no data rows", headers }, { status: 400 })

  // Create batch row up front so we can record results regardless of partial failure
  const { data: batchRow, error: batchErr } = await sb.from("linkedin_import_batches")
    .insert({ source_filename: filename, rows_total: rows.length, notes: `source=${sourceLabel} default_relevance=${defaultRelevance}` })
    .select("id")
    .single()
  if (batchErr) return Response.json({ error: "Could not create batch row: " + batchErr.message }, { status: 500 })

  // Field-name candidates per common LinkedIn / LinkedHelper / Sales Navigator CSVs
  const FIELDS = {
    linkedin_url:   ["LinkedIn URL", "URL", "Profile URL", "linkedinUrl", "Link", "Profile Link"],
    first_name:     ["First Name", "First name", "Firstname", "firstName"],
    last_name:      ["Last Name", "Last name", "Lastname", "lastName"],
    full_name:      ["Name", "Full Name", "fullName"],
    headline:       ["Headline", "Position Title", "Title", "headline"],
    current_company:["Company", "Current Company", "Organization", "company"],
    current_title:  ["Position", "Job Title", "Title", "Current Position"],
    location:       ["Location", "Geography", "City"],
    connected_at:   ["Connected On", "Connection Date", "Connected"],
    email:          ["Email", "Email Address"],
  }

  // Build URL set, normalize, find existing matches and the people-table cross-references in one pass
  const incoming = rows.map(r => {
    const rawUrl = pickField(r, FIELDS.linkedin_url)
    const url = normalizeLinkedInUrl(rawUrl)
    const first = pickField(r, FIELDS.first_name)
    const last  = pickField(r, FIELDS.last_name)
    const full  = pickField(r, FIELDS.full_name) || [first, last].filter(Boolean).join(" ").trim() || null
    const company = pickField(r, FIELDS.current_company)
    const title   = pickField(r, FIELDS.current_title)
    const headline = pickField(r, FIELDS.headline)
    const location = pickField(r, FIELDS.location)
    const connectedRaw = pickField(r, FIELDS.connected_at)
    let connectedAt = null
    if (connectedRaw) {
      const d = new Date(connectedRaw)
      if (!isNaN(d.getTime())) connectedAt = d.toISOString()
    }
    return { url, first, last, full, company, title, headline, location, connectedAt }
  }).filter(x => x.url)

  if (incoming.length === 0) {
    await sb.from("linkedin_import_batches").update({ rows_skipped: rows.length, notes: `No rows had a recognizable LinkedIn URL column. Headers: ${headers.join(", ")}` }).eq("id", batchRow.id)
    return Response.json({ error: "No rows had a recognizable LinkedIn URL column", headers }, { status: 400 })
  }

  const urls = incoming.map(x => x.url)

  // Existing connection rows (by url)
  const { data: existing } = await sb.from("linkedin_connections")
    .select("id, linkedin_url, relevance, heat, source, peerchair_person_id")
    .in("linkedin_url", urls)
  const existingByUrl = {}
  for (const r of (existing || [])) existingByUrl[r.linkedin_url] = r

  // people cross-reference (try both normalized and raw URLs; people table may have www. variants)
  const { data: peopleRows } = await sb.from("people")
    .select("id, linkedin_url")
    .not("linkedin_url", "is", null)
  const peopleByNormalizedUrl = {}
  for (const p of (peopleRows || [])) {
    const norm = normalizeLinkedInUrl(p.linkedin_url)
    if (norm) peopleByNormalizedUrl[norm] = p.id
  }

  // Build inserts and updates
  const inserts = []
  const updates = []
  const nowIso = new Date().toISOString()

  for (const x of incoming) {
    const personId = peopleByNormalizedUrl[x.url] || null
    const ex = existingByUrl[x.url]

    if (ex) {
      // Update LinkedIn-side fields + last_seen_at. Preserve curated fields.
      updates.push({
        id: ex.id,
        full_name: x.full,
        first_name: x.first,
        last_name: x.last,
        headline: x.headline,
        current_company: x.company,
        current_title: x.title,
        location: x.location,
        connected_at: x.connectedAt || undefined,
        last_seen_at: nowIso,
        connection_status: "connected",   // they're in the export, so connected
        peerchair_person_id: ex.peerchair_person_id || personId,
        updated_at: nowIso,
      })
    } else {
      inserts.push({
        linkedin_url: x.url,
        full_name: x.full,
        first_name: x.first,
        last_name: x.last,
        headline: x.headline,
        current_company: x.company,
        current_title: x.title,
        location: x.location,
        connection_status: "connected",
        relevance: defaultRelevance,
        heat: "cold",
        source: sourceLabel,
        peerchair_person_id: personId,
        connected_at: x.connectedAt,
        last_seen_at: nowIso,
      })
    }
  }

  let inserted = 0, updated = 0
  const errors = []

  // Insert in chunks of 500
  for (let i = 0; i < inserts.length; i += 500) {
    const chunk = inserts.slice(i, i + 500)
    const { error } = await sb.from("linkedin_connections").insert(chunk)
    if (error) { errors.push("insert chunk " + i + ": " + error.message); continue }
    inserted += chunk.length
  }

  // Updates one at a time (Supabase JS doesn't support bulk update with different values per row in one call)
  for (const u of updates) {
    const { id, ...patch } = u
    // remove undefined fields so we don't overwrite with null
    for (const k of Object.keys(patch)) if (patch[k] === undefined) delete patch[k]
    const { error } = await sb.from("linkedin_connections").update(patch).eq("id", id)
    if (error) { errors.push("update " + id + ": " + error.message); continue }
    updated++
  }

  // Mark anything previously in linkedin_connections that wasn't in this export as 'disconnected'
  // — but only if this looks like a FULL export (more than 1000 rows). Partial imports (e.g., the
  // 351 ProVisors list) should not nuke status on connections outside the list.
  let disconnected = 0
  if (incoming.length >= 1000) {
    const { data: stale } = await sb.from("linkedin_connections")
      .select("id, linkedin_url")
      .not("linkedin_url", "in", `(${urls.map(u => `"${u.replace(/"/g, '""')}"`).join(",")})`)
      .eq("connection_status", "connected")
      .limit(5000)
    if (stale && stale.length) {
      const { error } = await sb.from("linkedin_connections")
        .update({ connection_status: "disconnected", updated_at: nowIso })
        .in("id", stale.map(s => s.id))
      if (!error) disconnected = stale.length
      else errors.push("disconnect sweep: " + error.message)
    }
  }

  await sb.from("linkedin_import_batches").update({
    rows_total: rows.length,
    rows_inserted: inserted,
    rows_updated: updated,
    rows_skipped: rows.length - incoming.length,
    rows_disconnected: disconnected,
  }).eq("id", batchRow.id)

  return Response.json({
    success: true,
    filename,
    source_label: sourceLabel,
    rows_in_csv: rows.length,
    rows_with_url: incoming.length,
    inserted,
    updated,
    skipped_no_url: rows.length - incoming.length,
    disconnected,
    errors: errors.slice(0, 10),
    batch_id: batchRow.id,
  })
}
