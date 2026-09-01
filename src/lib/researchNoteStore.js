// Shared insert logic for person_research_notes, used by both the
// paste-and-normalize endpoint (research-note) and the live deep-research
// endpoint (deep-research) so a parse failure is handled identically in
// both places — never discard what was produced, always save something.
//
// Output contract: the AI writes the narrative as plain markdown prose
// FIRST, then ends with a fenced ```json code block containing ONLY the
// structured metadata (verdict/score/confidence/summary/dimensions) — NOT
// the narrative re-encoded inside it. Earlier versions asked for one giant
// JSON object with the whole narrative crammed into a string field; every
// quote and newline in a long writeup had to be escaped, which bloated
// token usage, made truncation far more likely, and meant a parse failure
// dumped raw escaped-JSON garbage into the narrative field instead of
// readable text. Splitting them out means even a failed/truncated response
// still leaves the narrative portion as clean prose.

export function splitNarrativeAndMeta(text) {
  const t = (text || "").trim()

  // Preferred shape: narrative prose, then a trailing ```json ... ``` fence.
  const fenceMatch = t.match(/```json\s*([\s\S]*?)```\s*$/i)
  if (fenceMatch) {
    const before = t.slice(0, fenceMatch.index).trim()
    try {
      const meta = JSON.parse(fenceMatch[1])
      return { narrative: before || null, meta }
    } catch (e) { /* fall through to other strategies */ }
  }

  // Older/looser shape: a bare trailing {...} with no fence.
  const braceMatch = t.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}\s*$/)
  if (braceMatch) {
    try {
      const meta = JSON.parse(braceMatch[0])
      const before = t.slice(0, braceMatch.index).trim()
      // Backward-compat: if this JSON blob itself carries a "narrative" key
      // (the old all-in-one-object format), prefer that over the prose prefix.
      return { narrative: meta.narrative || before || null, meta }
    } catch (e) { /* fall through */ }
  }

  // Nothing parseable — the whole response is just the narrative, unscored.
  return { narrative: t || null, meta: null }
}

export async function insertParsedNote(sb, personId, createdBy, meta, narrative, rawInput) {
  const insertRow = {
    person_id: personId,
    created_by: createdBy,
    verdict: meta.verdict || null,
    score: Number.isFinite(meta.score) ? meta.score : null,
    confidence: Number.isFinite(meta.confidence) ? meta.confidence : null,
    dimensions: Array.isArray(meta.dimensions) ? meta.dimensions : [],
    summary: meta.summary || null,
    narrative: narrative || meta.narrative || "(no narrative produced)",
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
