export const dynamic = "force-dynamic"
export const maxDuration = 60

import { serverClient } from "@/lib/supabaseServer"
import { graphFetch } from "@/lib/microsoft-auth"
import { upsertOutlookContact } from "@/lib/outlookContacts"

// POST /api/people/[id]/draft-email
//
// Two modes, one endpoint — mirrors the person's Draft Email tab:
//   mode="generate"  { instructions }              -> { subject, body }
//   mode="create"     { subject, body }             -> { ok, draft_url }
//
// "generate" asks Claude to write a real, personalized outreach email using
// the person's actual profile + recent communication history plus whatever
// Dalen said (voice-transcribed or typed). "create" takes the (possibly
// hand-edited) subject/body Dalen approved and lands it in his real Outlook
// Drafts folder via graphFetch — same never-auto-send convention as every
// other email flow in this app. Nothing here ever calls Graph's send.

const MODEL = process.env.DRAFT_EMAIL_MODEL || "claude-sonnet-4-6"

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function bodyToHtml(body) {
  const paras = String(body || "").split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
  const htmlParas = paras.map(p =>
    '<p style="font-size:15px;line-height:1.6;margin:0 0 14px">' + escapeHtml(p).replace(/\n/g, "<br>") + '</p>'
  ).join("")
  return '<div style="font-family:Georgia,serif;max-width:560px;color:#20242f">' + htmlParas + '</div>'
}

export async function POST(request, { params }) {
  const id = params?.id
  if (!id) return Response.json({ error: "id required" }, { status: 400 })

  let b
  try { b = await request.json() } catch (e) { return Response.json({ error: "invalid JSON" }, { status: 400 }) }
  const mode = (b.mode || "").toString()

  const sb = serverClient()

  if (mode === "generate") {
    const instructions = (b.instructions || "").toString().trim()
    if (!instructions) return Response.json({ error: "instructions required" }, { status: 400 })

    const { data: person } = await sb.from("people")
      .select("id, full_name, first_name, title, company, headline, email, roles, cfo_state, about")
      .eq("id", id).maybeSingle()
    if (!person) return Response.json({ error: "person not found" }, { status: 404 })

    const { data: recentComms } = await sb.from("communications")
      .select("direction, channel, step_label, body, occurred_at")
      .eq("person_id", id)
      .order("occurred_at", { ascending: false })
      .limit(5)

    const historyLines = (recentComms || []).slice().reverse().map(function (c) {
      const who = c.direction === "OUT" || c.direction === "outbound" ? "Dalen" : (person.first_name || "They")
      const when = c.occurred_at ? String(c.occurred_at).slice(0, 10) : ""
      const snippet = (c.body || c.step_label || "").toString().slice(0, 200)
      return `- ${when} [${c.channel || ""}] ${who}: ${snippet}`
    }).join("\n")

    const anthropicKey = process.env.ANTHROPIC_API_KEY
    if (!anthropicKey) return Response.json({ error: "AI not configured" }, { status: 500 })

    const prompt =
`You are helping Dalen Lawrence, Chapter Director of CFO Circle Los Angeles, write a real email to send to one specific person. Dalen has ADHD and prefers to describe what he wants out loud rather than type a full draft himself, so what follows is his spoken (transcribed) instructions for this exact email.

RECIPIENT:
Name: ${person.full_name || person.first_name || "Unknown"}
Title: ${person.title || "(unknown)"}
Company: ${person.company || "(unknown)"}
Headline: ${person.headline || "(none)"}
Roles: ${(person.roles || []).join(", ") || "(none)"}
Pipeline stage: ${person.cfo_state || "(none)"}
${person.about ? "Notes on this person: " + person.about : ""}

RECENT INTERACTION HISTORY (most recent last, may be empty):
${historyLines || "(no prior communications on file)"}

DALEN'S INSTRUCTIONS FOR THIS EMAIL (spoken/transcribed, may be rough or informal):
"${instructions}"

Write the email now. Rules:
- End with a natural closing salutation that fits the tone (e.g. "Best," "Talk soon," "Warmly,") followed by just "Dalen" on its own line. Never write his last name, title, or organization in the closing — his Outlook signature already carries that, so writing it again would duplicate it.
- Address the recipient by their first name.
- Keep it warm but direct and concise — no corporate fluff, no em dashes, no bullet-point lists inside the email body.
- Ground it in the recipient's actual profile/history above where relevant; do not invent facts about them that weren't given.
- Follow Dalen's spoken instructions as the primary guide for content and tone, even if informal or incomplete — fill reasonable gaps yourself.
- Separate paragraphs with a blank line.

Respond with ONLY valid JSON, no other text, in exactly this shape:
{"subject": "...", "body": "..."}`

    let aiRes
    try {
      aiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": anthropicKey },
        body: JSON.stringify({ model: MODEL, max_tokens: 1200, messages: [{ role: "user", content: prompt }] }),
      })
    } catch (e) {
      return Response.json({ error: "AI request failed: " + (e.message || e) }, { status: 500 })
    }
    if (!aiRes.ok) {
      const t = await aiRes.text().catch(() => "")
      return Response.json({ error: "AI error " + aiRes.status, detail: t.slice(0, 300) }, { status: 502 })
    }
    const data = await aiRes.json()
    const raw = (data.content && data.content[0] && data.content[0].text) || ""
    let parsed
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw)
    } catch (e) {
      return Response.json({ error: "Could not parse AI response", raw: raw.slice(0, 500) }, { status: 502 })
    }
    if (!parsed.subject || !parsed.body) {
      return Response.json({ error: "AI response missing subject/body", raw: raw.slice(0, 500) }, { status: 502 })
    }
    return Response.json({ subject: parsed.subject, body: parsed.body, has_email: !!person.email })
  }

  if (mode === "create") {
    const subject = (b.subject || "").toString().trim()
    const body = (b.body || "").toString().trim()
    if (!subject || !body) return Response.json({ error: "subject and body required" }, { status: 400 })

    const { data: person } = await sb.from("people").select("id, email").eq("id", id).maybeSingle()
    if (!person) return Response.json({ error: "person not found" }, { status: 404 })
    if (!person.email) return Response.json({ error: "no_email" }, { status: 400 })

    const message = {
      subject,
      body: { contentType: "HTML", content: bodyToHtml(body) },
      toRecipients: [{ emailAddress: { address: person.email } }],
    }
    try {
      const res = await graphFetch("https://graph.microsoft.com/v1.0/me/messages", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(message),
      })
      if (!res.ok) {
        const t = await res.text().catch(() => "")
        return Response.json({ error: "Graph " + res.status, detail: t.slice(0, 300) }, { status: 502 })
      }
      const d = await res.json().catch(() => ({}))
      upsertOutlookContact(sb, id).catch(() => {})
      return Response.json({ ok: true, draft_url: d.webLink || null })
    } catch (e) {
      return Response.json({ error: String(e.message || e) }, { status: 500 })
    }
  }

  return Response.json({ error: "mode must be 'generate' or 'create'" }, { status: 400 })
}
