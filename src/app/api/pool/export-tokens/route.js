export const dynamic = "force-dynamic"

// POST /api/pool/export-tokens
//
// Variables-only CSV for people ALREADY inside LinkedHelper.
//
// Why this exists: /api/pool/export-linkedhelper deliberately EXCLUDES anyone
// already tagged export_to_linkedhelper / connection_sent — correct for seeding
// new people, exactly wrong for retrofitting tokens onto in-flight campaigns.
// This route is the mirror image: it selects only people already in the
// LinkedHelper universe and emits their tokenized links so they can be uploaded
// as CRM-level custom variables (matched on Profile URL).
//
// Read-only: no action tags written, no state changed. Safe to run repeatedly.
//
// Body: { dry_run?: boolean, default_src?: string }
// CSV columns: Profile URL, brochure_url, assessment_url, meeting_url, event_url

import { serverClient } from "@/lib/supabaseServer"

const SITE = "https://la-cfo.com"
const PAGE = 1000

function csvEscape(v) {
  if (v === null || v === undefined) return ""
  const s = String(v)
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

// Derive a stable channel tag from the original export note ("Seed B2 export ...").
// Must satisfy the /api/track src regex: ^[\w.\-:]{1,64}$ and not start with "la-".
function srcFromNotes(notes, fallback) {
  if (!notes) return fallback
  const m = String(notes).match(/seed\s*b(\d+)/i)
  if (m) return "seed-b" + m[1]
  return fallback
}

async function fetchAllTagRows(sb, actionTypes) {
  let out = [], from = 0
  for (;;) {
    const { data, error } = await sb
      .from("person_action_tags")
      .select("person_id, action_type, notes")
      .in("action_type", actionTypes)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    out = out.concat(data || [])
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return out
}

export async function POST(request) {
  const sb = serverClient()
  // Newest published event, so the Aug 11 (and future) registration link rides
  // along in the backfill. Not hardcoded, so it never goes stale after the date.
  let eventSlug = null
  {
    const { data: ev } = await sb.from("events")
      .select("slug").eq("published", true)
      .order("event_date", { ascending: false }).limit(1).maybeSingle()
    eventSlug = ev ? ev.slug : null
  }
  let body = {}
  try { body = await request.json() } catch { /* empty body ok */ }
  const dryRun = !!body.dry_run
  const fallbackSrc = (body.default_src || "linkedhelper-backfill").trim()

  let tagRows
  try {
    tagRows = await fetchAllTagRows(sb, ["export_to_linkedhelper", "connection_sent"])
  } catch (e) {
    return Response.json({ error: "Tag lookup failed: " + e.message }, { status: 500 })
  }

  // person_id -> src (prefer a note that names the seed cohort)
  const srcByPerson = new Map()
  for (const r of tagRows) {
    const derived = srcFromNotes(r.notes, null)
    if (derived) srcByPerson.set(r.person_id, derived)
    else if (!srcByPerson.has(r.person_id)) srcByPerson.set(r.person_id, fallbackSrc)
  }
  const ids = Array.from(srcByPerson.keys())
  if (ids.length === 0) return Response.json({ error: "Nobody is in the LinkedHelper universe yet." }, { status: 404 })

  // Pull linkedin_url + token in chunks
  const people = new Map()
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500)
    const { data, error } = await sb.from("people").select("id, linkedin_url").in("id", chunk)
    if (error) return Response.json({ error: "People lookup failed: " + error.message }, { status: 500 })
    ;(data || []).forEach(p => people.set(p.id, p.linkedin_url))
  }

  const tokens = new Map()
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500)
    const { data, error } = await sb.from("track_tokens").select("person_id, token").in("person_id", chunk)
    if (error) return Response.json({ error: "Token lookup failed: " + error.message }, { status: 500 })
    ;(data || []).forEach(t => tokens.set(t.person_id, t.token))
  }

  // Mint for anyone somehow missing a token (defensive; backfill covered all)
  const missing = ids.filter(id => !tokens.has(id))
  if (missing.length > 0) {
    const { data, error } = await sb.from("track_tokens")
      .insert(missing.map(id => ({ person_id: id }))).select("person_id, token")
    if (error) return Response.json({ error: "Token mint failed: " + error.message }, { status: 500 })
    ;(data || []).forEach(t => tokens.set(t.person_id, t.token))
  }

  const rows = []
  let skippedNoUrl = 0
  for (const id of ids) {
    const url = people.get(id)
    const tok = tokens.get(id)
    if (!url || !tok) { skippedNoUrl++; continue }
    const src = srcByPerson.get(id) || fallbackSrc
    const q = p => `${SITE}${p}?t=${encodeURIComponent(tok)}&src=${encodeURIComponent(src)}`
    const eventUrl = eventSlug ? q("/events/" + eventSlug) : ""
    rows.push([csvEscape(url), csvEscape(q("/overview")), csvEscape(q("/assessment")), csvEscape(q("/meeting")), csvEscape(eventUrl)].join(","))
  }

  const bySrc = {}
  for (const id of ids) { const s = srcByPerson.get(id) || fallbackSrc; bySrc[s] = (bySrc[s] || 0) + 1 }

  if (dryRun) {
    return Response.json({
      dry_run: true,
      in_linkedhelper: ids.length,
      exportable: rows.length,
      skipped_missing_url_or_token: skippedNoUrl,
      tokens_minted: missing.length,
      by_src: bySrc
    })
  }

  const csv = ["Profile URL,brochure_url,assessment_url,meeting_url,event_url"].concat(rows).join("\n") + "\n"
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="linkedhelper-token-backfill.csv"',
      "X-PeerChair-Rows": String(rows.length),
      "X-PeerChair-Skipped": String(skippedNoUrl)
    }
  })
}
