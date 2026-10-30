export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

/* Public, cross-origin opt-in for la-cfo.com — "add me to CFO event invitations."
   This is the PERMISSION capture: a submission here is explicit consent to be
   emailed about events (CAN-SPAM / Gmail-Yahoo friendly), recorded with source
   and date. Sending stays gated elsewhere on email_consent='subscribed' AND NOT
   email_suppressed.

   Mirrors /api/events/register: same CORS, same clean(), same strong matcher
   (track token first, then find_existing_person which canonicalizes LinkedIn /
   email / name+company). Unmatched submitters land as a new 'pool' person with
   an 'unmatched' review pill so Dalen verifies identity before they count.

   Bonus: if they give a city we recognize, we resolve market + pole on the spot
   from the city_geo gazetteer — the opt-in form is also the geo-enrichment path
   for the ~pending audience. */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}
function json(b, s = 200) { return Response.json(b, { status: s, headers: CORS }) }
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }) }

function clean(v, n = 200) { return (v == null ? "" : String(v)).trim().slice(0, n) }

export async function POST(req) {
  let body = {}
  try { body = await req.json() } catch { return json({ error: "bad_request" }, 400) }

  const first_name = clean(body.first_name, 80)
  const last_name  = clean(body.last_name, 80)
  const email      = clean(body.email, 160).toLowerCase()
  const cityIn     = clean(body.city, 80)
  const company    = clean(body.company, 160)
  const linkedin   = clean(body.linkedin_url, 200)
  const src        = clean(body.src, 64) || "website"
  const token      = clean(body.t, 128) || null

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: "invalid_email" }, 400)
  }
  // LinkedIn is required: the list is CFOs only, and the URL is how Dalen
  // confirms the seat (and how PeerChair matches to an existing record).
  if (!/linkedin\.com\/(in|pub)\//i.test(linkedin)) {
    return json({ error: "linkedin_required", message: "Please include your LinkedIn profile URL." }, 400)
  }

  const sb = serverClient()
  const full_name = (first_name + " " + last_name).trim()
  const nowIso = new Date().toISOString()

  // Resolve the submitted city against the gazetteer (case-insensitive) so a
  // recognized city immediately yields market + pole. Unknown city -> store the
  // raw string, leave market/pole for review.
  let geo = null
  if (cityIn) {
    const { data: g } = await sb.from("city_geo")
      .select("city, pole, market").ilike("city", cityIn).limit(1).maybeSingle()
    if (g) geo = g
  }

  // ---- match, strongest signal first (mirrors /events/register) ----
  let matchedId = null
  if (token) {
    const { data: tok } = await sb.from("track_tokens").select("person_id").eq("token", token).maybeSingle()
    if (tok && tok.person_id) matchedId = tok.person_id
  }
  if (!matchedId) {
    const { data: pid } = await sb.rpc("find_existing_person", {
      p_linkedin_url: linkedin || null,
      p_email: email || null,
      p_full_name: full_name || null,
      p_company: company || null,
    })
    if (pid) matchedId = pid
  }

  let person_id = null
  let match_status = ""

  if (matchedId) {
    const { data: m } = await sb.from("people")
      .select("id, email, email2, city, pole, linkedin_url").eq("id", matchedId).maybeSingle()
    if (m) {
      person_id = m.id
      match_status = "matched"

      // Attach the submitted address so future matching finds it. The primary /
      // secondary email triggers mirror people.email / email2 into person_emails;
      // a third distinct address goes straight into the alias table.
      if (!clean(m.email)) {
        await sb.from("people").update({ email }).eq("id", person_id)
      } else if (email !== m.email.toLowerCase()) {
        if (!clean(m.email2)) {
          await sb.from("people").update({ email2: email }).eq("id", person_id)
        } else if (email !== m.email2.toLowerCase()) {
          await sb.from("person_emails").insert({ person_id, email }).select().maybeSingle().then(() => {}, () => {})
        }
      }

      const patch = {
        email_consent: "pending",
        email_consent_source: src,
        email_consent_at: nowIso,
        email_suppressed: false,
      }
      if (linkedin && !clean(m.linkedin_url)) patch.linkedin_url = linkedin
      if (cityIn && !clean(m.city)) patch.city = geo ? geo.city : cityIn
      if (geo && (!m.pole || m.pole === "pending")) { patch.pole = geo.pole; patch.market = geo.market }
      await sb.from("people").update(patch).eq("id", person_id)
    }
  }

  if (!person_id) {
    const { data: np, error: perr } = await sb.from("people").insert({
      first_name: first_name || null,
      last_name: last_name || "",
      full_name: full_name || email,
      email,
      company: company || null,
      linkedin_url: linkedin || null,
      roles: [],
      inbound_request: true,
      source: "subscribe:" + src,
      city: geo ? geo.city : (cityIn || null),
      market: geo ? geo.market : null,
      pole: geo ? geo.pole : null,
      email_consent: "pending",
      email_consent_source: src,
      email_consent_at: nowIso,
    }).select("id").single()
    if (perr) return json({ error: "person_insert_failed" }, 500)
    person_id = np.id
    match_status = "created"
    // Not confidently matched — flag for /unmatched review before they count.
    await sb.rpc("set_status_tag", {
      p_person_id: person_id,
      p_tag: "unmatched",
      p_set_by: "event_subscribe",
    })
  }

  // Durable audit of the raw submission + how it resolved.
  await sb.from("signup_submissions").insert({
    first_name: first_name || null,
    last_name: last_name || null,
    email,
    city: cityIn || null,
    company: company || null,
    linkedin_url: linkedin || null,
    src, token,
    person_id,
    match_status,
    raw: body,
  })

  // Badge — deduped per person so re-submits don't spam.
  const who = full_name || email
  await sb.from("notifications").upsert(
    [{
      kind: "subscribe",
      person_id,
      title: who + " opted in to event invitations",
      body: "Consent captured via " + src + (cityIn ? " · " + cityIn : ""),
      href: "/people/" + person_id,
      dedup_key: "sub:" + person_id,
    }],
    { onConflict: "dedup_key", ignoreDuplicates: true }
  )

  // Attribution — same stream as views / RSVPs.
  await sb.from("page_events").insert({
    person_id, token: null,
    event: "subscribed",
    page: "subscribe",
    src, is_bot: false,
    user_agent: (req.headers.get("user-agent") || "").slice(0, 300),
  })

  return json({ ok: true })
}
