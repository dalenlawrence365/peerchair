"use client"
import { useState, useEffect } from "react"

var G   = "#f0c84a"
var BG  = "#080f1a"
var BG2 = "#0c1520"
var T   = {
  text:"#e8f2ff", muted:"#7a9bb8", dim:"#3a5a74",
  green:"#2ecc71", red:"#e74c3c", orange:"#e67e22",
  blue:"#4a9eba", purple:"#9b59b6"
}

function typeColor(t) {
  if (t==="sponsor_discovery") return T.purple
  if (t==="fit_call_30")       return T.blue
  return G
}
function typeLabel(t) {
  if (t==="sponsor_discovery") return "Sponsor Discovery"
  if (t==="fit_call_30")       return "Fit Call — 30 min"
  return "Fit Chat"
}
function fDate(iso) {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"})
}
function fTime(iso) {
  if (!iso) return ""
  return new Date(iso).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:true,timeZone:"America/Los_Angeles"})+" PT"
}
function fShortDate(iso) {
  return new Date(iso).toLocaleDateString("en-US",{month:"short",day:"numeric"})
}

function groupByBucket(meetings) {
  var now   = new Date()
  var today = new Date(now.getFullYear(),now.getMonth(),now.getDate())
  var buckets = { today:[], thisWeek:[], nextWeek:[], later:[] }
  meetings.forEach(function(m) {
    var d = new Date(m.start_time)
    var day = new Date(d.getFullYear(),d.getMonth(),d.getDate())
    var diff = Math.round((day-today)/86400000)
    if (diff===0)      buckets.today.push(m)
    else if (diff<=7)  buckets.thisWeek.push(m)
    else if (diff<=14) buckets.nextWeek.push(m)
    else               buckets.later.push(m)
  })
  return buckets
}

function Avatar({ name, size }) {
  size = size||44
  var parts=(name||"?").split(" ")
  var initials=((parts[0]||"")[0]||"")+((parts[1]||"")[0]||"")
  return (
    <div style={{width:size,height:size,borderRadius:"50%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:G,flexShrink:0}}>
      {initials.toUpperCase()}
    </div>
  )
}

function MeetingCard({ meeting, onNavigate }) {
  var color    = typeColor(meeting.event_type)
  var name     = meeting.invitee?.name  || "Unknown"
  var company  = meeting.contact?.company || meeting.invitee?.email || "—"
  var title    = meeting.contact?.title || ""
  var stage    = meeting.contact?.stage || ""
  var matched  = meeting.peerchair_matched
  var correct  = meeting.peerchair_stage_correct
  var isToday  = meeting.countdown && (meeting.countdown.includes("h") || meeting.countdown.includes("m"))

  return (
    <div style={{
      background: isToday ? "rgba(240,200,74,0.04)" : "rgba(255,255,255,0.02)",
      border:"1px solid "+(isToday ? "rgba(240,200,74,0.2)" : "rgba(255,255,255,0.07)"),
      borderLeft:"4px solid "+color,
      borderRadius:8, padding:"18px 20px",
      boxShadow: isToday ? "0 0 24px rgba(240,200,74,0.06)" : "none",
    }}>
      <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
        <Avatar name={name} size={44}/>

        {/* Main content */}
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8,marginBottom:6}}>

            {/* Left: name + company */}
            <div>
              <div style={{fontSize:16,fontWeight:600,color:"#fff",marginBottom:2}}>{name}</div>
              <div style={{fontSize:13,color:T.muted}}>{title}{title&&company?" · ":""}{company}</div>
            </div>

            {/* Right: time + countdown */}
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontSize:15,fontWeight:600,color:isToday?G:T.text}}>{fTime(meeting.start_time)}</div>
              {meeting.countdown && (
                <div style={{fontSize:11,color:isToday?G:T.dim,marginTop:2,fontWeight:isToday?700:400}}>
                  {isToday?"⚡ ":""}{meeting.countdown}
                </div>
              )}
            </div>
          </div>

          {/* Meta row */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginBottom:10}}>
            <span style={{fontSize:10,padding:"2px 8px",borderRadius:9,background:color+"12",border:"1px solid "+color+"25",color,fontWeight:600}}>
              {typeLabel(meeting.event_type)}
            </span>
            {matched ? (
              <span style={{fontSize:10,padding:"2px 8px",borderRadius:9,background:"rgba(46,204,113,0.1)",border:"1px solid rgba(46,204,113,0.2)",color:T.green}}>
                ✓ Matched
              </span>
            ) : (
              <span style={{fontSize:10,padding:"2px 8px",borderRadius:9,background:"rgba(231,76,60,0.1)",border:"1px solid rgba(231,76,60,0.2)",color:T.red}}>
                ✗ Not in PeerChair
              </span>
            )}
            {matched && !correct && (
              <span style={{fontSize:10,padding:"2px 8px",borderRadius:9,background:"rgba(230,126,34,0.1)",border:"1px solid rgba(230,126,34,0.2)",color:T.orange}}>
                ⚠ Stage: {stage}
              </span>
            )}
            {matched && correct && (
              <span style={{fontSize:10,padding:"2px 8px",borderRadius:9,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:T.dim}}>
                {stage}
              </span>
            )}
          </div>

          {/* Invitee notes */}
          {meeting.invitee?.notes && (
            <div style={{fontSize:12,color:T.muted,fontStyle:"italic",marginBottom:10,paddingLeft:10,borderLeft:"2px solid rgba(255,255,255,0.08)"}}>
              "{meeting.invitee.notes}"
            </div>
          )}

          {/* Action row */}
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            {meeting.zoom_url && (
              <a href={meeting.zoom_url} target="_blank" rel="noreferrer"
                style={{padding:"6px 16px",background:"rgba(74,154,186,0.12)",border:"1px solid rgba(74,154,186,0.3)",color:T.blue,borderRadius:5,fontSize:12,fontWeight:600,textDecoration:"none"}}>
                Join Zoom →
              </a>
            )}
            {matched && onNavigate && (
              <button onClick={function(){
                onNavigate("profile",{
                  id:meeting.contact.id,
                  first_name:meeting.contact.name.split(" ")[0],
                  last_name:meeting.contact.name.split(" ").slice(1).join(" "),
                  company_name:meeting.contact.company
                })
              }} style={{padding:"6px 16px",background:"rgba(240,200,74,0.08)",border:"1px solid rgba(240,200,74,0.2)",color:G,borderRadius:5,fontSize:12,fontWeight:600,cursor:"pointer"}}>
                Open in Pipeline
              </button>
            )}
            {meeting.invitee?.reschedule_url && (
              <a href={meeting.invitee.reschedule_url} target="_blank" rel="noreferrer"
                style={{padding:"6px 12px",background:"transparent",border:"1px solid rgba(255,255,255,0.08)",color:T.muted,borderRadius:5,fontSize:12,textDecoration:"none"}}>
                Reschedule
              </a>
            )}
            {meeting.invitee?.cancel_url && (
              <a href={meeting.invitee.cancel_url} target="_blank" rel="noreferrer"
                style={{padding:"6px 12px",background:"transparent",border:"1px solid rgba(231,76,60,0.15)",color:T.red,borderRadius:5,fontSize:12,textDecoration:"none",opacity:0.7}}>
                Cancel
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function PastCard({ meeting, onNavigate }) {
  var color   = typeColor(meeting.event_type)
  var name    = meeting.invitee?.name || "Unknown"
  var company = meeting.contact?.company || meeting.invitee?.email || "—"
  var matched = meeting.peerchair_matched

  return (
    <div style={{
      background:"rgba(255,255,255,0.01)",
      border:"1px solid rgba(255,255,255,0.05)",
      borderLeft:"3px solid "+color+"60",
      borderRadius:6,padding:"12px 16px",opacity:0.75,
      display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"
    }}>
      <Avatar name={name} size={34}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
          <div>
            <span style={{fontSize:13,fontWeight:600,color:T.muted}}>{name}</span>
            <span style={{fontSize:12,color:T.dim}}>{company?" · "+company:""}</span>
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <span style={{fontSize:11,color:T.dim}}>{fShortDate(meeting.start_time)} · {fTime(meeting.start_time)}</span>
            <span style={{fontSize:9,padding:"1px 7px",borderRadius:9,background:color+"10",border:"1px solid "+color+"20",color}}>{typeLabel(meeting.event_type)}</span>
            {matched
              ? <span style={{fontSize:9,padding:"1px 7px",borderRadius:9,background:"rgba(46,204,113,0.08)",border:"1px solid rgba(46,204,113,0.15)",color:T.green}}>✓</span>
              : <span style={{fontSize:9,padding:"1px 7px",borderRadius:9,background:"rgba(231,76,60,0.08)",border:"1px solid rgba(231,76,60,0.15)",color:T.red}}>✗</span>
            }
          </div>
        </div>
      </div>
      {matched && onNavigate && (
        <button onClick={function(){
          onNavigate("profile",{
            id:meeting.contact.id,
            first_name:meeting.contact.name.split(" ")[0],
            last_name:meeting.contact.name.split(" ").slice(1).join(" "),
            company_name:meeting.contact.company
          })
        }} style={{padding:"4px 12px",background:"rgba(240,200,74,0.06)",border:"1px solid rgba(240,200,74,0.15)",color:G,borderRadius:4,fontSize:11,cursor:"pointer",flexShrink:0}}>
          Open
        </button>
      )}
    </div>
  )
}

function BucketSection({ title, meetings, onNavigate, isPast }) {
  if (meetings.length===0) return null
  return (
    <div style={{marginBottom:32}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
        <div style={{fontSize:10,letterSpacing:3,textTransform:"uppercase",color:G,fontWeight:600}}>{title}</div>
        <div style={{flex:1,height:1,background:"rgba(240,200,74,0.12)"}}/>
        <div style={{fontSize:11,color:T.dim}}>{meetings.length} meeting{meetings.length!==1?"s":""}</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap: isPast?6:10}}>
        {meetings.map(function(m){
          return isPast
            ? <PastCard key={m.id} meeting={m} onNavigate={onNavigate}/>
            : <MeetingCard key={m.id} meeting={m} onNavigate={onNavigate}/>
        })}
      </div>
    </div>
  )
}

export default function Meetings({ onNavigate }) {
  var [upcoming, setUpcoming] = useState([])
  var [past,     setPast]     = useState([])
  var [loading,  setLoading]  = useState(true)
  var [error,    setError]    = useState("")
  var [showPast, setShowPast] = useState(true)

  useEffect(function(){ load() },[])

  async function load() {
    setLoading(true); setError("")
    try {
      var res = await fetch("/api/meetings")
      var d   = await res.json()
      if (d.error) { setError(d.error); setLoading(false); return }
      setUpcoming(d.upcoming||[])
      setPast(d.past||[])
    } catch(e) { setError(e.message) }
    setLoading(false)
  }

  var buckets       = groupByBucket(upcoming)
  var totalUpcoming = upcoming.length
  var totalPast     = past.length
  var unmatched     = [...upcoming,...past].filter(function(m){return !m.peerchair_matched}).length
  var mismatched    = [...upcoming,...past].filter(function(m){return m.peerchair_matched&&!m.peerchair_stage_correct}).length

  return (
    <div style={{fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,serif",height:"100%",overflowY:"auto",background:BG,padding:"24px 32px"}}>

      {/* Page header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:28}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:600,color:"#fff",margin:0,marginBottom:4}}>Meetings</h1>
          <div style={{fontSize:13,color:T.muted}}>
            {totalUpcoming} upcoming · {totalPast} in last 60 days
            {unmatched>0 && <span style={{marginLeft:12,color:T.red}}>⚠ {unmatched} unmatched</span>}
            {mismatched>0 && <span style={{marginLeft:8,color:T.orange}}>⚠ {mismatched} stage mismatch</span>}
          </div>
        </div>
        <button onClick={load} disabled={loading} style={{padding:"7px 16px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",color:T.muted,borderRadius:5,cursor:"pointer",fontSize:12}}>
          {loading?"Loading…":"↺ Refresh"}
        </button>
      </div>

      {loading && (
        <div style={{textAlign:"center",padding:"80px 0",color:T.dim}}>
          <div style={{fontSize:28,marginBottom:12,opacity:0.4}}>📅</div>
          <div style={{fontSize:14}}>Loading from Calendly…</div>
        </div>
      )}

      {error && (
        <div style={{padding:"16px 20px",background:"rgba(231,76,60,0.08)",border:"1px solid rgba(231,76,60,0.2)",borderRadius:8,color:T.red,fontSize:13,marginBottom:20}}>
          {error}
        </div>
      )}

      {!loading && !error && totalUpcoming===0 && (
        <div style={{textAlign:"center",padding:"60px 0",color:T.dim}}>
          <div style={{fontSize:28,marginBottom:12,opacity:0.3}}>📅</div>
          <div style={{fontSize:14}}>No upcoming meetings</div>
          <div style={{fontSize:12,marginTop:6,opacity:0.7}}>Share your Calendly link to start booking fit calls</div>
        </div>
      )}

      {/* Upcoming buckets */}
      {!loading && <>
        <BucketSection title="Today"      meetings={buckets.today}    onNavigate={onNavigate} isPast={false}/>
        <BucketSection title="This Week"  meetings={buckets.thisWeek} onNavigate={onNavigate} isPast={false}/>
        <BucketSection title="Next Week"  meetings={buckets.nextWeek} onNavigate={onNavigate} isPast={false}/>
        <BucketSection title="Coming Up"  meetings={buckets.later}    onNavigate={onNavigate} isPast={false}/>

        {/* Past meetings — collapsible */}
        {totalPast > 0 && (
          <div style={{marginTop:16}}>
            <button onClick={function(){setShowPast(function(v){return !v;});}} style={{display:"flex",alignItems:"center",gap:10,background:"transparent",border:"none",cursor:"pointer",padding:"6px 0",marginBottom:showPast?14:0}}>
              <div style={{fontSize:10,letterSpacing:3,textTransform:"uppercase",color:T.dim,fontWeight:600}}>
                Past Meetings ({totalPast})
              </div>
              <div style={{flex:1,height:1,background:"rgba(255,255,255,0.06)",width:120}}/>
              <div style={{fontSize:11,color:T.dim}}>{showPast?"▲ hide":"▼ show"}</div>
            </button>
            {showPast && (
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {past.map(function(m){
                  return <PastCard key={m.id} meeting={m} onNavigate={onNavigate}/>
                })}
              </div>
            )}
          </div>
        )}
      </>}
    </div>
  )
}
