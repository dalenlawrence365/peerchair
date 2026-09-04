export const dynamic = "force-dynamic"
export const maxDuration = 60

import { serverClient } from "@/lib/supabaseServer"
import { SENDER_CONTEXT } from "@/lib/dalenContext"
import { WARNING_TAGS } from "@/lib/warningTags"

// POST /api/people/[id]/draft-dm
//
// One mode: mode="generate" { instructions } -> { body }
//
// Same idea as Draft Email, but for a LinkedIn DM: shorter, no subject line,
// no formal salutation (LinkedIn already shows the recipient's name/photo),
// and nothing ever gets sent from here — Dalen copies the body and pastes it
// into LinkedIn himself. Reuses the identical context-gathering as Draft
// Email (status/activity/invitation tags, latest research note, warning
// detection) so the same guardrails apply.

const MODEL = process.env.DRAFT_EMAIL_MODEL || "claude-sonnet-4-6"


export async function POST(request, { params }) {
  const id = params?.id
  if (!id) return Response.json({ error: "id required" }, { status: 400 })

  let b
  try { b = await request.json() } catch (e) { return Response.json({ error: "invalid JSON" }, { status: 400 }) }
  const mode = (b.mode || "").toString()

  if (mode !== "generate") return Response.json({ error: "mode must be 'generate'" }, { status: 400 })

  const instructions = (b.instructions || "").toString().trim()
  if (!instructions) return Response.json({ error: "instructions required" }, { status: 400 })
  // Refinement round — Dalen already has a draft (possibly hand-edited) and wants to
  // add more context/instructions on top of it, not start over.
  const previousBody = (b.previous_body || "").toString().trim()
  const isRefinement = !!previousBody

  const sb = serverClient()

  const { data: person } = await sb.from("people")
    .select("id, full_name, first_name, title, company, headline, roles, cfo_state, about")
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

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) return Response.json({ error: "AI not configured" }, { status: 500 })

  const prompt =
`You are helping Dalen Lawrence, Chapter Director of CFO Circle Los Angeles, write a real LinkedIn direct message to send to one specific person. Dalen has ADHD and prefers to describe what he wants out loud rather than type a full draft himself, so what follows is his spoken (transcribed) instructions for this exact message.

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

RESEARCH ASSESSMENT (AI deep-research on this person, if one exists — ground the message in real facts from here, don't invent anything not in it or in the profile above):
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

${isRefinement ? `CURRENT DRAFT (Dalen has already reviewed and possibly hand-edited this — refine it,
don't start over from a blank page; keep whatever still works):
${previousBody}

DALEN'S ADDITIONAL INSTRUCTIONS — apply these on top of the current draft above (spoken/transcribed, may be rough or informal):
"${instructions}"` : `DALEN'S INSTRUCTIONS FOR THIS MESSAGE (spoken/transcribed, may be rough or informal):
"${instructions}"`}

Write the LinkedIn DM now. Rules:
- This is a LinkedIn direct message, NOT an email — no subject line, no "Dear ___", no formal salutation. LinkedIn already shows the recipient's name and photo, so open naturally (a first-name greeting is fine and common, but don't over-formalize it).
- Keep it short — LinkedIn DMs get skimmed, not read. A few sentences, not paragraphs. No corporate fluff, no em dashes, no bullet-point lists.
- End naturally — a short sign-off line is fine ("Talk soon," etc.) or the message can simply end on its last sentence. Do NOT sign with his full name/title — his LinkedIn profile already shows who he is.
- Address the recipient by their first name if a greeting is used.
- Ground it in the recipient's actual profile/history above where relevant; do not invent facts about them that weren't given.
${isRefinement ? "- This is a revision pass: preserve the parts of the CURRENT DRAFT that still fit, and weave in the additional instructions — don't discard good material just to sound different." : "- Follow Dalen's spoken instructions as the primary guide for content and tone, even if informal or incomplete — fill reasonable gaps yourself."}
- When the instructions reference something covered in KNOWN FACTS above (the website, a booking link, etc.), use that exact URL as a real link — never write a placeholder, never guess a URL, never paraphrase it into something vague like "our website."

Respond with ONLY valid JSON, no other text, in exactly this shape:
{"body": "..."}`

  let aiRes
  try {
    aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": anthropicKey },
      body: JSON.stringify({ model: MODEL, max_tokens: 800, messages: [{ role: "user", content: prompt }] }),
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
  if (!parsed.body) {
    return Response.json({ error: "AI response missing body", raw: raw.slice(0, 500) }, { status: 502 })
  }
  return Response.json({ body: parsed.body, warning_tags: warningTags })
}
