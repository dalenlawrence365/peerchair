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

  if (!slug || !first_name || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: "missing_fields" }, 400)
  }

  const sb = serverClient()
  const { data: event } = await sb
    .from("events").select("id, slug, published")
    .eq("slug", slug).eq("published", true).maybeSingle()
  if (!event) return json({ error: "not_found" }, 404)

  // Match existing person by email, then LinkedIn; else create.
  let person_id = null
  const { data: byEmail } = await sb.from("people").select("id").ilike("email", email).maybeSingle()
  if (byEmail) person_id = byEmail.id
  if (!person_id && linkedin) {
    const { data: byLi } = await sb.from("people").select("id").ilike("linkedin_url", linkedin).maybeSingle()
    if (byLi) person_id = byLi.id
  }
  if (!person_id) {
    const full_name = (first_name + " " + last_name).trim()
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
  }

  const noteBits = [
    title || null,
    company ? "@ " + company : null,
    revenue || null,
    ctype || null,
    linkedin || null,
  ].filter(Boolean)
  const note = "Self-registered (Aug 11): " + (noteBits.join(" · ") || "no details")

  // Insert as Requested; never downgrade an already-Invited person.
  await sb.from("event_attendees").upsert(
    [{ event_id: event.id, person_id, status: "Requested", notes: note }],
    { onConflict: "event_id,person_id", ignoreDuplicates: true }
  )

  const { data: att } = await sb.from("event_attendees")
    .select("status").eq("event_id", event.id).eq("person_id", person_id).maybeSingle()
  const status = att?.status || "Requested"

  // Badge — deduped per person+event so re-submits don't spam.
  const fullName = (first_name + " " + last_name).trim() || email
  await sb.from("notifications").upsert(
    [{
      kind: "registration",
      person_id,
      title: fullName + " requested a seat — Aug 11",
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

  return json({ ok: true, status: status === "Requested" ? "requested" : "invited" })
}
