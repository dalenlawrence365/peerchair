export const dynamic = "force-dynamic"
export const maxDuration = 60
import { graphFetch } from "@/lib/microsoft-auth"

// POST /api/outlook/draft?k=<key>
// Body: { to: string|string[], cc?: string[], subject, html? , text? }
// Creates ONE Outlook DRAFT via the app's Microsoft integration (never sends).
// Uses graphFetch (the same working path as /api/events/reminder-drafts) rather
// than the MCP Outlook connector, whose app registration lacks Mail write consent.
// Guarded by a probe key, same convention as reminder-drafts.
const PROBE_KEY = "pk_draft_9b41c7e2a5"

export async function POST(request) {
  const url = new URL(request.url)
  if (url.searchParams.get("k") !== PROBE_KEY) return Response.json({ error: "not found" }, { status: 404 })

  let b
  try { b = await request.json() } catch (e) { return Response.json({ error: "invalid JSON" }, { status: 400 }) }

  const to = Array.isArray(b.to) ? b.to : (b.to ? [b.to] : [])
  if (!to.length) return Response.json({ error: "to required" }, { status: 400 })
  if (!b.subject && !b.html && !b.text) return Response.json({ error: "subject or body required" }, { status: 400 })

  const message = {
    subject: b.subject || "",
    body: { contentType: b.html ? "HTML" : "Text", content: b.html || b.text || "" },
    toRecipients: to.map(a => ({ emailAddress: { address: a } })),
  }
  if (Array.isArray(b.cc) && b.cc.length) message.ccRecipients = b.cc.map(a => ({ emailAddress: { address: a } }))

  try {
    const res = await graphFetch("https://graph.microsoft.com/v1.0/me/messages", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(message),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => "")
      return Response.json({ error: "Graph " + res.status, detail: t.slice(0, 300) }, { status: 502 })
    }
    const d = await res.json().catch(() => ({}))
    return Response.json({ ok: true, id: d.id || null, webLink: d.webLink || null })
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 500 })
  }
}
