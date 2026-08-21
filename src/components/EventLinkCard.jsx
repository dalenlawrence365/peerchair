"use client"
import { useEffect, useState, useCallback } from "react"
import { T } from "@/lib/pipelineTheme"

function fmtDate(iso) {
  if (!iso) return ""
  try { return new Date(String(iso).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) }
  catch (e) { return "" }
}

const STATUS_STYLE = {
  Invited:    { bg: "#eaf0f8", border: "#c7d5ea", color: "#1e3a5f", label: "Invited" },
  Registered: { bg: "#fff7e6", border: "#f4d58a", color: "#8a5a00", label: "Registered — awaiting your approval" },
  Requested:  { bg: "#fff7e6", border: "#f4d58a", color: "#8a5a00", label: "Requested — awaiting your approval" },
  Confirmed:  { bg: "#e9f3ec", border: "#c3e0cc", color: "#1b5e36", label: "Confirmed" },
  Attended:   { bg: "#e9f3ec", border: "#c3e0cc", color: "#1b5e36", label: "Attended" },
  Declined:   { bg: "#fee2e2", border: "#fca5a5", color: "#991b1b", label: "Declined" },
  Unavailable:{ bg: "#fef3c7", border: "#fcd34d", color: "#92400e", label: "Unavailable — carried forward" },
  "No-show":  { bg: "#fee2e2", border: "#fca5a5", color: "#991b1b", label: "No-show" },
}

export default function EventLinkCard({ personId }) {
  const [events, setEvents] = useState([])
  const [slug, setSlug] = useState("")
  const [msg, setMsg] = useState("")
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [attendee, setAttendee] = useState(null)   // this person's row for the selected event, or null
  const [statusLoaded, setStatusLoaded] = useState(false)
  const [draftUrl, setDraftUrl] = useState(null)

  useEffect(function () {
    fetch("/api/events/upcoming").then(function (r) { return r.json() }).then(function (d) {
      const evs = (d && d.events) || []
      setEvents(evs)
      if (evs[0]) setSlug(evs[0].slug)
    }).catch(function () {}).finally(function () { setLoaded(true) })
  }, [])

  const loadStatus = useCallback(function () {
    if (!slug || !personId) return
    setStatusLoaded(false)
    fetch("/api/events/attendees?slug=" + encodeURIComponent(slug) + "&person_id=" + encodeURIComponent(personId), { cache: "no-store" })
      .then(function (r) { return r.json() })
      .then(function (d) { setAttendee((d && d.attendees && d.attendees[0]) || null) })
      .catch(function () { setAttendee(null) })
      .finally(function () { setStatusLoaded(true) })
  }, [slug, personId])
  useEffect(function () { loadStatus() }, [loadStatus])

  function markInvited() {
    setBusy(true); setMsg("")
    fetch("/api/events/attendees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: slug, person_ids: [personId] }) })
      .then(function (r) { return r.json() })
      .then(function (d) {
        if (d && d.ok) { setMsg("Marked Invited — now on the event roster."); loadStatus() }
        else { setMsg("Couldn't mark invited.") }
      }).catch(function () { setMsg("Error.") }).finally(function () { setBusy(false) })
  }

  function copyLink() {
    setBusy(true); setMsg("")
    fetch("/api/person-event-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ person_id: personId, slug: slug, mode: "link", src: "profile" }) })
      .then(function (r) { return r.json() }).then(function (d) {
        if (d.url) { try { navigator.clipboard.writeText(d.url) } catch (e) {} setMsg("Invite (registration) link copied — for " + eventLabel(slug) + ".") }
        else setMsg("Couldn't build the link.")
      }).catch(function () { setMsg("Error.") }).finally(function () { setBusy(false) })
  }

  function draftEmail() {
    setBusy(true); setMsg(""); setDraftUrl(null)
    fetch("/api/person-event-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ person_id: personId, slug: slug, mode: "draft", src: "email" }) })
      .then(function (r) { return r.json() }).then(function (d) {
        // Was window.open(d.draft_url, "_blank") here -- every click forced a new
        // outlook.com browser tab open, which Dalen doesn't want. The draft itself
        // was always being created correctly (a real POST to Graph /me/messages,
        // which lands in the actual Outlook Drafts folder) -- the only fix needed
        // is to stop yanking focus into a browser tab. Surface an optional link
        // instead so he can open it himself if he wants to, or just go to Outlook
        // on his own and find it sitting in Drafts.
        if (d.drafted) { setMsg("Draft saved to your Outlook Drafts — for " + eventLabel(slug) + "."); setDraftUrl(d.draft_url || null) }
        else if (d.url) { try { navigator.clipboard.writeText(d.url) } catch (e) {} setMsg("Draft not created" + (d.error ? (" (" + d.error + ")") : "") + " — link copied instead.") }
        else setMsg("Error.")
      }).catch(function () { setMsg("Error.") }).finally(function () { setBusy(false) })
  }

  function eventLabel(s) {
    const e = events.find(function (x) { return x.slug === s })
    return e ? (fmtDate(e.event_date) + " — " + e.name) : s
  }

  // Was `return null`, which was right when this card sat loose on the profile —
  // nothing to invite to, nothing to show. Now that it owns the Events tab,
  // vanishing leaves a blank tab that reads as broken. Say why it's empty.
  if (!loaded) {
    return <div style={{ fontSize: 13, color: T.textTertiary, padding: "4px 2px" }}>Loading events…</div>
  }
  if (!events.length) {
    return (
      <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.textSecondary, marginBottom: 6 }}>Event invite</div>
        <div style={{ fontSize: 12.5, color: T.textTertiary, lineHeight: 1.5 }}>
          No upcoming events on the calendar. Once a session is scheduled, you can copy a
          personal invite link or draft the invite email from here.
        </div>
      </div>
    )
  }

  const st = attendee ? (STATUS_STYLE[attendee.status] || { bg: "#eaf0f8", border: "#c7d5ea", color: "#1e3a5f", label: attendee.status }) : null

  return (
    <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: T.textSecondary, marginBottom: 10 }}>Event invite</div>
      {/* Multiple events now share the same title ("The 8 Key Drivers of CFO Success"),
          so the date leads every option — this is the fix for "which meeting is this link for". */}
      <select value={slug} onChange={function (e) { setSlug(e.target.value) }} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid " + T.border, fontSize: 13, marginBottom: 10, fontFamily: "inherit", background: "white" }}>
        {events.map(function (e) { return <option key={e.slug} value={e.slug}>{fmtDate(e.event_date)} — {e.name}</option> })}
      </select>

      {/* Live status for THIS person on THIS event — the "does her profile show
          she's invited" gap. Pulled straight from event_attendees, not a
          free-text tag, so it can never drift out of sync with the roster. */}
      <div style={{ marginBottom: 10 }}>
        {!statusLoaded ? (
          <span style={{ fontSize: 12, color: T.textTertiary }}>Checking status…</span>
        ) : attendee ? (
          <span style={{ fontSize: 11.5, fontWeight: 600, padding: "3px 9px", borderRadius: 999, display: "inline-block", background: st.bg, border: "1px solid " + st.border, color: st.color }}>
            {st.label}{attendee.invited_at ? " · " + fmtDate(attendee.invited_at) : ""}
          </span>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, padding: "3px 9px", borderRadius: 999, background: "#f3f4f6", border: "1px solid " + T.border, color: T.textTertiary }}>Not on the roster for this event</span>
            <button disabled={busy} onClick={markInvited} style={{ fontSize: 12, fontWeight: 600, color: T.accent, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>Mark Invited</button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button disabled={busy || !slug} onClick={copyLink} style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid " + T.border, background: "white", color: T.textPrimary, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Copy invite link</button>
        <button disabled={busy || !slug} onClick={draftEmail} style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "none", background: T.accent, color: "white", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Draft email</button>
      </div>
      {msg ? (
        <div style={{ fontSize: 12, color: T.textTertiary, marginTop: 8 }}>
          {msg}{" "}
          {draftUrl ? <a href={draftUrl} target="_blank" rel="noreferrer" style={{ color: T.accent, fontWeight: 600 }}>Open in Outlook →</a> : null}
        </div>
      ) : null}
    </div>
  )
}
