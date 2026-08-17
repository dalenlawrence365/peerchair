export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

/* Public, cross-origin registration for la-cfo.com event pages.
   Cold / LinkedIn visitors self-register and land as status "Requested".
   The address stays gated — the invite route only releases the private block
   for non-Requested statuses — so approval is what unlocks the venue.
   Mirrors /api/add-contact for safe person creation, and pings the badge. */

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

  const slug       = clean(body.slug, 64)
  const first_name = clean(body.first_name, 80)
  const last_name  = clean(body.last_name, 80)
  const email      = clean(body.email, 160).toLowerCase()
  const company    = clean(body.company, 160)
  const title      = clean(body.title, 120)
  const revenue    = clean(body.revenue_band, 60)
  const ctype      = clean(body.company_type, 60)
  const linkedin   = clean(body.linkedin_url, 200)
  const src        = clean(body.src, 64) || null
  const token      = clean(body.t, 128) || null

  if (!slug || !first_name || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: "missing_fields" }, 400)
  }

  const sb = serverClient()
  const { data: event } = await sb
    .from("events").select("id, slug, published, event_date, ends_at")
    .eq("slug", slug).eq("published", true).maybeSingle()
  if (!event) return json({ error: "not_found" }, 404)
  const evLabel = new Date(event.event_date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" })

  // Registration closes once the event is over. The page keeps working as a
  // recap and points to the next date, but self-registration for a past session
  // is rejected server-side so a stale tracked link can't create a dead signup.
  const overAt = event.ends_at || event.event_date
  if (overAt && new Date(overAt).getTime() < Date.now()) {
    return json({ error: "event_passed", message: "Registration for this session has closed. Please check for our next date." }, 409)
  }

  const full_name = (first_name + " " + last_name).trim()

  // Match, strongest signal first.
  //
  // 1) The tracking token. If they arrived on the personal link we sent them,
  //    that token IS their identity — no guessing. This is the signal the flow
  //    used to throw away: Laura Gallant registered on her own tracked link and
  //    was duplicated anyway because the token was ignored and a trailing slash
  //    ("lmgallant" vs "lmgallant/") defeated the LinkedIn string compare.
  //
  // 2) find_existing_person — the same normalizing matcher the ProVisors intake
  //    uses. It canonicalizes the LinkedIn slug (drops www / trailing slash /
  //    case) and strips company suffixes ("YONDR" == "Yondr, Inc."), then falls
  //    back to email and name+company. This is where "compare companies" already
  //    lives; the registration path just wasn't calling it.
  let matched = null
  if (token) {
    const { data: tok } = await sb.from("track_tokens").select("person_id").eq("token", token).maybeSingle()
    if (tok && tok.person_id) {
      const { data } = await sb.from("people").select("id, email, linkedin_url").eq("id", tok.person_id).maybeSingle()
      if (data) matched = data
    }
  }
  if (!matched) {
    const { data: pid } = await sb.rpc("find_existing_person", {
      p_linkedin_url: linkedin || null,
      p_email: email || null,
      p_full_name: full_name || null,
      p_company: company || null,
    })
    if (pid) {
      const { data } = await sb.from("people").select("id, email, linkedin_url").eq("id", pid).maybeSingle()
      if (data) matched = data
    }
  }

  let person_id = null
  let dupFlag = ""
  if (matched) {
    person_id = matched.id
    // Enrich: fill in the email / LinkedIn we just captured if the record lacked them.
    const patch = {}
    if (!matched.email && email) patch.email = email
    if (!matched.linkedin_url && linkedin) patch.linkedin_url = linkedin
    if (Object.keys(patch).length) await sb.from("people").update(patch).eq("id", person_id)
  } else {
    // No confident match — flag same-name records so Dalen can merge at review.
    const { data: sameName } = await sb.from("people").select("id").ilike("full_name", full_name).limit(1)
    if (sameName && sameName.length) dupFlag = "\u26a0 Possible duplicate (same name already in PeerChair) \u2014 review before approving. "
    const { data: np, error: perr } = await sb.from("people").insert({
      first_name,
      last_name: last_name || "",
      full_name,
      email,
      company: company || null,
      title: title || null,
      linkedin_url: linkedin || null,
      roles: ["cfo"],
      cfo_state: "pool",
      inbound_request: true,
      source: "event-reg:" + slug,
    }).select("id").single()
    if (perr) return json({ error: "person_insert_failed" }, 500)
    person_id = np.id
    // Newly created from a self-registration — not confidently matched to an
    // existing record. Flag for review on /unmatched (carries an 'unmatched'
    // pill) so Dalen verifies identity/role and merges any duplicate.
    await sb.rpc("set_status_tag", {
      p_person_id: person_id,
      p_tag: "unmatched",
      p_set_by: "event_registration",
    })
  }

  const noteBits = [
    title || null,
    company ? "@ " + company : null,
    revenue || null,
    ctype || null,
    linkedin || null,
  ].filter(Boolean)
  const note = dupFlag + "Self-registered (" + evLabel + "): " + (noteBits.join(" · ") || "no details")

  // New registrant -> insert as Registered. Someone who already has a row
  // (e.g. Dalen invited them directly) -> RECORD the registration on that row
  // without downgrading their status. Ignoring the conflict would silently throw
  // away registered_at and their qualifying answers.
  const nowIso = new Date().toISOString()
  const { data: existingRow } = await sb.from("event_attendees")
    .select("id, status, notes, registered_at, source")
    .eq("event_id", event.id).eq("person_id", person_id).maybeSingle()

  let status = "Registered"
  if (!existingRow) {
    await sb.from("event_attendees").insert({
      event_id: event.id, person_id, status: "Registered", notes: note,
      registered_at: nowIso, source: src || "direct",
    })
  } else {
    const already = (existingRow.notes || "")
    const merged = already && already.indexOf("Self-registered") === -1 ? (already + "  |  " + note) : (already || note)
    await sb.from("event_attendees").update({
      registered_at: existingRow.registered_at || nowIso,
      notes: merged,
      source: existingRow.source || src || "direct",
    }).eq("id", existingRow.id)
    status = existingRow.status || "Registered"
  }

  // Badge — deduped per person+event so re-submits don't spam.
  const fullName = (first_name + " " + last_name).trim() || email
  await sb.from("notifications").upsert(
    [{
      kind: "registration",
      person_id,
      title: fullName + " requested a seat — " + evLabel,
      body: note,
      href: "/events",
      dedup_key: "reg:" + event.id + ":" + person_id,
    }],
    { onConflict: "dedup_key", ignoreDuplicates: true }
  )

  // Attribution — same stream as views/RSVPs.
  await sb.from("page_events").insert({
    person_id, token: null,
    event: "event_registered",
    page: "event:" + event.slug,
    src, is_bot: false,
    user_agent: (req.headers.get("user-agent") || "").slice(0, 300),
  })

  return json({ ok: true, status: (status === "Registered" || status === "Requested") ? "registered" : "invited" })
}
