export const dynamic = "force-dynamic"
export const maxDuration = 60

import { serverClient } from "@/lib/supabaseServer"

// POST /api/people/[id]/clean-note  { text } -> { note }
//
// Takes a raw, spoken-and-transcribed (or hastily typed) note Dalen dictated
// about a person and tidies it into a short, factual CRM note in his own voice.
// It SUMMARIZES — a two-minute rant comes back as a few tight sentences — while
// preserving every fact, name, number, date, commitment and action item. It
// never invents anything and never adds a greeting/sign-off. Mirrors the
// Anthropic call in draft-dm/draft-email so the same key/model are used.

const MODEL = process.env.DRAFT_EMAIL_MODEL || "claude-sonnet-4-6"

export async function POST(request, { params }) {
  const id = params?.id
  if (!id) return Response.json({ error: "id required" }, { status: 400 })

  let b
  try { b = await request.json() } catch (e) { return Response.json({ error: "invalid JSON" }, { status: 400 }) }
  const text = (b.text || "").toString().trim()
  if (!text) return Response.json({ error: "text required" }, { status: 400 })

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) return Response.json({ error: "AI not configured" }, { status: 500 })

  // Light context only — the person's name helps phrasing; nothing else is needed
  // to tidy a note, and we never want the model inventing facts from the profile.
  let who = "a person in his CRM"
  try {
    const sb = serverClient()
    const { data: person } = await sb.from("people").select("full_name, first_name, company").eq("id", id).maybeSingle()
    if (person) who = (person.full_name || person.first_name || "a person") + (person.company ? " at " + person.company : "")
  } catch (e) { /* non-fatal */ }

  const prompt = `You are tidying a note that Dalen — chapter director of CFO Circle Los Angeles — just dictated or typed about ${who} in his CRM. Spoken input rambles: he repeats himself, trails off, and thinks out loud. Your job is to turn it into a clean, usable note.

Rules:
- Write it in HIS voice, first person, the way he'd jot it for himself later.
- SUMMARIZE. A long rant becomes a few tight sentences. If there are clearly distinct items (facts + a couple of to-dos), a short bullet list is fine; otherwise plain sentences.
- Preserve every substantive fact, name, company, number, date, dollar figure, commitment, and action item. Losing a fact is the only real failure.
- Cut filler, false starts, repetition, and "um / you know / like".
- Do NOT invent anything that isn't in the raw note. Do NOT add a greeting, sign-off, or preamble like "Note:".
- Keep it concise and skimmable.

Raw note:
"""
${text}
"""

Respond with ONLY valid JSON, no other text, in exactly this shape:
{"note": "..."}`

  let aiRes
  try {
    aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": anthropicKey },
      body: JSON.stringify({ model: MODEL, max_tokens: 700, messages: [{ role: "user", content: prompt }] }),
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
  let note = ""
  try {
    const parsed = JSON.parse(raw)
    note = (parsed.note || "").toString().trim()
  } catch (e) {
    // Model didn't return clean JSON — salvage the text rather than failing.
    note = raw.replace(/^[^{]*\{?\s*"?note"?\s*:?\s*"?/i, "").replace(/"?\s*\}?\s*$/, "").trim()
  }
  if (!note) return Response.json({ error: "empty result" }, { status: 502 })
  return Response.json({ note })
}
