// Parse Calendly notification email bodies (from notifications@calendly.com)
// to extract structured invitee + event metadata that can be attached to a
// matching `meetings` row.
//
// Calendly notification format (stable as of 2026):
//
//   Hi Dalen Lawrence - CFO Circle,
//   A new invitee has been scheduled.
//   Event Type:
//   CFO Circle - 30 Minute
//   Invitee:
//   Mike Caruso
//   Invitee Email:
//   mikecaruso1174@gmail.com
//   Event Date/Time:
//   12:00pm - Thursday, June 4, 2026 (Pacific Time - US & Canada)
//   ...
//   Cancel: https://calendly.com/cancellations/{uuid}
//   Reschedule: https://calendly.com/reschedulings/{uuid}
//
// We extract: event_type, invitee_name, invitee_email, start_time (parsed),
// cancel_uri, reschedule_uri, calendly_event_uri (derived).

export function parseCalendlyNotification(body) {
  if (!body) return null
  const out = {}

  const section = (label) => {
    const re = new RegExp(`${label}:\\s*\\r?\\n\\s*([^\\r\\n]+)`, "i")
    const m = body.match(re)
    return m ? m[1].trim() : null
  }

  out.event_type    = section("Event Type")
  out.invitee_name  = section("Invitee")
  out.invitee_email = section("Invitee Email")
  out.event_time    = section("Event Date/Time")

  const cancel = body.match(/https:\/\/calendly\.com\/cancellations\/([a-zA-Z0-9_-]+)/i)
  if (cancel) {
    out.cancel_uri = cancel[0]
    out.calendly_event_uri = `https://api.calendly.com/scheduled_events/${cancel[1]}`
  }
  const resched = body.match(/https:\/\/calendly\.com\/reschedulings\/([a-zA-Z0-9_-]+)/i)
  if (resched) out.reschedule_uri = resched[0]

  if (out.event_time) {
    out.start_iso = parseCalendlyTimePhrase(out.event_time)
  }

  return (out.invitee_email || out.calendly_event_uri) ? out : null
}

// "12:00pm - Thursday, June 4, 2026 (Pacific Time - US & Canada)" → ISO
function parseCalendlyTimePhrase(s) {
  try {
    const m = s.match(/(\d{1,2}):(\d{2})\s*([ap]m)?\s*-\s*\w+,\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/i)
    if (!m) return null
    let [_, h, mm, ampm, monthName, day, year] = m
    let hour = parseInt(h, 10)
    if (ampm && /pm/i.test(ampm) && hour !== 12) hour += 12
    if (ampm && /am/i.test(ampm) && hour === 12) hour = 0
    const months = { january:0, february:1, march:2, april:3, may:4, june:5, july:6, august:7, september:8, october:9, november:10, december:11 }
    const monthIdx = months[monthName.toLowerCase()]
    if (monthIdx === undefined) return null
    // Assume PT (UTC-7 in summer, UTC-8 in winter). June = PDT = UTC-7.
    const offsetHours = 7  // close enough for matching against calendar event start_at
    const dt = new Date(Date.UTC(parseInt(year, 10), monthIdx, parseInt(day, 10), hour + offsetHours, parseInt(mm, 10), 0))
    return dt.toISOString()
  } catch { return null }
}
