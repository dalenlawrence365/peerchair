"use client"
import { useState, useEffect, useRef } from "react"

var G   = "#f0c84a"
var BG  = "#080f1a"
var BG2 = "#0c1520"
var BG3 = "#0f1e2e"
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
  return new Date(d).toLocaleString("en-US", { month:"short", day:"numeric", hour:"numeric", minute:"2-digit", hour12:true })
}

function sbFetch(path) {
  var U = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  var K = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
  if (!U || !K) { console.error("Supabase env vars not set"); return Promise.resolve([]); }
  return fetch(U + "/rest/v1/" + path, { headers: { "apikey": K, "Authorization": "Bearer " + K } }).then(function(r){ return r.json(); }).catch(function(e){ console.error("sbFetch error:", e); return []; })
}

function Avatar({ first, last, imageUrl, size }) {
  size = size || 36
  if (imageUrl) return <img src={imageUrl} style={{ width:size, height:size, borderRadius:"50%", objectFit:"cover", flexShrink:0 }} alt="" />
  var initials = ((first||"?")[0] + (last||"?")[0]).toUpperCase()
  return <div style={{ width:size, height:size, borderRadius:"50%", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:size > 40 ? 14 : 11, fontWeight:700, color:G, flexShrink:0 }}>{initials}</div>
}

function ConvCard({ conv, selected, onClick }) {
  var isTheirs = conv.last_sender === "CORRESPONDENT"
  var accent = isTheirs ? T.green : T.dim
  return (
    <div onClick={onClick} style={{ padding:"11px 14px", borderRadius:6, cursor:"pointer", background: selected ? "rgba(240,200,74,0.06)" : "rgba(255,255,255,0.01)", border:"1px solid " + (selected ? G + "40" : "rgba(255,255,255,0.05)"), borderLeft:"3px solid " + (selected ? G : accent), marginBottom:5, transition:"all 0.1s" }}>
      <div style={{ display:"flex", gap:10, alignItems:"center" }}>
        <Avatar first={conv.contact_first_name} last={conv.contact_last_name} imageUrl={conv.custom_photo_url} size={34} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:13, fontWeight:600, color: selected ? "#fff" : T.text }}>{conv.contact_first_name} {conv.contact_last_name}</span>
            <span style={{ fontSize:10, color:T.dim, flexShrink:0, marginLeft:6 }}>{timeAgo(conv.last_message_at)}</span>
          </div>
          <div style={{ fontSize:11, color:T.muted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{conv.contact_company}</div>
          <div style={{ fontSize:11, color: isTheirs ? T.green : T.dim, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", marginTop:2, fontStyle:"italic" }}>"{conv.last_message_body}"</div>
        </div>
      </div>
      <div style={{ display:"flex", gap:5, marginTop:5 }}>
        {conv.contact_stage && <span style={{ fontSize:9, padding:"1px 6px", borderRadius:3, background:"rgba(74,158,186,0.1)", border:"1px solid rgba(74,158,186,0.2)", color:T.blue }}>{conv.contact_stage}</span>}
        {conv.channel === "inmail" && <span style={{ fontSize:9, padding:"1px 6px", borderRadius:3, background:"rgba(155,89,182,0.1)", border:"1px solid rgba(155,89,182,0.2)", color:T.purple }}>InMail</span>}
        {isTheirs && <span style={{ fontSize:9, padding:"1px 6px", borderRadius:3, background:"rgba(46,204,113,0.1)", border:"1px solid rgba(46,204,113,0.2)", color:T.green }}>Their Turn</span>}
      </div>
    </div>
  )
}

function ThreadView({ conv }) {
  var [messages, setMessages] = useState([])
  var [loading, setLoading] = useState(true)
  var bottomRef = useRef(null)

  useEffect(function() {
    if (!conv) return
    setLoading(true)
    setMessages([])
    sbFetch("conversation_messages?conversation_id=eq." + conv.id + "&order=sent_at.asc&limit=200")
      .then(function(rows) {
        setMessages(Array.isArray(rows) ? rows : [])
        setLoading(false)
      })
      .catch(function() { setLoading(false) })
  }, [conv?.id])

  useEffect(function() {
    if (threadRef.current && messages.length > 0) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight
    }
  }, [messages])

  if (!conv) return (
    <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:10, color:T.dim }}>
      <div style={{ fontSize:32, opacity:0.3 }}>💬</div>
      <div style={{ fontSize:14 }}>Select a conversation</div>
    </div>
  )

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
      {/* Header */}
      <div style={{ padding:"14px 20px", borderBottom:"1px solid rgba(255,255,255,0.06)", background:"linear-gradient(90deg,#0c1520,#0f1e2e)", flexShrink:0, display:"flex", alignItems:"center", gap:12 }}>
        <Avatar first={conv.contact_first_name} last={conv.contact_last_name} imageUrl={conv.custom_photo_url} size={40} />
        <div style={{ flex:1 }}>
          <div style={{ fontSize:15, fontWeight:600, color:"#fff" }}>{conv.contact_first_name} {conv.contact_last_name}</div>
          <div style={{ fontSize:12, color:T.muted }}>{conv.contact_company}{conv.contact_title ? " · " + conv.contact_title : ""}</div>
        </div>
        <div style={{ fontSize:10, color:T.dim }}>{conv.channel === "inmail" ? "InMail" : "LinkedIn"} · Last synced {timeAgo(conv.last_synced_at)}</div>
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:"auto", padding:"16px 20px", display:"flex", flexDirection:"column", gap:12 }}>
        {loading && <div style={{ textAlign:"center", color:T.dim, padding:"40px 0", fontSize:13 }}>Loading messages…</div>}
        {!loading && messages.length === 0 && (
          <div style={{ textAlign:"center", color:T.dim, padding:"40px 0", fontSize:13 }}>
            No messages stored yet. Hit Sync to pull from HeyReach.
          </div>
        )}
        {messages.map(function(msg, i) {
          var isOut = msg.direction === "OUT"
          return (
            <div key={msg.id || i} style={{ display:"flex", flexDirection:"column", alignItems: isOut ? "flex-end" : "flex-start", width:"100%" }}>
              <div style={{ display:"flex", gap:5, marginBottom:3, alignItems:"center", flexDirection: isOut ? "row-reverse" : "row" }}>
                {msg.sequence_key && <span style={{ fontSize:9, padding:"1px 6px", borderRadius:3, background:"rgba(74,158,186,0.12)", border:"1px solid rgba(74,158,186,0.2)", color:T.blue, fontFamily:"monospace" }}>{msg.sequence_key}</span>}
                {msg.channel === "inmail" && <span style={{ fontSize:9, padding:"1px 6px", borderRadius:3, background:"rgba(155,89,182,0.12)", border:"1px solid rgba(155,89,182,0.2)", color:T.purple }}>InMail</span>}
                <span style={{ fontSize:10, color:T.dim }}>{fmtTime(msg.sent_at)}</span>
              </div>
              <div style={{ maxWidth:"75%", padding:"10px 14px", borderRadius: isOut ? "14px 4px 14px 14px" : "4px 14px 14px 14px", background: isOut ? "rgba(240,200,74,0.09)" : "rgba(255,255,255,0.05)", border:"1px solid " + (isOut ? "rgba(240,200,74,0.25)" : "rgba(255,255,255,0.09)"), fontSize:13, color: isOut ? "#f5e49a" : T.text, lineHeight:1.75, whiteSpace:"pre-wrap", wordBreak:"break-word" }}>
                {msg.body}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

export default function LinkedInMessages({ onNavigate }) {
  var [convs, setConvs]         = useState([])
  var [loading, setLoading]     = useState(true)
  var [selected, setSelected]   = useState(null)
  var [filter, setFilter]       = useState("all")  // all, theirs, mine
  var [typeFilter, setTypeFilter] = useState("all") // all, cfo, sponsor
  var [search, setSearch]       = useState("")
  var [lastSync, setLastSync]   = useState(null)

  useEffect(function() {
    loadConversations()
    loadLastSync()
  }, [])

  async function loadConversations() {
    setLoading(true)
    try {
      // Join conversations with contacts for display
      var rows = await sbFetch("conversations?order=last_message_at.desc&limit=200&select=id,conversation_id,channel,last_message_at,last_message_direction,last_message_body,last_sender,unread,last_synced_at,contact_id")
      var convRows = Array.isArray(rows) ? rows : []
      // Load contact details for all conversations
      var contactIds = [...new Set(convRows.map(function(r){ return r.contact_id }).filter(Boolean))]
      var contactMap = {}
      if (contactIds.length > 0) {
        var ctRows = await sbFetch("contacts?id=in.(" + contactIds.join(",") + ")&select=id,first_name,last_name,title,company_name,pipeline_stage,contact_type,custom_photo_url&limit=200")
        ;(Array.isArray(ctRows) ? ctRows : []).forEach(function(ct){ contactMap[ct.id] = ct })
      }
      var mapped = convRows.map(function(r) {
        var ct = contactMap[r.contact_id] || {}
        return {
          id: r.id,
          conversation_id: r.conversation_id,
          channel: r.channel,
          last_message_at: r.last_message_at,
          last_message_direction: r.last_message_direction,
          last_message_body: r.last_message_body,
          last_sender: r.last_sender,
          unread: r.unread,
          last_synced_at: r.last_synced_at,
          contact_id: r.contact_id,
          contact_first_name: ct.first_name || "",
          contact_last_name: ct.last_name || "",
          contact_title: ct.title || "",
          contact_company: ct.company_name || "",
          contact_stage: ct.pipeline_stage || "",
          contact_type: ct.contact_type || "CFO_PROSPECT",
          custom_photo_url: ct.custom_photo_url || "",
        }
      })
      setConvs(mapped)
      if (mapped.length > 0 && !selected) setSelected(mapped[0])
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  async function loadLastSync() {
    try {
      var U = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
      var K = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
      if (!U || !K) return;
      var r = await fetch(U + "/rest/v1/system_settings?key=eq.linkedin_last_sync", { headers: { "apikey":K, "Authorization":"Bearer "+K } })
      var d = await r.json()
      if (d && d[0]) setLastSync(d[0].value)
    } catch(e) {}
  }

  var filtered = convs.filter(function(c) {
    if (filter === "theirs" && c.last_sender !== "CORRESPONDENT") return false
    if (filter === "mine"   && c.last_sender === "CORRESPONDENT") return false
    if (typeFilter === "cfo"     && c.contact_type !== "CFO_PROSPECT") return false
    if (typeFilter === "sponsor" && c.contact_type !== "SPONSOR_CONTACT") return false
    if (search) {
      var q = search.toLowerCase()
      if (!((c.contact_first_name + " " + c.contact_last_name).toLowerCase().includes(q) || (c.contact_company||"").toLowerCase().includes(q))) return false
    }
    return true
  })

  return (
    <div style={{ fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,serif", display:"flex", height:"100%", overflow:"hidden", background:BG }}>

      {/* LEFT */}
      <div style={{ width:320, flexShrink:0, display:"flex", flexDirection:"column", borderRight:"1px solid rgba(255,255,255,0.06)", background:BG2, overflow:"hidden" }}>

        {/* Header */}
        <div style={{ padding:"14px 14px 10px", borderBottom:"1px solid rgba(255,255,255,0.06)", flexShrink:0 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <div style={{ fontSize:11, letterSpacing:3, color:T.blue, textTransform:"uppercase", fontWeight:600 }}>LinkedIn Messages</div>
            <div style={{ fontSize:10, color:T.dim }}>{filtered.length} convos</div>
          </div>
          {/* Search */}
          <input value={search} onChange={function(e){setSearch(e.target.value)}} placeholder="Search name or company…" style={{ width:"100%", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", color:T.text, padding:"6px 10px", borderRadius:5, fontSize:12, outline:"none", boxSizing:"border-box", marginBottom:8 }} />
          {/* Filter tabs */}
          <div style={{ display:"flex", gap:3, marginBottom:5 }}>
            {[["all","All"],["theirs","Their Turn"],["mine","My Turn"]].map(function(f) {
              var active = filter === f[0]
              return <button key={f[0]} onClick={function(){setFilter(f[0])}} style={{ flex:1, padding:"4px 3px", borderRadius:4, cursor:"pointer", border:"1px solid "+(active?"rgba(240,200,74,0.4)":"rgba(255,255,255,0.07)"), background:active?"rgba(240,200,74,0.1)":"transparent", color:active?G:T.muted, fontSize:10 }}>{f[1]}</button>
            })}
          </div>
          <div style={{ display:"flex", gap:3 }}>
            {[["all","All"],["cfo","CFO"],["sponsor","Sponsor"]].map(function(f) {
              var active = typeFilter === f[0]
              return <button key={f[0]} onClick={function(){setTypeFilter(f[0])}} style={{ flex:1, padding:"3px", borderRadius:4, cursor:"pointer", border:"1px solid "+(active?"rgba(74,158,186,0.4)":"rgba(255,255,255,0.06)"), background:active?"rgba(74,158,186,0.1)":"transparent", color:active?T.blue:T.dim, fontSize:10 }}>{f[1]}</button>
            })}
          </div>
        </div>

        {/* Last sync */}
        {lastSync && <div style={{ fontSize:10, color:T.dim, padding:"5px 14px", borderBottom:"1px solid rgba(255,255,255,0.04)", flexShrink:0 }}>Last sync: {timeAgo(lastSync)}</div>}

        {/* Conversation list */}
        <div style={{ flex:1, overflowY:"auto", padding:"8px 10px" }}>
          {loading && <div style={{ color:T.dim, fontSize:13, textAlign:"center", padding:"30px 0" }}>Loading…</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ textAlign:"center", padding:"40px 20px", color:T.dim }}>
              <div style={{ fontSize:20, marginBottom:8 }}>💬</div>
              <div style={{ fontSize:13 }}>No conversations yet</div>
              <div style={{ fontSize:11, marginTop:4 }}>Hit Sync to pull from HeyReach</div>
            </div>
          )}
          {filtered.map(function(conv) {
            return <ConvCard key={conv.id} conv={conv} selected={selected?.id === conv.id} onClick={function(){setSelected(conv)}} />
          })}
        </div>
      </div>

      {/* RIGHT */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        <ThreadView conv={selected} />
      </div>
    </div>
  )
}
