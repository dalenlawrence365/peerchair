// Warmth Index — how engaged THIS person is with Dalen right now, as
// distinct from the CFO qualification score (cfoScores.js). Qualification
// asks "should they be in the room"; warmth asks "how live is this
// relationship" — a great-fit CFO can be ice cold on outreach, and a
// mediocre-fit CFO can reply to everything. Keep the two separate.
//
// The core idea: reciprocity beats volume. Dalen sending five emails that
// go unanswered isn't warmth, it's just his own effort — so almost every
// weight below is tied to something THEY did (replied, showed up, clicked,
// registered, engaged on a real call), not something Dalen did to them (an
// outbound tag doesn't score). Every signal decays with age (half-life
// below) so a reply from last week outweighs one from last year, and a
// handful of hard-negative status tags floor the score to Cold regardless
// of history.
//
// Every signal that contributes carries a human-readable label + category
// so computeWarmth can return an itemized breakdown, not just a number —
// the profile page's warmth pill is clickable specifically so Dalen can see
// exactly what's driving a score and judge the accuracy for himself, rather
// than trusting a black box.
//
// This is a first pass, built to be tuned — same spirit as the CFO research
// rubric: ship a reasonable weighting now, adjust the numbers later once
// Dalen has a feel for whether the tiers match reality.

import { WARMTH_FLOOR_TAGS } from "@/lib/warningTags"

const HALF_LIFE_DAYS = 75

function decay(occurredAt, now) {
  if (!occurredAt) return 0
  const ageDays = (now - new Date(occurredAt).getTime()) / 86400000
  if (!isFinite(ageDays) || ageDays < 0) return 1
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS)
}

// Inbound communications (their replies / messages to Dalen) — the DB
// normalizes direction to lowercase inbound/outbound/internal on write, so
// filtering on 'inbound' already excludes Dalen's own outbound sends and
// internal notes/invitation-log entries.
const INBOUND_COMM_WEIGHT = 18

// Action tags that reflect something THE PERSON did, not Dalen's outbound
// effort (connection_sent, brochure_sent, assessment_sent, event_invite_sent,
// and the ws_invite_*/social_invite_* family are deliberately excluded —
// those are Dalen's actions, not signals about them).
const ACTION_TAG_WEIGHTS = {
  reply_received: 20,
  connection_accepted: 8,
  fit_call_completed: 35,
  fit_call_scheduled: 15,
  event_rsvp_confirmed: 12,
}

// Event RSVP/attendance outcome. A no-show after registering is the one
// mild negative signal here — everything else that reflects a real response
// (even a decline) scores at least a little positive, because responding is
// still reciprocity.
const EVENT_STATUS_WEIGHTS = {
  Attended: 30,
  Confirmed: 14,
  Registered: 8,
  Requested: 6,
  Declined: 4,
  Unavailable: 4,
  "No-show": -8,
}

// Website engagement past a bare page view (see the deep-research prompt's
// identical event vocabulary). Counted once per distinct event type per
// person at its most recent occurrence, not summed across every firing —
// otherwise a single session where the "engaged" beacon fires five times
// would inflate the score far past what it should. "view" and
// registration_submitted/event_registered are excluded: view is passive
// noise, and registration is already captured via event_attendees above.
const PAGE_EVENT_WEIGHTS = {
  engaged: 3,
  pdf_opened: 6,
  assessment_clicked: 8,
  download_business_case: 8,
  cta_fitchat: 10,
  fit_call_clicked: 10,
  rsvp_top: 5,
  rsvp_confirmed: 8,
}
const PAGE_EVENT_LABELS = {
  engaged: "spent real time reading the site",
  pdf_opened: "opened a PDF/brochure",
  assessment_clicked: "clicked into the self-assessment",
  download_business_case: "downloaded the business case",
  cta_fitchat: "clicked the \"book a fit call\" CTA",
  fit_call_clicked: "clicked to book a fit call",
  rsvp_top: "clicked the top RSVP button",
  rsvp_confirmed: "confirmed their RSVP",
}

// Meeting recap engagement read (see the Meetings tab / MeetingsCard) — a
// real qualitative signal from an actual conversation, not inferred. This is
// deliberately SEPARATE from the recap's fit_verdict (CFO Circle
// invite-worthiness lives in cfoScores.js territory) — warmth only cares
// about relationship temperature. "Passive" contributes nothing (attending
// a meeting at all is already credited via the inbound-communication weight
// below); "Guarded" is a mild negative, same spirit as a No-show.
const ENGAGEMENT_SIGNAL_WEIGHTS = {
  Reciprocal: 15,
  Engaged: 8,
  Passive: 0,
  Guarded: -6,
}

// A referral offer is arguably the single strongest reciprocity signal that
// exists — someone willing to put their own name behind an introduction —
// so it's weighted above every other single signal in this file.
const REFERRAL_MENTIONED_WEIGHT = 20

const RELEVANT_ACTION_TYPES = Object.keys(ACTION_TAG_WEIGHTS)
const RELEVANT_PAGE_EVENTS = Object.keys(PAGE_EVENT_WEIGHTS)

// Tiers — mirrors the CFO score pill's red/yellow/green pattern but with
// four buckets since "warm" genuinely needs a middle ground that isn't
// "about to close" or "ice cold."
const TIERS = [
  { key: "hot",  label: "Hot",  min: 65, bg: "#fee2e2", fg: "#b91c1c", border: "#fca5a5" },
  { key: "warm", label: "Warm", min: 35, bg: "#fef3c7", fg: "#92400e", border: "#fde68a" },
  { key: "cool", label: "Cool", min: 12, bg: "#dbeafe", fg: "#1d4ed8", border: "#93c5fd" },
  { key: "cold", label: "Cold", min: 0,  bg: "#f1f5f9", fg: "#64748b", border: "#e2e8f0" },
]

export function tierFor(score) {
  for (const t of TIERS) if (score >= t.min) return t
  return TIERS[TIERS.length - 1]
}

// Keyed lookup for UI code that already has a tier key (e.g. from a stored
// warmth object) and just needs its pill colors without re-deriving them.
export const TIER_COLORS = TIERS.reduce(function (m, t) {
  m[t.key] = { bg: t.bg, fg: t.fg, border: t.border }
  return m
}, {})

// Core scorer — takes already-fetched signal rows for ONE person (each
// carrying weight/occurred_at/label/category) and a set of their current
// (non-removed) status tags. Returns score/tier plus an itemized, sorted
// breakdown so the caller can show exactly how the number was built.
export function computeWarmth(signals, statusTags, now) {
  now = now || Date.now()
  const flaggedTags = (statusTags || []).filter(function (t) { return WARMTH_FLOOR_TAGS.indexOf(t) >= 0 })
  if (flaggedTags.length) {
    const t = tierFor(0)
    return {
      score: 0, tier: t.key, tierLabel: t.label, flagged: true, flaggedTags: flaggedTags,
      breakdown: [{
        label: "Floored to 0 — flagged " + flaggedTags.join(", "),
        category: "flag", weight: 0, decay: 1, contribution: 0, occurred_at: null,
      }],
    }
  }

  let total = 0
  const breakdown = []
  for (const s of signals) {
    const d = decay(s.occurred_at, now)
    const contribution = s.weight * d
    total += contribution
    breakdown.push({
      label: s.label || "Signal", category: s.category || "other",
      weight: s.weight, decay: d, contribution: contribution, occurred_at: s.occurred_at || null,
    })
  }
  breakdown.sort(function (a, b) { return b.contribution - a.contribution })

  const score = Math.max(0, Math.min(100, Math.round(total)))
  const t = tierFor(score)
  return { score, tier: t.key, tierLabel: t.label, flagged: false, breakdown: breakdown, rawTotal: total }
}

function fmtDate(iso) {
  if (!iso) return ""
  return String(iso).slice(0, 10)
}

// Build the flat, labeled signal list for one person from raw rows already
// filtered to that person_id (used by both the single-person and bulk
// fetchers below so the weighting logic only lives in one place).
function buildSignals(inboundComms, actionTags, attendeeRows, pageEventsByType, meetingRecapRows) {
  const signals = []
  for (const c of inboundComms) {
    signals.push({
      weight: INBOUND_COMM_WEIGHT, occurred_at: c.occurred_at, category: "communication",
      label: "Inbound " + (c.channel || "message") + (c.step_label ? " — " + c.step_label : "") + " (" + fmtDate(c.occurred_at) + ")",
    })
  }
  for (const a of actionTags) {
    const w = ACTION_TAG_WEIGHTS[a.action_type]
    if (w == null) continue
    const when = a.as_of_date || a.set_at
    signals.push({ weight: w, occurred_at: when, category: "action_tag", label: "Action tag: " + a.action_type + " (" + fmtDate(when) + ")" })
  }
  for (const ea of attendeeRows) {
    const w = EVENT_STATUS_WEIGHTS[ea.status]
    if (w == null) continue
    const when = ea.responded_at || ea.registered_at || ea.invited_at
    signals.push({ weight: w, occurred_at: when, category: "event", label: "Event RSVP: " + ea.status + " (" + fmtDate(when) + ")" })
  }
  for (const eventType in pageEventsByType) {
    const w = PAGE_EVENT_WEIGHTS[eventType]
    if (w == null) continue
    const when = pageEventsByType[eventType]
    signals.push({ weight: w, occurred_at: when, category: "website", label: "Website: " + (PAGE_EVENT_LABELS[eventType] || eventType) + " (" + fmtDate(when) + ")" })
  }
  for (const r of (meetingRecapRows || [])) {
    const mt = r.meeting_type ? " (" + r.meeting_type + ")" : ""
    const engW = ENGAGEMENT_SIGNAL_WEIGHTS[r.engagement_signal]
    if (engW != null && engW !== 0) {
      signals.push({ weight: engW, occurred_at: r.occurred_at, category: "meeting_engagement", label: "Meeting engagement: " + r.engagement_signal + mt + " (" + fmtDate(r.occurred_at) + ")" })
    }
    if (r.referral_mentioned) {
      signals.push({ weight: REFERRAL_MENTIONED_WEIGHT, occurred_at: r.occurred_at, category: "referral", label: "Referral mentioned in meeting" + mt + " (" + fmtDate(r.occurred_at) + ")" })
    }
  }
  return signals
}

export async function getWarmthForPerson(sb, personId) {
  const [{ data: comms }, { data: actionTags }, { data: attendee }, { data: pageEvents }, { data: statusRows }, { data: recapLinks }] = await Promise.all([
    sb.from("communications").select("occurred_at, channel, step_label").eq("person_id", personId).eq("direction", "inbound"),
    sb.from("person_action_tags").select("action_type, as_of_date, set_at").eq("person_id", personId).in("action_type", RELEVANT_ACTION_TYPES),
    sb.from("event_attendees").select("status, responded_at, registered_at, invited_at").eq("person_id", personId),
    sb.from("page_events").select("event, created_at").eq("person_id", personId).eq("is_bot", false).in("event", RELEVANT_PAGE_EVENTS),
    sb.from("person_status_tags").select("tag").eq("person_id", personId).is("removed_at", null),
    sb.from("meeting_recap_participants").select("meeting_recap_id").eq("person_id", personId),
  ])

  const pageEventsByType = {}
  for (const pe of (pageEvents || [])) {
    if (!pageEventsByType[pe.event] || new Date(pe.created_at) > new Date(pageEventsByType[pe.event])) {
      pageEventsByType[pe.event] = pe.created_at
    }
  }

  let meetingRecapRows = []
  const recapIds = (recapLinks || []).map(function (l) { return l.meeting_recap_id })
  if (recapIds.length) {
    const { data: recaps } = await sb.from("meeting_recaps")
      .select("occurred_at, meeting_type, engagement_signal, referral_mentioned")
      .in("id", recapIds)
    meetingRecapRows = recaps || []
  }

  const signals = buildSignals(comms || [], actionTags || [], attendee || [], pageEventsByType, meetingRecapRows)
  return computeWarmth(signals, (statusRows || []).map(function (r) { return r.tag }))
}

// Bulk version for the report page + dashboard tile — fetches each signal
// table ONCE across everyone (small tables, a few thousand rows total) and
// groups in JS, rather than N+1 querying per person. Does NOT surface the
// itemized breakdown (only the single-person path needs that, for the
// profile page's warmth-pill popup) — keeps the bulk payload lean.
export async function getAllWarmthRows(sb) {
  const [{ data: people }, { data: comms }, { data: actionTags }, { data: attendee }, { data: pageEvents }, { data: statusRows }, { data: recapParticipants }] = await Promise.all([
    sb.from("people").select("id, full_name, company, roles"),
    sb.from("communications").select("person_id, occurred_at, channel, step_label").eq("direction", "inbound").not("person_id", "is", null),
    sb.from("person_action_tags").select("person_id, action_type, as_of_date, set_at").in("action_type", RELEVANT_ACTION_TYPES),
    sb.from("event_attendees").select("person_id, status, responded_at, registered_at, invited_at"),
    sb.from("page_events").select("person_id, event, created_at").eq("is_bot", false).in("event", RELEVANT_PAGE_EVENTS).not("person_id", "is", null),
    sb.from("person_status_tags").select("person_id, tag").is("removed_at", null).in("tag", WARMTH_FLOOR_TAGS),
    sb.from("meeting_recap_participants").select("person_id, meeting_recap_id"),
  ])

  const relevantRoles = ["cfo", "sponsor_contact", "referral_partner"]
  const people_ = (people || []).filter(function (p) { return (p.roles || []).some(function (r) { return relevantRoles.indexOf(r) >= 0 }) })

  const commsBy = {}
  for (const c of (comms || [])) (commsBy[c.person_id] = commsBy[c.person_id] || []).push(c)
  const tagsBy = {}
  for (const a of (actionTags || [])) (tagsBy[a.person_id] = tagsBy[a.person_id] || []).push(a)
  const attendeeBy = {}
  for (const ea of (attendee || [])) (attendeeBy[ea.person_id] = attendeeBy[ea.person_id] || []).push(ea)
  const pageEventsBy = {}
  for (const pe of (pageEvents || [])) {
    const byType = (pageEventsBy[pe.person_id] = pageEventsBy[pe.person_id] || {})
    if (!byType[pe.event] || new Date(pe.created_at) > new Date(byType[pe.event])) byType[pe.event] = pe.created_at
  }
  const statusBy = {}
  for (const s of (statusRows || [])) (statusBy[s.person_id] = statusBy[s.person_id] || []).push(s.tag)

  // Meeting recaps: bulk-fetch the recap rows once for every distinct
  // recap_id referenced, then group by person via the participant links —
  // same two-hop join as the single-person path, just batched.
  const recapIdsByPerson = {}
  const allRecapIds = new Set()
  for (const link of (recapParticipants || [])) {
    (recapIdsByPerson[link.person_id] = recapIdsByPerson[link.person_id] || []).push(link.meeting_recap_id)
    allRecapIds.add(link.meeting_recap_id)
  }
  let recapsById = {}
  if (allRecapIds.size) {
    const { data: recaps } = await sb.from("meeting_recaps")
      .select("id, occurred_at, meeting_type, engagement_signal, referral_mentioned")
      .in("id", Array.from(allRecapIds))
    recapsById = (recaps || []).reduce(function (m, r) { m[r.id] = r; return m }, {})
  }
  const recapRowsByPerson = {}
  for (const personId in recapIdsByPerson) {
    recapRowsByPerson[personId] = recapIdsByPerson[personId].map(function (rid) { return recapsById[rid] }).filter(Boolean)
  }

  const now = Date.now()
  return people_.map(function (p) {
    const signals = buildSignals(commsBy[p.id] || [], tagsBy[p.id] || [], attendeeBy[p.id] || [], pageEventsBy[p.id] || {}, recapRowsByPerson[p.id] || [])
    const w = computeWarmth(signals, statusBy[p.id] || [], now)
    return {
      person_id: p.id,
      full_name: p.full_name,
      company: p.company,
      score: w.score,
      tier: w.tier,
      tier_label: w.tierLabel,
      flagged: w.flagged,
    }
  }).sort(function (a, b) { return b.score - a.score })
}
