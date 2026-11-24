// Read-only view of every LinkedIn message PeerChair has captured, from BOTH places it lives:
//   1. communications        — channel linkedin/inmail (LinkedHelper webhook, manual logs, audits)
//   2. conversation_messages — the older thread sync (via conversations.person_id)
// Rows are normalized to one shape and the same message seen in both tables is merged
// (same person + direction + text within 5 minutes), so counts are not inflated.

const PAGE = 1000
const DUP_WINDOW_MS = 5 * 60 * 1000
const LINKEDIN_CHANNELS = ["linkedin", "LinkedIn", "inmail", "InMail"]

async function fetchAll(buildQuery) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return rows
}

function normBody(b) {
  return String(b || "").toLowerCase().replace(/\s+/g, " ").trim()
}

function normDirection(d) {
  const v = String(d || "").toLowerCase()
  if (v === "in" || v === "inbound") return "in"
  if (v === "out" || v === "outbound") return "out"
  return v || "other"
}

// Returns { messages, unattached } — messages sorted oldest -> newest, all with a person_id.
export async function loadLinkedInMessages(sb, opts) {
  const personId = opts && opts.personId

  const comms = await fetchAll(function () {
    let q = sb.from("communications")
      .select("id, person_id, occurred_at, created_at, channel, direction, step_label, subject, body, source, logged_by, sequence_key, send_status")
      .in("channel", LINKEDIN_CHANNELS)
      .order("id")
    if (personId) q = q.eq("person_id", personId)
    return q
  })

  const convs = await fetchAll(function () {
    let q = sb.from("conversations").select("id, person_id, conversation_id, folder").order("id")
    if (personId) q = q.eq("person_id", personId)
    return q
  })
  const convById = {}
  convs.forEach(function (c) { convById[c.id] = c })

  let threadMsgs = []
  if (convs.length > 0) {
    threadMsgs = await fetchAll(function () {
      let q = sb.from("conversation_messages")
        .select("id, conversation_id, message_id, direction, body, sent_at, created_at, channel, sequence_key, sender_name")
        .order("id")
      if (personId) q = q.in("conversation_id", convs.map(function (c) { return c.id }))
      return q
    })
  }

  let unattached = 0
  const out = []

  comms.forEach(function (r) {
    if (!r.person_id) { unattached++; return }
    out.push({
      key: "c:" + r.id,
      person_id: r.person_id,
      at: r.occurred_at || r.created_at,
      direction: normDirection(r.direction),
      body: r.body || "",
      subject: r.subject || null,
      sources: [r.source || "unknown"],
      tables: ["communications"],
      channel: String(r.channel || "").toLowerCase(),
      step_label: r.step_label || null,
      sequence_key: r.sequence_key || null,
      send_status: r.send_status || null,
      logged_by: r.logged_by || null,
      sender_name: null,
    })
  })

  const threadRows = []
  threadMsgs.forEach(function (m) {
    const conv = convById[m.conversation_id]
    if (!conv || !conv.person_id) { unattached++; return }
    threadRows.push({
      key: "m:" + m.id,
      person_id: conv.person_id,
      at: m.sent_at || m.created_at,
      direction: normDirection(m.direction),
      body: m.body || "",
      subject: null,
      sources: ["thread sync"],
      tables: ["conversation_messages"],
      channel: String(m.channel || "").toLowerCase(),
      step_label: null,
      sequence_key: m.sequence_key || null,
      send_status: null,
      logged_by: null,
      sender_name: m.sender_name || null,
    })
  })

  // Merge a thread-sync row into a communications row when it is the same message.
  const commsIndex = {}
  out.forEach(function (m) {
    const k = m.person_id + "|" + m.direction + "|" + normBody(m.body)
    ;(commsIndex[k] = commsIndex[k] || []).push(m)
  })
  threadRows.forEach(function (t) {
    const k = t.person_id + "|" + t.direction + "|" + normBody(t.body)
    const t0 = new Date(t.at).getTime()
    const hit = (commsIndex[k] || []).find(function (c) {
      return !c.merged && Math.abs(new Date(c.at).getTime() - t0) <= DUP_WINDOW_MS
    })
    if (hit) {
      hit.merged = true
      hit.tables.push("conversation_messages")
      hit.sources.push("thread sync")
      hit.sender_name = hit.sender_name || t.sender_name
    } else {
      out.push(t)
    }
  })

  out.forEach(function (m) { delete m.merged })
  out.sort(function (a, b) { return new Date(a.at) - new Date(b.at) })
  return { messages: out, unattached }
}
