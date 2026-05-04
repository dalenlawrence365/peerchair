"use client"
import { useState, useEffect, useRef } from "react"

var G   = "#f0c84a"
var BG  = "#080f1a"
var BG2 = "#0c1520"
var T   = { text:"#e8f2ff", muted:"#7a9bb8", dim:"#3a5a74", border:"rgba(255,255,255,0.06)", green:"#2ecc71", red:"#e74c3c", orange:"#e67e22", blue:"#4a9eba", purple:"#9b59b6" }

function timeAgo(d) {
  if (!d) return ""
  var ms = Date.now() - new Date(d).getTime()
  var m = Math.floor(ms/60000), h = Math.floor(ms/3600000), dy = Math.floor(ms/86400000)
  if (dy > 0) return dy + "d ago"
  if (h  > 0) return h  + "h ago"
  if (m  > 0) return m  + "m ago"
  return "just now"
}

function fmtTime(d) {
  if (!d) return ""
  return new Date(d).toLocaleString("en-US", { month:"short", day:"numeric", year:"numeric", hour:"numeric", minute:"2-digit", hour12:true })
}

function sbFetch(path) {
  var U = process.env.NEXT_PUBLIC_SUPABASE_URL
  var K = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return fetch(U + "/rest/v1/" + path, { headers: { "apikey":K, "Authorization":"Bearer "+K } }).then(r => r.json())
}

function Avatar({ first, last, size }) {
  size = size || 36
  var initials = ((first||"?")[0] + (last||"?")[0]).toUpperCase()
  return <div style={{ width:size, height:size, borderRadius:"50%", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize: size > 40 ? 14 : 11, fontWeight:700, color:G, flexShrink:0 }}>{initials}</div>
}

// Group email messages by thread
function groupByThread(emails) {
  var threads = {}
  var order = []
  emails.forEach(function(e) {
    var key = e.thread_id || e.id
    if (!threads[key]) { threads[key] = []; order.push(key) }
    threads[key].push(e)
  })
  // Sort each thread chronologically
  order.forEach(function(k) { threads[k].sort(function(a,b){ return new Date(a.sent_at)-new Date(b.sent_at) }) })
  // Return threads sorted by most recent message in thread
  return order.map(function(k) { return threads[k] }).sort(function(a,b) {
    var aLast = a[a.length-1].sent_at
    var bLast = b[b.length-1].sent_at
    return new Date(bLast) - new Date(aLast)
  })
}

function EmailCard({ thread, contactName, contactCompany, selected, onClick }) {
  var lastMsg = thread[thread.length - 1]
  var isTheirs = lastMsg.direction === "IN"
  var accent = isTheirs ? T.green : T.dim
  return (
    <div onClick={onClick} style={{ padding:"11px 14px", borderRadius:6, cursor:"pointer", background: selected ? "rgba(240,200,74,0.06)" : "rgba(255,255,255,0.01)", border:"1px solid " + (selected ? G+"40" : "rgba(255,255,255,0.05)"), borderLeft:"3px solid " + (selected ? G : accent), marginBottom:5 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div style={{ fontSize:13, fontWeight:600, color: selected ? "#fff" : T.text, flex:1, marginRight:8 }}>{contactName}</div>
        <span style={{ fontSize:10, color:T.dim, flexShrink:0 }}>{timeAgo(lastMsg.sent_at)}</span>
      </div>
      <div style={{ fontSize:11, color:T.muted, marginBottom:3 }}>{contactCompany}</div>
      <div style={{ fontSize:12, fontWeight:500, color:T.muted, marginBottom:2 }}>{lastMsg.subject || "(no subject)"}</div>
      <div style={{ fontSize:11, color:T.dim, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontStyle:"italic" }}>"{lastMsg.body_preview || lastMsg.body?.slice(0,80) || ""}"</div>
      <div style={{ display:"flex", gap:5, marginTop:5 }}>
        {thread.length > 1 && <span style={{ fontSize:9, padding:"1px 6px", borderRadius:3, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", color:T.dim }}>{thread.length} messages</span>}
        {isTheirs && <span style={{ fontSize:9, padding:"1px 6px", borderRadius:3, background:"rgba(46,204,113,0.1)", border:"1px solid rgba(46,204,113,0.2)", color:T.green }}>Their Turn</span>}
      </div>
    </div>
  )
}

function EmailThreadView({ thread, contactName, contactCompany }) {
  var bottomRef = useRef(null)
  useEffect(function() {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior:"smooth" })
  }, [thread])

  if (!thread) return (
    <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:10, color:T.dim }}>
      <div style={{ fontSize:32, opacity:0.3 }}>✉</div>
      <div style={{ fontSize:14 }}>Select an email thread</div>
    </div>
  )

  var lastMsg = thread[thread.length-1]
  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
      {/* Header */}
      <div style={{ padding:"14px 20px", borderBottom:"1px solid rgba(255,255,255,0.06)", background:"linear-gradient(90deg,#0c1520,#0f1e2e)", flexShrink:0 }}>
        <div style={{ fontSize:15, fontWeight:600, color:"#fff", marginBottom:2 }}>{lastMsg.subject || "(no subject)"}</div>
        <div style={{ fontSize:12, color:T.muted }}>{contactName} · {contactCompany} · {thread.length} message{thread.length !== 1 ? "s" : ""}</div>
      </div>

      {/* Thread */}
      <div style={{ flex:1, overflowY:"auto", padding:"16px 20px", display:"flex", flexDirection:"column", gap:16 }}>
        {thread.map(function(msg, i) {
          var isOut = msg.direction === "OUT"
          return (
            <div key={msg.id || i} style={{ display:"flex", flexDirection:"column" }}>
              {/* Message header */}
              <div style={{ display:"flex", justifyContent: isOut ? "flex-end" : "flex-start", marginBottom:4, gap:8, alignItems:"center" }}>
                <span style={{ fontSize:11, color: isOut ? G : T.muted, fontWeight:600 }}>{isOut ? "Dalen Lawrence" : contactName}</span>
                <span style={{ fontSize:10, color:T.dim }}>{fmtTime(msg.sent_at)}</span>
              </div>
              {/* Message bubble */}
              <div style={{ alignSelf: isOut ? "flex-end" : "flex-start", maxWidth:"80%", background: isOut ? "rgba(240,200,74,0.07)" : "rgba(255,255,255,0.04)", border:"1px solid " + (isOut ? "rgba(240,200,74,0.2)" : "rgba(255,255,255,0.08)"), borderRadius:8, padding:"12px 16px" }}>
                <div style={{ fontSize:13, color: isOut ? "#f5e49a" : T.text, lineHeight:1.8, whiteSpace:"pre-wrap", wordBreak:"break-word" }}>
                  {msg.body || msg.body_preview || "(no content)"}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

export default function EmailMessages({ onNavigate }) {
  var [contacts, setContacts]   = useState([])
  var [allEmails, setAllEmails] = useState([])
  var [loading, setLoading]     = useState(true)
  var [selectedThread, setSelectedThread] = useState(null)
  var [selectedContact, setSelectedContact] = useState(null)
  var [filter, setFilter]       = useState("all")
  var [typeFilter, setTypeFilter] = useState("all")
  var [search, setSearch]       = useState("")
  var [lastSync, setLastSync]   = useState(null)

  useEffect(function() {
    loadEmails()
    loadLastSync()
  }, [])

  async function loadEmails() {
    setLoading(true)
    try {
      var rows = await sbFetch("email_messages?order=sent_at.desc&limit=500&select=id,message_id,direction,subject,body,body_preview,sent_at,from_address,to_address,thread_id,contact_id")
      var emailRows = Array.isArray(rows) ? rows : []
      setAllEmails(emailRows)

      // Load contact details separately
      var contactIds = [...new Set(emailRows.map(function(e){ return e.contact_id }).filter(Boolean))]
      var ctList = []
      if (contactIds.length > 0) {
        var ctRows = await sbFetch("contacts?id=in.(" + contactIds.join(",") + ")&select=id,first_name,last_name,company_name,pipeline_stage,contact_type,custom_photo_url&limit=200")
        ctList = Array.isArray(ctRows) ? ctRows : []
      }
      setContacts(ctList)
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  async function loadLastSync() {
    try {
      var U = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
      var K = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
      if (!U || !K) return;
      var r = await fetch(U + "/rest/v1/system_settings?key=eq.email_last_sync", { headers: { "apikey":K, "Authorization":"Bearer "+K } })
      var d = await r.json()
      if (d && d[0]) setLastSync(d[0].value)
    } catch(e) {}
  }

  // Group all emails by contact then by thread
  var contactThreads = contacts
    .filter(function(ct) {
      if (typeFilter === "cfo"     && ct.contact_type !== "CFO_PROSPECT")    return false
      if (typeFilter === "sponsor" && ct.contact_type !== "SPONSOR_CONTACT") return false
      if (search) {
        var q = search.toLowerCase()
        if (!((ct.first_name + " " + ct.last_name).toLowerCase().includes(q) || (ct.company_name||"").toLowerCase().includes(q))) return false
      }
      return true
    })
    .map(function(ct) {
      var ctEmails = allEmails.filter(function(e) { return e.contact_id === ct.id })
      var threads = groupByThread(ctEmails)
      return { contact: ct, threads }
    })
    .filter(function(item) {
      if (item.threads.length === 0) return false
      if (filter === "theirs") {
        return item.threads.some(function(t) { return t[t.length-1].direction === "IN" })
      }
      if (filter === "mine") {
        return item.threads.every(function(t) { return t[t.length-1].direction === "OUT" })
      }
      return true
    })

  // Flatten to a list of thread cards for the left panel
  var threadCards = []
  contactThreads.forEach(function(item) {
    item.threads.forEach(function(thread) {
      threadCards.push({ thread, contact: item.contact })
    })
  })
  threadCards.sort(function(a, b) {
    return new Date(b.thread[b.thread.length-1].sent_at) - new Date(a.thread[a.thread.length-1].sent_at)
  })

  return (
    <div style={{ fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,serif", display:"flex", height:"100%", overflow:"hidden", background:BG }}>

      {/* LEFT */}
      <div style={{ width:320, flexShrink:0, display:"flex", flexDirection:"column", borderRight:"1px solid rgba(255,255,255,0.06)", background:BG2, overflow:"hidden" }}>
        <div style={{ padding:"14px 14px 10px", borderBottom:"1px solid rgba(255,255,255,0.06)", flexShrink:0 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <div style={{ fontSize:11, letterSpacing:3, color:T.green, textTransform:"uppercase", fontWeight:600 }}>Email</div>
            <div style={{ fontSize:10, color:T.dim }}>{threadCards.length} threads</div>
          </div>
          <input value={search} onChange={function(e){setSearch(e.target.value)}} placeholder="Search name or company…" style={{ width:"100%", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", color:T.text, padding:"6px 10px", borderRadius:5, fontSize:12, outline:"none", boxSizing:"border-box", marginBottom:8 }} />
          <div style={{ display:"flex", gap:3, marginBottom:5 }}>
            {[["all","All"],["theirs","Their Turn"],["mine","My Turn"]].map(function(f) {
              var active = filter === f[0]
              return <button key={f[0]} onClick={function(){setFilter(f[0])}} style={{ flex:1, padding:"4px 3px", borderRadius:4, cursor:"pointer", border:"1px solid "+(active?"rgba(46,204,113,0.4)":"rgba(255,255,255,0.07)"), background:active?"rgba(46,204,113,0.1)":"transparent", color:active?T.green:T.muted, fontSize:10 }}>{f[1]}</button>
            })}
          </div>
          <div style={{ display:"flex", gap:3 }}>
            {[["all","All"],["cfo","CFO"],["sponsor","Sponsor"]].map(function(f) {
              var active = typeFilter === f[0]
              return <button key={f[0]} onClick={function(){setTypeFilter(f[0])}} style={{ flex:1, padding:"3px", borderRadius:4, cursor:"pointer", border:"1px solid "+(active?"rgba(74,158,186,0.4)":"rgba(255,255,255,0.06)"), background:active?"rgba(74,158,186,0.1)":"transparent", color:active?T.blue:T.dim, fontSize:10 }}>{f[1]}</button>
            })}
          </div>
        </div>

        {lastSync && <div style={{ fontSize:10, color:T.dim, padding:"5px 14px", borderBottom:"1px solid rgba(255,255,255,0.04)", flexShrink:0 }}>Last sync: {timeAgo(lastSync)}</div>}

        <div style={{ flex:1, overflowY:"auto", padding:"8px 10px" }}>
          {loading && <div style={{ color:T.dim, fontSize:13, textAlign:"center", padding:"30px 0" }}>Loading…</div>}
          {!loading && threadCards.length === 0 && (
            <div style={{ textAlign:"center", padding:"40px 20px", color:T.dim }}>
              <div style={{ fontSize:20, marginBottom:8 }}>✉</div>
              <div style={{ fontSize:13 }}>No emails synced yet</div>
              <div style={{ fontSize:11, marginTop:4 }}>Emails sync hourly from your CFO Circle inbox</div>
            </div>
          )}
          {threadCards.map(function(item, i) {
            var isSelected = selectedThread && selectedThread[0].thread_id === item.thread[0].thread_id && selectedContact?.id === item.contact.id
            return (
              <EmailCard key={i} thread={item.thread} contactName={item.contact.first_name + " " + item.contact.last_name} contactCompany={item.contact.company_name} selected={isSelected} onClick={function(){ setSelectedThread(item.thread); setSelectedContact(item.contact) }} />
            )
          })}
        </div>
      </div>

      {/* RIGHT */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        <EmailThreadView thread={selectedThread} contactName={selectedContact ? selectedContact.first_name + " " + selectedContact.last_name : ""} contactCompany={selectedContact?.company_name || ""} />
      </div>
    </div>
  )
}
