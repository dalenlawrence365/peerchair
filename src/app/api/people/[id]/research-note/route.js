export const dynamic = "force-dynamic"
export const maxDuration = 60

import { serverClient } from "@/lib/supabaseServer"

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

const PARSE_PROMPT_HEADER = `You are normalizing a CFO-prospect research writeup into a fixed JSON shape. The writeup below was produced by an AI deep-research process that scores how strong a candidate someone is to invite into CFO Circle, a peer advisory group. The exact rubric/dimensions used may vary between notes — extract whatever dimensions THIS note actually used, don't invent a fixed set.

Extract:
- verdict: the short call, e.g. "Strong Invite", "Invite", "Maybe", "Pass" — read from the note's own language if it states one, otherwise infer the closest short label from the overall tone/score.
- score: the overall numeric score out of 100, as an integer. Null if genuinely not present.
- confidence: the stated research-confidence percentage, as an integer 0-100. Null if not present.
- summary: one or two plain sentences capturing the bottom-line takeaway (not a title, an actual summary a busy person can read in 5 seconds).
- dimensions: an array of {"name": string, "score": number, "max": number, "why": string} for each scoring row found in any breakdown table in the note. Empty array if no dimension table is present.
- narrative: the full body of the note, cleaned up as clean markdown (keep all facts, figures, tables, and citation links — do not summarize or shorten it, just strip obvious formatting noise).

Respond with ONLY valid JSON, no other text, in exactly this shape:
{"verdict": "...", "score": 88, "confidence": 94, "summary": "...", "dimensions": [{"name":"...", "score":20, "max":20, "why":"..."}], "narrative": "..."}

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

  let aiRes
  try {
    aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": anthropicKey },
      body: JSON.stringify({ model: MODEL, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
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
  if (!parsed.narrative) return Response.json({ error: "AI response missing narrative", raw: raw.slice(0, 500) }, { status: 502 })

  const insertRow = {
    person_id: id,
    created_by: "dalen",
    verdict: parsed.verdict || null,
    score: Number.isFinite(parsed.score) ? parsed.score : null,
    confidence: Number.isFinite(parsed.confidence) ? parsed.confidence : null,
    dimensions: Array.isArray(parsed.dimensions) ? parsed.dimensions : [],
    summary: parsed.summary || null,
    narrative: parsed.narrative,
    raw_input: rawText,
  }
  const { data: inserted, error: insErr } = await sb.from("person_research_notes").insert(insertRow).select().single()
  if (insErr) return Response.json({ error: insErr.message }, { status: 500 })

  return Response.json({ note: inserted })
}
