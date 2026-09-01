export const dynamic = "force-dynamic"
// Fluid compute grants 300s by default even on Hobby; stay under that with
// margin. Real multi-search research runs 30s-3min in practice, but a slow
// run (many searches, a stubborn source) needs the room.
export const maxDuration = 280

import { serverClient } from "@/lib/supabaseServer"
import { splitNarrativeAndMeta, insertParsedNote, insertRawNote } from "@/lib/researchNoteStore"

// POST /api/people/[id]/deep-research  -> { note }
//
// The in-app version of the deep-research pass Dalen has been running by
// hand: screenshot a LinkedIn Sales Navigator profile, paste it into an AI
// research tool, let it browse IRS filings / SEC filings / company
// registries / news / org charts to independently verify the person's CFO
// status and assess the company, and produce a scored writeup. This does
// the same thing using Claude's web_search tool instead of a human copy-
// pasting a screenshot — starting from the profile facts already on file
// (name, title, company, location, LinkedIn URL, connections) rather than
// re-deriving them, then researching everything a screenshot can't tell you.
//
// Uses the exact same standardized shape (verdict/score/confidence/
// dimensions/summary/narrative) as the paste-and-normalize endpoint
// (research-note/route.js) and the same never-lose-the-output fallback —
// research that produces something but fails to parse into JSON is still
// saved as an unscored raw note rather than discarded.

const MODEL = process.env.DEEP_RESEARCH_MODEL || "claude-opus-5"

const RUBRIC = `Score using these seven dimensions, summing to 100 (this is the standing CFO Circle rubric — reuse it as-is unless the research genuinely doesn't fit one of these axes):
- CFO authenticity (0-20): is this person REALLY the CFO, verified via a source independent of their own LinkedIn self-report? SEC filings, IRS Form 990 (via ProPublica's Nonprofit Explorer or the organization's own site), state business registries, company "About/Leadership" pages, press releases, or reputable news are all independent verification. A LinkedIn title alone, with nothing corroborating it, caps this dimension low.
- Company scale/complexity (0-20): revenue, assets, employee count, growth trajectory, regulatory/audit complexity (public company, PE-backed, nonprofit subject to single-audit, etc).
- Strategic CFO environment (0-15): does the role look like real strategic decision-making (capital, growth, board exposure) versus a narrow bookkeeping/controller function dressed up with a CFO title.
- Peer-room contribution (0-20): career background, pedigree (firms, credentials like CPA/CFA), what a room of other CFOs would get from having this person in it.
- Development/need fit (0-15): plausible interest in or need for a confidential peer group — genuinely hard to assess from public sources alone, so keep this conservative and say so rather than guessing confidently.
- Geography (0-5): proximity to CFO Circle Los Angeles's target market (LA / Southern California).
- Cultural evidence (0-5): any public red or green flags relevant to how they'd show up in a room with other CFOs.`

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

  const knownFacts = `NAME: ${person.full_name || person.first_name || "Unknown"}
LINKEDIN-STATED TITLE: ${person.title || "(unknown)"}
COMPANY: ${person.company || "(unknown)"}
LINKEDIN HEADLINE: ${person.headline || "(none)"}
LOCATION: ${person.location || "(unknown)"}
LINKEDIN URL: ${person.linkedin_url || "(none)"}
LINKEDIN CONNECTIONS: ${person.connections_count != null ? person.connections_count : "(unknown)"}
LINKEDIN ABOUT/SUMMARY: ${person.about || "(none)"}
CONNECTED TO DALEN ON LINKEDIN: ${person.linkedin_connected ? "yes" : "no"}`

  const prompt = `You are doing deep-research due diligence on a CFO prospect for Dalen Lawrence, Chapter Director of CFO Circle Los Angeles (a confidential peer advisory group for CFOs only). This is the exact same research process Dalen normally runs by hand — screenshot a LinkedIn Sales Navigator profile into an AI research tool and have it independently verify the person's CFO status and assess their company using web search across multiple sources (SEC EDGAR, IRS Form 990 via ProPublica Nonprofit Explorer, state business registries, company websites, org-chart sites like TheOrg, news coverage). You are that process now, with web search available.

STARTING FACTS (already known from LinkedIn — do not waste searches re-deriving these, but DO verify the CFO title independently rather than taking it at face value):
${knownFacts}

Research this person and their company. At minimum, try to:
1. Independently verify their CFO status/tenure through a source other than LinkedIn itself (SEC filing, IRS 990, company site, news, state registry).
2. Assess the company's real scale: revenue, assets, employee count if findable, and growth trend over recent years.
3. Understand the company type (public, private, PE-backed, nonprofit, family-owned) and what that implies about regulatory/audit complexity.
4. Look into the person's career background — prior firms, credentials (CPA/CFA/etc), trajectory.
5. Note anything that would help Dalen on a fit call, and anything genuinely uncertain that only a conversation could resolve.

${RUBRIC}

Once your research is complete, write up your findings as the LAST thing you output, in two parts:

PART 1 — the narrative, as PLAIN MARKDOWN TEXT (not inside JSON, not escaped): clear markdown with headers and bold for key findings, a table for financials if you find real figures, a table for the dimension scoring breakdown, inline citation links to sources as you use them (markdown links, not bare URLs), and a numbered source list at the end. Open with a one-line verdict ("This one is worth pursuing" / "This one is a pass" / etc) before the detail. End with Dalen's actual open question for the fit call, if there is one. Getting this part complete and well-formatted matters more than anything else in your output — do not truncate or summarize it to save space.

PART 2 — immediately after the narrative, on its own, a fenced code block starting with \`\`\`json containing ONLY this metadata (do NOT repeat the narrative inside it):
{"verdict": "Strong Invite | Invite | Maybe | Pass", "score": 88, "confidence": 94, "summary": "one or two plain sentences, the bottom-line takeaway", "dimensions": [{"name":"CFO authenticity", "score":20, "max":20, "why":"..."}, ...all seven...]}

Do not write any text after the closing \`\`\` of that code block.`

  let aiRes
  try {
    aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": anthropicKey },
      body: JSON.stringify({
        model: MODEL,
        // Narrative is plain prose now, not JSON-escaped, so this budget
        // stretches further than it did before — but a well-researched
        // writeup (search commentary + a long narrative) is still real
        // content, so keep real headroom rather than risk another cutoff.
        max_tokens: 16000,
        messages: [{ role: "user", content: prompt }],
        tools: [{
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 15,
          user_location: { type: "approximate", city: "Los Angeles", region: "California", country: "US" },
        }],
      }),
    })
  } catch (e) {
    return Response.json({ error: "AI request failed: " + (e.message || e) }, { status: 500 })
  }
  if (!aiRes.ok) {
    const t = await aiRes.text().catch(() => "")
    return Response.json({ error: "AI error " + aiRes.status, detail: t.slice(0, 500) }, { status: 502 })
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
