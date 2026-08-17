"use client"
import Link from "next/link"
import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { T } from "@/lib/pipelineTheme"


function shortDate(iso) {
  if (!iso) return ""
  try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) } catch (e) { return "" }
}
function rosterDate(a) {
  if (a.status === "Unavailable" && a.unavailable_at) return "Unavailable " + shortDate(a.unavailable_at)
  if ((a.status === "Confirmed" || a.status === "Declined") && a.responded_at) return a.status + " " + shortDate(a.responded_at)
  if (a.invited_at) return "Invited " + shortDate(a.invited_at)
  return ""
}

function Chip({ label, bg, color }) {
  return <span style={{ background: bg, color: color, fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 999 }}>{label}</span>
}

function statusChip(status) {
  if (status === "Confirmed") return <Chip label="Confirmed" bg={T.memberBg} color={T.memberText} />
  if (status === "Declined")  return <Chip label="Declined" bg={T.dangerBg} color={T.danger} />
  // Amber, not red. They didn't say no to you — they said no to a Tuesday.
  if (status === "Unavailable") return <Chip label="Unavailable" bg="#fef3c7" color="#92400e" />
  if (status === "Attended") return <Chip label="Attended" bg="#dcfce7" color="#166534" />
  if (status === "Registered" || status === "Requested") return <Chip label="Registered" bg={T.qualifiedBg} color={T.qualifiedText} />
  return <Chip label="Invited" bg={T.audienceBg} color={T.audienceText} />
}

const PILL = { registered: "#d97706", approved: "#16a34a", confirmed: "#0f766e", noshow: "#dc2626" }
const COMMITTED_STATUSES = ["Confirmed", "Attended", "No-show"]
function Pill({ label, date, bg, on }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999, lineHeight: 1.3,
      background: on ? bg : "transparent", color: on ? "#ffffff" : "#94a3b8",
      border: "1px solid " + (on ? bg : "#cbd5e1"), whiteSpace: "nowrap",
    }}>
      <span>{label}</span>
      {on && date ? <span style={{ fontWeight: 400, opacity: 0.85 }}>{date}</span> : null}
    </span>
  )
}
function PillTrack({ a }) {
  const isLi = a.source === "li-event"
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <Pill label={isLi ? "LinkedIn" : "Invited"} date={shortDate(a.invited_at)} bg={isLi ? "#0a66c2" : "#1a2550"} on={true} />
      <Pill label="Registered" date={shortDate(a.registered_at)} bg={PILL.registered} on={!!a.registered_at} />
      <Pill label="Approved" date={shortDate(a.approved_at)} bg={PILL.approved} on={!!a.approved_at} />
      <Pill label="Confirmed" date={shortDate(a.responded_at)} bg={PILL.confirmed} on={a.status === "Confirmed"} />
      {a.status === "No-show" ? <Pill label="No-show" date="" bg={PILL.noshow} on={true} /> : null}
      {a.status === "Attended" ? <Pill label="Attended" date="" bg="#16a34a" on={true} /> : null}
    </div>
  )
}

function longDate(v) {
  if (!v) return ""
  try {
    return new Date(String(v).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
  } catch (e) { return "" }
}

export default function EventRoster({ slug }) {
  const router = useRouter()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState("")
  const [busy, setBusy] = useState(null)
  const [draftUrl, setDraftUrl] = useState(null)
  // Which stat box is selected as a filter. null = show everything.
  const [filter, setFilter] = useState(null)
  // Free-text search over the roster — 57+ names is too many to scroll to find
  // the one person a DM just told you can't make it.
  const [q, setQ] = useState("")
  // All events, newest first, for the date switcher at the top of the page.
  const [allEvents, setAllEvents] = useState([])
  // In-page duplicate merge: which pending row is picking a record to merge into.
  const [mergeFor, setMergeFor] = useState(null)     // attendee id
  const [mergeQ, setMergeQ] = useState("")
  const [mergeResults, setMergeResults] = useState([])

  const load = useCallback(function () {
    setLoading(true)
    fetch("/api/events/attendees?slug=" + slug)
      .then(function (r) { return r.json() })
      .then(function (d) { setData(d); setLoading(false) })
      .catch(function () { setLoading(false) })
  }, [slug])

  useEffect(function () { load() }, [load])

  useEffect(function () {
    if (!mergeFor || mergeQ.trim().length < 2) { setMergeResults([]); return }
    var alive = true
    var id = setTimeout(function () {
      fetch("/api/people/search?q=" + encodeURIComponent(mergeQ.trim()), { cache: "no-store" })
        .then(function (r) { return r.json() })
        .then(function (d) { if (alive) setMergeResults((d && d.results) || []) })
        .catch(function () {})
    }, 200)
    return function () { alive = false; clearTimeout(id) }
  }, [mergeFor, mergeQ])


  // The date switcher's options — every event, newest first.
  useEffect(function () {
    fetch("/api/events/all", { cache: "no-store" })
      .then(function (r) { return r.json() })
      .then(function (d) { setAllEvents((d && d.events) || []) })
      .catch(function () {})
  }, [])

  // People carried over from a session they couldn't make. Kept out of the
  // roster counts — they aren't attendees yet — but shown here so the promise
  // is in front of you while there are still seats.
  const [waiting, setWaiting] = useState([])
  const loadWaiting = useCallback(function () {
    const slug = data && data.event ? data.event.slug : null
    fetch("/api/events/carry-forward" + (slug ? "?exclude_event_slug=" + encodeURIComponent(slug) : ""), { cache: "no-store" })
      .then(function (r) { return r.json() })
      .then(function (d) { setWaiting((d && d.waiting) || []) })
      .catch(function () {})
  }, [data && data.event && data.event.slug])
  useEffect(function () { loadWaiting() }, [loadWaiting])

  function inviteFromWaiting(w) {
    const slug = data && data.event ? data.event.slug : null
    if (!slug) return
    fetch("/api/events/attendees", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: slug, person_ids: [w.person_id] }),
    })
      .then(function (r) { return r.json() })
      .then(function () {
        return fetch("/api/events/carry-forward", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ person_id: w.person_id, event_slug: slug, action: "fulfil" }),
        })
      })
      .then(function () { setMsg(w.full_name + " added to this session — promise kept."); load(); loadWaiting() })
      .catch(function () { setMsg("Couldn't add " + w.full_name + ".") })
  }

  // "Can't make it" is a different event from "no thanks", and the difference is
  // worth two prompts: what they said, and what you promised back. Otherwise
  // "I'll keep you in mind for the next one" lives only in your head.
  function markUnavailable(a) {
    const name = a.name || "them"
    const note = window.prompt(
      "What did " + name + " say?\n\nTheir words, roughly — this goes on their timeline so future-you knows this was a date conflict, not a decline.",
      "Travelling that week."
    )
    if (note === null) return
    const promised = window.prompt(
      "What did you promise " + name + "?\n\nLeave blank if nothing. They'll be queued for the next session either way.",
      "Keep them in mind for the next session."
    )
    if (promised === null) return
    setStatus(a.id, "Unavailable", name, { note: note, promised: promised })
  }

  function setStatus(id, status, name, extra) {
    setBusy(id)
    fetch("/api/events/attendees", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ id: id, status: status }, extra || {})) })
      .then(function (r) { return r.json() })
      .then(function (d) {
        if (d && d.ok && (status === "Invited" || status === "Confirmed")) {
          setDraftUrl(null)
          if (d.drafted) {
            setMsg("Approved " + (name || "") + " — a draft invite email is in your Outlook drafts. Review it, then send.")
            if (d.draft_url) setDraftUrl(d.draft_url)
          } else {
            try { navigator.clipboard.writeText(d.invite_url) } catch (e) {}
            setMsg("Approved " + (name || "") + " — approved link copied. Draft not created" + (d.draft_error ? " (" + d.draft_error + ")" : "") + ".")
          }
        } else if (d && d.ok && status === "Unavailable") {
          setMsg(name + " marked unavailable — not a decline." + (d.carried ? " Queued for the next session." : ""))
        } else if (d && d.ok && status === "Declined") {
          setMsg("Declined " + (name || "") + ".")
        } else if (d && d.ok && status === "No-show") {
          setMsg("Marked " + (name || "") + " as a no-show.")
        } else if (d && d.ok && status === "Attended") {
          setMsg((name || "They") + " marked attended — CFO Workshop pill added to their profile.")
        }
        load()
      })
      .catch(function () { setMsg("Something went wrong.") })
      .finally(function () { setBusy(null) })
  }

  function regenerateConfirmation(id, name) {
    setBusy(id); setDraftUrl(null)
    fetch("/api/events/attendees", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: id, action: "regenerate_confirmation" }) })
      .then(function (r) { return r.json() })
      .then(function (d) {
        if (d && d.drafted) {
          setMsg("Confirmation draft created for " + (name || "") + " — it's in your Outlook drafts.")
          if (d.draft_url) setDraftUrl(d.draft_url)
        } else if (d && d.error === "no_email") {
          setMsg("Can't draft for " + (name || "") + " — no email on file. Add one on their profile, then regenerate.")
        } else {
          setMsg("Couldn't draft for " + (name || "") + (d && d.error ? " (" + d.error + ")" : "") + ".")
        }
        load()
      })
      .catch(function () { setMsg("Error regenerating draft."); })
      .finally(function () { setBusy(null) })
  }

  function markConfirmation(id, sent) {
    setBusy(id)
    fetch("/api/events/attendees", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: id, mark_confirmation: sent ? "sent" : "unsent" }) })
      .then(function (r) { return r.json() })
      .then(function (d) { if (d && d.ok) { load() } else { setMsg("Couldn't update confirmation.") } })
      .catch(function () { setMsg("Something went wrong.") })
      .finally(function () { setBusy(null) })
  }

  function copy(url) {
    try { navigator.clipboard.writeText(url); setMsg("Approved link copied.") } catch (e) {}
  }

  if (loading) return <div style={{ padding: "28px 32px", color: T.textTertiary }}>Loading…</div>
  if (!data || data.error) return <div style={{ padding: "28px 32px", color: T.danger }}>Couldn’t load the event.</div>

  const ev = data.event || {}
  const c = data.counts || {}
  const all = data.attendees || []
  // Awaiting review = registered but not yet approved. Keying off status alone
  // hid anyone who was invited directly AND then self-registered.
  const TERMINAL = ["Declined", "No-show", "Attended", "Unavailable"]
  const awaitingReview = function (a) {
    return TERMINAL.indexOf(a.status) === -1 && !a.approved_at &&
      (!!a.registered_at || a.status === "Registered" || a.status === "Requested")
  }
  // Each stat box is a filter. The predicate is chosen so the rows shown always
  // equal the number on the box you clicked — "select seven confirmed, see seven".
  const FILTERS = {
    confirmed:   function (a) { return COMMITTED_STATUSES.indexOf(a.status) !== -1 },
    registered:  awaitingReview,
    invited:     function () { return true },   // "total on the list"
    declined:    function (a) { return a.status === "Declined" },
    unavailable: function (a) { return a.status === "Unavailable" },
    noshow:      function (a) { return a.status === "No-show" },
    cfoconfirmed:     function (a) { return COMMITTED_STATUSES.indexOf(a.status) !== -1 && (a.roles || []).includes("cfo") },
    sponsorconfirmed: function (a) { return COMMITTED_STATUSES.indexOf(a.status) !== -1 && ((a.roles || []).includes("sponsor_contact") || a.cfo_circle_member) },
    attended:    function (a) { return a.status === "Attended" },
    cfoattended: function (a) { return a.status === "Attended" && (a.roles || []).includes("cfo") },
  }
  const pred = filter && FILTERS[filter] ? FILTERS[filter] : null
  const needle = q.trim().toLowerCase()
  const matches = function (a) {
    if (!needle) return true
    return [a.name, a.company, a.email, a.title].some(function (v) {
      return v && String(v).toLowerCase().indexOf(needle) !== -1
    })
  }
  const pending = all.filter(awaitingReview).filter(function (a) { return (!pred || pred(a)) && matches(a) })
  const roster = all.filter(function (a) { return !awaitingReview(a) }).filter(function (a) { return (!pred || pred(a)) && matches(a) })
  const shortOf = Math.max(0, (ev.min_to_run || 8) - (c.confirmed || 0))
  function toggleFilter(key) { setFilter(function (cur) { return cur === key ? null : key }) }

  // Merge the registrant (loser) INTO the existing record you picked (winner):
  // the registration and history move to the real person, the duplicate is gone.
  function doMerge(loserPersonId, winner) {
    if (!loserPersonId || !winner) return
    if (!confirm('Merge this registration into "' + (winner.name || "that record") + '"?\n\nThe registration and any history move onto the existing person, and the duplicate is deleted.')) return
    setBusy(mergeFor)
    fetch("/api/people/merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ winner_id: winner.id, loser_id: loserPersonId }) })
      .then(function (r) { return r.json() })
      .then(function (d) {
        if (d && d.ok) { setMsg("Merged into " + (winner.name || "the existing record") + "."); setMergeFor(null); setMergeQ(""); setMergeResults([]); load() }
        else { setMsg("Merge failed" + (d && d.error ? " (" + d.error + ")" : "") + ".") }
      })
      .catch(function () { setMsg("Merge failed.") })
      .finally(function () { setBusy(null) })
  }

  return (
    <div style={{ padding: "28px 32px", maxWidth: 900 }}>
      {/* Date switcher — jump between events, newest first. Only shown once
          there's more than one event to switch to. */}
      {allEvents.length > 1 ? (
        <div style={{ marginBottom: 12 }}>
          <select value={slug} onChange={function (e) { if (e.target.value !== slug) router.push("/events/" + e.target.value) }}
            style={{ fontSize: 13, fontWeight: 600, fontFamily: "inherit", color: T.textPrimary, background: "white", border: "1px solid " + T.border, borderRadius: 8, padding: "8px 30px 8px 12px", cursor: "pointer", maxWidth: 420 }}>
            {allEvents.map(function (e) {
              return <option key={e.slug} value={e.slug}>{e.name + "  —  " + longDate(e.event_date)}</option>
            })}
          </select>
        </div>
      ) : null}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ marginBottom: 6, fontSize: 22, fontWeight: 600, color: T.textPrimary }}>{ev.name || "Event"}</div>
          <div style={{ color: T.textTertiary, fontSize: 13 }}>{longDate(ev.event_date) || "Date TBD"}</div>
        </div>
        <div style={{ flexShrink: 0, minWidth: 214, maxWidth: 250, border: "1px solid " + T.border, borderRadius: 10, padding: "8px 11px", background: T.cardBg }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Registration link · copy &amp; paste</div>
          {[{ label: "DM", src: "linkedin_dm" }, { label: "Email", src: "email" }].map(function (r) {
            var url = "https://la-cfo.com/events/" + slug + "?src=" + r.src
            return (
              <div key={r.src} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "3px 0" }}>
                <span style={{ fontSize: 12, color: T.textSecondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><strong style={{ color: T.textPrimary }}>{r.label}</strong> <span style={{ color: T.textTertiary }}> · src={r.src}</span></span>
                <button onClick={function () { try { navigator.clipboard.writeText(url); setMsg(r.label + " registration link copied (src=" + r.src + ").") } catch (e) {} }} title={url} style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, color: T.accent, background: "transparent", border: "1px solid " + T.border, borderRadius: 6, padding: "2px 9px", cursor: "pointer", fontFamily: "inherit" }}>Copy</button>
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ marginBottom: 18 }}>
        <a href={"/api/events/campaign-export?slug=" + slug + "&src=li-dm"} style={{ display: "inline-block", fontSize: 12.5, fontWeight: 600, color: T.accent, textDecoration: "none", border: "1px solid " + T.border, borderRadius: 8, padding: "7px 12px", background: "white" }}>↓ Export CFO campaign CSV (LinkedHelper)</a>
      </div>

      {/* Counts — click a box to filter the list below to just those names */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <Stat label="Total confirmed" value={c.confirmed || 0} sub={shortOf > 0 ? (shortOf + " short of " + (ev.min_to_run || 8)) : "at go threshold"} good={shortOf === 0} active={filter === "confirmed"} onClick={function () { toggleFilter("confirmed") }} />
        <Stat label="CFOs confirmed" value={c.cfo_confirmed || 0} sub="" active={filter === "cfoconfirmed"} onClick={function () { toggleFilter("cfoconfirmed") }} />
        <Stat label="Sponsors confirmed" value={c.sponsor_confirmed || 0} sub="" active={filter === "sponsorconfirmed"} onClick={function () { toggleFilter("sponsorconfirmed") }} />
        <Stat label="Attended" value={c.attended || 0} sub="actually showed" active={filter === "attended"} onClick={function () { toggleFilter("attended") }} />
        <Stat label="CFOs attended" value={c.cfo_attended || 0} sub="" active={filter === "cfoattended"} onClick={function () { toggleFilter("cfoattended") }} />
        <Stat label="Registered" value={c.registered || 0} sub="awaiting your review" highlight={(c.registered || 0) > 0} active={filter === "registered"} onClick={function () { toggleFilter("registered") }} />
        <Stat label="Invited" value={c.invited || 0} sub="total on the list" active={filter === "invited"} onClick={function () { toggleFilter("invited") }} />
        <Stat label="Declined" value={c.declined || 0} sub="" active={filter === "declined"} onClick={function () { toggleFilter("declined") }} />
        <Stat label="Unavailable" value={c.unavailable || 0} sub="wants the next one" active={filter === "unavailable"} onClick={function () { toggleFilter("unavailable") }} />
        <Stat label="No-show" value={c.no_show || 0} sub="didn't come" active={filter === "noshow"} onClick={function () { toggleFilter("noshow") }} />
      </div>
      <div style={{ minHeight: 20, marginBottom: 14 }}>
        {filter ? (
          <div style={{ fontSize: 12.5, color: T.textSecondary }}>
            Showing <strong style={{ color: T.textPrimary }}>{filter}</strong> only — {pending.length + roster.length} {(pending.length + roster.length) === 1 ? "person" : "people"}.
            <button onClick={function () { setFilter(null) }} style={{ marginLeft: 8, background: "transparent", border: "none", color: T.accent, fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: 0 }}>Clear filter ✕</button>
          </div>
        ) : (
          <div style={{ fontSize: 11.5, color: T.textTertiary }}>Tip: click a box above to see just those names.</div>
        )}
      </div>

      {waiting.length > 0 && (
        <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#92400e" }}>
            {waiting.length} {waiting.length === 1 ? "person is" : "people are"} waiting for a session
          </div>
          <div style={{ fontSize: 12, color: "#92400e", opacity: 0.85, marginTop: 3, lineHeight: 1.5 }}>
            They wanted in but couldn&rsquo;t make a previous date, and you said you&rsquo;d keep them in mind.
            They are not on this roster yet.
          </div>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 7 }}>
            {waiting.map(function (w) {
              return (
                <div key={w.id} style={{ background: "white", border: "1px solid #fde68a", borderRadius: 8, padding: "9px 11px", display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary }}>
                      {w.full_name}
                      {w.company && <span style={{ fontWeight: 400, color: T.textTertiary }}> · {w.company}</span>}
                    </div>
                    {w.reason && <div style={{ fontSize: 11.5, color: T.textSecondary, marginTop: 2 }}>Said: {w.reason}</div>}
                    {w.promised && <div style={{ fontSize: 11.5, color: "#92400e", marginTop: 2 }}>You promised: {w.promised}</div>}
                    <div style={{ fontSize: 10.5, color: T.textTertiary, marginTop: 3 }}>
                      Missed {w.from_event || "a previous session"}{w.from_event_date ? " · " + shortDate(w.from_event_date) : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={function () { inviteFromWaiting(w) }}
                      style={{ fontSize: 11.5, fontWeight: 600, padding: "5px 11px", borderRadius: 6, border: "none", background: "#16a34a", color: "white", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                      Add to this session
                    </button>
                    <button onClick={function () {
                        if (!confirm("Stop carrying " + w.full_name + " forward? The record stays on their timeline.")) return
                        fetch("/api/events/carry-forward", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ person_id: w.person_id, action: "drop" }) })
                          .then(function () { loadWaiting() })
                      }}
                      style={{ fontSize: 11.5, padding: "5px 9px", borderRadius: 6, border: "1px solid " + T.border, background: "white", color: T.textTertiary, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                      Not this one
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {msg ? <div style={{ background: "#fffdf5", border: "1px solid #f1e2b8", color: T.textPrimary, borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 18 }}>{msg}{draftUrl ? <a href={draftUrl} target="_blank" rel="noopener" style={{ color: T.accent, marginLeft: 10, fontWeight: 600, textDecoration: "none" }}>Open draft →</a> : null}</div> : null}

      {/* Search — find one person in a long roster without scrolling */}
      <div style={{ marginBottom: 18, position: "relative", maxWidth: 340 }}>
        <input
          value={q}
          onChange={function (e) { setQ(e.target.value) }}
          placeholder="Search this event by name, company, or email…"
          style={{ width: "100%", boxSizing: "border-box", padding: "8px 30px 8px 12px", fontSize: 13, fontFamily: "inherit", border: "1px solid " + T.border, borderRadius: 8, background: "white", color: T.textPrimary }}
        />
        {q ? (
          <button onClick={function () { setQ("") }} title="Clear search"
            style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: T.textTertiary, fontSize: 14, cursor: "pointer", lineHeight: 1, padding: 0 }}>✕</button>
        ) : null}
        {needle ? (
          <div style={{ fontSize: 11.5, color: T.textTertiary, marginTop: 5 }}>
            {pending.length + roster.length} {(pending.length + roster.length) === 1 ? "match" : "matches"} for &ldquo;{q.trim()}&rdquo;
          </div>
        ) : null}
      </div>

      {/* Pending */}
      <div style={{ fontSize: 13, fontWeight: 600, color: T.brass || "#b7791f", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>Pending requests</div>
      {pending.length === 0 ? (
        <div style={{ color: T.textTertiary, fontSize: 14, marginBottom: 26 }}>{needle ? "No pending requests match your search." : "No requests waiting. New self-registrations land here."}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 30 }}>
          {pending.map(function (a) {
            return (
              <div key={a.id} style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: 12, minWidth: 0 }}>
                    <Avatar name={a.name} src={a.avatar_url} />
                    <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: T.textPrimary }}>{a.person_id ? <Link href={"/people/" + a.person_id} style={{ color: T.textPrimary, textDecoration: "none" }}>{a.name || "(no name)"}</Link> : (a.name || "(no name)")}{a.company ? <span style={{ fontWeight: 400, color: T.textSecondary }}>{"  ·  " + a.company}</span> : null}</div>
                    <div style={{ fontSize: 13, color: T.textSecondary, marginTop: 2 }}>{a.email || ""}</div>
                    {a.notes ? <div style={{ fontSize: 13, color: T.textSecondary, marginTop: 6 }}>{a.notes}</div> : null}
                    <div style={{ marginTop: 8 }}><PillTrack a={a} /></div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button disabled={busy === a.id} onClick={function () { setStatus(a.id, "Invited", a.name) }} style={btnPrimary}>Approve</button>
                    <button disabled={busy === a.id} onClick={function () { markUnavailable(a) }} style={btnGhost}>Can't make it</button>
                    <button disabled={busy === a.id} onClick={function () { setStatus(a.id, "Declined", a.name) }} style={btnGhost}>Decline</button>
                    {a.person_id ? (
                      <button disabled={busy === a.id}
                        onClick={function () { setMergeFor(mergeFor === a.id ? null : a.id); setMergeQ(""); setMergeResults([]) }}
                        style={/Possible duplicate/i.test(a.notes || "") ? btnDupe : btnGhost}
                        title="This registrant is already in PeerChair under another record — merge them">
                        {/Possible duplicate/i.test(a.notes || "") ? "⚠ Merge duplicate" : "Merge…"}
                      </button>
                    ) : null}
                  </div>
                </div>

                {mergeFor === a.id ? (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid " + T.borderSoft }}>
                    <div style={{ fontSize: 12, color: T.textSecondary, marginBottom: 6 }}>
                      Find the record <strong>{a.name}</strong> already exists under — the registration will move onto it.
                    </div>
                    <input autoFocus value={mergeQ} onChange={function (e) { setMergeQ(e.target.value) }}
                      placeholder="Search by name, company, or email…"
                      style={{ width: "100%", maxWidth: 360, boxSizing: "border-box", padding: "8px 12px", fontSize: 13, fontFamily: "inherit", border: "1px solid " + T.border, borderRadius: 8, background: "white" }} />
                    {mergeResults.length ? (
                      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4, maxWidth: 480 }}>
                        {mergeResults.filter(function (r) { return r.id !== a.person_id }).map(function (r) {
                          return (
                            <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "white", border: "1px solid " + T.border, borderRadius: 8, padding: "8px 11px" }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary }}>{r.name}</div>
                                <div style={{ fontSize: 11.5, color: T.textTertiary }}>{[r.email, r.company, (r.roles || []).join(", ")].filter(Boolean).join(" · ") || "no details"}</div>
                              </div>
                              <button disabled={busy === a.id} onClick={function () { doMerge(a.person_id, r) }}
                                style={{ flexShrink: 0, fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 7, border: "none", background: "#16a34a", color: "white", cursor: "pointer", fontFamily: "inherit" }}>
                                Merge into this
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    ) : (mergeQ.trim().length >= 2 ? <div style={{ fontSize: 12, color: T.textTertiary, marginTop: 8 }}>No matches.</div> : null)}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      {/* Roster */}
      <div style={{ fontSize: 13, fontWeight: 600, color: T.textTertiary, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>Invited &amp; confirmed</div>
      {roster.length === 0 ? (
        <div style={{ color: T.textTertiary, fontSize: 14 }}>{filter ? "No one on the roster matches this filter." : "No one invited yet."}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {roster.map(function (a) {
            return (
              <div key={a.id} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, background: T.cardBg, border: "1px solid " + T.border, borderRadius: 8, padding: "11px 14px" }}>
                <div style={{ display: "flex", gap: 12, minWidth: 0 }}>
                  <Avatar name={a.name} src={a.avatar_url} size={36} />
                  <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    {a.person_id ? <Link href={"/people/" + a.person_id} style={{ fontSize: 14, color: T.textPrimary, fontWeight: 600, textDecoration: "none" }}>{a.name || "(no name)"}</Link> : <span style={{ fontSize: 14, color: T.textPrimary, fontWeight: 600 }}>{a.name || "(no name)"}</span>}
                    {(a.roles || []).includes("cfo") ? <span title="CFO" style={{ fontSize: 10, fontWeight: 700, color: "#c2410c", background: "#ffedd5", border: "1px solid #f4b183", borderRadius: 999, padding: "1px 7px", lineHeight: 1.5 }}>CFO</span> : null}
                    {(a.roles || []).includes("sponsor_contact") ? <span title="Sponsor" style={{ fontSize: 10, fontWeight: 700, color: "#0f766e", background: "#ccfbf1", border: "1px solid #5eead4", borderRadius: 999, padding: "1px 7px", lineHeight: 1.5 }}>Sponsor</span> : null}
                    {a.cfo_circle_member ? <span title="CFO Circle" style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: "#ea580c", borderRadius: 999, padding: "1px 7px", lineHeight: 1.5 }}>CFO Circle</span> : null}
                    {a.linkedin_url ? <a href={a.linkedin_url} target="_blank" rel="noopener noreferrer" title="Open in LinkedIn" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: 3, background: "#0a66c2", color: "#fff", fontSize: 10, fontWeight: 700, textDecoration: "none", lineHeight: 1, flexShrink: 0 }}>in</a> : null}
                    {a.linkedin_connected ? <span title="First-degree connection — you can DM them" style={{ fontSize: 10, fontWeight: 700, color: "#0a66c2", border: "1px solid #0a66c2", borderRadius: 999, padding: "1px 6px", lineHeight: 1.5 }}>1st</span> : null}
                    {a.company ? <span style={{ fontSize: 13, color: T.textSecondary, fontWeight: 500 }}>{a.company}</span> : null}
                    {["Unavailable", "Declined", "No-show", "Attended"].indexOf(a.status) !== -1 ? statusChip(a.status) : null}
                  </div>
                  <div style={{ marginTop: 6 }}><PillTrack a={a} /></div>
                  {a.email ? <div style={{ marginTop: 5 }}><a href={"mailto:" + a.email} style={{ fontSize: 12, color: T.accent, textDecoration: "none" }}>{a.email}</a></div> : null}
                  {a.notes || a.title ? <div style={{ fontSize: 12, color: T.textTertiary, marginTop: 3 }}>{a.notes || a.title}</div> : null}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end", flexShrink: 0 }}>
                  {a.confirmation_sent_at ? (
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: "#15803d", background: "#dcfce7", border: "1px solid #a7e0b8", borderRadius: 6, padding: "3px 8px", whiteSpace: "nowrap" }}>✓ Confirmation sent {shortDate(a.confirmation_sent_at)}</span>
                  ) : a.confirmation_draft_weblink ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: "#9a3412", background: "#ffe4d6", border: "1px solid #f4a273", borderRadius: 6, padding: "3px 8px", whiteSpace: "nowrap" }}>⚠ Confirmation NOT sent</span>
                      <div style={{ display: "flex", gap: 10 }}>
                        <a href={a.confirmation_draft_weblink} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#0a66c2", textDecoration: "none" }}>Open draft</a>
                        <button disabled={busy === a.id} onClick={function () { regenerateConfirmation(a.id, a.name) }} style={{ background: "transparent", color: "#0a66c2", border: "none", fontSize: 12, cursor: "pointer" }}>Regenerate</button>
                        <button disabled={busy === a.id} onClick={function () { markConfirmation(a.id, true) }} style={{ background: "transparent", color: "#15803d", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Mark sent</button>
                      </div>
                    </div>
                  ) : (a.status === "Confirmed" || (a.registered_at && a.approved_at)) ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: "#991b1b", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "3px 8px", whiteSpace: "nowrap" }}>⚠ No confirmation draft</span>
                      <div style={{ fontSize: 10.5, color: "#b91c1c", maxWidth: 200, textAlign: "right", lineHeight: 1.4 }}>
                        {a.confirmation_draft_error || "Draft was never created — they have no venue details."}
                      </div>
                      <button disabled={busy === a.id} onClick={function () { regenerateConfirmation(a.id, a.name) }} style={{ background: "transparent", color: "#0a66c2", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}>Regenerate draft</button>
                    </div>
                  ) : null}
                  {a.status === "Unavailable" || a.status === "Declined" ? (
                    <span style={{ fontSize: 11.5, color: "#92400e", textAlign: "right", maxWidth: 210 }}>
                      {a.status === "Unavailable" ? "Can't make this one — on your carry-forward list." : "Declined."}
                      {a.unavailable_note ? <span style={{ display: "block", color: T.textTertiary, marginTop: 2 }}>&ldquo;{a.unavailable_note.slice(0, 90)}{a.unavailable_note.length > 90 ? "\u2026" : ""}&rdquo;</span> : null}
                    </span>
                  ) : (
                    <>
                      <button onClick={function () { copy(a.invite_url) }} style={btnLink}>Copy approved link</button>
                      {a.status !== "No-show" && a.status !== "Attended" ? <button disabled={busy === a.id} onClick={function () { setStatus(a.id, "Attended", a.name) }} title="They showed up — mark attended (adds a CFO Workshop pill to their profile)" style={{ background: "transparent", color: "#166534", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Mark attended</button> : null}
                      {!a.approved_at && a.status !== "No-show" ? <button disabled={busy === a.id} onClick={function () { setStatus(a.id, "Confirmed", a.name) }} title="They told you they're coming — confirm them and draft their details email" style={{ background: "transparent", color: "#15803d", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Mark confirmed</button> : null}
                      {a.status !== "No-show" ? <button disabled={busy === a.id} onClick={function () { markUnavailable(a) }} title="They told you they can't make this date" style={{ background: "transparent", color: "#92400e", border: "none", fontSize: 12, cursor: "pointer" }}>Can&rsquo;t make it</button> : null}
                      {a.status !== "No-show" ? <button disabled={busy === a.id} onClick={function () { setStatus(a.id, "No-show", a.name) }} style={{ background: "transparent", color: "#b3452f", border: "none", fontSize: 12, cursor: "pointer" }}>Mark no-show</button> : null}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Avatar({ name, src, size }) {
  const s = size || 40
  const initials = (name || "?").split(/\s+/).map(function (w) { return w[0] }).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?"
  const [broken, setBroken] = useState(false)
  const box = { width: s, height: s, borderRadius: "50%", flexShrink: 0, background: T.borderSoft }
  if (src && !broken) {
    return <img src={src} alt={name || ""} onError={function () { setBroken(true) }}
      style={Object.assign({}, box, { objectFit: "cover" })} />
  }
  return <div style={Object.assign({}, box, { display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: s * 0.36, fontWeight: 600, color: T.textSecondary })}>{initials}</div>
}

function Stat({ label, value, sub, highlight, good, active, onClick }) {
  const clickable = typeof onClick === "function"
  return (
    <div onClick={onClick} role={clickable ? "button" : undefined} tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick() } } : undefined}
      title={clickable ? (active ? "Showing only these — click to clear" : "Click to show only " + label) : undefined}
      style={{
        background: active ? "#eef4ff" : (highlight ? "#fffdf5" : T.cardBg),
        border: "1px solid " + (active ? "#3b82f6" : (highlight ? "#f1e2b8" : T.border)),
        boxShadow: active ? "0 0 0 2px rgba(59,130,246,0.25)" : "none",
        borderRadius: 10, padding: "14px 18px", minWidth: 150,
        cursor: clickable ? "pointer" : "default", userSelect: "none",
        transition: "border-color .12s, box-shadow .12s, background .12s",
      }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: good ? T.success : T.textPrimary }}>{value}</div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: T.textSecondary, marginTop: 2 }}>{label}</div>
      {sub ? <div style={{ fontSize: 11.5, color: T.textTertiary, marginTop: 2 }}>{sub}</div> : null}
    </div>
  )
}

const btnPrimary = { background: "#16a34a", color: "white", border: "none", fontSize: 13, fontWeight: 600, padding: "8px 16px", borderRadius: 7, cursor: "pointer" }
const btnGhost = { background: "white", color: "#475569", border: "1px solid #e7e8ec", fontSize: 13, fontWeight: 500, padding: "8px 14px", borderRadius: 7, cursor: "pointer" }
const btnDupe = { background: "#fffbeb", color: "#92400e", border: "1px solid #fcd34d", fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 7, cursor: "pointer" }
const btnLink = { background: "transparent", color: "#2563eb", border: "none", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }
