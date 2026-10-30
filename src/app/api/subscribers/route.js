export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// GET /api/subscribers?tab=subscribed|pending|rejected|unsubscribed
//   subscribed   = email_consent='subscribed' (approved, on the list)
//   pending      = email_consent='pending' (requested, awaiting Dalen's review)
//   rejected     = email_consent in ('rejected','removed') (declined — not a CFO)
//   unsubscribed = email_consent='unsubscribed' OR suppressed (self opted-out)
const TABS = new Set(["subscribed", "pending", "rejected", "unsubscribed"])

function applyTab(q, tab) {
  if (tab === "pending") return q.eq("email_consent", "pending")
  if (tab === "rejected") return q.in("email_consent", ["rejected", "removed"])
  if (tab === "unsubscribed") return q.or("email_consent.eq.unsubscribed,email_suppressed.eq.true")
  return q.eq("email_consent", "subscribed").eq("email_suppressed", false) // subscribed
}

export async function GET(request) {
  let tab = new URL(request.url).searchParams.get("tab") || "subscribed"
  if (!TABS.has(tab)) tab = "subscribed"
  const sb = serverClient()
  const cols = "id, full_name, first_name, last_name, company, title, email, linkedin_url, city, roles, email_consent, email_consent_source, email_consent_at, email_suppressed, email_unsubscribed_at, email_unsub_reason"

  const rows = []
  for (let from = 0; from < 20000; from += 1000) {
    const q = applyTab(sb.from("people").select(cols), tab)
    const { data, error } = await q.order("email_consent_at", { ascending: false, nullsFirst: false }).range(from, from + 999)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    rows.push(...(data || []))
    if (!data || data.length < 1000) break
  }

  const unmatched = new Set()
  if (rows.length) {
    const { data: tags } = await sb.from("person_status_tags").select("person_id").eq("tag", "unmatched").is("removed_at", null)
    for (const t of tags || []) unmatched.add(t.person_id)
  }

  const people = rows.map(p => ({
    id: p.id,
    name: p.full_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email,
    company: p.company || null, title: p.title || null, email: p.email || null,
    linkedin_url: p.linkedin_url || null, city: p.city || null,
    roles: p.roles || [],
    source: p.email_consent_source || null,
    consent_at: p.email_consent_at || null,
    unsubscribed_at: p.email_unsubscribed_at || null,
    unsub_reason: p.email_unsub_reason || null,
    suppressed: !!p.email_suppressed,
    unmatched: unmatched.has(p.id),
  }))

  const since = Date.now() - 30 * 86400000
  const base = () => sb.from("people").select("id", { count: "exact", head: true })
  const [sub, pend, rej, unsub] = await Promise.all([
    base().eq("email_consent", "subscribed").eq("email_suppressed", false),
    base().eq("email_consent", "pending"),
    base().in("email_consent", ["rejected", "removed"]),
    base().or("email_consent.eq.unsubscribed,email_suppressed.eq.true"),
  ])
  return Response.json({
    tab, people,
    counts: {
      subscribed: sub.count || 0, pending: pend.count || 0, rejected: rej.count || 0, unsubscribed: unsub.count || 0,
      last_30d: tab === "subscribed" ? people.filter(p => p.consent_at && new Date(p.consent_at).getTime() >= since).length : null,
    },
  })
}
