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

// The live deep-research model streams step-by-step reasoning as plain text
// BETWEEN its web searches ("I'll start by verifying…", "Good start…"), and
// those blocks get concatenated ahead of the real writeup. The prompt now
// marks the start of the deliverable with a hidden <!--NOTE--> line; keep only
// what follows the last marker so the research log never lands in the note.
// No marker (older notes, or the paste-and-normalize path) → unchanged.
const NOTE_MARKER = "<!--NOTE-->"
function stripResearchLog(s) {
  if (!s) return s
  const i = s.lastIndexOf(NOTE_MARKER)
  return i >= 0 ? s.slice(i + NOTE_MARKER.length).trim() : s
}

export function splitNarrativeAndMeta(text) {
  const t = (text || "").trim()

  // Preferred shape: narrative prose, then a trailing ```json ... ``` fence.
  const fenceMatch = t.match(/```json\s*([\s\S]*?)```\s*$/i)
  if (fenceMatch) {
    const before = t.slice(0, fenceMatch.index).trim()
    try {
      const meta = JSON.parse(fenceMatch[1])
      return { narrative: stripResearchLog(before) || null, meta }
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
      return { narrative: meta.narrative || stripResearchLog(before) || null, meta }
    } catch (e) { /* fall through */ }
  }

  // Nothing parseable — the whole response is just the narrative, unscored.
  return { narrative: stripResearchLog(t) || null, meta: null }
}

// tokenUsage (optional, 7th arg on both functions below) -- when the caller
// has real Anthropic usage numbers (the live deep-research path does; the
// paste-and-normalize path doesn't bother, since that AI call is a small
// parsing pass, not the expensive part) it gets persisted alongside the
// note so spend is queryable after the fact instead of only visible as a
// surprise on the Anthropic bill. Shape: {input_tokens, output_tokens,
// cache_creation_input_tokens, cache_read_input_tokens} -- any/all may be
// null if the API response didn't include them.
function usageColumns(tokenUsage) {
  if (!tokenUsage) return {}
  return {
    input_tokens: tokenUsage.input_tokens ?? null,
    output_tokens: tokenUsage.output_tokens ?? null,
    cache_creation_input_tokens: tokenUsage.cache_creation_input_tokens ?? null,
    cache_read_input_tokens: tokenUsage.cache_read_input_tokens ?? null,
  }
}

export async function insertParsedNote(sb, personId, createdBy, meta, narrative, rawInput, tokenUsage) {
  // Score is the SUM of the dimension scores — the single source of truth — so the
  // stored headline can never diverge from the rubric (the model used to free-type a
  // different total into the prose). Fall back to the model's stated score only when
  // no dimensions came back.
  const dims = Array.isArray(meta.dimensions) ? meta.dimensions : []
  const dimSum = dims.reduce(function (a, d) { return a + (d && Number.isFinite(d.score) ? d.score : 0) }, 0)
  const computedScore = dims.length ? dimSum : (Number.isFinite(meta.score) ? meta.score : null)

  // Lock the verdict LABEL to the score band so the label and the number can
  // never disagree (the model used to upgrade the label a notch above the
  // number). A hard stop overrides the score and is kept verbatim. When the
  // model's own verdict reached a band ABOVE the score — its "pursue at the
  // margin" call — keep the band label but set pursue_anyway so the card still
  // surfaces the "worth a conversation" signal.
  const BANDS = ["Wrong Target", "Investigate Further", "Strong Prospect", "Priority Recruit"]
  const modelVerdict = meta.verdict || null
  const isHardStop = typeof modelVerdict === "string" && /hard stop/i.test(modelVerdict)
  const band = !Number.isFinite(computedScore) ? null
    : computedScore >= 85 ? "Priority Recruit"
    : computedScore >= 65 ? "Strong Prospect"
    : computedScore >= 50 ? "Investigate Further"
    : "Wrong Target"
  const finalVerdict = isHardStop ? modelVerdict : (band || modelVerdict)
  const pursueAnyway = (!isHardStop && band) ? (BANDS.indexOf(modelVerdict) > BANDS.indexOf(band)) : false

  const insertRow = {
    person_id: personId,
    created_by: createdBy,
    verdict: finalVerdict,
    score: computedScore,
    confidence: Number.isFinite(meta.confidence) ? meta.confidence : null,
    dimensions: dims,
    pursue_anyway: pursueAnyway,
    summary: meta.summary || null,
    narrative: narrative || meta.narrative || "(no narrative produced)",
    raw_input: rawInput || null,
    ...usageColumns(tokenUsage),
  }
  return sb.from("person_research_notes").insert(insertRow).select().single()
}

export async function insertRawNote(sb, personId, createdBy, narrativeText, reason, rawInput, tokenUsage) {
  const insertRow = {
    person_id: personId,
    created_by: createdBy,
    verdict: null, score: null, confidence: null, dimensions: [],
    summary: "(auto-formatting failed — saved as raw text: " + reason + ")",
    narrative: narrativeText || "(no content produced)",
    raw_input: rawInput || narrativeText || null,
    ...usageColumns(tokenUsage),
  }
  return sb.from("person_research_notes").insert(insertRow).select().single()
}
