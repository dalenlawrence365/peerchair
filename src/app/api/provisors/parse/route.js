export const dynamic = "force-dynamic"
export const maxDuration = 120
import { serverClient } from "@/lib/supabaseServer"
import { matchPerson } from "@/lib/provisorsIngest"

// POST /api/provisors/parse — INTAKE step. A ProVisors roster PDF comes in (base64);
// Claude extracts structured attendee records; we run the dedupe analysis and drop a
// PENDING batch into provisor_import_batches for one-click review/approve. Called by the
// email cron and by manual upload. Does NOT mutate people — that happens on approve.
// Body: { pdf_base64, filename?, source? }
// Returns: { batch_id, meetingGroup, summary:{total,new,existing} }

const MODEL = process.env.PROVISOR_PARSER_MODEL || "claude-sonnet-4-6"

// The 5 groups PeerChair tracks. Output names MUST match these exactly so the ingest
// step's group lookup hits (note the intentional "$" typos baked into two of them).
const TRACKED_GROUPS = [
  "Middle Market Affinity Group",
  "Transactions & Transitions",
  "Valley Distributors & Manufacturers",
  "M$A/Capital Formation Group",
  "Mergers & Acquisitions 2",
]

const PROMPT = `You are extracting attendee records from a ProVisors meeting roster ("photo list") PDF.

Return ONLY valid JSON (no prose, no markdown fences) of the shape:
{
  "meetingGroup": "<the meeting's group, from the roster header/title>",
  "meetingDate": "<the meeting date as YYYY-MM-DD if the roster states a specific date, else empty>",
  "people": [
    {
      "full_name": "First Last",
      "title": "job title",
      "company": "company name",
      "email": "lowercased email or empty",
      "phone": "phone or empty",
      "location": "City, State or empty",
      "headline": "a short 3-6 word descriptor of what they do, or empty",
      "industry": "the ProVisors profession/category line if present, else empty",
      "address": "street address if present, else empty",
      "zip": "zip if present, else empty",
      "groups": ["<zero or more of the tracked groups this person belongs to>"]
    }
  ]
}

Rules:
- One object per attendee on the roster.
- "groups" and "meetingGroup": use ONLY these exact canonical names when they apply, mapping any roster spelling/spacing variants (including "$" used for "&", and dropping/adding "Affinity"/"Group" suffix words) to the closest match. Output the canonical string verbatim:
${TRACKED_GROUPS.map(g => "  • " + g).join("\n")}
- If a person's card lists a group that is NOT one of the five above, omit it.
- "meetingGroup" is the single group whose roster this is (the header). If it matches one of the five, use the canonical form; otherwise use the header text as-is.
- Never invent emails or data. Leave fields empty ("") when not present.
- "location" = "City, State"; put any street address in "address" and zip in "zip".`

export async function POST(request) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 })
  let body
  try { body = await request.json() } catch (e) { return Response.json({ error: "invalid JSON" }, { status: 400 }) }
  const pdf = body.pdf_base64
  if (!pdf) return Response.json({ error: "pdf_base64 required" }, { status: 400 })

  // 1) Extract structured records via Claude
  let aResp
  try {
    aResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        messages: [{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf } },
            { type: "text", text: PROMPT },
          ],
        }],
      }),
    })
  } catch (e) {
    return Response.json({ error: "anthropic request failed", detail: String(e) }, { status: 502 })
  }
  const aData = await aResp.json()
  if (!aResp.ok) return Response.json({ error: "anthropic error", detail: aData }, { status: 502 })
  const text = (aData.content || []).filter(b => b.type === "text").map(b => b.text).join("\n")
  const clean = text.replace(/```json/g, "").replace(/```/g, "").trim()
  let parsed
  try { parsed = JSON.parse(clean) } catch (e) {
    return Response.json({ error: "could not parse model output as JSON", raw: text.slice(0, 2000) }, { status: 502 })
  }
  const meetingGroup = parsed.meetingGroup || null
  const meetingDate = (parsed.meetingDate && /^\d{4}-\d{2}-\d{2}$/.test(parsed.meetingDate)) ? parsed.meetingDate : null
  const people = Array.isArray(parsed.people) ? parsed.people : []

  // 2) Dedupe analysis — annotate each person new/existing (read-only; no writes to people)
  const sb = serverClient()
  let nNew = 0, nExisting = 0
  for (const p of people) {
    const m = await matchPerson(sb, { full_name: p.full_name, email: p.email, company: p.company })
    if (m) { p._match = { id: m.id, name: m.full_name, company: m.company }; p._status = "existing"; nExisting++ }
    else { p._status = "new"; nNew++ }
  }
  const summary = { total: people.length, new: nNew, existing: nExisting }

  // 3) Stage a pending batch for review
  const { data: batch, error } = await sb.from("provisor_import_batches").insert({
    source: body.source || "email",
    meeting_group: meetingGroup,
    filename: body.filename || null,
    status: "pending",
    payload: { meetingGroup, meetingDate, people },
    summary,
  }).select("id").single()
  if (error || !batch) return Response.json({ error: "could not stage batch", detail: error && error.message }, { status: 500 })

  return Response.json({ ok: true, batch_id: batch.id, meetingGroup, summary })
}
