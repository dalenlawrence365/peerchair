export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"
import { getAccessToken } from "@/lib/microsoft-auth"

/* Admin-side attendee management. Same-origin (PeerChair UI) only — no CORS.

   GET  /api/events/attendees?slug=august-11-workshop
        → event + attendee rows with ready-to-paste tokenized invite URLs,
          plus counts. This is the only place the confirmed count is visible.

   POST /api/events/attendees  { slug, person_ids: [uuid, ...] }
        → idempotently creates Invited rows. Re-posting an existing person is
          a no-op, so a fat-fingered double-click never re-tokenizes someone
          and invalidates an invitation already sitting in their inbox.

   DELETE /api/events/attendees?id=<attendee_id>
        → removes an invitation before it goes out.
*/

const SITE = process.env.NEXT_PUBLIC_EVENT_SITE_URL || "https://la-cfo.com"

function inviteUrl(slug, token) {
  return `${SITE}/events/${slug}?t=${encodeURIComponent(token)}`
}

export async function GET(req) {
  const url = new URL(req.url)
  const slug = (url.searchParams.get("slug") || "").trim()
  const sb = serverClient()

  const { data: event } = await sb
    .from("events")
    .select("id, slug, name, event_date, ends_at, target_capacity, min_to_run, status")
    .eq("slug", slug)
    .maybeSingle()

  if (!event) return Response.json({ error: "not_found" }, { status: 404 })

  const { data: rows } = await sb
    .from("event_attendees")
    .select("id, status, invited_at, responded_at, invite_token, person_id, notes, source, registered_at, approved_at, confirmation_drafted_at, confirmation_draft_weblink, confirmation_sent_at, confirmation_draft_error, confirmation_draft_error_at, people:person_id ( first_name, last_name, full_name, email, title, company, cfo_state, avatar_url, linkedin_url, linkedin_connected )")
    .eq("event_id", event.id)
    .order("invited_at", { ascending: true })

  const attendees = (rows || []).map(r => ({
    id: r.id,
    person_id: r.person_id,
    name: r.people?.full_name || [r.people?.first_name, r.people?.last_name].filter(Boolean).join(" "),
    email: r.people?.email || null,
    title: r.people?.title || null,
    company: r.people?.company || null,
    linkedin_url: r.people?.linkedin_url || null,
    linkedin_connected: !!r.people?.linkedin_connected,
    cfo_state: r.people?.cfo_state || null,
    avatar_url: r.people?.avatar_url || null,
    status: r.status,
    notes: r.notes || null,
    source: r.source || null,
    registered_at: r.registered_at || null,
    approved_at: r.approved_at || null,
    confirmation_drafted_at: r.confirmation_drafted_at || null,
    confirmation_draft_weblink: r.confirmation_draft_weblink || null,
    confirmation_draft_error: r.confirmation_draft_error || null,
    confirmation_draft_error_at: r.confirmation_draft_error_at || null,
    confirmation_sent_at: r.confirmation_sent_at || null,
    invited_at: r.invited_at,
    responded_at: r.responded_at,
    invite_url: inviteUrl(event.slug, r.invite_token),
  }))

  const count = s => attendees.filter(a => a.status === s).length
  const confirmed = count("Confirmed")
  // "Awaiting your review" is a fact about timestamps, not a status label:
  // registered, not yet approved. Someone you invited directly who then also
  // self-registered carries status 'Invited' — they still need reviewing.
  // Terminal for THIS EVENT'S queue — they need nothing further from you today.
  // 'Unavailable' belongs here (there's no seat decision left to make) but it is
  // emphatically NOT a decline: they still want in, just not on this date, and
  // they live on in event_carry_forward.
  const TERMINAL = new Set(["Declined", "No-show", "Attended", "Unavailable"])
  const isAwaitingReview = a => !TERMINAL.has(a.status) && !a.approved_at &&
    (!!a.registered_at || a.status === "Registered" || a.status === "Requested")
  const registered = attendees.filter(isAwaitingReview).length

  return Response.json({
    event,
    attendees,
    counts: {
      invited: attendees.length,
      registered,
      confirmed,
      declined: count("Declined"),
      // Counted apart from declined on purpose. Collapsing them would read as
      // "5 people said no" when four of them said "not that Tuesday".
      unavailable: count("Unavailable"),
      no_response: count("Invited"),
      // The go/no-go number. Manual: do not run under 8 confirmed CFOs.
      short_of_minimum: Math.max(0, (event.min_to_run || 8) - confirmed),
    },
  })
}

export async function POST(req) {
  let body = {}
  try { body = await req.json() } catch { return Response.json({ error: "bad_request" }, { status: 400 }) }

  const slug = (body.slug || "").toString().trim()
  const ids = Array.isArray(body.person_ids) ? body.person_ids.filter(Boolean) : []
  if (!ids.length) return Response.json({ error: "no_people" }, { status: 400 })

  const sb = serverClient()
  const { data: event } = await sb.from("events").select("id, slug").eq("slug", slug).maybeSingle()
  if (!event) return Response.json({ error: "not_found" }, { status: 404 })

  // ignoreDuplicates → the (event_id, person_id) unique index makes this safe
  // to call repeatedly. Existing tokens are preserved.
  const { error } = await sb
    .from("event_attendees")
    .upsert(ids.map(pid => ({ event_id: event.id, person_id: pid, status: "Invited", source: "invited", approved_at: new Date().toISOString() })),
            { onConflict: "event_id,person_id", ignoreDuplicates: true })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  const { data: rows } = await sb
    .from("event_attendees")
    .select("person_id, invite_token")
    .eq("event_id", event.id)
    .in("person_id", ids)

  return Response.json({
    ok: true,
    added: (rows || []).map(r => ({ person_id: r.person_id, invite_url: inviteUrl(event.slug, r.invite_token) })),
  })
}

async function createInviteDraft({ to, first_name, invite_url, event }) {
  try {
    const hi = first_name ? ("Hi " + first_name + ",") : "Hi,"
    const ev = event || {}
    let whenStr = "Tuesday, August 11 &middot; 8:30&ndash;11:30 AM"
    try { if (ev.event_date) whenStr = new Date(String(ev.event_date).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) + " &middot; 8:30&ndash;11:30 AM" } catch (e) {}
    const row = (label, value) => value ? ('<p style="margin:0 0 9px;font-size:15px;line-height:1.5"><strong>' + label + '</strong> ' + value + '</p>') : ""
    const where = [ev.venue_name, ev.address_line].filter(Boolean).join(", ")
    // Universal add-to-calendar: .ics (Apple/Outlook) + Google link.
    const icsUrl = "https://www.peerchair.com/api/events/ics?slug=" + encodeURIComponent(ev.slug || "")
    const gcalStamp = function (iso) { try { const d = new Date(iso); const p = n => String(n).padStart(2, "0"); return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + "T" + p(d.getUTCHours()) + p(d.getUTCMinutes()) + "00Z" } catch (e) { return "" } }
    const gcal = "https://calendar.google.com/calendar/render?action=TEMPLATE"
      + "&text=" + encodeURIComponent((ev.name || "CFO Circle workshop") + " \u2014 CFO Circle Los Angeles")
      + (ev.event_date ? ("&dates=" + gcalStamp(ev.event_date) + "/" + gcalStamp(ev.ends_at || ev.event_date)) : "")
      + "&location=" + encodeURIComponent(where)
      + "&details=" + encodeURIComponent("CFO Circle Los Angeles. See your confirmation email for parking, check-in and breakfast details.")
    const calBlock =
      '<p style="font-size:14px;line-height:1.5;margin:20px 0 8px;color:#20242f"><strong>Add it to your calendar</strong> so it\u2019s locked in \u2014 works on any device:</p>' +
      '<p style="margin:0 0 20px">' +
      '<a href="' + icsUrl + '" style="display:inline-block;background:#20242f;color:#fff;padding:10px 18px;border-radius:3px;text-decoration:none;font-weight:bold;font-family:Arial,sans-serif;font-size:13px;margin:0 8px 8px 0">Apple / Outlook</a>' +
      '<a href="' + gcal + '" style="display:inline-block;background:#20242f;color:#fff;padding:10px 18px;border-radius:3px;text-decoration:none;font-weight:bold;font-family:Arial,sans-serif;font-size:13px;margin:0 8px 8px 0">Google Calendar</a>' +
      '</p>'
    const html =
      '<div style="font-family:Georgia,serif;max-width:560px;color:#20242f">' +
      '<p style="font-size:16px;margin:0 0 14px">' + hi + '</p>' +
      '<p style="font-size:15px;line-height:1.6;margin:0 0 16px">You\u2019re confirmed for <strong>' + (ev.name || "the CFO Circle workshop") + '</strong> \u2014 CFO Circle Los Angeles. Here\u2019s everything you need:</p>' +
      row("When:", whenStr) +
      row("Where:", where) +
      row("Parking:", ev.parking_instructions) +
      row("Check-in:", ev.check_in_instructions) +
      row("Breakfast:", ev.breakfast_note) +
      calBlock +
      '<p style="font-size:14px;line-height:1.6;margin:0 0 22px"><a href="' + invite_url + '" style="color:#1a2550">View all the details online &rarr;</a></p>' +
      '<p style="font-size:14px;line-height:1.6;color:#54596b;margin:0">Looking forward to it,<br>Dalen Lawrence<br>Chapter Director, CFO Circle Los Angeles</p>' +
      '</div>'
    // POST /me/messages creates a DRAFT (not sent) so Dalen reviews before sending.
    const payload = JSON.stringify({
      subject: "You're in — August 11 CFO Circle workshop",
      body: { contentType: "HTML", content: html },
      toRecipients: [{ emailAddress: { address: to } }],
    })
    function post(tok) {
      return fetch("https://graph.microsoft.com/v1.0/me/messages", {
        method: "POST",
        headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" },
        body: payload,
      })
    }
    let token = await getAccessToken()
    let res = await post(token)
    if (res.status === 401) {
      // Cached token was rejected as expired — force a fresh one and retry once.
      token = await getAccessToken({ force: true })
      res = await post(token)
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => "")
      console.error("invite draft: Graph " + res.status + " " + errText.slice(0, 500))
      return { ok: false, webLink: null, error: "Graph " + res.status + (errText ? (": " + errText.slice(0, 160)) : "") }
    }
    const data = await res.json().catch(() => ({}))
    return { ok: true, webLink: data.webLink || null }
  } catch (e) { console.error("invite draft failed:", e); return { ok: false, webLink: null, error: (e && e.message) || "exception" } }
}

// Draft the confirmation for one attendee AND record what happened, always.
// The old flow only drafted on the status transition into approved and only when
// an email was present, with no else — so "no email" and "Graph was down" both
// looked identical to success: a Confirmed row with a blank confirmation column.
// This persists every outcome so the roster can tell the truth, and is safe to
// call again (regenerate) without any status change.
async function draftConfirmationFor(sb, id) {
  const { data: a } = await sb
    .from("event_attendees")
    .select("id, invite_token, approved_at, status, event_id, people:person_id ( first_name, email ), events:event_id ( slug, name, event_date, ends_at, venue_name, address_line, parking_instructions, check_in_instructions, breakfast_note )")
    .eq("id", id)
    .maybeSingle()
  if (!a) return { ok: false, error: "not_found" }

  const email = a.people?.email || null
  const invite_url = a.events?.slug ? inviteUrl(a.events.slug, a.invite_token) : null

  // No email is a real, nameable state — not a silent no-op. Record it so the
  // roster shows "no email on file" and Dalen knows to handle it by hand.
  if (!email) {
    await sb.from("event_attendees").update({
      confirmation_draft_error: "No email on file — can't draft a confirmation.",
      confirmation_draft_error_at: new Date().toISOString(),
    }).eq("id", id)
    return { ok: false, drafted: false, error: "no_email" }
  }
  if (!invite_url) {
    await sb.from("event_attendees").update({
      confirmation_draft_error: "No event link (missing invite token or event slug).",
      confirmation_draft_error_at: new Date().toISOString(),
    }).eq("id", id)
    return { ok: false, drafted: false, error: "no_invite_url" }
  }

  const d = await createInviteDraft({ to: email, first_name: a.people?.first_name, invite_url, event: a.events })
  if (d.ok) {
    await sb.from("event_attendees").update({
      confirmation_drafted_at: new Date().toISOString(),
      confirmation_draft_weblink: d.webLink || null,
      confirmation_draft_error: null,
      confirmation_draft_error_at: null,
    }).eq("id", id)
    return { ok: true, drafted: true, draft_url: d.webLink || null }
  }

  // Graph failed — persist the reason instead of dropping it on the floor.
  await sb.from("event_attendees").update({
    confirmation_draft_error: d.error || "Draft failed.",
    confirmation_draft_error_at: new Date().toISOString(),
  }).eq("id", id)
  return { ok: false, drafted: false, error: d.error || "draft_failed" }
}

export async function PATCH(req) {
  let body = {}
  try { body = await req.json() } catch { return Response.json({ error: "bad_request" }, { status: 400 }) }

  const id = (body.id || "").toString().trim()

  // Regenerate a confirmation draft on demand for an already-approved attendee.
  // The auto-draft only runs on the transition INTO approved, so a Confirmed row
  // whose draft never happened (no email at the time, Graph down, confirmed via
  // a path that skipped it) had no way back. This is that way back, idempotent.
  if (body.action === "regenerate_confirmation") {
    if (!id) return Response.json({ error: "bad_request" }, { status: 400 })
    const sbR = serverClient()
    const { data: chk } = await sbR.from("event_attendees").select("id, approved_at, status").eq("id", id).maybeSingle()
    if (!chk) return Response.json({ error: "not_found" }, { status: 404 })
    if (!chk.approved_at && chk.status !== "Confirmed") {
      return Response.json({ error: "not_approved", message: "Only an approved/confirmed attendee can have a confirmation draft." }, { status: 409 })
    }
    const r = await draftConfirmationFor(sbR, id)
    return Response.json({ ok: r.ok, regenerated: true, drafted: !!r.drafted, draft_url: r.draft_url || null, error: r.error || null })
  }

  // Mark the confirmation as sent (Dalen sent it from Outlook). Truthful roster state.
  if (body.mark_confirmation === "sent" || body.mark_confirmation === "unsent") {
    const sb2 = serverClient()
    const val = body.mark_confirmation === "sent" ? new Date().toISOString() : null
    const { error: mErr } = await sb2.from("event_attendees").update({ confirmation_sent_at: val }).eq("id", id)
    if (mErr) return Response.json({ error: mErr.message }, { status: 500 })
    return Response.json({ ok: true, confirmation_sent_at: val })
  }


  const status = (body.status || "").toString().trim()
  const ALLOWED = new Set(["Registered", "Invited", "Confirmed", "Declined", "Requested", "No-show", "Unavailable"])
  if (!id || !ALLOWED.has(status)) return Response.json({ error: "bad_request" }, { status: 400 })

  const sb = serverClient()
  const { data: cur } = await sb
    .from("event_attendees")
    .select("id, status, registered_at, approved_at, invite_token, event_id, person_id, people:person_id ( first_name, email ), events:event_id ( slug, name, event_date, ends_at, venue_name, address_line, parking_instructions, check_in_instructions, breakfast_note )")
    .eq("id", id)
    .maybeSingle()
  if (!cur) return Response.json({ error: "not_found" }, { status: 404 })

  // Approval is terminal: approving a registrant confirms the seat outright.
  // The page's "I'll be there" button is being retired, and it was the only
  // other writer of 'Confirmed' — so approval must write it or headcount reads zero.
  // Approving = granting a seat to someone who doesn't have one yet — whichever
  // door they came through. A registrant approved from the queue, OR a direct
  // invite who just replied "I'll be there" and never touched the form.
  // Both stamp approved_at, flip to Confirmed, and draft the confirmation.
  const isApproval = !cur.approved_at && (status === "Invited" || status === "Confirmed")
  const patch = { status: isApproval ? "Confirmed" : status }
  if (isApproval) patch.approved_at = new Date().toISOString()

  // Unavailable is not Declined. Declined answers "do you want this?" —
  // Unavailable answers "can you make that Tuesday?". It costs a seat, not a
  // prospect, so it records what they said, what you promised, and queues them
  // for next time. "I'll keep you in mind" is precisely the promise that dies
  // in an inbox; this is where it stops being a memory.
  let carried = false
  if (status === "Unavailable") {
    patch.unavailable_at = new Date().toISOString()
    if (body.note) patch.unavailable_note = String(body.note).trim() || null
  }

  const { error } = await sb.from("event_attendees").update(patch).eq("id", id)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  if (status === "Unavailable" && cur.person_id) {
    const carry = body.carry_to_next !== false   // default: yes, keep them in mind
    if (carry) {
      // One open promise per person — being unavailable twice doesn't make them
      // two people waiting. The partial unique index enforces it; ignore the
      // conflict rather than erroring out on a second miss.
      const { error: cErr } = await sb.from("event_carry_forward").insert({
        person_id: cur.person_id,
        from_event_id: cur.event_id,
        reason: body.note ? String(body.note).trim() : "Unavailable on this date",
        promised: body.promised ? String(body.promised).trim() : null,
      })
      carried = !cErr
    }

    // Their timeline should say why, in their words, not just show a status flip.
    const bits = ["Can't attend " + (cur.events?.name || "the session") + " — date conflict, not a decline."]
    if (body.note) bits.push("They said: " + String(body.note).trim())
    if (body.promised) bits.push("You told them: " + String(body.promised).trim())
    if (carried) bits.push("Queued for the next session.")
    await sb.from("communications").insert({
      person_id: cur.person_id,
      direction: "outbound",
      channel: "note",
      subject: "Unavailable — " + (cur.events?.name || "event"),
      body: bits.join("\n\n"),
      occurred_at: new Date().toISOString(),
      step_label: "Marked unavailable",
      source: "events",
    })
  }

  const slug = cur.events?.slug
  const invite_url = slug ? inviteUrl(slug, cur.invite_token) : null

  // On approval, ALWAYS attempt the confirmation draft and record the outcome —
  // success, no-email, or Graph failure. No branch exits silently, so a Confirmed
  // row can never again sit with a blank, unexplained confirmation column.
  let drafted = false
  let draft_url = null
  let draft_error = null
  if (isApproval) {
    const r = await draftConfirmationFor(sb, id)
    drafted = !!r.drafted
    draft_url = r.draft_url || null
    draft_error = r.ok ? null : (r.error || "draft_failed")
  }

  return Response.json({ ok: true, status: patch.status, invite_url, drafted, draft_url, draft_error, carried })
}

export async function DELETE(req) {
  const url = new URL(req.url)
  const id = (url.searchParams.get("id") || "").trim()
  if (!id) return Response.json({ error: "bad_request" }, { status: 400 })

  const sb = serverClient()
  const { error } = await sb.from("event_attendees").delete().eq("id", id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
