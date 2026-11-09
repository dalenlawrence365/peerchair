export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// POST /api/people/[id]/email-consent   { subscribe: boolean, note?: string }
// Manually record (or withdraw) explicit permission to email someone about events —
// e.g. they replied "keep me in mind for next time". Writes the same fields the signup
// form does (email_consent / _at / _source) and logs the note on their timeline as proof.
// Never overrides a person's own opt-out: if they unsubscribed themselves (or are
// suppressed), this refuses with "opted_out".
export async function POST(request, { params }) {
  const { id } = await params
  let b = {}
  try { b = await request.json() } catch (e) { return Response.json({ error: "bad_request" }, { status: 400 }) }
  const subscribe = b.subscribe === true
  const note = String(b.note || "").trim().slice(0, 1000)
  const sb = serverClient()

  const { data: p } = await sb.from("people")
    .select("id, email, email_consent, email_suppressed, email_unsubscribed_at").eq("id", id).maybeSingle()
  if (!p) return Response.json({ error: "not_found" }, { status: 404 })

  const nowIso = new Date().toISOString()
  // Consent can be recorded BEFORE we have an email address — e.g. a LinkedIn DM
  // where they say "keep me posted," ahead of enriching/appending their address.
  // Provenance matters: a pre-email, inferred opt-in is NOT the same as a direct
  // reply from someone already on file, so stamp the source accordingly instead
  // of flattening everything to "direct reply." Lets the appended cohort be told
  // apart later (audit + deliverability).
  const source = p.email ? "direct reply" : "LinkedIn DM"
  if (subscribe) {
    if (p.email_consent === "unsubscribed" || p.email_suppressed === true) {
      return Response.json({ error: "opted_out", at: p.email_unsubscribed_at || null }, { status: 409 })
    }
    const { error } = await sb.from("people").update({
      email_consent: "subscribed", email_consent_source: source, email_consent_at: nowIso, email_suppressed: false,
    }).eq("id", id)
    if (error) return Response.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await sb.from("people").update({
      email_consent: "unsubscribed", email_unsubscribed_at: nowIso, email_unsub_reason: note || "Removed manually",
    }).eq("id", id)
    if (error) return Response.json({ error: error.message }, { status: 500 })
  }

  await sb.from("communications").insert({
    person_id: id, occurred_at: nowIso, channel: subscribe && !p.email ? "linkedin" : "email", direction: "inbound",
    step_label: subscribe ? ("Email consent — subscribed (" + source + ")") : "Email consent — removed manually",
    body: note || (subscribe ? "Marked as subscribed by Dalen." : "Removed from the email list by Dalen."),
    source: "PeerChair", logged_by: "Dalen Lawrence",
  }).then(() => {}, () => {})

  return Response.json({ ok: true, email_consent: subscribe ? "subscribed" : "unsubscribed", at: nowIso })
}
