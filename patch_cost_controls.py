import re

# ---------- 1. researchNoteStore.js: add optional tokenUsage param ----------
f1 = "/tmp/pc/src/lib/researchNoteStore.js"
s = open(f1).read()

old1 = '''export async function insertParsedNote(sb, personId, createdBy, meta, narrative, rawInput) {
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
}'''

new1 = '''// tokenUsage (optional, 7th arg on both functions below) -- when the caller
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
}'''

assert s.count(old1) == 1, "researchNoteStore block not found"
s = s.replace(old1, new1)
open(f1, "w").write(s)
print("researchNoteStore.js patched")

# ---------- 2. deepResearch.js: model swap, maxSearches opt, usage capture ----------
f2 = "/tmp/pc/src/lib/deepResearch.js"
s = open(f2).read()

old2a = 'const MODEL = process.env.DEEP_RESEARCH_MODEL || "claude-opus-5"'
new2a = '''// Cost fix (2026-09-14): this was defaulting to Opus -- the only AI call in
// the codebase that did (every other feature here defaults to Sonnet or
// Haiku). Combined with the auto-fire-on-every-LinkedIn-connect webhook path
// having no de-dupe guard, that was burning through Dalen's Anthropic budget
// fast, silently, in the background. Sonnet is dramatically cheaper per
// token; the structured rubric in PROTOCOL below does most of the actual
// reasoning work, so the quality delta should be modest, not dramatic.
const MODEL = process.env.DEEP_RESEARCH_MODEL || "claude-sonnet-4-6"'''
assert s.count(old2a) == 1, "MODEL line not found"
s = s.replace(old2a, new2a)

old2b = "export async function runDeepResearch(sb, id) {"
new2b = '''// opts.maxSearches (default 15): the manual "Run deep research" button
// wants full depth since Dalen deliberately chose to spend the time/money.
// The auto-fired background path (triggerPostConnectResearch, fired on
// every LinkedIn connection accept) passes a lower cap -- each web search
// injects its own scraped result content back into context, so search
// count is a real cost lever, and an unattended background job firing on
// every connect shouldn't default to the same depth as a deliberate click.
export async function runDeepResearch(sb, id, opts = {}) {
  const maxSearches = opts.maxSearches || 15'''
assert s.count(old2b) == 1, "runDeepResearch signature not found"
s = s.replace(old2b, new2b)

old2c = '''    tools: [{
      type: "web_search_20250305",
      name: "web_search",
      max_uses: 15,
      user_location: { type: "approximate", city: "Los Angeles", region: "California", country: "US" },
    }],'''
new2c = '''    tools: [{
      type: "web_search_20250305",
      name: "web_search",
      max_uses: maxSearches,
      user_location: { type: "approximate", city: "Los Angeles", region: "California", country: "US" },
    }],'''
assert s.count(old2c) == 1, "tools config not found"
s = s.replace(old2c, new2c)

old2d = '''  const data = await aiRes.json()

  if (data.stop_reason === "pause_turn") {'''
new2d = '''  const data = await aiRes.json()

  // Capture actual token usage so spend is queryable after the fact --
  // previously only searches_used was tracked, which said nothing about
  // real cost. Anthropic's usage object may omit cache fields entirely on
  // some responses, hence the ?? null throughout rather than assuming 0.
  const u = data.usage || {}
  const tokenUsage = {
    input_tokens: u.input_tokens ?? null,
    output_tokens: u.output_tokens ?? null,
    cache_creation_input_tokens: u.cache_creation_input_tokens ?? null,
    cache_read_input_tokens: u.cache_read_input_tokens ?? null,
  }

  if (data.stop_reason === "pause_turn") {'''
assert s.count(old2d) == 1, "data.usage insertion point not found"
s = s.replace(old2d, new2d)

old2e = '''  if (data.stop_reason === "max_tokens" && !meta) {
    const { data: inserted, error: insErr } = await insertRawNote(sb, id, "dalen (deep research)", narrative || raw, "Response was cut off before finishing (hit the token ceiling after " + searchesUsed + " searches)", null)
    if (insErr) return { ok: false, status: 500, error: "Research cut off, and saving it also failed: " + insErr.message }
    return { ok: true, note: inserted, parse_failed: true, parse_failed_reason: "cut off before finishing" }
  }

  if (!meta || !narrative) {
    const { data: inserted, error: insErr } = await insertRawNote(sb, id, "dalen (deep research)", narrative || raw, "Could not parse the research output into the standard format (used " + searchesUsed + " searches)", null)
    if (insErr) return { ok: false, status: 500, error: "Could not parse research output, and saving it also failed: " + insErr.message }
    return { ok: true, note: inserted, parse_failed: true, parse_failed_reason: "could not parse" }
  }

  const { data: inserted, error: insErr } = await insertParsedNote(sb, id, "dalen (deep research)", meta, narrative, null)
  if (insErr) return { ok: false, status: 500, error: insErr.message }

  return { ok: true, note: inserted, searches_used: searchesUsed }
}'''
new2e = '''  if (data.stop_reason === "max_tokens" && !meta) {
    const { data: inserted, error: insErr } = await insertRawNote(sb, id, "dalen (deep research)", narrative || raw, "Response was cut off before finishing (hit the token ceiling after " + searchesUsed + " searches)", null, tokenUsage)
    if (insErr) return { ok: false, status: 500, error: "Research cut off, and saving it also failed: " + insErr.message }
    return { ok: true, note: inserted, parse_failed: true, parse_failed_reason: "cut off before finishing" }
  }

  if (!meta || !narrative) {
    const { data: inserted, error: insErr } = await insertRawNote(sb, id, "dalen (deep research)", narrative || raw, "Could not parse the research output into the standard format (used " + searchesUsed + " searches)", null, tokenUsage)
    if (insErr) return { ok: false, status: 500, error: "Could not parse research output, and saving it also failed: " + insErr.message }
    return { ok: true, note: inserted, parse_failed: true, parse_failed_reason: "could not parse" }
  }

  const { data: inserted, error: insErr } = await insertParsedNote(sb, id, "dalen (deep research)", meta, narrative, null, tokenUsage)
  if (insErr) return { ok: false, status: 500, error: insErr.message }

  return { ok: true, note: inserted, searches_used: searchesUsed }
}'''
assert s.count(old2e) == 1, "final insert block not found"
s = s.replace(old2e, new2e)

open(f2, "w").write(s)
print("deepResearch.js patched")

# ---------- 3. linkedhelper-webhook/route.js: de-dupe guard + lower search cap ----------
f3 = "/tmp/pc/src/app/api/linkedhelper-webhook/route.js"
s = open(f3).read()

old3a = '''async function triggerPostConnectResearch(sb, personId, displayName) {
  try {
    const result = await runDeepResearch(sb, personId)'''
new3a = '''async function triggerPostConnectResearch(sb, personId, displayName) {
  try {
    // Capped lower than the manual button's default (15) -- this fires
    // unattended on every LinkedIn connect accept, so it shouldn't spend at
    // the same depth as a deliberate click. See dedup guard in
    // handleConnected below for the other half of the cost fix.
    const result = await runDeepResearch(sb, personId, { maxSearches: 6 })'''
assert s.count(old3a) == 1, "triggerPostConnectResearch call not found"
s = s.replace(old3a, new3a)

old3b = '''  if (isCfo && !isOutOfMarket) {
    waitUntil(triggerPostConnectResearch(sb, contact.id, lead.fullName || contact.full_name))
  }
}'''
new3b = '''  // De-dupe guard (2026-09-14): this used to fire unconditionally on every
  // accept with no check for an existing note -- a repeat/duplicate webhook
  // delivery, or someone disconnecting and reconnecting, could silently
  // re-run a full paid research pass on someone already researched. A
  // person's fundamentals (employer, role, scale) don't meaningfully change
  // week to week, so skip if there's already a note from the last 90 days.
  let hasRecentResearch = false
  if (isCfo && !isOutOfMarket) {
    const { data: recentNote } = await sb.from("person_research_notes")
      .select("id")
      .eq("person_id", contact.id)
      .gt("created_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
      .limit(1)
    hasRecentResearch = !!(recentNote && recentNote.length)
  }

  if (isCfo && !isOutOfMarket && !hasRecentResearch) {
    waitUntil(triggerPostConnectResearch(sb, contact.id, lead.fullName || contact.full_name))
  }
}'''
assert s.count(old3b) == 1, "handleConnected trigger block not found"
s = s.replace(old3b, new3b)

open(f3, "w").write(s)
print("linkedhelper-webhook/route.js patched")
