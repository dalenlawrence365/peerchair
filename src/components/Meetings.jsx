"use client"
import { useState, useEffect } from "react"

var G   = "#f0c84a"
var BG  = "#080f1a"
var BG2 = "#0c1520"
var BG3 = "#0f1e2e"
var T   = {
  text:"#e8f2ff", muted:"#7a9bb8", dim:"#3a5a74",
  border:"rgba(255,255,255,0.06)",
  green:"#2ecc71", red:"#e74c3c", orange:"#e67e22",
  blue:"#4a9eba", purple:"#9b59b6"
}

function typeColor(event_type) {
  if (event_type === "sponsor_discovery") return T.purple
  if (event_type === "fit_call_30")       return T.blue
  return G
}

function typeLabel(event_type) {
  if (event_type === "sponsor_discovery") return "Sponsor Discovery"
  if (event_type === "fit_call_30")       return "Fit Call — 30 min"
  return "Fit Chat"
}

function formatDate(iso) {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("en-US", {
    weekday:"short", month:"short", day:"numeric", year:"numeric"
  })
}

function formatTime(iso) {
  if (!iso) return ""
  return new Date(iso).toLocaleTimeString("en-US", {
    hour:"numeric", minute:"2-digit", hour12:true,
    timeZone:"America/Los_Angeles"
  }) + " PT"
}

function Avatar({ name, size }) {
  size = size || 36
  var parts = (name || "?").split(" ")
  var initials = (parts[0]?.[0] || "") + (parts[1]?.[0] || "")
  return (
    <div style={{width:size,height:size,borderRadius:"50%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:size>40?14:11,fontWeight:700,color:G,flexShrink:0}}>
      {initials.toUpperCase()}
    </div>
  )
}

function MeetingCard({ meeting, selected, onClick }) {
  var isUpcoming = meeting.is_upcoming
  var color = typeColor(meeting.event_type)
  var isSelected = selected

  return (
    <div onClick={onClick} style={{
      padding:"12px 14px", borderRadius:6, cursor:"pointer",
      background: isSelected ? "rgba(240,200,74,0.06)" : "rgba(255,255,255,0.01)",
      border:"1px solid " + (isSelected ? G+"40" : "rgba(255,255,255,0.06)"),
      borderLeft:"3px solid " + (isSelected ? G : color),
      marginBottom:6, transition:"all 0.1s"
    }}>
      <div style={{display:"flex", gap:10, alignItems:"flex-start"}}>
        <Avatar name={meeting.invitee?.name || "?"} size={34}/>
        <div style={{flex:1, minWidth:0}}>
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:2}}>
            <span style={{fontSize:13, fontWeight:600, color:isSelected?"#fff":T.text}}>
              {meeting.invitee?.name || "Unknown"}
            </span>
            {isUpcoming && meeting.countdown && (
              <span style={{fontSize:10, padding:"1px 8px", borderRadius:9, background:color+"12", border:"1px solid "+color+"30", color, fontWeight:600, flexShrink:0}}>
                {meeting.countdown}
              </span>
            )}
          </div>
          <div style={{fontSize:11, color:T.muted, marginBottom:3}}>
            {meeting.contact?.company || meeting.invitee?.email || "—"}
          </div>
          <div style={{fontSize:12, color:T.dim}}>
            {formatDate(meeting.start_time)} · {formatTime(meeting.start_time)}
          </div>
          <div style={{display:"flex", gap:5, marginTop:5, flexWrap:"wrap"}}>
            <span style={{fontSize:9, padding:"1px 6px", borderRadius:3, background:color+"10", border:"1px solid "+color+"20", color}}>
              {typeLabel(meeting.event_type)}
            </span>
            {meeting.peerchair_matched ? (
              <span style={{fontSize:9, padding:"1px 6px", borderRadius:3, background:"rgba(46,204,113,0.1)", border:"1px solid rgba(46,204,113,0.2)", color:T.green}}>
                ✓ IN PEERCHAIR
              </span>
            ) : (
              <span style={{fontSize:9, padding:"1px 6px", borderRadius:3, background:"rgba(231,76,60,0.1)", border:"1px solid rgba(231,76,60,0.2)", color:T.red}}>
                ✗ NOT MATCHED
              </span>
            )}
            {meeting.peerchair_matched && !meeting.peerchair_stage_correct && (
              <span style={{fontSize:9, padding:"1px 6px", borderRadius:3, background:"rgba(230,126,34,0.1)", border:"1px solid rgba(230,126,34,0.2)", color:T.orange}}>
                ⚠ STAGE MISMATCH
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MeetingDetail({ meeting, onNavigate }) {
  if (!meeting) return (
    <div style={{flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12, color:T.dim}}>
      <div style={{fontSize:32, opacity:0.3}}>📅</div>
      <div style={{fontSize:14}}>Select a meeting</div>
    </div>
  )

  var color = typeColor(meeting.event_type)
  var isUpcoming = meeting.is_upcoming

  return (
    <div style={{flex:1, display:"flex", flexDirection:"column", overflow:"hidden", background:BG2, borderLeft:"1px solid rgba(255,255,255,0.06)"}}>

      {/* Header */}
      <div style={{padding:"16px 24px", borderBottom:"1px solid rgba(255,255,255,0.06)", background:"linear-gradient(90deg,#0c1520,#0f1e2e)", flexShrink:0}}>
        <div style={{display:"flex", alignItems:"center", gap:14}}>
          <Avatar name={meeting.invitee?.name || "?"} size={48}/>
          <div style={{flex:1}}>
            <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:3}}>
              <h2 style={{fontSize:18, fontWeight:600, color:"#fff", margin:0}}>
                {meeting.invitee?.name || "Unknown Invitee"}
              </h2>
              <span style={{fontSize:10, padding:"2px 9px", borderRadius:9, background:color+"12", border:"1px solid "+color+"30", color, fontWeight:600}}>
                {typeLabel(meeting.event_type)}
              </span>
              {isUpcoming && meeting.countdown && (
                <span style={{fontSize:10, padding:"2px 9px", borderRadius:9, background:"rgba(46,204,113,0.12)", border:"1px solid rgba(46,204,113,0.3)", color:T.green, fontWeight:600}}>
                  {meeting.countdown}
                </span>
              )}
            </div>
            <div style={{fontSize:12, color:T.muted}}>
              {meeting.contact?.company || meeting.invitee?.email || "—"}
            </div>
          </div>
          {meeting.zoom_url && isUpcoming && (
            <a href={meeting.zoom_url} target="_blank" rel="noreferrer" style={{padding:"8px 18px", background:"rgba(74,154,186,0.12)", border:"1px solid rgba(74,154,186,0.35)", color:T.blue, borderRadius:6, fontSize:13, fontWeight:600, textDecoration:"none", flexShrink:0}}>
              Join Zoom →
            </a>
          )}
        </div>
      </div>

      <div style={{flex:1, overflowY:"auto", padding:"20px 24px", display:"flex", flexDirection:"column", gap:20}}>

        {/* Time + date */}
        <div style={{background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:8, padding:"14px 18px"}}>
          <div style={{fontSize:10, color:T.dim, letterSpacing:2, textTransform:"uppercase", marginBottom:10}}>Meeting Time</div>
          <div style={{fontSize:20, fontWeight:600, color:isUpcoming?G:T.muted}}>{formatDate(meeting.start_time)}</div>
          <div style={{fontSize:14, color:T.muted, marginTop:3}}>{formatTime(meeting.start_time)} — {formatTime(meeting.end_time)}</div>
          {meeting.invitee?.timezone && (
            <div style={{fontSize:11, color:T.dim, marginTop:4}}>Invitee timezone: {meeting.invitee.timezone}</div>
          )}
        </div>

        {/* PeerChair match */}
        <div style={{background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:8, padding:"14px 18px"}}>
          <div style={{fontSize:10, color:T.dim, letterSpacing:2, textTransform:"uppercase", marginBottom:10}}>PeerChair Status</div>
          {meeting.peerchair_matched ? (
            <div>
              <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:8}}>
                <span style={{fontSize:12, color:T.green, fontWeight:600}}>✓ Matched to contact</span>
              </div>
              <div style={{fontSize:14, color:T.text, fontWeight:600}}>{meeting.contact.name}</div>
              <div style={{fontSize:12, color:T.muted}}>{meeting.contact.title} · {meeting.contact.company}</div>
              <div style={{display:"flex", alignItems:"center", gap:8, marginTop:8}}>
                <span style={{fontSize:11, padding:"2px 8px", borderRadius:4, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", color:meeting.peerchair_stage_correct?T.green:T.orange}}>
                  {meeting.contact.stage}
                </span>
                {!meeting.peerchair_stage_correct && (
                  <span style={{fontSize:11, color:T.orange}}>⚠ Expected "Fit Call Scheduled"</span>
                )}
              </div>
              {onNavigate && (
                <button onClick={function(){ onNavigate("profile", {id:meeting.contact.id, first_name:meeting.contact.name.split(" ")[0], last_name:meeting.contact.name.split(" ").slice(1).join(" "), company_name:meeting.contact.company}); }} style={{marginTop:10, padding:"6px 14px", background:"rgba(240,200,74,0.1)", border:"1px solid rgba(240,200,74,0.25)", color:G, borderRadius:5, cursor:"pointer", fontSize:12, fontWeight:600}}>
                  Open in Pipeline →
                </button>
              )}
            </div>
          ) : (
            <div>
              <div style={{fontSize:12, color:T.red, fontWeight:600, marginBottom:6}}>✗ No matching contact found</div>
              <div style={{fontSize:12, color:T.muted}}>Email: {meeting.invitee?.email || "—"}</div>
              <div style={{fontSize:11, color:T.dim, marginTop:6}}>This meeting was not logged in PeerChair. Check if the contact exists under a different email or was booked by an EA.</div>
            </div>
          )}
        </div>

        {/* Invitee notes */}
        {meeting.invitee?.notes && (
          <div style={{background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:8, padding:"14px 18px"}}>
            <div style={{fontSize:10, color:T.dim, letterSpacing:2, textTransform:"uppercase", marginBottom:8}}>Invitee Notes</div>
            <div style={{fontSize:13, color:T.text, lineHeight:1.7, fontStyle:"italic"}}>"{meeting.invitee.notes}"</div>
          </div>
        )}

        {/* Zoom link (past meetings) */}
        {meeting.zoom_url && !isUpcoming && (
          <div style={{background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:8, padding:"14px 18px"}}>
            <div style={{fontSize:10, color:T.dim, letterSpacing:2, textTransform:"uppercase", marginBottom:8}}>Recording / Link</div>
            <a href={meeting.zoom_url} target="_blank" rel="noreferrer" style={{fontSize:13, color:T.blue, textDecoration:"none"}}>Zoom link (may have recording) →</a>
          </div>
        )}

        {/* Reschedule / Cancel links */}
        {meeting.invitee && meeting.is_upcoming && (
          <div style={{display:"flex", gap:8}}>
            {meeting.invitee.reschedule_url && (
              <a href={meeting.invitee.reschedule_url} target="_blank" rel="noreferrer" style={{fontSize:12, color:T.blue, padding:"6px 14px", background:"rgba(74,154,186,0.08)", border:"1px solid rgba(74,154,186,0.2)", borderRadius:5, textDecoration:"none"}}>Reschedule</a>
            )}
            {meeting.invitee.cancel_url && (
              <a href={meeting.invitee.cancel_url} target="_blank" rel="noreferrer" style={{fontSize:12, color:T.red, padding:"6px 14px", background:"rgba(231,76,60,0.08)", border:"1px solid rgba(231,76,60,0.2)", borderRadius:5, textDecoration:"none"}}>Cancel</a>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

export default function Meetings({ onNavigate }) {
  var [upcoming, setUpcoming] = useState([])
  var [past,     setPast]     = useState([])
  var [loading,  setLoading]  = useState(true)
  var [error,    setError]    = useState("")
  var [selected, setSelected] = useState(null)
  var [tab,      setTab]      = useState("upcoming") // upcoming | past

  useEffect(function() { load() }, [])

  async function load() {
    setLoading(true); setError("")
    try {
      var res = await fetch("/api/meetings")
      var d = await res.json()
      if (d.error) { setError(d.error); setLoading(false); return }
      setUpcoming(d.upcoming || [])
      setPast(d.past || [])
      var first = (d.upcoming || [])[0] || (d.past || [])[0] || null
      setSelected(first)
    } catch(e) { setError(e.message) }
    setLoading(false)
  }

  var list = tab === "upcoming" ? upcoming : past
  var unmatchedCount = [...upcoming, ...past].filter(function(m){ return !m.peerchair_matched }).length
  var mismatchCount  = [...upcoming, ...past].filter(function(m){ return m.peerchair_matched && !m.peerchair_stage_correct }).length

  return (
    <div style={{fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,serif", display:"flex", height:"100%", overflow:"hidden", background:BG}}>

      {/* LEFT */}
      <div style={{width:320, flexShrink:0, display:"flex", flexDirection:"column", borderRight:"1px solid rgba(255,255,255,0.06)", background:BG2, overflow:"hidden"}}>

        <div style={{padding:"14px 14px 10px", borderBottom:"1px solid rgba(255,255,255,0.06)", flexShrink:0}}>
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10}}>
            <div style={{fontSize:11, letterSpacing:3, color:G, textTransform:"uppercase", fontWeight:600}}>Meetings</div>
            <button onClick={load} style={{background:"transparent", border:"none", color:T.dim, cursor:"pointer", fontSize:13}}>↺</button>
          </div>

          {/* Alert badges */}
          {(unmatchedCount > 0 || mismatchCount > 0) && (
            <div style={{display:"flex", gap:6, marginBottom:8, flexWrap:"wrap"}}>
              {unmatchedCount > 0 && (
                <span style={{fontSize:10, padding:"2px 8px", borderRadius:9, background:"rgba(231,76,60,0.1)", border:"1px solid rgba(231,76,60,0.2)", color:T.red}}>
                  {unmatchedCount} unmatched
                </span>
              )}
              {mismatchCount > 0 && (
                <span style={{fontSize:10, padding:"2px 8px", borderRadius:9, background:"rgba(230,126,34,0.1)", border:"1px solid rgba(230,126,34,0.2)", color:T.orange}}>
                  {mismatchCount} stage mismatch
                </span>
              )}
            </div>
          )}

          {/* Tabs */}
          <div style={{display:"flex", gap:3}}>
            {[["upcoming","Upcoming",upcoming.length],["past","Past",past.length]].map(function(t){
              var active = tab === t[0]
              return (
                <button key={t[0]} onClick={function(){setTab(t[0]);}} style={{flex:1, padding:"5px", borderRadius:4, cursor:"pointer", border:"1px solid "+(active?G+"40":"rgba(255,255,255,0.07)"), background:active?G+"10":"transparent", color:active?G:T.muted, fontSize:11}}>
                  {t[1]} {t[2]>0 && <span style={{color:active?G:T.dim}}>({t[2]})</span>}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{flex:1, overflowY:"auto", padding:"8px 10px"}}>
          {loading && <div style={{color:T.dim, fontSize:13, textAlign:"center", padding:"40px 0"}}>Loading from Calendly…</div>}
          {error && <div style={{color:T.red, fontSize:12, textAlign:"center", padding:"20px"}}>{error}</div>}
          {!loading && list.length === 0 && (
            <div style={{textAlign:"center", padding:"40px 20px", color:T.dim}}>
              <div style={{fontSize:24, marginBottom:8, opacity:0.4}}>📅</div>
              <div style={{fontSize:13}}>{tab === "upcoming" ? "No upcoming meetings" : "No past meetings"}</div>
            </div>
          )}
          {list.map(function(m) {
            return (
              <MeetingCard
                key={m.id}
                meeting={m}
                selected={selected?.id === m.id}
                onClick={function(){ setSelected(m); }}
              />
            )
          })}
        </div>
      </div>

      {/* RIGHT */}
      <div style={{flex:1, display:"flex", flexDirection:"column", overflow:"hidden"}}>
        <MeetingDetail meeting={selected} onNavigate={onNavigate}/>
      </div>
    </div>
  )
}
