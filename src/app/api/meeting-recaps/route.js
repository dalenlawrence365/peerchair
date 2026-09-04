export const dynamic = "force-dynamic"
export const maxDuration = 60

import { serverClient } from "@/lib/supabaseServer"
import { WARNING_TAGS } from "@/lib/warningTags"

// POST /api/meeting-recaps   { raw_text, person_ids:[...], occurred_at?, meeting_type? }  -> { meeting_recap }
//
// Landing zone for Granola (or any AI note-taker) post-meeting output. A
// recap can be posted to MULTIPLE people at once (a meeting with several
// contacts at one company), so this is intentionally NOT nested under
// /people/[id] the way research-note is — the person(s) are named in the
// body instead. Mirrors researchNoteStore's normalize-then-save pattern:
// Claude reshapes the raw paste into a fixed set of fields so every recap
// is comparable, but the full narrative is preserved as-is and a parse
// failure never loses the paste, it just falls back to raw/unscored.
//
// On success, ALSO writes one inbound `communications` row per participant.
// This is the piece that actually feeds the warmth score — the score reads
// from communications/action_tags/event status, not from prose notes, so a
// recap that never becomes a communications row is invisible to warmth no
// matter how well-structured it is.

const MODEL = process.env.DRAFT_EMAIL_MODEL || "claude-sonnet-4-6"

const PARSE_PROMPT_HEADER = `You are normalizing a post-meeting recap (likely produced by Granola or a similar AI note-taker) for Dalen Lawrence, Chapter Director of CFO Circle Los Angeles. These are NOT always CFO-recruiting fit calls — could be a board meeting, a sponsor check-in, a networking coffee, anything. Don't force a sales-call shape onto content that isn't one.

First, reproduce the recap's full body as clean markdown (keep all facts, figures, and structure — do not summarize or shorten it, just strip obvious formatting noise like stray asterisks or broken line breaks). Write this as PLAIN TEXT, not inside any JSON — this is the most important part to get right and to not truncate.

Then, after the markdown narrative, on its own on a new line, output a fenced code block starting with \`\`\`json containing ONLY this metadata (do NOT repeat the narrative inside it):

{
  "summary": "one or two plain sentences, the bottom-line takeaway",
  "meeting_type": "a short label for what kind of meeting this was (e.g. Fit call, Sponsor check-in, Board meeting, Networking) if inferable, else null",
  "engagement_signal": "one of: Reciprocal | Engaged | Passive | Guarded | Not enough signal — Reciprocal means they asked questions back, showed curiosity, or proposed their own next step; use 'Not enough signal' rather than guessing",
  "referral_mentioned": true or false,
  "referral_who": "who they mentioned referring/introducing, if referral_mentioned is true, else null",
  "hard_stop": true or false,
  "hard_stop_detail": "exact phrasing if they explicitly asked not to be contacted, said this isn't a fit, or indicated they're out of market, else null",
  "suggested_warning_tag": "one of do_not_contact | opted_out | not_a_fit | out_of_market if hard_stop is true (pick the closest match), else null",
  "fit_verdict": "one of Strong Invite | Invite | Maybe | Pass — ONLY if this was actually a CFO Circle recruiting/fit conversation and enough was discussed to judge; otherwise null. Do not force this for a sponsor/board/networking meeting.",
  "commitments": "plain text — what Dalen committed to, what the other side committed to, and any specific follow-up date. Use 'Not mentioned' for anything not stated."
}

Do not invent or infer facts that were not stated. Where something wasn't discussed, write "Not mentioned" (for text fields) or false/null (for booleans) rather than guessing.

MEETING RECAP TO NORMALIZE:
"""`

export async function POST(request) {
  let b
  try { b = await request.json() } catch (e) { return Response.json({ error: "invalid JSON" }, { status: 400 }) }

  const rawText = (b.raw_text || "").toString().trim()
  if (!rawText) return Response.json({ error: "raw_text required" }, { status: 400 })

  const personIds = Array.isArray(b.person_ids) ? b.person_ids.filter(Boolean) : []
  if (!personIds.length) return Response.json({ error: "at least one person_id required" }, { status: 400 })

  const occurredAt = (b.occurred_at || "").toString().trim() || new Date().toISOString().slice(0, 10)
  const meetingTypeInput = (b.meeting_type || "").toString().trim() || null

  const sb = serverClient()

  // Confirm every person_id is real before writing anything.
  const { data: people, error: peopleErr } = await sb.from("people")
    .select("id, first_name, full_name").in("id", personIds)
  if (peopleErr) return Response.json({ error: peopleErr.message }, { status: 500 })
  if (!people || people.length !== personIds.length) {
    return Response.json({ error: "one or more person_ids not found" }, { status: 404 })
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) return Response.json({ error: "AI not configured" }, { status: 500 })

  const prompt = PARSE_PROMPT_HEADER + rawText + '\n"""'

  let aiRes
  try {
    aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": anthropicKey },
      body: JSON.stringify({ model: MODEL, max_tokens: 6000, messages: [{ role: "user", content: prompt }] }),
    })
  } catch (e) {
    return saveRaw(sb, personIds, occurredAt, meetingTypeInput, rawText, "AI request failed: " + (e.message || e))
  }
  if (!aiRes.ok) {
    const t = await aiRes.text().catch(() => "")
    return saveRaw(sb, personIds, occurredAt, meetingTypeInput, rawText, "AI error " + aiRes.status + ": " + t.slice(0, 300))
  }
  const data = await aiRes.json()
  const raw = (data.content && data.content[0] && data.content[0].text) || ""

  const { narrative, meta } = splitNarrativeAndMeta(raw)

  if (data.stop_reason === "max_tokens" && !meta) {
    return saveRaw(sb, personIds, occurredAt, meetingTypeInput, narrative || rawText, "AI response was cut off before finishing (too long to normalize in one pass)")
  }
  if (!meta) return saveRaw(sb, personIds, occurredAt, meetingTypeInput, narrative || rawText, "Could not parse AI response")
  if (!narrative) return saveRaw(sb, personIds, occurredAt, meetingTypeInput, rawText, "AI response missing narrative")

  const suggestedTag = WARNING_TAGS.includes(meta.suggested_warning_tag) ? meta.suggested_warning_tag : null

  const insertRow = {
    occurred_at: occurredAt,
    meeting_type: meetingTypeInput || meta.meeting_type || null,
    raw_text: rawText,
    narrative,
    summary: meta.summary || null,
    engagement_signal: meta.engagement_signal || null,
    referral_mentioned: typeof meta.referral_mentioned === "boolean" ? meta.referral_mentioned : null,
    referral_who: meta.referral_who || null,
    hard_stop: !!meta.hard_stop,
    hard_stop_detail: meta.hard_stop_detail || null,
    suggested_warning_tag: meta.hard_stop ? suggestedTag : null,
    fit_verdict: meta.fit_verdict || null,
    commitments: meta.commitments || null,
    created_by: "dalen",
  }

  const { data: inserted, error: insErr } = await sb.from("meeting_recaps").insert(insertRow).select().single()
  if (insErr) return Response.json({ error: insErr.message }, { status: 500 })

  const { error: partErr } = await sb.from("meeting_recap_participants")
    .insert(personIds.map(function (pid) { return { meeting_recap_id: inserted.id, person_id: pid } }))
  if (partErr) return Response.json({ error: "recap saved but linking participants failed: " + partErr.message }, { status: 500 })

  await logCommunications(sb, personIds, inserted)

  return Response.json({ meeting_recap: inserted })
}

// Never lose a pasted meeting recap just because normalizing failed — save
// it verbatim (unscored, unlinked-to-warmth-fields) rather than discarding
// it. Still links participants and still logs a communications row, since
// "a meeting happened" is true and worth counting toward warmth even when
// the AI reshape failed.
async function saveRaw(sb, personIds, occurredAt, meetingType, rawText, reason) {
  const insertRow = {
    occurred_at: occurredAt,
    meeting_type: meetingType,
    raw_text: rawText,
    narrative: rawText,
    summary: "(auto-formatting failed — saved as raw text: " + reason + ")",
    parse_failed: true,
    parse_failed_reason: reason,
    created_by: "dalen",
  }
  const { data: inserted, error: insErr } = await sb.from("meeting_recaps").insert(insertRow).select().single()
  if (insErr) return Response.json({ error: reason + " — and saving the raw recap also failed: " + insErr.message }, { status: 500 })

  const { error: partErr } = await sb.from("meeting_recap_participants")
    .insert(personIds.map(function (pid) { return { meeting_recap_id: inserted.id, person_id: pid } }))
  if (!partErr) await logCommunications(sb, personIds, inserted)

  return Response.json({ meeting_recap: inserted, parse_failed: true, parse_failed_reason: reason })
}

async function logCommunications(sb, personIds, recap) {
  const body = recap.summary && !recap.parse_failed
    ? recap.summary
    : (recap.narrative || "").toString().slice(0, 500) || "Meeting logged"
  const stepLabel = "Meeting" + (recap.meeting_type ? ": " + recap.meeting_type : "")
  const occurredAtIso = recap.occurred_at ? recap.occurred_at + "T12:00:00.000Z" : new Date().toISOString()
  try {
    await sb.from("communications").insert(personIds.map(function (pid) {
      return {
        person_id: pid,
        direction: "inbound",
        channel: "meeting",
        body,
        occurred_at: occurredAtIso,
        step_label: stepLabel,
        source: "meeting_recap",
        meeting_recap_id: recap.id,
      }
    }))
    await sb.from("people").update({ last_meaningful_touch: new Date().toISOString() }).in("id", personIds)
  } catch (e) { console.error("meeting_recap communications log failed:", e.message) }
}

// Local copy of the narrative/meta split used by research-note and
// deep-research (src/lib/researchNoteStore.js) — same contract, different
// call site, kept inline here since this route's metadata shape (summary/
// engagement_signal/etc) is specific to meeting recaps, not research notes.
function splitNarrativeAndMeta(text) {
  const t = (text || "").trim()
  const fenceMatch = t.match(/```json\s*([\s\S]*?)```\s*$/i)
  if (fenceMatch) {
    const before = t.slice(0, fenceMatch.index).trim()
    try {
      const meta = JSON.parse(fenceMatch[1])
      return { narrative: before || null, meta }
    } catch (e) { /* fall through */ }
  }
  const braceMatch = t.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}\s*$/)
  if (braceMatch) {
    try {
      const meta = JSON.parse(braceMatch[0])
      const before = t.slice(0, braceMatch.index).trim()
      return { narrative: meta.narrative || before || null, meta }
    } catch (e) { /* fall through */ }
  }
  return { narrative: t || null, meta: null }
}
