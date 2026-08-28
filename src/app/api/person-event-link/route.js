export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"
import { getAccessToken } from "@/lib/microsoft-auth"
import { upsertOutlookContact } from "@/lib/outlookContacts"

const SITE = process.env.NEXT_PUBLIC_EVENT_SITE_URL || "https://la-cfo.com"

async function tokenFor(sb, personId) {
  const { data } = await sb.from("track_tokens").select("token").eq("person_id", personId).maybeSingle()
  if (data) return data.token
  const { data: minted } = await sb.from("track_tokens").insert({ person_id: personId }).select("token").single()
  return minted ? minted.token : null
}

export async function POST(request) {
  let body = {}
  try { body = await request.json() } catch {}
  const personId = (body.person_id || "").toString()
  const slug = (body.slug || "").toString().trim()
  const mode = (body.mode || "link").toString()
  const src = (body.src || "profile").toString().slice(0, 64)
  if (!personId || !slug) return Response.json({ error: "bad_request" }, { status: 400 })

  const sb = serverClient()
  const { data: ev } = await sb.from("events").select("slug, name, event_date").eq("slug", slug).eq("published", true).maybeSingle()
  if (!ev) return Response.json({ error: "event_not_found" }, { status: 404 })

  const token = await tokenFor(sb, personId)
  if (!token) return Response.json({ error: "token_failed" }, { status: 500 })

  // Tracking-token link => the REGISTRATION form (not the invite/inv_ link).
  const url = SITE + "/events/" + ev.slug + "?t=" + encodeURIComponent(token) + "&src=" + encodeURIComponent(src)

  if (mode !== "draft") return Response.json({ url })

  const { data: person } = await sb.from("people").select("first_name, email").eq("id", personId).maybeSingle()
  if (!person || !person.email) return Response.json({ url, drafted: false, error: "no_email" })

  let whenStr = ""
  try { if (ev.event_date) whenStr = new Date(String(ev.event_date).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) } catch (e) {}
  const hi = person.first_name ? ("Hi " + person.first_name + ",") : "Hi,"
  const linkText = "Register for " + ev.name + " →"
  const html =
    '<div style="font-family:Georgia,serif;max-width:540px;color:#20242f">' +
    '<p style="font-size:16px;margin:0 0 14px">' + hi + '</p>' +
    '<p style="font-size:15px;line-height:1.6;margin:0 0 14px">I’d like to invite you to <strong>' + ev.name + '</strong>' + (whenStr ? (" on " + whenStr) : "") + ' — a confidential CFO working session here in Los Angeles. It’s complimentary, and seats are limited, so there’s a quick registration step.</p>' +
    '<p style="margin:0 0 20px"><a href="' + url + '" style="background:#c39a4e;color:#121a3c;padding:12px 22px;border-radius:3px;text-decoration:none;font-weight:bold;font-family:Arial,sans-serif;font-size:14px">' + linkText + '</a></p>' +
    '<p style="font-size:15px;line-height:1.6;margin:0 0 16px">Takes a minute, and I’ll follow up personally. Hope you can make it. — Dalen</p>' +
    '</div>'
  const payload = JSON.stringify({
    subject: "You’re invited — " + ev.name,
    body: { contentType: "HTML", content: html },
    toRecipients: [{ emailAddress: { address: person.email } }],
  })
  function post(tok) {
    return fetch("https://graph.microsoft.com/v1.0/me/messages", {
      method: "POST", headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" }, body: payload,
    })
  }
  try {
    let tk = await getAccessToken()
    let res = await post(tk)
    if (res.status === 401) { tk = await getAccessToken({ force: true }); res = await post(tk) }
    if (!res.ok) { const t = await res.text().catch(() => ""); console.error("person-event-link draft: Graph " + res.status + " " + t.slice(0, 300)); return Response.json({ url, drafted: false, error: "Graph " + res.status }) }
    const d = await res.json().catch(() => ({}))
    upsertOutlookContact(sb, personId).catch(() => {})
    return Response.json({ url, drafted: true, draft_url: d.webLink || null })
  } catch (e) { console.error("person-event-link draft failed:", e); return Response.json({ url, drafted: false, error: (e && e.message) || "exception" }) }
}
