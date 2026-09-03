// Keeps the two workshop-invite tracking systems in sync with each other,
// no matter which side an invite gets logged through first:
//
//   1. event_attendees — tied to a specific `events` row, carries the real
//      invite token / RSVP status (Invited/Confirmed/Unavailable/etc). This
//      is what the bulk "invite these people" action and the public RSVP
//      flow use.
//   2. person_action_tags (ws_invite_MM-DD-YY) — a quick per-person tag,
//      countable at a glance in the Invitations section, and mirrored onto
//      the Timeline so it shows up chronologically alongside emails/notes.
//
// Before this, only ever writing one side meant a report/query that checked
// just the other side would wrongly call someone "never invited" — exactly
// what happened with Jenna Hardy: invited via event_attendees, but with no
// ws_invite tag, so a tag-only check missed her entirely.

// Invitations are a sub-category of action tag — kept in sync with the
// check the profile UI uses to split them into their own "Invitations"
// section (see isInvitationTag in the person profile page).
export function isInvitationTag(actionType) {
  const t = actionType || ""
  return /^ws_invite_/.test(t) || /^social_invite_/.test(t) || /_invite_\d{2}-\d{2}-\d{2}$/.test(t) || t === "event_invite_sent"
}

// Only the ws_invite_MM-DD-YY convention maps onto a specific `events` row
// (social invites and the legacy generic tag don't), so only these are
// eligible for the event_attendees <-> action-tag sync below.
export function isWsInviteTag(actionType) {
  return /^ws_invite_\d{2}-\d{2}-\d{2}$/.test(actionType || "")
}

// event_date -> "ws_invite_MM-DD-YY". Works off the first 10 chars of
// whatever date-ish string/timestamptz comes back from Postgres, matching
// the exact convention already used for the "next workshop" quick-tag on
// the person profile — deliberately NOT parsed through `new Date()` +
// getMonth(), which would apply local-timezone conversion and could shift
// the calendar date near midnight UTC.
export function wsInviteTagForDate(eventDateLike) {
  if (!eventDateLike) return null
  const s = String(eventDateLike).slice(0, 10)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return `ws_invite_${m[2]}-${m[3]}-${m[1].slice(2)}`
}

function friendlyDate(mm, dd, yy) {
  const d = new Date(2000 + parseInt(yy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10))
  try { return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) } catch (e) { return `${mm}/${dd}/${yy}` }
}

export function describeInviteTag(actionType) {
  const t = actionType || ""
  const ws = t.match(/^ws_invite_(\d{2})-(\d{2})-(\d{2})$/)
  if (ws) return `Invited to the ${friendlyDate(ws[1], ws[2], ws[3])} workshop.`
  const social = t.match(/^social_invite_(\d{2})-(\d{2})-(\d{2})$/)
  if (social) return `Invited to the ${friendlyDate(social[1], social[2], social[3])} social event.`
  const generic = t.match(/_invite_(\d{2})-(\d{2})-(\d{2})$/)
  if (generic) return `Invited to the ${friendlyDate(generic[1], generic[2], generic[3])} event.`
  if (t === "event_invite_sent") return "Invited to an event."
  return `Invited (${t}).`
}

// Mirrors ONE invitation action tag onto the Timeline (communications table)
// — dedupes on (person_id, channel, step_label) so calling this repeatedly
// for the same tag is always a safe no-op. NOTE: a DB trigger
// (normalize_communications_format) lowercases `channel` on insert, so the
// dedupe check has to match the lowercased form.
export async function mirrorInviteToTimeline(sb, personId, actionType, asOfDate) {
  const { data: existingTimeline } = await sb.from("communications")
    .select("id").eq("person_id", personId).eq("channel", "workshop invitation")
    .eq("step_label", actionType).limit(1)
  if (existingTimeline && existingTimeline.length) return
  const occurredAt = asOfDate ? new Date(asOfDate + "T12:00:00").toISOString() : new Date().toISOString()
  await sb.from("communications").insert({
    person_id: personId,
    direction: "INTERNAL",
    channel: "Workshop Invitation",
    step_label: actionType,
    body: describeInviteTag(actionType),
    occurred_at: occurredAt,
    source: "App",
    logged_by: "Dalen Lawrence",
  })
}

// Direction 1: an event_attendees invite was just created/upserted for
// these person_ids -> make sure each of them also has the matching
// ws_invite_MM-DD-YY action tag (and its Timeline mirror). Used by the
// bulk "invite these people" endpoint. Skips people who already have the
// tag (set_action_tag has no built-in dedup, so this checks first rather
// than relying on a DB constraint). Returns how many tags were added.
export async function syncActionTagsFromEventInvite(sb, personIds, eventDateLike, setBy) {
  const tag = wsInviteTagForDate(eventDateLike)
  if (!tag || !personIds.length) return 0

  const { data: existing } = await sb.from("person_action_tags")
    .select("person_id").eq("action_type", tag).in("person_id", personIds)
  const already = new Set((existing || []).map(function (r) { return r.person_id }))
  const missing = personIds.filter(function (id) { return !already.has(id) })
  if (!missing.length) return 0

  const asOfDate = new Date().toISOString().slice(0, 10)
  const { error } = await sb.from("person_action_tags").insert(
    missing.map(function (personId) {
      return { person_id: personId, action_type: tag, as_of_date: asOfDate, set_by: setBy || "event_invite_sync" }
    })
  )
  if (error) return 0

  for (const personId of missing) {
    await mirrorInviteToTimeline(sb, personId, tag, asOfDate)
  }
  return missing.length
}

// Direction 2: a ws_invite_MM-DD-YY action tag was just added for one
// person -> make sure there's a matching event_attendees row too, so they
// show up on that event's roster and are covered by its RSVP flow. Only
// two events at a time realistically exist, so fetching all published
// events and matching the derived tag in JS is simpler and just as fast as
// a reverse-parsing SQL query. No-ops if no event matches or a row already
// exists (upsert with ignoreDuplicates, same as the bulk invite endpoint).
export async function syncEventAttendeeFromActionTag(sb, personId, actionType) {
  if (!isWsInviteTag(actionType)) return false

  const { data: events } = await sb.from("events").select("id, event_date").eq("published", true)
  const match = (events || []).find(function (e) { return wsInviteTagForDate(e.event_date) === actionType })
  if (!match) return false

  const { error } = await sb.from("event_attendees").upsert(
    [{ event_id: match.id, person_id: personId, status: "Invited", source: "invited", approved_at: new Date().toISOString() }],
    { onConflict: "event_id,person_id", ignoreDuplicates: true }
  )
  return !error
}
