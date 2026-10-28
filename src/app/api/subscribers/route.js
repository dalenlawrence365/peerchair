export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// GET /api/subscribers?tab=subscribed|unsubscribed
// The permission list: everyone with email_consent = 'subscribed' (explicit opt-in,
// via the invitations page or the "yes, invite me" button after registering).
// tab=unsubscribed returns opted-out / suppressed people — the do-not-email list.
export async function GET(request) {
  const tab = new URL(request.url).searchParams.get("tab") === "unsubscribed" ? "unsubscribed" : "subscribed"
  const sb = serverClient()
  const cols = "id, full_name, first_name, last_name, company, title, email, roles, email_consent, email_consent_source, email_consent_at, email_suppressed, email_unsubscribed_at, email_unsub_reason"

  const rows = []
  for (let from = 0; from < 20000; from += 1000) {
    let q = sb.from("people").select(cols)
    q = tab === "subscribed"
      ? q.eq("email_consent", "subscribed").eq("email_suppressed", false)
      : q.or("email_consent.eq.unsubscribed,email_suppressed.eq.true")
    const { data, error } = await q.order("email_consent_at", { ascending: false, nullsFirst: false }).range(from, from + 999)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    rows.push(...(data || []))
    if (!data || data.length < 1000) break
  }

  // people still flagged 'unmatched' (identity not yet verified)
  const unmatched = new Set()
  if (rows.length) {
    const { data: tags } = await sb.from("person_status_tags").select("person_id").eq("tag", "unmatched").is("removed_at", null)
    for (const t of tags || []) unmatched.add(t.person_id)
  }

  const people = rows.map(p => ({
    id: p.id,
    name: p.full_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email,
    company: p.company || null, title: p.title || null, email: p.email || null,
    roles: p.roles || [],
    source: p.email_consent_source || null,
    consent_at: p.email_consent_at || null,
    unsubscribed_at: p.email_unsubscribed_at || null,
    unsub_reason: p.email_unsub_reason || null,
    suppressed: !!p.email_suppressed,
    unmatched: unmatched.has(p.id),
  }))

  const since = Date.now() - 30 * 86400000
  const [{ count: subCount }, { count: unsubCount }] = await Promise.all([
    sb.from("people").select("id", { count: "exact", head: true }).eq("email_consent", "subscribed").eq("email_suppressed", false),
    sb.from("people").select("id", { count: "exact", head: true }).or("email_consent.eq.unsubscribed,email_suppressed.eq.true"),
  ])
  return Response.json({
    tab, people,
    counts: { subscribed: subCount || 0, unsubscribed: unsubCount || 0,
      last_30d: tab === "subscribed" ? people.filter(p => p.consent_at && new Date(p.consent_at).getTime() >= since).length : null },
  })
}
