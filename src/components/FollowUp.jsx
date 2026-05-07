"use client"
import { useState, useEffect } from "react"
import SmartCommand from "@/components/SmartCommand"

var G   = "#f0c84a"
var BG  = "#080f1a"
var BG2 = "#0c1520"
var T   = {
  text:"#e8f2ff", muted:"#7a9bb8", dim:"#3a5a74",
  border:"rgba(255,255,255,0.06)",
  green:"#2ecc71", red:"#e74c3c", orange:"#e67e22",
  blue:"#4a9eba"
}

function timeAgo(iso) {
  if (!iso) return ""
  var diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 3600)  return Math.round(diff/60)  + "m ago"
  if (diff < 86400) return Math.round(diff/3600) + "h ago"
  return Math.round(diff/86400) + "d ago"
}

function Avatar({ name }) {
  var parts    = (name || "?").split(" ")
  var initials = ((parts[0]||"")[0]||"") + ((parts[1]||"")[0]||"")
  return (
    <div style={{width:38,height:38,borderRadius:"50%",flexShrink:0,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:G}}>
      {initials.toUpperCase()}
    </div>
  )
}

function signalText(item) {
  if (item.itemType === "inbound") {
    var body = item.lastMessage || item.snippet || ""
    return body.length > 90 ? body.slice(0,90)+"…" : body || "Replied"
  }
  if (item.itemType === "scheduled") {
    var when = item.send_at ? " · " + new Date(item.send_at).toLocaleDateString("en-US",{month:"short",day:"numeric"}) : ""
    return (item.note || item.message_body || "Scheduled send") + when
  }
  return item.note || "Follow-up needed"
}

function signalColor(item) {
  if (item.itemType === "inbound") {
    var b = (item.lastMessage||item.snippet||"").toLowerCase()
    if (["not interested","no thanks","no time","pass","opted out"].some(function(w){return b.includes(w)})) return T.red
    if (["interested","sounds","learn more","happy","love to","yes","sure","great"].some(function(w){return b.includes(w)})) return T.green
    return T.blue
  }
  if (item.itemType === "task") return T.orange
  return T.muted
}

function typeIcon(item) {
  if (item.itemType === "inbound")   return "💬"
  if (item.itemType === "scheduled") return "📅"
  if (item.itemType === "task")      return "✓"
  return "•"
}

function NotificationCard({ item, onClick }) {
  var name    = ((item.firstName||item.contact_first_name||"") + " " + (item.lastName||item.contact_last_name||"")).trim()
  var company = item.company || item.contact_company || ""
  var stage   = item.pipelineStage || item.pipeline_stage || ""
  var signal  = signalText(item)
  var color   = signalColor(item)
  var isOverdue = item.due_at && new Date(item.due_at) < new Date()
  var [hov, setHov] = useState(false)

  return (
    <div
      onClick={onClick}
      onMouseEnter={function(){setHov(true)}}
      onMouseLeave={function(){setHov(false)}}
      style={{
        padding:"11px 13px", borderRadius:8, cursor:"pointer", marginBottom:5,
        background: hov ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.01)",
        border:"1px solid "+(hov?"rgba(255,255,255,0.1)":"rgba(255,255,255,0.05)"),
        borderLeft:"3px solid "+color,
        transition:"all 0.1s"
      }}>
      <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
        <Avatar name={name}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
            <span style={{fontSize:13,fontWeight:600,color:T.text}}>{name||"Unknown"}</span>
            <span style={{fontSize:10,color:T.dim,flexShrink:0,marginLeft:8}}>{timeAgo(item.due_at||item.lastMessageAt)}</span>
          </div>
          <div style={{fontSize:11,color:T.dim,marginBottom:5}}>
            {typeIcon(item)} {item.itemType.charAt(0).toUpperCase()+item.itemType.slice(1)} · {company}
          </div>
          <div style={{fontSize:12,color,lineHeight:1.55,marginBottom:stage||item.hasUnconfirmed||isOverdue?6:0}}>
            {signal}
          </div>
          {(stage||item.hasUnconfirmed||isOverdue) && (
            <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
              {stage && <span style={{fontSize:9,padding:"1px 7px",borderRadius:9,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",color:T.dim}}>{stage}</span>}
              {item.hasUnconfirmed && <span style={{fontSize:9,padding:"1px 7px",borderRadius:9,background:"rgba(230,126,34,0.1)",border:"1px solid rgba(230,126,34,0.2)",color:T.orange}}>⚠ UNCONFIRMED</span>}
              {isOverdue && <span style={{fontSize:9,padding:"1px 7px",borderRadius:9,background:"rgba(231,76,60,0.1)",border:"1px solid rgba(231,76,60,0.2)",color:T.red}}>OVERDUE</span>}
              <div style={{flex:1}}/>
              <span style={{fontSize:11,color:hov?T.muted:T.dim}}>Open profile →</span>
            </div>
          )}
          {!stage && !item.hasUnconfirmed && !isOverdue && (
            <div style={{textAlign:"right"}}><span style={{fontSize:10,color:hov?T.muted:T.dim}}>Open profile →</span></div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function FollowUp({ onNavigate }) {
  var [inbound,     setInbound]     = useState([])
  var [scheduled,   setScheduled]   = useState([])
  var [tasks,       setTasks]       = useState([])
  var [loading,     setLoading]     = useState(true)
  var [error,       setError]       = useState("")
  var [showCapture, setShowCapture] = useState(false)

  useEffect(function(){ loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadInbound(), loadScheduled(), loadTasks()])
    setLoading(false)
  }

  async function loadInbound() {
    try {
      var d = await fetch("/api/follow-up-queue").then(function(r){return r.json()})
      var q = Array.isArray(d.queue) ? d.queue : []
      try {
        var U=process.env.NEXT_PUBLIC_SUPABASE_URL, K=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        var uc = await fetch(U+"/rest/v1/communications?send_status=eq.unconfirmed&select=contact_id&limit=200",{headers:{"apikey":K,"Authorization":"Bearer "+K}}).then(function(r){return r.json()})
        var ucIds = new Set((Array.isArray(uc)?uc:[]).map(function(c){return c.contact_id}))
        q = q.map(function(i){return Object.assign({},i,{itemType:"inbound",hasUnconfirmed:ucIds.has(i.supabaseId)})})
      } catch(e){ q = q.map(function(i){return Object.assign({},i,{itemType:"inbound"})}) }
      setInbound(q)
    } catch(e){ setError(e.message) }
  }

  async function loadScheduled() {
    try {
      var U=process.env.NEXT_PUBLIC_SUPABASE_URL, K=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      var rows = await fetch(U+"/rest/v1/scheduled_actions?status=eq.pending&order=send_at.asc&limit=100",{headers:{"apikey":K,"Authorization":"Bearer "+K}}).then(function(r){return r.json()})
      setScheduled((Array.isArray(rows)?rows:[]).map(function(s){
        return {id:s.id,itemType:"scheduled",contact_id:s.contact_id,contact_first_name:s.contact_first_name||"",contact_last_name:s.contact_last_name||"",contact_company:s.contact_company||"",note:s.message_body||"",message_body:s.message_body||"",due_at:s.send_at,send_at:s.send_at,channel:s.channel||"linkedin",conversation_id:s.conversation_id}
      }))
    } catch(e){}
  }

  async function loadTasks() {
    try {
      var U=process.env.NEXT_PUBLIC_SUPABASE_URL, K=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      var rows = await fetch(U+"/rest/v1/follow_up_tasks?status=eq.open&order=due_at.asc.nullslast&limit=100",{headers:{"apikey":K,"Authorization":"Bearer "+K}}).then(function(r){return r.json()})
      setTasks((Array.isArray(rows)?rows:[]).map(function(t){
        return {id:t.id,itemType:"task",contact_id:t.contact_id,contact_first_name:t.contact_first_name||"",contact_last_name:t.contact_last_name||"",contact_company:t.contact_company||"",note:t.note||"",due_at:t.due_at||null,priority:t.priority||"normal",source:t.source||"manual"}
      }))
    } catch(e){}
  }

  function routeToProfile(item) {
    var contactId   = item.supabaseId || item.contact_id || null
    var firstName   = item.firstName  || item.contact_first_name || ""
    var lastName    = item.lastName   || item.contact_last_name  || ""
    var companyName = item.company    || item.contact_company     || ""
    if (!contactId && !firstName) return
    if (onNavigate) onNavigate("profile", {id:contactId, first_name:firstName, last_name:lastName, company_name:companyName})
  }

  var now        = new Date()
  var overdue    = [...inbound,...scheduled,...tasks].filter(function(i){return i.due_at && new Date(i.due_at)<now})
  var totalCount = inbound.length + scheduled.length + tasks.length

  return (
    <div style={{fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,serif",display:"flex",flexDirection:"column",height:"100%",overflow:"hidden",background:BG}}>

      {/* Header */}
      <div style={{padding:"14px 16px 10px",borderBottom:"1px solid rgba(255,255,255,0.06)",background:BG2,flexShrink:0}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:showCapture?10:0}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{fontSize:11,letterSpacing:3,color:G,textTransform:"uppercase",fontWeight:600}}>Follow-Up</div>
            {totalCount>0 && <span style={{fontSize:10,padding:"1px 8px",borderRadius:9,background:"rgba(240,200,74,0.08)",border:"1px solid rgba(240,200,74,0.2)",color:G}}>{totalCount}</span>}
            {overdue.length>0 && <span style={{fontSize:10,padding:"1px 8px",borderRadius:9,background:"rgba(231,76,60,0.1)",border:"1px solid rgba(231,76,60,0.2)",color:T.red}}>{overdue.length} overdue</span>}
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <button onClick={function(){setShowCapture(function(v){return !v})}} title="Capture a task or contact" style={{width:30,height:30,borderRadius:"50%",background:showCapture?"rgba(240,200,74,0.12)":"rgba(255,255,255,0.04)",border:"1px solid "+(showCapture?"rgba(240,200,74,0.3)":"rgba(255,255,255,0.1)"),color:showCapture?G:T.dim,cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center"}}>
              🎙
            </button>
            <button onClick={loadAll} style={{width:30,height:30,borderRadius:"50%",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",color:T.dim,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>
              ↺
            </button>
          </div>
        </div>

        {showCapture && (
          <div style={{borderTop:"1px solid rgba(255,255,255,0.06)",paddingTop:8}}>
            <SmartCommand
              contact={null}
              conversationId={null}
              onRefresh={loadAll}
              placeholder={"e.g. \"Ryan Kessler at Cohen Resnick — great sponsor candidate, send discovery email\""}
            />
          </div>
        )}
      </div>

      {/* Notification list */}
      <div style={{flex:1,overflowY:"auto",padding:"12px"}}>

        {loading && <div style={{textAlign:"center",padding:"40px 0",color:T.dim,fontSize:13}}>Loading…</div>}
        {error   && <div style={{padding:"12px",color:T.red,fontSize:12,textAlign:"center"}}>{error}</div>}

        {!loading && totalCount===0 && (
          <div style={{textAlign:"center",padding:"60px 20px"}}>
            <div style={{fontSize:32,marginBottom:10,opacity:0.3}}>✓</div>
            <div style={{fontSize:14,color:T.dim}}>All clear</div>
            <div style={{fontSize:12,color:T.dim,marginTop:6,opacity:0.7}}>Nothing needs attention right now</div>
          </div>
        )}

        {inbound.length>0 && <>
          <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:T.dim,fontWeight:600,marginBottom:8}}>💬 Inbound Replies · {inbound.length}</div>
          {inbound.map(function(item){ return <NotificationCard key={"in-"+item.id} item={item} onClick={function(){routeToProfile(item)}}/> })}
        </>}

        {scheduled.length>0 && <>
          <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:T.dim,fontWeight:600,margin:"16px 0 8px"}}>📅 Scheduled Sends · {scheduled.length}</div>
          {scheduled.map(function(item){ return <NotificationCard key={"sch-"+item.id} item={item} onClick={function(){routeToProfile(item)}}/> })}
        </>}

        {tasks.length>0 && <>
          <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:T.dim,fontWeight:600,margin:"16px 0 8px"}}>✓ Tasks · {tasks.length}</div>
          {tasks.map(function(item){ return <NotificationCard key={"task-"+item.id} item={item} onClick={function(){routeToProfile(item)}}/> })}
        </>}

      </div>
    </div>
  )
}
