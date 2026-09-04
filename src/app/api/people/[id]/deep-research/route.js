export const dynamic = "force-dynamic"
// Fluid compute grants 300s by default even on Hobby; stay under that with
// margin. Real multi-search research runs 30s-3min in practice, but a slow
// run (many searches, a stubborn source) needs the room.
export const maxDuration = 280

import { serverClient } from "@/lib/supabaseServer"
import { splitNarrativeAndMeta, insertParsedNote, insertRawNote } from "@/lib/researchNoteStore"

// POST /api/people/[id]/deep-research  -> { note }
//
// The in-app version of the CFO Circle Prospect Research Protocol Dalen
// runs by hand: screenshot a LinkedIn Sales Navigator profile into an AI
// research tool, have it independently verify CFO status and assess the
// company across multiple sources, and produce a scored, opinionated
// recommendation. This does the same thing using Claude's web_search tool,
// starting from the profile facts already on file — but those facts are
// treated as a last-synced starting hypothesis, not ground truth, because
// a stale CRM record is exactly the kind of thing this process exists to
// catch (see the "current employment" step below).
//
// Uses the exact same standardized shape (verdict/score/confidence/
// dimensions/summary/narrative) as the paste-and-normalize endpoint
// (research-note/route.js) and the same never-lose-the-output fallback.

const MODEL = process.env.DEEP_RESEARCH_MODEL || "claude-opus-5"

const PROTOCOL = `# CFO Circle Prospect Research Protocol

You are not summarizing a resume. Your job is to determine whether this person should occupy one of the limited seats in a CFO Circle room, and tell Dalen what to do about them. CFO Circle is a curated, confidential peer advisory group where accomplished CFOs bring current business issues to experienced peers — the quality of each person admitted affects the value of the product itself. You are simultaneously answering two questions: will this CFO get real value from the room, and will putting them in the room increase the room's value for everyone already in it.

## Step zero: don't trust the starting facts, verify them

The "starting facts" below are the last-synced snapshot from Dalen's CRM — they can be stale. Before anything else, confirm whether this person's CURRENT title and employer, as of today, actually match what's stored. People change jobs; databases don't always catch up. If you find they've moved on, or that a title is ambiguous ("CFO / Finance Director / Interim CFO"), that discovery is the single most important thing in your writeup and should lead it, not get buried in a footnote.

## Method: try to disprove the initial impression, don't just confirm it

Actively look for contradictions rather than supporting evidence:
- If a source calls them CFO, ask: is this really a sitting CFO with meaningful authority, or a controller/finance-manager title inflated by an aggregator?
- If a source cites a dollar figure, ask what it actually measures — real company revenue, systemwide/franchise sales, GMV, AUM, enterprise value, capital raised, or just marketing language. These get conflated constantly and change the read entirely.
- If someone has two current roles, ask whether this is a real operating CFO seat or fractional/portfolio/consulting work.
- If sources disagree on title or employer, resolve which one is CURRENT rather than reporting both uncritically.

## Source credibility — weight accordingly, and say when you're relying on a weak tier

**Tier 1 (highest, treat as near-conclusive):** SEC filings (Form D/10-K/8-K and who signs them as CFO), IRS Form 990 (ProPublica Nonprofit Explorer or the org's own filing), Companies House / state corporate/business registries, official company leadership pages, press releases, investor materials.

**Tier 2 (solid context, corroborating):** reputable business/trade press, industry transaction reporting, franchise disclosure documents, funding/deal announcements, recognized industry databases.

**Tier 3 (leads only — do not let a qualification decision rest on these alone):** aggregator/resume-scrape databases (ZoomInfo, RocketReach, SignalHire, Muraena, ContactOut, Wiza, etc). These are almost always LinkedIn-derived and frequently stale or contradictory to each other. If Tier 1/2 sources are unavailable and you're relying on Tier 3, say so plainly and reflect it in a lower confidence score — don't manufacture false precision.

## Revenue is a signal, not a filter

The nominal target is roughly $20M-$500M revenue with a presumptive $15M floor, but judge organizational and economic COMPLEXITY, not a revenue number crossed. A newly formed company with a CFO managing hundreds of millions in capital commitments, financing, and infrastructure buildout can be a far stronger prospect than a simple $25M family-owned distributor CFO who merely cleared the revenue bar. For PE-context CFOs, management-company revenue is often meaningless — look at AUM, fund structures, LP reporting, portfolio companies, transaction volume, leverage, and governance complexity instead.

## Score using these seven dimensions, summing to 100

- **CFO Role Authenticity (0-20):** is this really a sitting CFO with meaningful authority, verified beyond their own self-report?
- **Company Scale & Complexity (0-20):** is the enterprise substantial enough to generate genuine CFO-level problems?
- **Strategic CFO Environment (0-15):** capital, M&A, growth, PE involvement, international operations, systems transformation, board exposure, financing — real strategic decision-making versus a narrow bookkeeping/controller function.
- **Peer Room Value (0-20):** career background, pedigree, credentials (CPA/CFA/etc) — what would the other CFOs in the room actually get from having this person there?
- **Development / Need Fit (0-15):** plausible benefit from peer challenge and perspective. Genuinely hard to assess from public sources alone — keep this conservative and say so rather than guessing confidently.
- **Geography / Practical Fit (0-5):** proximity to CFO Circle Los Angeles's target market and realistic ability to participate.
- **Cultural Evidence (0-5):** any public signal, positive or negative, about how they'd show up in a room with other CFOs.

## Hard stops override the score

A high point total does not save a prospect who is: fractional rather than a sitting CFO, actually a controller, primarily selling services (not running finance for one operating company), too junior, unable to realistically participate, or showing any signal likely to damage trust in the room. If a hard stop applies, the verdict is "Do Not Pursue — Hard Stop" regardless of the numeric score, and the writeup should say exactly which hard stop and why.

## What research cannot tell you

You cannot reliably assess from public sources whether someone has a big ego, actually listens, is intellectually curious, will expose a real problem, accepts challenge well, keeps confidences, or genuinely wants peer accountability. Say this plainly in "what remains unknown" — that judgment belongs to the fit call, not to this research.

## Score bands (drive the verdict label)

- 90-100: Priority Recruit — go get this person
- 80-89: Strong Prospect — qualify the remaining open questions
- 70-79: Investigate Further — interesting, but something material needs resolving
- 60-69: Do Not Pursue — usually not worth recruiting energy without a compelling exception
- Below 60: Wrong Target
- Any hard stop present: Do Not Pursue — Hard Stop (regardless of score)

## Confidence is separate from score

Score = how strong the prospect is, given what you found. Confidence = how sure you are the underlying facts are right. A high score with low confidence (e.g. 84/67) means "this looks strong, but important facts are still unverified — the fit call needs to close specific gaps," and you should say exactly which gaps.`

export async function POST(request, { params }) {
  const id = params?.id
  if (!id) return Response.json({ error: "id required" }, { status: 400 })

  const sb = serverClient()
  const { data: person } = await sb.from("people")
    .select("id, full_name, first_name, title, company, headline, location, linkedin_url, roles, connections_count, about, email, linkedin_connected")
    .eq("id", id).maybeSingle()
  if (!person) return Response.json({ error: "person not found" }, { status: 404 })

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) return Response.json({ error: "AI not configured" }, { status: 500 })

  // Full communications timeline — every logged email, LinkedIn message, and
  // note with this person, not just the last few. Dalen has flagged that
  // research done without reading this misses context a web search can't
  // find: a job change the person mentioned directly, a referral, a stated
  // objection, personal circumstances, etc. Fetched most-recent-first so a
  // hard character budget (in case someone has an unusually long history)
  // keeps the newest, most-relevant entries rather than the oldest, then
  // reversed back to chronological order for the prompt.
  const { data: commRowsDesc } = await sb.from("communications")
    .select("direction, channel, step_label, subject, body, occurred_at")
    .eq("person_id", id)
    .order("occurred_at", { ascending: false })

  let timelineCharBudget = 20000
  let timelineTruncated = false
  const timelineLinesDesc = []
  for (const c of (commRowsDesc || [])) {
    const when = c.occurred_at ? String(c.occurred_at).slice(0, 10) : "(no date)"
    const dir = c.direction === "OUT" || c.direction === "outbound" ? "Dalen →"
      : c.direction === "IN" || c.direction === "inbound" ? "← them"
      : c.direction === "INTERNAL" ? "note"
      : (c.direction || "")
    const chan = c.channel || ""
    const subj = c.subject ? " — " + c.subject : ""
    const body = (c.body || c.step_label || "").toString().trim()
    const line = `- ${when} [${chan}] ${dir}${subj}\n  ${body}`
    if (timelineCharBudget - line.length < 0) { timelineTruncated = true; break }
    timelineCharBudget -= line.length
    timelineLinesDesc.push(line)
  }
  const timelineText = timelineLinesDesc.length
    ? (timelineTruncated ? "[older entries omitted — timeline exceeded the context budget]\n\n" : "") + timelineLinesDesc.slice().reverse().join("\n\n")
    : "(no communications logged for this person)"

  // Website engagement — real tracked behavior on la-cfo.com, attributed to
  // this person via their personal tracking link. "view" alone is passive
  // (a page loaded); everything past that (engaged, registered, opened a
  // PDF, clicked a fit-call CTA, etc.) is a live signal of actual interest
  // that the research prompt below is told to weigh explicitly, separate
  // from anything self-reported on LinkedIn or said directly to Dalen.
  const EVENT_LABELS = {
    engaged: "spent real time reading",
    registration_submitted: "submitted the registration form",
    event_registered: "completed event registration",
    pdf_opened: "opened a PDF/brochure",
    assessment_clicked: "clicked into the self-assessment",
    download_business_case: "downloaded the business case",
    rsvp_top: "clicked the top RSVP button",
    rsvp_confirmed: "confirmed their RSVP",
    cta_fitchat: "clicked the \"book a fit call\" CTA",
    fit_call_clicked: "clicked to book a fit call",
  }
  const { data: pageEventsDesc } = await sb.from("page_events")
    .select("event, page, src, created_at")
    .eq("person_id", id)
    .eq("is_bot", false)
    .order("created_at", { ascending: false })
    .limit(200)

  let engagementText = "(no tracked website visits on record for this person)"
  if (pageEventsDesc && pageEventsDesc.length) {
    const total = pageEventsDesc.length
    const viewCount = pageEventsDesc.filter(function (r) { return r.event === "view" }).length
    const meaningful = pageEventsDesc.filter(function (r) { return r.event !== "view" }).slice().reverse()
    const distinctPages = Array.from(new Set(pageEventsDesc.map(function (r) { return r.page })))
    const firstSeen = String(pageEventsDesc[pageEventsDesc.length - 1].created_at).slice(0, 10)
    const lastSeen = String(pageEventsDesc[0].created_at).slice(0, 10)
    const summaryLine = `${total} tracked event(s) (${viewCount} page view(s)) across ${distinctPages.length} page(s) — first seen ${firstSeen}, most recent ${lastSeen}.`
    const meaningfulText = meaningful.length
      ? meaningful.map(function (r) {
          const label = EVENT_LABELS[r.event] || r.event
          return `- ${String(r.created_at).slice(0, 10)}: ${label} on "${r.page}" (via ${r.src || "direct/unknown"})`
        }).join("\n")
      : "No interaction beyond a bare page view logged — treat this as light/passive interest only, not active intent."
    engagementText = summaryLine + "\n\n" + meaningfulText
  }

  // Meeting recaps — normalized Granola (or any note-taker) post-meeting
  // content this person participated in, possibly shared with other people
  // on the same call. Distinct from the raw timeline above: these carry an
  // explicit engagement read, referrals, hard-stop flags, and commitments,
  // so surface them as their own section rather than folding into timelineText.
  const { data: recapLinks } = await sb.from("meeting_recap_participants")
    .select("meeting_recap_id")
    .eq("person_id", id)
  let meetingRecapsText = "(no meeting recaps on file for this person)"
  if (recapLinks && recapLinks.length) {
    const recapIds = recapLinks.map(function (l) { return l.meeting_recap_id })
    const { data: recapsDesc } = await sb.from("meeting_recaps")
      .select("occurred_at, meeting_type, summary, engagement_signal, referral_mentioned, referral_who, hard_stop, hard_stop_detail, fit_verdict, commitments")
      .in("id", recapIds)
      .order("occurred_at", { ascending: false })
      .limit(10)
    if (recapsDesc && recapsDesc.length) {
      meetingRecapsText = recapsDesc.map(function (r) {
        return [
          `- ${r.occurred_at || "(no date)"}${r.meeting_type ? " [" + r.meeting_type + "]" : ""}`,
          r.summary ? `  Summary: ${r.summary}` : null,
          r.engagement_signal ? `  Engagement: ${r.engagement_signal}` : null,
          r.referral_mentioned ? `  Referral mentioned: ${r.referral_who || "(unnamed)"}` : null,
          r.hard_stop ? `  HARD STOP FLAGGED: ${r.hard_stop_detail || "(no detail)"}` : null,
          r.fit_verdict ? `  Fit verdict from this call: ${r.fit_verdict}` : null,
          r.commitments ? `  Commitments: ${r.commitments}` : null,
        ].filter(Boolean).join("\n")
      }).join("\n\n")
    }
  }

  const knownFacts = `NAME: ${person.full_name || person.first_name || "Unknown"}
LAST-SYNCED TITLE (per Dalen's CRM — verify, do not assume current): ${person.title || "(unknown)"}
LAST-SYNCED COMPANY (per Dalen's CRM — verify, do not assume current): ${person.company || "(unknown)"}
LINKEDIN HEADLINE: ${person.headline || "(none)"}
LOCATION: ${person.location || "(unknown)"}
LINKEDIN URL: ${person.linkedin_url || "(none)"}
LINKEDIN CONNECTIONS: ${person.connections_count != null ? person.connections_count : "(unknown)"}
LINKEDIN ABOUT/SUMMARY: ${person.about || "(none)"}
CONNECTED TO DALEN ON LINKEDIN: ${person.linkedin_connected ? "yes" : "no"}`

  const prompt = `You are running the CFO Circle Prospect Research Protocol for Dalen Lawrence, Chapter Director of CFO Circle Los Angeles, on the prospect below. Full protocol follows, then the prospect's starting facts, then the exact output format required.

${PROTOCOL}

## Prospect — starting facts (last-synced CRM snapshot; step zero above applies)
${knownFacts}

## Prospect — communications timeline (Dalen's own emails, LinkedIn messages, and notes with this person, oldest first)

READ THIS BEFORE YOU START RESEARCHING. It often contains context web search cannot find and that should shape your research angle and conclusions — a job change or employer they've told Dalen about directly, a referral source, a stated objection or hesitation, a scheduling constraint, a personal circumstance, a prior fit-call outcome. Anything this person has told Dalen directly outranks a scraped web profile — if the timeline and a Tier 3 aggregator disagree, trust the timeline. If the timeline reveals something material (they've already said they're not interested, they've moved to a new company, there's already a hard-stop reason on record), lead with that rather than re-discovering it independently, and let it steer where you spend your searches.

${timelineText}

## Prospect — website engagement (la-cfo.com visitor tracking, real tracked behavior, not self-reported)

This is what this specific person has actually done on the CFO Circle website, tracked via their personal link. Treat it as a live signal of active interest, distinct from anything they've said or that a scraped profile shows — someone who registered, opened materials, or clicked to book a fit call is showing real, current intent even if their pipeline stage hasn't caught up to reflect it yet. Weave this in explicitly where it's relevant (the discovery, why they qualify, recommended recruiting approach) rather than treating it as a footnote. A bare "view" with nothing past it is weak/passive — don't oversell it into meaningful interest it isn't. If there's no tracked activity at all, say so plainly rather than assuming disinterest; most qualified prospects are still found off-platform first, so this is a supplementary signal, not a qualifying one on its own.

${engagementText}

## Prospect — meeting recaps (Granola/note-taker recaps of real conversations Dalen or a colleague had with this person, if any)

These are normalized summaries of actual meetings — fit calls, sponsor check-ins, board meetings, whatever's on record — not scraped web content. Trust them over an inferred read from LinkedIn. If a HARD STOP is flagged on any recap, that overrides everything else: lead with it and the verdict should reflect it.

${meetingRecapsText}

## Voice

Write like a sharp colleague giving Dalen a real opinion, not a compliance memo. Lead with your call, in first person, before the detail — "This one is worth pursuing because..." / "I'd pass on this one — here's why." Keep each dimension's rationale to one tight sentence in the scoring table; put the actual argument in the narrative prose above it, not spread across a wall of table cells. The single most valuable thing you can surface is whatever ISN'T obvious from a LinkedIn glance — lead the narrative with that discovery.

## Output format — write this as the LAST thing you produce, in two parts

PART 1 — the narrative, as PLAIN MARKDOWN TEXT (not inside JSON, not escaped). Structure it as:
- One-line recommendation + score + confidence, e.g. "**Priority Recruit — 96/100** · Research confidence: 93%"
- The discovery: the one or two things that aren't obvious from LinkedIn and that materially affect the qualification call
- Why they qualify (or don't)
- What they bring to the room
- What remains unknown (including the personality/fit signals only a conversation can resolve)
- Red flags, if any
- Questions to resolve on the fit call
- Recommended recruiting approach
- A compact dimension-by-dimension scoring table (one line of rationale each)
- Inline citation links to sources as you use them (markdown links, not bare URLs), and a numbered source list at the end

Getting this part complete and well-formatted matters more than anything else in your output — do not truncate or summarize it to save space.

PART 2 — immediately after the narrative, on its own, a fenced code block starting with \`\`\`json containing ONLY this metadata (do NOT repeat the narrative inside it):
{"verdict": "Priority Recruit | Strong Prospect | Investigate Further | Do Not Pursue | Do Not Pursue — Hard Stop | Wrong Target", "score": 88, "confidence": 94, "summary": "one or two plain sentences, the bottom-line takeaway including the key discovery", "dimensions": [{"name":"CFO Role Authenticity", "score":18, "max":20, "why":"..."}, {"name":"Company Scale & Complexity", "score":..., "max":20, "why":"..."}, {"name":"Strategic CFO Environment", "score":..., "max":15, "why":"..."}, {"name":"Peer Room Value", "score":..., "max":20, "why":"..."}, {"name":"Development / Need Fit", "score":..., "max":15, "why":"..."}, {"name":"Geography / Practical Fit", "score":..., "max":5, "why":"..."}, {"name":"Cultural Evidence", "score":..., "max":5, "why":"..."}]}

Do not write any text after the closing \`\`\` of that code block.`

  // 529 ("Overloaded") is Anthropic's own capacity signal, not a bug here —
  // it happens during high load across all of Anthropic's traffic and is
  // meant to be retried. A failed 529/500/503 attempt returns almost
  // immediately (it's rejected before any work starts), so a couple of
  // short-backoff retries costs very little against the 280s budget and
  // only the eventual successful attempt spends real research time.
  const RETRYABLE_STATUSES = [429, 500, 502, 503, 529]
  const MAX_ATTEMPTS = 3
  const anthropicBody = JSON.stringify({
    model: MODEL,
    // Narrative is plain prose, not JSON-escaped, so this budget
    // stretches further than the character count suggests — but a
    // well-researched writeup (search commentary + full narrative) is
    // still real content, so keep real headroom rather than risk a cutoff.
    max_tokens: 16000,
    messages: [{ role: "user", content: prompt }],
    tools: [{
      type: "web_search_20250305",
      name: "web_search",
      max_uses: 15,
      user_location: { type: "approximate", city: "Los Angeles", region: "California", country: "US" },
    }],
  })

  let aiRes
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      aiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": anthropicKey },
        body: anthropicBody,
      })
    } catch (e) {
      if (attempt === MAX_ATTEMPTS) return Response.json({ error: "AI request failed: " + (e.message || e) }, { status: 500 })
      await new Promise(function (r) { setTimeout(r, attempt * 2000) })
      continue
    }
    if (aiRes.ok) break
    if (!RETRYABLE_STATUSES.includes(aiRes.status) || attempt === MAX_ATTEMPTS) {
      const t = await aiRes.text().catch(() => "")
      const overloaded = aiRes.status === 529
      return Response.json({
        error: overloaded ? "Anthropic is overloaded right now (529) — this isn't a bug, it's capacity on their end. Try again in a minute." : "AI error " + aiRes.status,
        detail: t.slice(0, 500),
      }, { status: 502 })
    }
    await new Promise(function (r) { setTimeout(r, attempt * 2000) })
  }
  const data = await aiRes.json()

  if (data.stop_reason === "pause_turn") {
    return Response.json({ error: "Research ran long and paused mid-turn — this needs a continuation call that isn't wired up yet. Try again, or ask Claude to add pause_turn continuation support." }, { status: 502 })
  }

  // Concatenate every text block (Claude narrates between/around searches;
  // the narrative + trailing json fence are typically the last block, but
  // joining everything is robust either way).
  const textBlocks = (data.content || []).filter(function (b) { return b.type === "text" }).map(function (b) { return b.text })
  const raw = textBlocks.join("\n\n")

  const searchesUsed = (data.usage && data.usage.server_tool_use && data.usage.server_tool_use.web_search_requests) || 0
  const { narrative, meta } = splitNarrativeAndMeta(raw)

  // If it got cut off mid-metadata-block, the narrative prose before it is
  // usually still intact and worth keeping — save that, not raw JSON soup.
  if (data.stop_reason === "max_tokens" && !meta) {
    const { data: inserted, error: insErr } = await insertRawNote(sb, id, "dalen (deep research)", narrative || raw, "Response was cut off before finishing (hit the token ceiling after " + searchesUsed + " searches)", null)
    if (insErr) return Response.json({ error: "Research cut off, and saving it also failed: " + insErr.message }, { status: 500 })
    return Response.json({ note: inserted, parse_failed: true, parse_failed_reason: "cut off before finishing" })
  }

  if (!meta || !narrative) {
    const { data: inserted, error: insErr } = await insertRawNote(sb, id, "dalen (deep research)", narrative || raw, "Could not parse the research output into the standard format (used " + searchesUsed + " searches)", null)
    if (insErr) return Response.json({ error: "Could not parse research output, and saving it also failed: " + insErr.message }, { status: 500 })
    return Response.json({ note: inserted, parse_failed: true, parse_failed_reason: "could not parse" })
  }

  const { data: inserted, error: insErr } = await insertParsedNote(sb, id, "dalen (deep research)", meta, narrative, null)
  if (insErr) return Response.json({ error: insErr.message }, { status: 500 })

  return Response.json({ note: inserted, searches_used: searchesUsed })
}
