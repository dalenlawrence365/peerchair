export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// POST /api/meetings/backfill-tags
// One-shot script that walks every existing row in `meetings`, computes
// tags via the same logic as sync-calendar (title patterns + attendee
// role walk), and writes them. Safe to re-run — it overwrites the tags
// column each time but doesn't touch anything else. Manual user edits
// would be lost if re-run, so the UI should warn before invoking this.

const SELF_EMAILS = new Set([
  "dalen.lawrence@cfo-circle.com",
  "dalen.lawrence@stalliant.com",
])

function titleTags(title, bodyPreview) {
  const t = `${title || ""} ${bodyPreview || ""}`.toLowerCase()
  const tags = new Set()
  if (/\bfit\s*(call|chat)\b/.test(t)) tags.add("fit_call")
  if (/\bsponsor\s*discovery\b/.test(t)) tags.add("sponsor_discovery")
  if (/\btroika\b/.test(t)) { tags.add("troika"); tags.add("provisors"); tags.add("networking") }
  if (/\bprovisors\b/.test(t)) { tags.add("provisors"); tags.add("networking") }
  if (/\baffinity\s*group\b/.test(t)) { tags.add("provisors"); tags.add("networking") }
  if (/\btransactions\s*(&|and|\$)\s*transitions\b/.test(t)) { tags.add("provisors"); tags.add("networking") }
  if (/\bcapital\s*formation\b/.test(t)) { tags.add("provisors"); tags.add("networking") }
  if (/\bacg\b/.test(t)) { tags.add("acg"); tags.add("networking") }
  if (/\bmixer\b/.test(t)) { tags.add("mixer"); tags.add("networking") }
  if (/\bnetworking\b/.test(t)) tags.add("networking")
  if (/\bhappy\s*hour\b/.test(t)) tags.add("networking")
  if (/\bchapter\b/.test(t) && /\b(director|lead|peer)\b/.test(t)) tags.add("chapter_peer")
  if (/\b(lunch|dinner|gym|workout|personal|doctor|dentist|family|kids|school|buffer|drive|commute)\b/.test(t)) tags.add("personal")
  return tags
}

export async function POST() {
  const sb = serverClient()

  // 1. Pull all people emails+roles upfront (one query, since the meeting
  //    set is small — currently ~20). Avoids N+1 lookups.
  const { data: allPeople } = await sb
    .from("people")
    .select("email, roles")
    .not("email", "is", null)
  const rolesByEmail = new Map()
  for (const p of allPeople || []) {
    if (!p.email) continue
    rolesByEmail.set(p.email.toLowerCase().trim(), p.roles || [])
  }

  // 2. Pull all meetings
  const { data: meetings, error } = await sb
    .from("meetings")
    .select("id, title, body_preview, attendees_json")
  if (error) return Response.json({ error: error.message }, { status: 500 })

  // 3. Compute tags per meeting + update
  let updated = 0
  const samples = []
  for (const m of meetings || []) {
    const tags = new Set(titleTags(m.title, m.body_preview))

    // Walk attendees → role tags
    const attendees = Array.isArray(m.attendees_json) ? m.attendees_json : []
    for (const a of attendees) {
      const e = (a.address || "").toLowerCase().trim()
      if (!e || !e.includes("@") || SELF_EMAILS.has(e)) continue
      const roles = rolesByEmail.get(e) || []
      for (const r of roles) {
        if (r === "cfo") tags.add("cfo")
        else if (r === "sponsor_contact") tags.add("sponsor")
        else if (r === "referral_partner") tags.add("referral")
      }
    }

    // 'call' baseline for matched-to-person meetings without a pipeline type
    const hasRole = tags.has("cfo") || tags.has("sponsor") || tags.has("referral")
    const hasPipelineType = tags.has("fit_call") || tags.has("sponsor_discovery")
    if (hasRole && !hasPipelineType) tags.add("call")

    // Catch-all
    if (tags.size === 0) tags.add("other")

    const tagsArr = Array.from(tags)
    const { error: upErr } = await sb.from("meetings").update({ tags: tagsArr }).eq("id", m.id)
    if (!upErr) {
      updated++
      if (samples.length < 25) samples.push({ title: m.title, tags: tagsArr })
    }
  }

  return Response.json({ ok: true, updated, total: (meetings || []).length, sample: samples })
}
