export const dynamic = "force-dynamic"

import { serverClient } from "@/lib/supabaseServer"
import { graphFetch } from "@/lib/microsoft-auth"

// POST /api/people/[id]/sync-email-now  -> { synced, checked, addresses, errors }
//
// On-demand counterpart to the sync-email cron (which only runs every 30
// min). Scoped to ONE person's known address(es) rather than sweeping the
// whole inbox, so it's cheap to fire from the profile page whenever Dalen
// needs an email in the timeline right now instead of waiting for the next
// cron slot. Same insert shape and same dedupe check (person_id + channel +
// direction + exact occurred_at) as sync-email's matched path, so a message
// picked up here is indistinguishable from one the cron would have written
// — the cron just won't double-insert it later.
//
// person_emails (not just people.email) is the source of truth for "which
// addresses belong to this person" — trg_sync_primary_person_email keeps
// people.email mirrored into it automatically, and a contact's second
// address lives there too (see resolvePeople.js).

export async function POST(request, { params }) {
  const id = params?.id
  if (!id) return Response.json({ error: "id required" }, { status: 400 })

  const sb = serverClient()
  const { data: person } = await sb.from("people").select("id, full_name").eq("id", id).maybeSingle()
  if (!person) return Response.json({ error: "person not found" }, { status: 404 })

  const { data: emailRows } = await sb.from("person_emails").select("email").eq("person_id", id)
  const addresses = Array.from(new Set((emailRows || []).map(function (r) { return r.email }).filter(Boolean)))
  if (!addresses.length) return Response.json({ error: "no email address on file for this person" }, { status: 400 })

  // 72h lookback — generous on purpose. This is a targeted, one-person
  // check fired because Dalen explicitly wants something recent in the
  // timeline right now, not a broad sweep, so there's no cost concern in
  // casting a wider net than the cron's default.
  const since = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()
  const addrFilter = addresses.map(function (a) { return `from/emailAddress/address eq '${a.replace(/'/g, "''")}'` }).join(" or ")
  const filter = `receivedDateTime ge ${since} and (${addrFilter})`

  let res
  try {
    res = await graphFetch(
      `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$filter=${filter}&$select=id,subject,receivedDateTime,from,bodyPreview&$orderby=receivedDateTime desc&$top=50`
    )
  } catch (e) {
    return Response.json({ error: "Outlook request failed: " + (e.message || e) }, { status: 500 })
  }
  if (!res.ok) {
    const t = await res.text().catch(function () { return "" })
    return Response.json({ error: "Outlook fetch failed: HTTP " + res.status, detail: t.slice(0, 300) }, { status: 502 })
  }

  const { value: messages } = await res.json()
  let synced = 0
  const errors = []

  for (const msg of (messages || [])) {
    const { data: existing } = await sb.from("communications")
      .select("id")
      .eq("person_id", id).eq("channel", "email").eq("direction", "inbound")
      .eq("occurred_at", msg.receivedDateTime)
      .limit(1)
    if (existing && existing.length) continue

    const { error: insErr } = await sb.from("communications").insert({
      person_id: id,
      direction: "inbound",
      channel: "email",
      subject: msg.subject || null,
      body: `Subject: ${msg.subject || "(no subject)"}\n\n${msg.bodyPreview || ""}`,
      occurred_at: msg.receivedDateTime,
      step_label: "Received Email (Outlook)",
      source: "outlook_sync_manual",
    })
    if (insErr) { errors.push(insErr.message); continue }
    synced++
  }

  if (synced > 0) {
    await sb.from("people").update({ last_meaningful_touch: new Date().toISOString() }).eq("id", id)
  }

  return Response.json({ synced, checked: (messages || []).length, addresses, errors })
}
