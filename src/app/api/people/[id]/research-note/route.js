export const dynamic = "force-dynamic"
export const maxDuration = 60

import { serverClient } from "@/lib/supabaseServer"
import { splitNarrativeAndMeta, insertParsedNote, insertRawNote } from "@/lib/researchNoteStore"

// POST /api/people/[id]/research-note   { raw_text }  -> { note }
// GET  /api/people/[id]/research-note                 -> { notes }
//
// Dalen runs a deep-research pass on a person somewhere outside this app
// (a GPT/Claude research tool that browses IRS filings, ProPublica, LinkedIn,
// etc.) and pastes the resulting writeup here. This endpoint doesn't do the
// research itself — it takes whatever loosely-formatted markdown comes back
// from that process and normalizes it into one standard shape (verdict,
// score /100, confidence %, a dimension-by-dimension breakdown, a one-line
// summary, plus the full narrative preserved as-is) so every research note
// in the system is comparable and machine-readable, even though the exact
// rubric may drift over time. `dimensions` is stored as free-form jsonb for
// that reason — whatever dimensions/weights this particular note used are
// what get recorded, not a hardcoded set.

const MODEL = process.env.DRAFT_EMAIL_MODEL || "claude-sonnet-4-6"

const PARSE_PROMPT_HEADER = `You are normalizing a CFO-prospect research writeup. The writeup below was produced by an AI deep-research process that scores how strong a candidate someone is to invite into CFO Circle, a peer advisory group. The exact rubric/dimensions used may vary between notes — extract whatever dimensions THIS note actually used, don't invent a fixed set.

First, reproduce the writeup's full body as clean markdown (keep all facts, figures, tables, and citation links — do not summarize or shorten it, just strip obvious formatting noise like stray asterisks or broken line breaks). Write this as PLAIN TEXT, not inside any JSON — this is the most important part to get right and to not truncate.

Then, after the markdown narrative, on its own on a new line, output a fenced code block starting with \`\`\`json containing ONLY this metadata (do NOT repeat the narrative inside it):
{"verdict": "Strong Invite | Invite | Maybe | Pass (or closest match to the note's own language)", "score": 88, "confidence": 94, "summary": "one or two plain sentences, the bottom-line takeaway", "dimensions": [{"name":"...", "score":20, "max":20, "why":"..."}]}

Use null for score/confidence if genuinely not stated in the writeup. dimensions is an array of every scoring row found in any breakdown table in the note — empty array if none.

RESEARCH WRITEUP TO NORMALIZE:
"""`

export async function GET(request, { params }) {
  const id = params?.id
  if (!id) return Response.json({ error: "id required" }, { status: 400 })
  const sb = serverClient()
  const { data: notes, error } = await sb.from("person_research_notes")
    .select("id, created_at, created_by, verdict, score, confidence, dimensions, summary, narrative")
    .eq("person_id", id)
    .order("created_at", { ascending: false })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ notes: notes || [] })
}

export async function POST(request, { params }) {
  const id = params?.id
  if (!id) return Response.json({ error: "id required" }, { status: 400 })

  let b
  try { b = await request.json() } catch (e) { return Response.json({ error: "invalid JSON" }, { status: 400 }) }
  const rawText = (b.raw_text || "").toString().trim()
  if (!rawText) return Response.json({ error: "raw_text required" }, { status: 400 })

  const sb = serverClient()
  const { data: person } = await sb.from("people").select("id").eq("id", id).maybeSingle()
  if (!person) return Response.json({ error: "person not found" }, { status: 404 })

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) return Response.json({ error: "AI not configured" }, { status: 500 })

  const prompt = PARSE_PROMPT_HEADER + rawText + '\n"""'

  // 12000 output tokens. Narrative is now plain prose (not JSON-escaped), so
  // this goes much further than it used to — but a real research writeup is
  // still long, so leave real headroom rather than risk another cutoff.
  let aiRes
  try {
    aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": anthropicKey },
      body: JSON.stringify({ model: MODEL, max_tokens: 12000, messages: [{ role: "user", content: prompt }] }),
    })
  } catch (e) {
    return saveRaw(sb, id, rawText, "AI request failed: " + (e.message || e))
  }
  if (!aiRes.ok) {
    const t = await aiRes.text().catch(() => "")
    return saveRaw(sb, id, rawText, "AI error " + aiRes.status + ": " + t.slice(0, 300))
  }
  const data = await aiRes.json()
  const raw = (data.content && data.content[0] && data.content[0].text) || ""

  const { narrative, meta } = splitNarrativeAndMeta(raw)

  // If Claude hit the token ceiling mid-metadata-block, at least the
  // narrative prose before it is usually intact (that's the whole point of
  // writing it plain, before any JSON) — save that rather than nothing.
  if (data.stop_reason === "max_tokens" && !meta) {
    return saveRaw(sb, id, narrative || rawText, "AI response was cut off before finishing (too long to normalize in one pass)")
  }
  if (!meta) return saveRaw(sb, id, narrative || rawText, "Could not parse AI response")
  if (!narrative) return saveRaw(sb, id, rawText, "AI response missing narrative")

  const { data: inserted, error: insErr } = await insertParsedNote(sb, id, "dalen", meta, narrative, rawText)
  if (insErr) return saveRaw(sb, id, narrative, "Saved but normalizing failed: " + insErr.message)

  return Response.json({ note: inserted })
}

// Never lose a pasted research note just because the auto-formatting step
// failed — save it verbatim (unscored) instead of discarding it and showing
// a bare error. Dalen can always tell it's unstructured (no verdict/score),
// and can re-paste later to try normalizing it again once the ceiling issue
// above is out of the way.
async function saveRaw(sb, personId, rawText, reason) {
  const { data: inserted, error: insErr } = await insertRawNote(sb, personId, "dalen", rawText, reason, rawText)
  if (insErr) return Response.json({ error: reason + " — and saving the raw note also failed: " + insErr.message }, { status: 500 })
  return Response.json({ note: inserted, parse_failed: true, parse_failed_reason: reason })
}
