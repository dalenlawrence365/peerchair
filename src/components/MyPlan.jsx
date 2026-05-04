"use client"
import { useState, useEffect, useRef } from "react"

var G   = "#f0c84a"
var BG  = "#080f1a"
var BG2 = "#0c1520"
var T   = { text:"#e8f2ff", muted:"#7a9bb8", dim:"#3a5a74", border:"rgba(255,255,255,0.06)", green:"#2ecc71", red:"#e74c3c", orange:"#e67e22", blue:"#4a9eba", purple:"#9b59b6" }

function timeLabel(due_at) {
  if (!due_at) return null
  var d = new Date(due_at)
  var now = new Date()
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  var itemDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  var diff = Math.round((itemDay - today) / 86400000)
  if (diff < 0)  return { label:"Overdue", color:T.red }
  if (diff === 0) return { label:"Today", color:T.orange }
  if (diff === 1) return { label:"Tomorrow", color:G }
  if (diff <= 7)  return { label:"This Week", color:T.blue }
  return { label: d.toLocaleDateString("en-US", { month:"short", day:"numeric" }), color:T.muted }
}

function Avatar({ first, last, size }) {
  size = size || 34
  return <div style={{ width:size, height:size, borderRadius:"50%", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:size>40?14:11, fontWeight:700, color:G, flexShrink:0 }}>{((first||"?")[0]+(last||"?")[0]).toUpperCase()}</div>
}

function PlanItem({ item, onComplete, onReschedule, onClick, selected }) {
  var tl = item.due_at ? timeLabel(item.due_at) : null
  var isScheduled = item.type === "scheduled"
  var accent = isScheduled ? T.purple : item.priority === "high" ? T.orange : T.blue
  var isOverdue = tl && tl.label === "Overdue"

  return (
    <div onClick={function(){ if(onClick) onClick(item) }} style={{ padding:"11px 14px", borderRadius:6, cursor:"pointer", background: selected ? "rgba(240,200,74,0.06)" : "rgba(255,255,255,0.01)", border:"1px solid "+(selected?G+"40":isOverdue?"rgba(231,76,60,0.2)":"rgba(255,255,255,0.05)"), borderLeft:"3px solid "+(selected?G:accent), marginBottom:5, transition:"all 0.1s" }}>
      <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
        <Avatar first={item.contact_first_name} last={item.contact_last_name} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:2 }}>
            <span style={{ fontSize:13, fontWeight:600, color: selected?"#fff":T.text }}>{item.contact_first_name} {item.contact_last_name}</span>
            <div style={{ display:"flex", gap:5, alignItems:"center", flexShrink:0, marginLeft:6 }}>
              {tl && <span style={{ fontSize:10, padding:"1px 7px", borderRadius:9, background:tl.color+"12", border:"1px solid "+tl.color+"30", color:tl.color, fontWeight:600 }}>{tl.label}</span>}
              <button onClick={function(e){ e.stopPropagation(); onComplete(item) }} style={{ background:"rgba(46,204,113,0.1)", border:"1px solid rgba(46,204,113,0.2)", color:T.green, borderRadius:4, cursor:"pointer", fontSize:10, padding:"2px 8px" }}>Done</button>
            </div>
          </div>
          <div style={{ fontSize:11, color:T.muted, marginBottom:3 }}>{item.contact_company}</div>
          <div style={{ fontSize:12, color: isScheduled ? T.purple : T.muted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {isScheduled ? "→ " : "● "}{(item.note||"").slice(0, 80)}
          </div>
          <div style={{ display:"flex", gap:5, marginTop:5 }}>
            {isScheduled && <span style={{ fontSize:9, padding:"1px 6px", borderRadius:3, background:"rgba(155,89,182,0.1)", border:"1px solid rgba(155,89,182,0.2)", color:T.purple }}>{item.channel?.toUpperCase()} · {item.mode === "auto_send" ? "AUTO-SEND" : "REVIEW FIRST"}</span>}
            {!isScheduled && item.source && <span style={{ fontSize:9, padding:"1px 6px", borderRadius:3, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", color:T.dim }}>{item.source === "auto_reply" ? "AUTO-DETECTED" : item.source === "ask_claude" ? "ASK CLAUDE" : item.source === "voice" ? "VOICE" : "MANUAL"}</span>}
            {item.priority === "high" && <span style={{ fontSize:9, padding:"1px 6px", borderRadius:3, background:"rgba(230,126,34,0.1)", border:"1px solid rgba(230,126,34,0.2)", color:T.orange }}>HIGH</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

function DetailPanel({ item, contacts, onClose, onComplete, onCommandSent }) {
  var [cmd, setCmd]         = useState("")
  var [running, setRunning] = useState(false)
  var [result, setResult]   = useState("")
  var [listening, setListening] = useState(false)
  var recognitionRef = useRef(null)

  function startVoice() {
    if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
      alert("Voice input not supported in this browser. Use Chrome.")
      return
    }
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition
    var r = new SR()
    r.lang = "en-US"
    r.interimResults = false
    r.onresult = function(e) { setCmd(e.results[0][0].transcript); setListening(false) }
    r.onerror = function() { setListening(false) }
    r.onend = function() { setListening(false) }
    recognitionRef.current = r
    r.start()
    setListening(true)
  }

  async function runCommand() {
    if (!cmd.trim() || running) return
    setRunning(true)
    setResult("")
    try {
      var res = await fetch("/api/smart-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: cmd,
          contact: item ? {
            id: item.contact_id,
            firstName: item.contact_first_name,
            lastName: item.contact_last_name,
            company: item.contact_company,
            type: item.contact_type,
          } : null,
          conversationId: item?.conversation_id || null,
        })
      })
      var d = await res.json()
      setResult(d.confirmation || "Done")
      setCmd("")
      if (onCommandSent) onCommandSent()
    } catch(e) { setResult("Error — try again") }
    setRunning(false)
  }

  if (!item) return (
    <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12, color:T.dim }}>
      <div style={{ fontSize:32, opacity:0.3 }}>📋</div>
      <div style={{ fontSize:14 }}>Select an item or add a new one</div>
      <div style={{ fontSize:12, opacity:0.7 }}>Use the command bar below to add tasks</div>
    </div>
  )

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
      {/* Header */}
      <div style={{ padding:"14px 20px", borderBottom:"1px solid rgba(255,255,255,0.06)", background:"linear-gradient(90deg,#0c1520,#0f1e2e)", flexShrink:0, display:"flex", alignItems:"center", gap:12 }}>
        <Avatar first={item.contact_first_name} last={item.contact_last_name} size={40} />
        <div style={{ flex:1 }}>
          <div style={{ fontSize:15, fontWeight:600, color:"#fff" }}>{item.contact_first_name} {item.contact_last_name}</div>
          <div style={{ fontSize:12, color:T.muted }}>{item.contact_company}</div>
        </div>
        <button onClick={function(){ onComplete(item) }} style={{ padding:"6px 14px", background:"rgba(46,204,113,0.1)", border:"1px solid rgba(46,204,113,0.25)", color:T.green, borderRadius:5, cursor:"pointer", fontSize:12, fontWeight:600 }}>Mark Done</button>
        <button onClick={onClose} style={{ background:"transparent", border:"1px solid rgba(255,255,255,0.1)", color:T.muted, width:28, height:28, borderRadius:5, cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
      </div>

      {/* Item detail */}
      <div style={{ padding:"16px 20px", borderBottom:"1px solid rgba(255,255,255,0.06)", flexShrink:0 }}>
        <div style={{ fontSize:11, color:T.dim, letterSpacing:2, textTransform:"uppercase", marginBottom:8 }}>{item.type === "scheduled" ? "Scheduled Send" : "Follow-Up Task"}</div>
        <div style={{ fontSize:14, color:T.text, lineHeight:1.7, background:"rgba(255,255,255,0.03)", padding:"12px 14px", borderRadius:6, border:"1px solid rgba(255,255,255,0.06)", whiteSpace:"pre-wrap" }}>{item.note}</div>
        {item.due_at && (
          <div style={{ marginTop:8, fontSize:12, color:T.muted }}>
            {item.type === "scheduled" ? "Sends" : "Due"}: {new Date(item.due_at).toLocaleString("en-US", { month:"long", day:"numeric", year:"numeric", hour:"numeric", minute:"2-digit", hour12:true })}
          </div>
        )}
        {item.source_message && <div style={{ marginTop:8, fontSize:11, color:T.dim, fontStyle:"italic" }}>"{item.source_message.slice(0,120)}..."</div>}
      </div>

      {/* Command bar */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", padding:"16px 20px", gap:10 }}>
        <div style={{ fontSize:11, color:T.dim, letterSpacing:2, textTransform:"uppercase" }}>Smart Action</div>
        <div style={{ fontSize:12, color:T.muted, lineHeight:1.6 }}>
          Type or speak a command. Examples:<br/>
          <span style={{ color:T.dim }}>"Send: Great talking to you. Follow up June 1"</span><br/>
          <span style={{ color:T.dim }}>"Reschedule to next Monday"</span><br/>
          <span style={{ color:T.dim }}>"Mark done — they opted out"</span>
        </div>
        <textarea
          value={cmd}
          onChange={function(e){ setCmd(e.target.value) }}
          onKeyDown={function(e){ if(e.key==="Enter"&&(e.metaKey||e.ctrlKey)) runCommand() }}
          placeholder="What do you want to do with this follow-up?"
          rows={3}
          style={{ width:"100%", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", color:T.text, padding:"10px 12px", borderRadius:6, fontSize:13, lineHeight:1.65, resize:"none", outline:"none", fontFamily:"inherit", boxSizing:"border-box" }}
        />
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <button onClick={startVoice} style={{ padding:"7px 14px", background: listening ? "rgba(231,76,60,0.15)" : "rgba(74,158,186,0.1)", border:"1px solid "+(listening?"rgba(231,76,60,0.3)":"rgba(74,158,186,0.25)"), color: listening ? T.red : T.blue, borderRadius:5, cursor:"pointer", fontSize:12 }}>
            {listening ? "🔴 Listening..." : "🎙 Voice"}
          </button>
          <button onClick={runCommand} disabled={!cmd.trim()||running} style={{ flex:1, padding:"7px 14px", background:"rgba(240,200,74,0.1)", border:"1px solid rgba(240,200,74,0.25)", color:G, borderRadius:5, cursor:"pointer", fontSize:12, fontWeight:600 }}>
            {running ? "Running..." : "Execute (Cmd+Enter)"}
          </button>
        </div>
        {result && <div style={{ padding:"8px 12px", background:"rgba(46,204,113,0.08)", border:"1px solid rgba(46,204,113,0.2)", borderRadius:5, fontSize:12, color:T.green }}>✓ {result}</div>}
      </div>
    </div>
  )
}

function AddTaskPanel({ onAdd, onClose }) {
  var [search, setSearch] = useState("")
  var [contacts, setContacts] = useState([])
  var [selected, setSelected] = useState(null)
  var [note, setNote] = useState("")
  var [dueDate, setDueDate] = useState("")
  var [priority, setPriority] = useState("normal")
  var [saving, setSaving] = useState(false)

  useEffect(function() {
    if (search.length < 2) { setContacts([]); return }
    var U = process.env.NEXT_PUBLIC_SUPABASE_URL
    var K = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    fetch(U+"/rest/v1/contacts?or=(first_name.ilike.*"+search+"*,last_name.ilike.*"+search+"*,company_name.ilike.*"+search+"*)&select=id,first_name,last_name,company_name,contact_type&limit=8", { headers:{"apikey":K,"Authorization":"Bearer "+K} })
      .then(function(r){ return r.json() })
      .then(function(d){ setContacts(Array.isArray(d)?d:[]) })
      .catch(function(){})
  }, [search])

  async function save() {
    setSaving(true)
    try {
      var res = await fetch("/api/my-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_task",
          contact_id: selected?.id || null,
          contact_first_name: selected?.first_name || search,
          contact_last_name: selected?.last_name || "",
          contact_company: selected?.company_name || "",
          contact_type: selected?.contact_type || "CFO_PROSPECT",
          note, priority,
          due_at: dueDate ? new Date(dueDate+"T09:00:00").toISOString() : null,
          source: "manual",
        })
      })
      var d = await res.json()
      if (d.success) { onAdd(); onClose() }
    } catch(e) {}
    setSaving(false)
  }

  return (
    <div style={{ position:"absolute", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 }}>
      <div style={{ background:BG2, border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, padding:24, width:440, maxWidth:"90vw" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div style={{ fontSize:13, fontWeight:600, color:G, letterSpacing:2, textTransform:"uppercase" }}>Add Follow-Up</div>
          <button onClick={onClose} style={{ background:"transparent", border:"none", color:T.muted, cursor:"pointer", fontSize:18 }}>×</button>
        </div>

        {/* Contact search */}
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:11, color:T.dim, marginBottom:5 }}>CONTACT</div>
          {selected ? (
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 12px", background:"rgba(240,200,74,0.06)", border:"1px solid rgba(240,200,74,0.2)", borderRadius:5 }}>
              <span style={{ fontSize:13, color:G }}>{selected.first_name} {selected.last_name} · {selected.company_name}</span>
              <button onClick={function(){setSelected(null);setSearch("");}} style={{ background:"transparent", border:"none", color:T.muted, cursor:"pointer", fontSize:14 }}>×</button>
            </div>
          ) : (
            <div style={{ position:"relative" }}>
              <input value={search} onChange={function(e){setSearch(e.target.value)}} placeholder="Search by name or company..." style={{ width:"100%", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", color:T.text, padding:"8px 12px", borderRadius:5, fontSize:13, outline:"none", boxSizing:"border-box" }} />
              {contacts.length > 0 && (
                <div style={{ position:"absolute", top:"100%", left:0, right:0, background:BG2, border:"1px solid rgba(255,255,255,0.1)", borderRadius:5, zIndex:10, maxHeight:160, overflowY:"auto" }}>
                  {contacts.map(function(ct) {
                    return <div key={ct.id} onClick={function(){setSelected(ct);setSearch("");setContacts([]);}} style={{ padding:"8px 12px", cursor:"pointer", fontSize:13, color:T.text, borderBottom:"1px solid rgba(255,255,255,0.05)" }} onMouseEnter={function(e){e.target.style.background="rgba(255,255,255,0.05)"}} onMouseLeave={function(e){e.target.style.background="transparent"}}>{ct.first_name} {ct.last_name} · <span style={{color:T.muted}}>{ct.company_name}</span></div>
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Note */}
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:11, color:T.dim, marginBottom:5 }}>WHAT NEEDS TO HAPPEN</div>
          <textarea value={note} onChange={function(e){setNote(e.target.value)}} placeholder="e.g. Email his EA to book fit call, Follow up on proposal, Send Calendly link..." rows={3} style={{ width:"100%", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", color:T.text, padding:"8px 12px", borderRadius:5, fontSize:13, outline:"none", fontFamily:"inherit", resize:"none", boxSizing:"border-box" }} />
        </div>

        {/* Date + Priority */}
        <div style={{ display:"flex", gap:10, marginBottom:16 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11, color:T.dim, marginBottom:5 }}>DUE DATE (optional)</div>
            <input type="date" value={dueDate} onChange={function(e){setDueDate(e.target.value)}} style={{ width:"100%", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", color:T.text, padding:"7px 10px", borderRadius:5, fontSize:13, outline:"none", boxSizing:"border-box" }} />
          </div>
          <div>
            <div style={{ fontSize:11, color:T.dim, marginBottom:5 }}>PRIORITY</div>
            <div style={{ display:"flex", gap:4 }}>
              {["high","normal","low"].map(function(p) {
                var active = priority === p
                var color = p==="high"?T.orange:p==="normal"?T.blue:T.dim
                return <button key={p} onClick={function(){setPriority(p)}} style={{ padding:"6px 10px", borderRadius:4, cursor:"pointer", border:"1px solid "+(active?color+"50":"rgba(255,255,255,0.08)"), background:active?color+"14":"transparent", color:active?color:T.muted, fontSize:11, fontWeight:active?600:400 }}>{p}</button>
              })}
            </div>
          </div>
        </div>

        <button onClick={save} disabled={!note.trim()||saving} style={{ width:"100%", padding:"10px", background:"rgba(240,200,74,0.12)", border:"1px solid rgba(240,200,74,0.3)", color:G, borderRadius:6, cursor:"pointer", fontSize:13, fontWeight:600 }}>
          {saving ? "Adding..." : "Add to My Plan"}
        </button>
      </div>
    </div>
  )
}

export default function MyPlan({ onNavigate }) {
  var [items, setItems]         = useState([])
  var [loading, setLoading]     = useState(true)
  var [selected, setSelected]   = useState(null)
  var [filter, setFilter]       = useState("all") // all, tasks, scheduled, overdue
  var [showAdd, setShowAdd]     = useState(false)
  var [taskCount, setTaskCount] = useState(0)
  var [schedCount, setSchedCount] = useState(0)

  useEffect(function() { load() }, [])

  async function load() {
    setLoading(true)
    try {
      var res = await fetch("/api/my-plan")
      var d = await res.json()
      setItems(Array.isArray(d.items) ? d.items : [])
      setTaskCount(d.taskCount || 0)
      setSchedCount(d.scheduledCount || 0)
      if (d.items && d.items.length > 0 && !selected) setSelected(d.items[0])
    } catch(e) {}
    setLoading(false)
  }

  async function complete(item) {
    await fetch("/api/my-plan", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ action:"complete", id:item.id, type:item.type })
    })
    setItems(function(prev) { return prev.filter(function(i){ return i.id !== item.id }) })
    setSelected(null)
  }

  var filtered = items.filter(function(i) {
    if (filter === "tasks")     return i.type === "task"
    if (filter === "scheduled") return i.type === "scheduled"
    if (filter === "overdue") {
      if (!i.due_at) return false
      return new Date(i.due_at) < new Date()
    }
    return true
  })

  var overdueCount = items.filter(function(i){ return i.due_at && new Date(i.due_at) < new Date() }).length

  return (
    <div style={{ fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,serif", display:"flex", height:"100%", overflow:"hidden", background:BG, position:"relative" }}>
      {showAdd && <AddTaskPanel onAdd={load} onClose={function(){ setShowAdd(false) }} />}

      {/* LEFT — Item list */}
      <div style={{ width:340, flexShrink:0, display:"flex", flexDirection:"column", borderRight:"1px solid rgba(255,255,255,0.06)", background:BG2, overflow:"hidden" }}>

        {/* Header */}
        <div style={{ padding:"14px 14px 10px", borderBottom:"1px solid rgba(255,255,255,0.06)", flexShrink:0 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div style={{ fontSize:11, letterSpacing:3, color:G, textTransform:"uppercase", fontWeight:600 }}>My Plan</div>
            <button onClick={function(){ setShowAdd(true) }} style={{ padding:"4px 12px", background:"rgba(240,200,74,0.1)", border:"1px solid rgba(240,200,74,0.25)", color:G, borderRadius:4, cursor:"pointer", fontSize:11, fontWeight:600 }}>+ Add</button>
          </div>
          {/* Stats */}
          <div style={{ display:"flex", gap:10, marginBottom:8 }}>
            <span style={{ fontSize:11, color:T.muted }}>{taskCount} tasks</span>
            <span style={{ fontSize:11, color:T.dim }}>·</span>
            <span style={{ fontSize:11, color:T.purple }}>{schedCount} scheduled</span>
            {overdueCount > 0 && <><span style={{ fontSize:11, color:T.dim }}>·</span><span style={{ fontSize:11, color:T.red }}>{overdueCount} overdue</span></>}
          </div>
          {/* Filter tabs */}
          <div style={{ display:"flex", gap:3 }}>
            {[["all","All"],["tasks","Tasks"],["scheduled","Scheduled"],["overdue","Overdue"]].map(function(f) {
              var active = filter === f[0]
              var color = f[0]==="overdue"?T.red:f[0]==="scheduled"?T.purple:G
              return <button key={f[0]} onClick={function(){setFilter(f[0])}} style={{ flex:1, padding:"4px 3px", borderRadius:4, cursor:"pointer", border:"1px solid "+(active?color+"40":"rgba(255,255,255,0.07)"), background:active?color+"10":"transparent", color:active?color:T.muted, fontSize:10 }}>{f[1]}</button>
            })}
          </div>
        </div>

        {/* Items */}
        <div style={{ flex:1, overflowY:"auto", padding:"8px 10px" }}>
          {loading && <div style={{ color:T.dim, textAlign:"center", padding:"30px 0", fontSize:13 }}>Loading...</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ textAlign:"center", padding:"40px 20px" }}>
              <div style={{ fontSize:24, marginBottom:10, opacity:0.4 }}>✓</div>
              <div style={{ fontSize:13, color:T.dim }}>
                {filter === "all" ? "Nothing pending — you're clear" : "No items in this filter"}
              </div>
              <button onClick={function(){ setShowAdd(true) }} style={{ marginTop:12, padding:"6px 16px", background:"rgba(240,200,74,0.08)", border:"1px solid rgba(240,200,74,0.2)", color:G, borderRadius:5, cursor:"pointer", fontSize:12 }}>+ Add something</button>
            </div>
          )}
          {filtered.map(function(item) {
            return <PlanItem key={item.id} item={item} selected={selected?.id === item.id} onClick={setSelected} onComplete={complete} />
          })}
        </div>
      </div>

      {/* RIGHT — Detail */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        <DetailPanel item={selected} onClose={function(){ setSelected(null) }} onComplete={complete} onCommandSent={load} />
      </div>
    </div>
  )
}
