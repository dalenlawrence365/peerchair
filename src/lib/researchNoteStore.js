// Shared insert logic for person_research_notes, used by both the
// paste-and-normalize endpoint (research-note) and the live deep-research
// endpoint (deep-research) so a parse failure is handled identically in
// both places — never discard what was produced, always save something.

export function extractJSON(text) {
  try {
    const m = (text || "").match(/\{[\s\S]*\}/)
    return JSON.parse(m ? m[0] : text)
  } catch (e) {
    return null
  }
}

export async function insertParsedNote(sb, personId, createdBy, parsed, rawInput) {
  const insertRow = {
    person_id: personId,
    created_by: createdBy,
    verdict: parsed.verdict || null,
    score: Number.isFinite(parsed.score) ? parsed.score : null,
    confidence: Number.isFinite(parsed.confidence) ? parsed.confidence : null,
    dimensions: Array.isArray(parsed.dimensions) ? parsed.dimensions : [],
    summary: parsed.summary || null,
    narrative: parsed.narrative,
    raw_input: rawInput || null,
  }
  return sb.from("person_research_notes").insert(insertRow).select().single()
}

export async function insertRawNote(sb, personId, createdBy, narrativeText, reason, rawInput) {
  const insertRow = {
    person_id: personId,
    created_by: createdBy,
    verdict: null, score: null, confidence: null, dimensions: [],
    summary: "(auto-formatting failed — saved as raw text: " + reason + ")",
    narrative: narrativeText || "(no content produced)",
    raw_input: rawInput || narrativeText || null,
  }
  return sb.from("person_research_notes").insert(insertRow).select().single()
}
