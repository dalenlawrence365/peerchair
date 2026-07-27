export const dynamic = "force-dynamic"

// POST /api/pool/export-linkedhelper
//
// Body: {
//   count: number,                    // how many to export, max 1000
//   batch_label?: string,             // becomes the Tags column value, e.g. "seed-20260526-b2"
//   location_filter?: string,         // optional ILIKE filter on people.location (e.g. "California")
//   dry_run?: boolean                 // if true, return counts without inserting tags
// }
//
// Returns: CSV file with columns:
//   Profile URL, First Name, Last Name, Company, Position, Location, Tags,
//   brochure_url, assessment_url, meeting_url, event_url
//
// The three link columns use snake_case headers deliberately: LinkedHelper turns
// CSV column headers into custom template variable names, and a name with spaces
// resolves unreliably in {braces}. Reference them as {brochure_url} etc.
//
// The three URL columns are per-person tokenized links (?t=<token>&src=<batch>).
// Reference them as variables in the LinkedHelper message template — the message
// COPY is never touched, only the link carries the token. Views of these links
// resolve to the person in page_events, which powers per-person attribution.
//
// As a side effect, tags every exported person with action_type='export_to_linkedhelper'
// (unless dry_run=true), so they're excluded from future exports.
//
// Exclusion rules:
//   - cfo_state must be 'pool' (only untouched-by-outreach people)
//   - linkedin_url must be present
//   - must NOT have an existing 'export_to_linkedhelper' tag
//   - must NOT have an existing 'connection_sent' tag (already invited)
//   - must NOT have 'do_not_contact' or 'opted_out' status tag
//
// Ordering: source-labeled rows first (more vetted), then most-recently-created.

import { createClient } from "@supabase/supabase-js"
import { serverClient } from "@/lib/supabaseServer"

function csvEscape(v) {
  if (v === null || v === undefined) return ""
  const s = String(v)
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

export async function POST(request) {
  const sb = serverClient()

  let body
  try { body = await request.json() } catch(e) {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const count = Math.min(Math.max(parseInt(body.count) || 0, 1), 1000)
  const batchLabel = (body.batch_label || `seed-${new Date().toISOString().slice(0,10).replace(/-/g,"")}`).trim()
  const locationFilter = (body.location_filter || "").trim()
  const dryRun = !!body.dry_run

  // Build the query. We need to exclude people who have specific action/status tags.
  // Postgres-side filtering is much faster than client-side. Build a query that
  // EXCLUDES anyone with the relevant tags via NOT IN subqueries.
  let query = sb.from("people")
    .select("id, first_name, last_name, full_name, title, company, location, linkedin_url, source")
    .eq("cfo_state", "pool")
    .filter("roles", "cs", '{"cfo"}')
    .not("linkedin_url", "is", null)
    .neq("linkedin_url", "")

  if (locationFilter) {
    query = query.ilike("location", `%${locationFilter}%`)
  }

  // Pull a generous superset so we can filter tags client-side and still hit count.
  // 5x the request count, capped at 5000, gives us plenty of margin.
  const fetchSize = Math.min(count * 5, 5000)
  const { data: candidates, error: qErr } = await query
    .order("source", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(fetchSize)

  if (qErr) {
    return Response.json({ error: "Query failed: " + qErr.message }, { status: 500 })
  }
  if (!candidates || candidates.length === 0) {
    return Response.json({ error: "No candidates found at cfo_state='pool' with the given filters" }, { status: 404 })
  }

  // Load the exclusion set: people who already have one of the disqualifying tags
  const candIds = candidates.map(c => c.id)
  const { data: actionTaggedRows } = await sb.from("person_action_tags")
    .select("person_id, action_type")
    .in("person_id", candIds)
    .in("action_type", ["export_to_linkedhelper", "connection_sent"])

  const { data: statusTaggedRows } = await sb.from("person_status_tags")
    .select("person_id, tag")
    .in("person_id", candIds)
    .in("tag", ["do_not_contact", "opted_out"])

  const excludeIds = new Set()
  ;(actionTaggedRows || []).forEach(r => excludeIds.add(r.person_id))
  ;(statusTaggedRows || []).forEach(r => excludeIds.add(r.person_id))

  const eligible = candidates.filter(c => !excludeIds.has(c.id))
  const selected = eligible.slice(0, count)

  if (selected.length === 0) {
    return Response.json({
      error: "No eligible pool members remain — all candidates already tagged. Increase your pool first (Import pool) or relax the location filter.",
      candidates_checked: candidates.length,
      all_excluded: candidates.length
    }, { status: 404 })
  }

  // DRY RUN: return JSON counts only, no CSV, no tagging
  if (dryRun) {
    return Response.json({
      dry_run: true,
      summary: {
        candidates_checked: candidates.length,
        excluded_by_tags: candidates.length - eligible.length,
        eligible: eligible.length,
        would_export: selected.length,
        batch_label: batchLabel,
        location_filter: locationFilter || null
      },
      sample: selected.slice(0, 5).map(p => ({
        name: p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim(),
        title: p.title || null,
        company: p.company || null,
        location: p.location || null
      }))
    })
  }

  // ---- Tokenized links -------------------------------------------------
  // Every person gets one stable opaque token (track_tokens). Backfill covered
  // everyone existing; anyone created since is minted here, lazily, on export.
  const selIds = selected.map(p => p.id)
  const { data: existingTokens, error: tokErr } = await sb
    .from("track_tokens").select("token, person_id").in("person_id", selIds)
  if (tokErr) return Response.json({ error: "Token lookup failed: " + tokErr.message }, { status: 500 })

  const tokenByPerson = new Map((existingTokens || []).map(r => [r.person_id, r.token]))
  const missing = selIds.filter(id => !tokenByPerson.has(id))
  if (missing.length > 0) {
    const { data: minted, error: mintErr } = await sb
      .from("track_tokens")
      .insert(missing.map(id => ({ person_id: id })))
      .select("token, person_id")
    if (mintErr) return Response.json({ error: "Token mint failed: " + mintErr.message }, { status: 500 })
    ;(minted || []).forEach(r => tokenByPerson.set(r.person_id, r.token))
  }

  const SITE = "https://la-cfo.com"
  // Newest published event, so event_url always points at the current one
  // instead of a hardcoded slug that goes stale the day after the event.
  let eventSlug = null
  {
    const { data: ev } = await sb.from("events")
      .select("slug").eq("published", true)
      .order("event_date", { ascending: false }).limit(1).maybeSingle()
    eventSlug = ev ? ev.slug : null
  }
  function trackedUrl(path, personId) {
    const tok = tokenByPerson.get(personId)
    if (!tok) return ""
    const qs = "?t=" + encodeURIComponent(tok) + "&src=" + encodeURIComponent(batchLabel)
    return SITE + path + qs
  }

  // Build CSV
  const headers = ["Profile URL","First Name","Last Name","Company","Position","Location","Tags","brochure_url","assessment_url","meeting_url","event_url"]
  const lines = [headers.join(",")]
  selected.forEach(p => {
    const fn = p.first_name || ((p.full_name || "").split(" ")[0] || "")
    const ln = p.last_name  || ((p.full_name || "").split(" ").slice(1).join(" ") || "")
    lines.push([
      csvEscape(p.linkedin_url),
      csvEscape(fn),
      csvEscape(ln),
      csvEscape(p.company || ""),
      csvEscape(p.title || ""),
      csvEscape(p.location || ""),
      csvEscape(batchLabel),
      csvEscape(trackedUrl("/overview", p.id)),
      csvEscape(trackedUrl("/assessment", p.id)),
      csvEscape(trackedUrl("/meeting", p.id)),
      csvEscape(eventSlug ? trackedUrl("/events/" + eventSlug, p.id) : "")
    ].join(","))
  })
  const csv = lines.join("\n") + "\n"

  // Side effect: tag every exported person with 'export_to_linkedhelper'
  let taggedCount = 0
  const tagErrors = []
  for (const p of selected) {
    const { error: rpcErr } = await sb.rpc("set_action_tag", {
      p_person_id: p.id,
      p_action_type: "export_to_linkedhelper",
      p_set_by: "pool_export_for_linkedhelper",
      p_notes: `batch: ${batchLabel}`
    })
    if (rpcErr) tagErrors.push({ id: p.id, name: p.full_name, message: rpcErr.message })
    else taggedCount++
  }

  // Audit log entry
  try {
    await sb.from("audit_log").insert({
      run_at: new Date().toISOString(),
      audit_type: "linkedhelper_export",
      contacts_checked: candidates.length,
      contacts_created: 0,
      summary: `linkedhelper_export · ${selected.length} exported · batch: ${batchLabel}${locationFilter ? ` · loc filter: ${locationFilter}` : ""}`,
      errors: tagErrors.map(e => `tag ${e.id} (${e.name}): ${e.message}`)
    })
  } catch(e) { /* audit failure ok */ }

  // Return CSV with stats in headers so the client can show a summary
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${batchLabel}.csv"`,
      "X-PeerChair-Exported": String(selected.length),
      "X-PeerChair-Tagged": String(taggedCount),
      "X-PeerChair-BatchLabel": batchLabel,
      "X-PeerChair-TokensMinted": String(missing.length)
    }
  })
}
