import { matchPerson } from "@/lib/provisorsIngest"

// Shared ProVisors roster INTAKE core — the single source of truth for turning a
// roster PDF (base64) into a PENDING review batch. Used by:
//   • POST /api/provisors/parse        (manual upload)
//   • GET  /api/provisors/poll-email   (hourly Outlook cron)
// It extracts attendees via Claude, runs read-only dedupe annotation, and stages
// a pending batch. It NEVER mutates people — that happens only on approve.
// Dedupe-on-intake: if sourceMessageId already produced a batch, it no-ops so the
// same email can be polled repeatedly without ever double-staging.

const MODEL = process.env.PROVISOR_PARSER_MODEL || "claude-sonnet-4-6"

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

// Returns one of:
//   { duplicate:true, batch_id, status }                         (already staged)
//   { batch_id, meetingGroup, meetingDate, summary }             (newly staged)
// Throws on hard failures (missing key, bad model output, insert error).
export async function parseAndStageRoster(sb, { pdf_base64, filename = null, source = "email", sourceMessageId = null } = {}) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error("ANTHROPIC_API_KEY not configured")
  if (!pdf_base64) throw new Error("pdf_base64 required")

  // Intake dedupe — never stage the same source email twice.
  if (sourceMessageId) {
    const { data: dup } = await sb.from("provisor_import_batches")
      .select("id, status").contains("payload", { sourceMessageId }).limit(1)
    if (dup && dup.length) return { duplicate: true, batch_id: dup[0].id, status: dup[0].status }
  }

  // 1) Extract structured records via Claude
  const aResp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf_base64 } },
          { type: "text", text: PROMPT },
        ],
      }],
    }),
  })
  const aData = await aResp.json()
  if (!aResp.ok) throw new Error("anthropic error: " + JSON.stringify(aData).slice(0, 500))
  const text = (aData.content || []).filter(b => b.type === "text").map(b => b.text).join("\n")
  const clean = text.replace(/```json/g, "").replace(/```/g, "").trim()
  let parsed
  try { parsed = JSON.parse(clean) } catch (e) { throw new Error("could not parse model output as JSON: " + text.slice(0, 300)) }

  const meetingGroup = parsed.meetingGroup || null
  const meetingDate = (parsed.meetingDate && /^\d{4}-\d{2}-\d{2}$/.test(parsed.meetingDate)) ? parsed.meetingDate : null
  const people = Array.isArray(parsed.people) ? parsed.people : []

  // 2) Dedupe analysis — annotate each person new/existing (read-only)
  let nNew = 0, nExisting = 0
  for (const p of people) {
    const m = await matchPerson(sb, { full_name: p.full_name, email: p.email, company: p.company, linkedin_url: p.linkedin_url })
    if (m) { p._match = { id: m.id, name: m.full_name, company: m.company }; p._status = "existing"; nExisting++ }
    else { p._status = "new"; nNew++ }
  }
  const summary = { total: people.length, new: nNew, existing: nExisting }

  // 3) Stage a pending batch for review
  const payload = { meetingGroup, meetingDate, people }
  if (sourceMessageId) payload.sourceMessageId = sourceMessageId
  const { data: batch, error } = await sb.from("provisor_import_batches").insert({
    source, meeting_group: meetingGroup, filename, status: "pending", payload, summary,
  }).select("id").single()
  if (error || !batch) throw new Error("could not stage batch: " + (error && error.message))

  return { batch_id: batch.id, meetingGroup, meetingDate, summary }
}
