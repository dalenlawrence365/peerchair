"use client"
import { useEffect, useState } from "react"
import { T } from "@/lib/pipelineTheme"

export default function EventLinkCard({ personId }) {
  const [events, setEvents] = useState([])
  const [slug, setSlug] = useState("")
  const [msg, setMsg] = useState("")
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(function () {
    fetch("/api/events/upcoming").then(function (r) { return r.json() }).then(function (d) {
      const evs = (d && d.events) || []
      setEvents(evs)
      if (evs[0]) setSlug(evs[0].slug)
    }).catch(function () {}).finally(function () { setLoaded(true) })
  }, [])

  function copyLink() {
    setBusy(true); setMsg("")
    fetch("/api/person-event-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ person_id: personId, slug: slug, mode: "link", src: "profile" }) })
      .then(function (r) { return r.json() }).then(function (d) {
        if (d.url) { try { navigator.clipboard.writeText(d.url) } catch (e) {} setMsg("Invite (registration) link copied.") }
        else setMsg("Couldn't build the link.")
      }).catch(function () { setMsg("Error.") }).finally(function () { setBusy(false) })
  }

  function draftEmail() {
    setBusy(true); setMsg("")
    fetch("/api/person-event-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ person_id: personId, slug: slug, mode: "draft", src: "email" }) })
      .then(function (r) { return r.json() }).then(function (d) {
        if (d.drafted) { setMsg("Draft created in your Outlook."); if (d.draft_url) window.open(d.draft_url, "_blank") }
        else if (d.url) { try { navigator.clipboard.writeText(d.url) } catch (e) {} setMsg("Draft not created" + (d.error ? (" (" + d.error + ")") : "") + " — link copied instead.") }
        else setMsg("Error.")
      }).catch(function () { setMsg("Error.") }).finally(function () { setBusy(false) })
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
  return (
    <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: T.textSecondary, marginBottom: 10 }}>Event invite</div>
      <select value={slug} onChange={function (e) { setSlug(e.target.value) }} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid " + T.border, fontSize: 13, marginBottom: 10, fontFamily: "inherit", background: "white" }}>
        {events.map(function (e) { return <option key={e.slug} value={e.slug}>{e.name}</option> })}
      </select>
      <div style={{ display: "flex", gap: 8 }}>
        <button disabled={busy || !slug} onClick={copyLink} style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid " + T.border, background: "white", color: T.textPrimary, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Copy invite link</button>
        <button disabled={busy || !slug} onClick={draftEmail} style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "none", background: T.accent, color: "white", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Draft email</button>
      </div>
      {msg ? <div style={{ fontSize: 12, color: T.textTertiary, marginTop: 8 }}>{msg}</div> : null}
    </div>
  )
}
