export const dynamic = "force-dynamic"
export const maxDuration = 60

import { serverClient } from "@/lib/supabaseServer"
import { graphFetch } from "@/lib/microsoft-auth"
import { upsertOutlookContact } from "@/lib/outlookContacts"
import { SENDER_CONTEXT } from "@/lib/dalenContext"
import { WARNING_TAGS } from "@/lib/warningTags"
import { getNamedLinksLines } from "@/lib/draftLinksContext"

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

// Renders a chunk of drafted plain text as HTML, turning any markdown-style
// link — [label](url) — into a REAL <a href> tag with that label as the
// visible text, instead of leaving it as escaped literal text that Outlook
// can only auto-linkify (ugly raw URL as the visible text, which is exactly
// what Dalen had to manually rename by hand before this). A bare URL with no
// markdown wrapper is still linkified too, just with the URL itself as the
// label, so nothing ever reaches Outlook as dead/unlinked text.
const LINK_OR_URL_RE = /\[([^\]\[]+)\]\((https?:\/\/[^\s)]+)\)|https?:\/\/[^\s<>")]+/g

function renderInlineHtml(text) {
  let out = ""
  let last = 0
  let m
  LINK_OR_URL_RE.lastIndex = 0
  while ((m = LINK_OR_URL_RE.exec(text)) !== null) {
    out += escapeHtml(text.slice(last, m.index))
    if (m[1] !== undefined) {
      // markdown link: [label](url)
      const label = escapeHtml(m[1])
      const url = escapeHtml(m[2])
      out += '<a href="' + url + '" style="color:#2563eb;text-decoration:underline">' + label + '</a>'
    } else {
      // bare URL — trim common trailing punctuation that isn't part of the link
      let url = m[0]
      let trailing = ""
      const trailMatch = url.match(/[.,;:!?)]+$/)
      if (trailMatch) { trailing = trailMatch[0]; url = url.slice(0, -trailing.length) }
      const safeUrl = escapeHtml(url)
      out += '<a href="' + safeUrl + '" style="color:#2563eb;text-decoration:underline">' + safeUrl + '</a>' + escapeHtml(trailing)
    }
    last = LINK_OR_URL_RE.lastIndex
  }
  out += escapeHtml(text.slice(last))
  return out
}

function bodyToHtml(body) {
  const paras = String(body || "").split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
  const htmlParas = paras.map(p =>
    '<p style="font-size:15px;line-height:1.6;margin:0 0 14px">' + renderInlineHtml(p).replace(/\n/g, "<br>") + '</p>'
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
    // Refinement round — Dalen already has a draft (possibly hand-edited) and wants to
    // add more context/instructions on top of it, not start over. Both must be present
    // together; a lone previous_body with no subject (or vice versa) is treated as no draft.
    const previousSubject = (b.previous_subject || "").toString().trim()
    const previousBody = (b.previous_body || "").toString().trim()
    const isRefinement = !!(previousSubject && previousBody)

    const { data: person } = await sb.from("people")
      .select("id, full_name, first_name, title, company, headline, email, roles, cfo_state, about")
      .eq("id", id).maybeSingle()
    if (!person) return Response.json({ error: "person not found" }, { status: 404 })

    const { data: statusTagRows } = await sb.from("person_status_tags")
      .select("tag").eq("person_id", id).is("removed_at", null)
    const statusTags = (statusTagRows || []).map(function(t){ return t.tag })
    const warningTags = statusTags.filter(function(t){ return WARNING_TAGS.indexOf(t) >= 0 })

    const { data: actionTagRows } = await sb.from("person_action_tags")
      .select("action_type, set_at").eq("person_id", id)
      .order("set_at", { ascending: false }).limit(20)
    const actionTagLines = (actionTagRows || []).map(function(t){
      return "- " + t.action_type + (t.set_at ? " (" + String(t.set_at).slice(0, 10) + ")" : "")
    }).join("\n")

    const { data: latestResearch } = await sb.from("person_research_notes")
      .select("verdict, score, confidence, summary, narrative").eq("person_id", id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle()

    // Meeting recaps — Granola/note-taker recaps of real conversations with
    // this person (could be shared with others on the same call). Ground the
    // draft in what was actually said/committed, not just inferred facts.
    const { data: recapLinks } = await sb.from("meeting_recap_participants")
      .select("meeting_recap_id").eq("person_id", id)
    let recentRecaps = []
    if (recapLinks && recapLinks.length) {
      const { data: recapsDesc } = await sb.from("meeting_recaps")
        .select("occurred_at, meeting_type, summary, engagement_signal, hard_stop, hard_stop_detail, commitments")
        .in("id", recapLinks.map(function (l) { return l.meeting_recap_id }))
        .order("occurred_at", { ascending: false })
        .limit(3)
      recentRecaps = recapsDesc || []
    }
    const recapLines = recentRecaps.map(function (r) {
      return `- ${r.occurred_at || ""}${r.meeting_type ? " [" + r.meeting_type + "]" : ""}: ${r.summary || "(no summary)"}${r.commitments ? " | Commitments: " + r.commitments : ""}${r.hard_stop ? " | HARD STOP FLAGGED: " + (r.hard_stop_detail || "") : ""}`
    }).join("\n")

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

    const namedLinksLines = await getNamedLinksLines(sb)

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

STATUS TAGS (current state — do not ignore these):
${statusTags.length ? statusTags.join(", ") : "(none)"}
${warningTags.length ? `⚠ WARNING: this person is tagged ${warningTags.join(", ")} — Dalen should generally NOT be reaching out. Write the draft anyway (he may have a specific reason), but do not pretend this is a routine outreach; if appropriate, note the conflict plainly rather than writing a normal pitch.` : ""}

ACTIVITY / INVITATION LOG (most recent first, may be empty — use this to avoid re-pitching something they've already been invited to, or to reference something they were already told):
${actionTagLines || "(no logged activity)"}

RESEARCH ASSESSMENT (AI deep-research on this person, if one exists — ground the email in real facts from here, don't invent anything not in it or in the profile above):
${latestResearch ? `Verdict: ${latestResearch.verdict || "(none)"} — Score: ${latestResearch.score != null ? latestResearch.score + "/100" : "(none)"} — Confidence: ${latestResearch.confidence != null ? latestResearch.confidence + "%" : "(none)"}
Summary: ${latestResearch.summary || "(none)"}
${(latestResearch.narrative || "").slice(0, 1500)}` : "(no research note on file for this person)"}

MEETING RECAPS (Granola/note-taker recaps of real meetings with this person, most recent first — ground the message in what was actually said/committed here; a HARD STOP means Dalen should generally not be reaching out):
${recapLines || "(no meeting recaps on file for this person)"}

KNOWN FACTS — use these exact values whenever the instructions refer to them, never invent or guess a URL/link yourself:
- Website: ${SENDER_CONTEXT.website}
- Fit call booking link (first CFO-prospect conversation only): ${SENDER_CONTEXT.calendly_links.fit_chat.url}
- Sponsor discovery call link (first sponsor conversation only): ${SENDER_CONTEXT.calendly_links.sponsor_discovery.url}
- General 15-minute booking link (any repeat/second conversation): ${SENDER_CONTEXT.calendly_links.the_15_min.url}
- General 30-minute booking link (any repeat/second conversation needing more time): ${SENDER_CONTEXT.calendly_links.the_30_min.url}
${namedLinksLines ? "\nOTHER KNOWN LINKS (Dalen's own link library — use the exact URL, referred to by these exact labels):\n" + namedLinksLines : ""}

${isRefinement ? `CURRENT DRAFT (Dalen has already reviewed and possibly hand-edited this — refine it,
don't start over from a blank page; keep whatever still works):
Subject: ${previousSubject}
Body:
${previousBody}

DALEN'S ADDITIONAL INSTRUCTIONS — apply these on top of the current draft above (spoken/transcribed, may be rough or informal):
"${instructions}"` : `DALEN'S INSTRUCTIONS FOR THIS EMAIL (spoken/transcribed, may be rough or informal):
"${instructions}"`}

Write the email now. Rules:
- End with a natural closing salutation that fits the tone (e.g. "Best," "Talk soon," "Warmly,") and NOTHING after it — no name at all, not even his first name. His Outlook signature already carries his full name, title, and contact info, so the email body should stop right after the salutation line.
- Address the recipient by their first name.
- Keep it warm but direct and concise — no corporate fluff, no em dashes, no bullet-point lists inside the email body.
- Ground it in the recipient's actual profile/history above where relevant; do not invent facts about them that weren't given.
${isRefinement ? "- This is a revision pass: preserve the parts of the CURRENT DRAFT that still fit, and weave in the additional instructions — don't discard good material just to sound different." : "- Follow Dalen's spoken instructions as the primary guide for content and tone, even if informal or incomplete — fill reasonable gaps yourself."}
- Separate paragraphs with a blank line.
- When the instructions reference something covered in KNOWN FACTS above (the website, a booking link, a link from OTHER KNOWN LINKS, etc.), write it as a markdown link using that exact URL and a short, natural label — like [book a quick chat](${SENDER_CONTEXT.calendly_links.the_15_min.url}) or [the workshop signup](https://example.com/rsvp) — never write a placeholder, never guess a URL, and never paste a raw naked URL into the body. This is an email that renders HTML, so the markdown link becomes a real clickable hyperlink with your label as the visible text — that's the whole point, don't skip it.

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
    return Response.json({ subject: parsed.subject, body: parsed.body, has_email: !!person.email, warning_tags: warningTags })
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
      // Awaited (not fire-and-forget) so the outcome can actually be reported
      // back — a prior version fired this without awaiting or surfacing the
      // result, so when contact sync failed there was no way to see it short
      // of reading Vercel's server logs.
      const contactResult = await upsertOutlookContact(sb, id)
      return Response.json({ ok: true, draft_url: d.webLink || null, contact_sync: contactResult })
    } catch (e) {
      return Response.json({ error: String(e.message || e) }, { status: 500 })
    }
  }

  return Response.json({ error: "mode must be 'generate' or 'create'" }, { status: 400 })
}
