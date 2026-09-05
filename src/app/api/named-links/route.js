export const dynamic = "force-dynamic"

import { serverClient } from "@/lib/supabaseServer"

// GET  /api/named-links            -> { links }  (all rows, active first, then by label)
// POST /api/named-links  { label, url, notes? } -> { link }
//
// Self-service link library — see named_links table comment. Draft Email
// and Draft DM both read the active rows here (see draftLinksContext.js)
// and hand them to Claude as KNOWN LINKS, so Dalen can add "Sept 16
// Workshop RSVP" or rename an existing link from the /links page and have
// every future draft pick it up immediately, no code change required.

export async function GET() {
  const sb = serverClient()
  const { data, error } = await sb.from("named_links")
    .select("*")
    .order("active", { ascending: false })
    .order("label", { ascending: true })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ links: data || [] })
}

export async function POST(request) {
  let b
  try { b = await request.json() } catch (e) { return Response.json({ error: "invalid JSON" }, { status: 400 }) }

  const label = (b.label || "").toString().trim()
  const url = (b.url || "").toString().trim()
  const useFor = (b.use_for || "").toString().trim()
  if (!label) return Response.json({ error: "label required" }, { status: 400 })
  if (!/^https?:\/\//i.test(url)) return Response.json({ error: "url must start with http:// or https://" }, { status: 400 })
  if (!useFor) return Response.json({ error: "use_for required — this is what tells Claude when to reach for this link, since the label alone (what the reader sees) usually won't match how Dalen describes it out loud" }, { status: 400 })

  const sb = serverClient()
  const { data, error } = await sb.from("named_links")
    .insert({ label, url, use_for: useFor })
    .select().single()
  if (error) {
    const msg = error.code === "23505" ? "A link with that label already exists." : error.message
    return Response.json({ error: msg }, { status: error.code === "23505" ? 409 : 500 })
  }
  return Response.json({ link: data })
}
