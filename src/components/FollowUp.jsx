"use client"
import { useState, useEffect, useRef } from "react";

var G   = "#f0c84a";
var BG  = "#080f1a";
var BG2 = "#0c1520";
var BG3 = "#0f1e2e";
var T   = {
  text:"#e8f2ff", muted:"#7a9bb8", dim:"#3a5a74",
  border:"rgba(255,255,255,0.06)",
  green:"#2ecc71", red:"#e74c3c", orange:"#e67e22", blue:"#4a9eba",
  purple:"#9b59b6"
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function timeAgo(d) {
  if (!d) return "";
  var ms = Date.now() - new Date(d).getTime();
  var m  = Math.floor(ms/60000);
  var h  = Math.floor(ms/3600000);
  var dy = Math.floor(ms/86400000);
  if (dy > 0) return dy + "d ago";
  if (h  > 0) return h  + "h ago";
  if (m  > 0) return m  + "m ago";
  return "just now";
}

function fmt(d) {
  if (!d) return "";
  return new Date(d).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit",hour12:true});
}

function sbFetch(path) {
  var U = process.env.NEXT_PUBLIC_SUPABASE_URL;
  var K = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return fetch(U+"/rest/v1/"+path,{headers:{"apikey":K,"Authorization":"Bearer "+K}}).then(r=>r.json());
}

// ─── Send Button ──────────────────────────────────────────────────────────────
function SendButton({onSend}) {
  var [state, setState] = useState("idle");
  var [count, setCount] = useState(5);
  var [err,   setErr]   = useState("");
  var timer = useRef(null);
  useEffect(function(){
    if (state !== "counting") return;
    if (count <= 0) {
      setState("sending");
      onSend().then(function(r){ setState("sent"); if(r&&r.stepLabel) setErr(r.stepLabel); })
               .catch(function(e){ setState("error"); setErr(e.message||"Send failed"); setTimeout(function(){setState("idle");setCount(5);setErr("");},4000); });
      return;
    }
    timer.current = setTimeout(function(){setCount(c=>c-1);},1000);
    return function(){clearTimeout(timer.current);};
  },[state,count]);
  var base = {padding:"8px 18px",borderRadius:5,fontSize:13,fontWeight:600,cursor:"pointer",border:"none"};
  if (state==="sent")     return <span style={{...base,background:"rgba(46,204,113,0.12)",border:"1px solid rgba(46,204,113,0.3)",color:T.green}}>✓ Sent{err?" · "+err:""}</span>;
  if (state==="sending")  return <span style={{...base,color:T.blue,background:"transparent"}}>Sending…</span>;
  if (state==="error")    return <span style={{...base,background:"rgba(231,76,60,0.12)",border:"1px solid rgba(231,76,60,0.3)",color:T.red}}>{err}</span>;
  if (state==="counting") return (
    <span style={{display:"flex",gap:6,alignItems:"center"}}>
      <span style={{...base,background:"rgba(240,200,74,0.12)",border:"1px solid rgba(240,200,74,0.3)",color:G}}>Sending in {count}s</span>
      <button onClick={function(){clearTimeout(timer.current);setState("idle");setCount(5);}} style={{...base,background:"rgba(231,76,60,0.1)",border:"1px solid rgba(231,76,60,0.3)",color:T.red}}>Undo</button>
    </span>
  );
  return <button onClick={function(){setState("counting");setCount(5);}} style={{...base,background:"rgba(46,204,113,0.12)",border:"1px solid rgba(46,204,113,0.3)",color:T.green}}>Send via LinkedIn</button>;
}

// ─── Thread Panel ─────────────────────────────────────────────────────────────
function ThreadPanel({item, onDone, onClose, onNavigate}) {
  var [thread,     setThread]     = useState([]);
  var [loading,    setLoading]    = useState(true);
  var [reply,      setReply]      = useState("");
  var [generating, setGenerating] = useState(false);
  var [showSnooze, setShowSnooze] = useState(false);
  var [snoozeDraft,setSnoozeDraft]= useState("");
  var [snoozeDate, setSnoozeDate] = useState("");
  var [snoozeMode, setSnoozeMode] = useState("resurface");
  var [snoozing,   setSnoozing]   = useState(false);
  var [snoozed,    setSnoozed]    = useState(false);
  var threadRef = useRef(null);

  // Load full thread from HeyReach + Supabase communications
  useEffect(function(){
    if (!item) return;
    setLoading(true);
    setThread([]);
    setReply("");

    // Pull Supabase communications for this contact
    var sbMsgs = [];
    var heyMsgs = [];

    var sbPromise = item.supabaseId
      ? sbFetch("communications?contact_id=eq."+item.supabaseId+"&order=occurred_at.asc&limit=100")
          .then(function(data){ sbMsgs = Array.isArray(data)?data:[]; })
          .catch(function(){})
      : Promise.resolve();

    // Pull HeyReach chatroom
    var hrPromise = fetch("/api/follow-up-queue/thread?conversationId="+encodeURIComponent(item.conversationId)+"&linkedInAccountId="+(item.linkedInAccountId||185228)+"&contactId="+(item.supabaseId||""))
      .then(function(r){return r.json();})
      .then(function(d){ heyMsgs = Array.isArray(d.messages)?d.messages:[]; })
      .catch(function(){});

    Promise.all([sbPromise, hrPromise]).then(function(){
      // Merge — prefer HeyReach messages (more complete), augment with Supabase
      var merged = [];

      // Add HeyReach messages
      heyMsgs.forEach(function(m){
        merged.push({
          id:        m.id || Math.random(),
          direction: m.sender==="ME"||m.senderType==="SENDER"?"OUT":"IN",
          body:      m.text||m.message||m.content||"",
          sentAt:    m.sentAt||m.createdAt||m.timestamp||"",
          channel:   m.type==="INMAIL"?"InMail":"LinkedIn",
          seqKey:    null,
          source:    "heyreach"
        });
      });

      // If no HeyReach messages, fall back to Supabase comms
      if (merged.length === 0) {
        sbMsgs.forEach(function(m){
          merged.push({
            id:        m.id,
            direction: m.direction==="OUT"?"OUT":"IN",
            body:      m.body||"",
            sentAt:    m.occurred_at||"",
            channel:   m.channel||"LinkedIn",
            seqKey:    m.sequence_key||m.step_label||null,
            source:    "supabase"
          });
        });
      } else {
        // Annotate with sequence keys from Supabase where we have them
        sbMsgs.forEach(function(sb){
          if (!sb.sequence_key) return;
          // Find matching HeyReach message by approximate time
          var sbTime = new Date(sb.occurred_at).getTime();
          var match = merged.find(function(m){
            return m.direction==="OUT" && Math.abs(new Date(m.sentAt).getTime()-sbTime) < 3600000;
          });
          if (match) match.seqKey = sb.sequence_key;
        });
      }

      // Sort chronological
      merged.sort(function(a,b){ return new Date(a.sentAt)-new Date(b.sentAt); });
      setThread(merged);
      setLoading(false);

      // Pre-fill reply if item has a suggestion
      if (item.suggestedReply) setReply(item.suggestedReply);
    });
  }, [item?.conversationId]);

  // Scroll to bottom of thread when loaded
  useEffect(function(){
    if (!loading && threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  },[loading, thread]);

  async function generateReply() {
    setGenerating(true);
    try {
      var res = await fetch("/api/ai-reply-suggest", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          firstName:   item.firstName,
          lastName:    item.lastName,
          title:       item.title,
          company:     item.company,
          thread:      thread,
          lastMessage: item.lastMessage,
          category:    item.category,
        })
      });
      var d = await res.json();
      if (d.reply) setReply(d.reply);
    } catch(e){ console.error(e); }
    setGenerating(false);
  }

  async function sendReply() {
    var res = await fetch("/api/follow-up-queue", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        conversationId:    item.conversationId,
        linkedInAccountId: item.linkedInAccountId,
        message:           reply,
        profileUrl:        item.profileUrl,
        contactId:         item.supabaseId||null,
        firstName:  item.firstName, lastName: item.lastName,
        fullName:   item.fullName||(item.firstName+" "+item.lastName),
        title:      item.title||"", company: item.company||"",
        location:   item.location||"", imageUrl: item.imageUrl||"",
        campaign:   item.campaign||"",
      })
    });
    var data = await res.json();
    if (!data.success) throw new Error(data.error||"Send failed");
    if (onDone) onDone(item,"sent",reply);
    return data;
  }

  function dismiss(reason) {
    fetch("/api/follow-up-queue",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({action:"dismiss",reason,conversationId:item.conversationId,
        profileUrl:item.profileUrl,contactId:item.supabaseId||null,
        firstName:item.firstName,lastName:item.lastName||"",
        fullName:item.fullName||"",company:item.company||""})
    }).catch(function(){});
    if (onDone) onDone(item,reason,null);
  }

  async function handleSnooze() {
    if (!snoozeDate || !snoozeDraft.trim() || snoozing) return;
    setSnoozing(true);
    try {
      var SBU = process.env.NEXT_PUBLIC_SUPABASE_URL;
      var SBK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      var h = {"apikey":SBK,"Authorization":"Bearer "+SBK,"Content-Type":"application/json"};
      await fetch(SBU+"/rest/v1/scheduled_actions", {
        method:"POST", headers:h,
        body: JSON.stringify({
          contact_id:          item.supabaseId||null,
          conversation_id:     item.conversationId,
          channel:             "linkedin",
          send_at:             new Date(snoozeDate+"T17:00:00Z").toISOString(),
          message_body:        snoozeDraft,
          mode:                snoozeMode,
          contact_first_name:  item.firstName,
          contact_last_name:   item.lastName,
          contact_company:     item.company,
          contact_linkedin_url:item.profileUrl,
          status:              "pending",
        })
      });
      setSnoozed(true);
      setShowSnooze(false);
      setTimeout(function(){ if(onDone) onDone(item,"snoozed",null); }, 1000);
    } catch(e){ console.error(e); }
    setSnoozing(false);
  }

  if (!item) return null;

  var isWarm = item.category==="warm";
  var isNeg  = item.category==="not_interested";
  var accent = isWarm?T.green:isNeg?T.red:T.blue;

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",background:BG2,borderLeft:"1px solid rgba(255,255,255,0.06)"}}>

      {/* Panel header */}
      <div style={{padding:"14px 20px",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",gap:12,flexShrink:0,background:"linear-gradient(90deg,#0c1520,#0f1e2e)"}}>
        <div style={{width:42,height:42,borderRadius:"50%",overflow:"hidden",flexShrink:0,background:"rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:G,border:"1px solid "+accent+"40"}}>
          {item.imageUrl?<img src={item.imageUrl} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:((item.firstName||"?")[0]+(item.lastName||"?")[0])}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div onClick={function(){ if(onNavigate&&item.supabaseId) onNavigate("profile",{id:item.supabaseId,first_name:item.firstName,last_name:item.lastName,title:item.title,company_name:item.company,linkedin_url:item.profileUrl}); }} style={{fontSize:15,fontWeight:600,color:"#fff",cursor:item.supabaseId?"pointer":"default",textDecoration:item.supabaseId?"underline":"none"}}>{item.firstName} {item.lastName}</div>
          <div style={{fontSize:12,color:T.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}{item.company?" · "+item.company:""}</div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <span style={{fontSize:10,padding:"2px 8px",borderRadius:9,background:accent+"12",border:"1px solid "+accent+"30",color:accent,textTransform:"uppercase",letterSpacing:1}}>
            {isWarm?"Warm":isNeg?"Not Interested":"Neutral"}
          </span>
          <button onClick={onClose} style={{background:"transparent",border:"1px solid rgba(255,255,255,0.1)",color:T.muted,width:28,height:28,borderRadius:5,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>
      </div>

      {/* Thread */}
      <div ref={threadRef} style={{flex:1,overflowY:"auto",padding:"16px 20px",display:"flex",flexDirection:"column",gap:10}}>
        {loading && (
          <div style={{textAlign:"center",color:T.dim,fontSize:13,padding:"40px 0"}}>
            <div style={{marginBottom:8,fontSize:20}}>⌛</div>
            Loading conversation…
          </div>
        )}
        {!loading && thread.length===0 && (
          <div style={{textAlign:"center",color:T.dim,fontSize:13,padding:"40px 0"}}>
            No messages found — HeyReach API may be temporarily unavailable. Check LinkedIn directly or wait a moment and refresh.
          </div>
        )}
        {!loading && thread.map(function(msg,i){
          var isOut = msg.direction==="OUT";
          return (
            <div key={msg.id||i} style={{display:"flex",flexDirection:"column",alignItems:isOut?"flex-end":"flex-start",width:"100%"}}>
              {/* Channel + seq key badge */}
              <div style={{display:"flex",gap:5,marginBottom:4,alignItems:"center",flexDirection:isOut?"row-reverse":"row"}}>
                {msg.seqKey&&<span style={{fontSize:9,padding:"1px 6px",borderRadius:3,background:"rgba(74,158,186,0.12)",border:"1px solid rgba(74,158,186,0.2)",color:T.blue,fontFamily:"'Courier New',monospace",letterSpacing:0.5}}>{msg.seqKey}</span>}
                {msg.channel==="InMail"&&<span style={{fontSize:9,padding:"1px 6px",borderRadius:3,background:"rgba(155,89,182,0.12)",border:"1px solid rgba(155,89,182,0.2)",color:T.purple}}>InMail</span>}
                <span style={{fontSize:10,color:T.dim}}>{fmt(msg.sentAt)}</span>
              </div>
              {/* Bubble */}
              <div style={{maxWidth:"75%",minWidth:80,padding:"10px 14px",borderRadius:isOut?"14px 4px 14px 14px":"4px 14px 14px 14px",background:isOut?"rgba(240,200,74,0.09)":"rgba(255,255,255,0.05)",border:"1px solid "+(isOut?"rgba(240,200,74,0.25)":"rgba(255,255,255,0.09)"),fontSize:13,color:isOut?"#f5e49a":T.text,lineHeight:1.75,whiteSpace:"pre-wrap",wordBreak:"break-word",boxShadow:isOut?"0 1px 8px rgba(240,200,74,0.05)":"0 1px 8px rgba(0,0,0,0.2)"}}>
                {msg.body}
              </div>
            </div>
          );
        })}
      </div>

      {/* Reply composer */}
      <div style={{borderTop:"1px solid rgba(255,255,255,0.06)",padding:"14px 20px",flexShrink:0,background:"#0a1522"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{fontSize:11,color:T.dim,letterSpacing:2,textTransform:"uppercase"}}>Your Reply</div>
          <button onClick={generateReply} disabled={generating} style={{background:"rgba(155,89,182,0.1)",border:"1px solid rgba(155,89,182,0.25)",color:T.purple,padding:"4px 11px",borderRadius:4,cursor:"pointer",fontSize:11,letterSpacing:1}}>
            {generating?"Generating…":"✦ AI Suggest"}
          </button>
        </div>
        <textarea
          value={reply}
          onChange={function(e){setReply(e.target.value);}}
          placeholder={"Reply to "+item.firstName+"…"}
          rows={4}
          style={{width:"100%",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",color:T.text,padding:"10px 12px",borderRadius:6,fontSize:13,lineHeight:1.7,resize:"vertical",outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}
        />
        {showSnooze&&<div style={{background:"rgba(240,200,74,0.05)",border:"1px solid rgba(240,200,74,0.2)",borderRadius:6,padding:"12px 14px",marginTop:10}}>
          <div style={{fontSize:11,color:G,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Schedule This Message</div>
          <textarea value={snoozeDraft} onChange={function(e){setSnoozeDraft(e.target.value);}} placeholder={"Write the message to send on the scheduled date..."} rows={3} style={{width:"100%",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",color:T.text,padding:"8px 10px",borderRadius:5,fontSize:13,lineHeight:1.65,resize:"vertical",outline:"none",fontFamily:"inherit",boxSizing:"border-box",marginBottom:8}}/>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <input type="date" value={snoozeDate} onChange={function(e){setSnoozeDate(e.target.value);}} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",color:T.text,padding:"5px 9px",borderRadius:4,fontSize:12,outline:"none",cursor:"pointer"}}/>
            <div style={{display:"flex",gap:4}}>
              {["resurface","auto_send"].map(function(m){return(
                <button key={m} onClick={function(){setSnoozeMode(m);}} style={{padding:"4px 10px",borderRadius:4,cursor:"pointer",fontSize:11,border:"1px solid "+(snoozeMode===m?"rgba(240,200,74,0.4)":"rgba(255,255,255,0.08)"),background:snoozeMode===m?"rgba(240,200,74,0.1)":"transparent",color:snoozeMode===m?G:"#8ab4cc"}}>
                  {m==="resurface"?"Review First":"Auto-Send"}
                </button>
              );})}
            </div>
            <button onClick={handleSnooze} disabled={!snoozeDate||!snoozeDraft.trim()||snoozing} style={{padding:"5px 14px",background:snoozed?"rgba(46,204,113,0.15)":"rgba(240,200,74,0.12)",border:"1px solid "+(snoozed?"rgba(46,204,113,0.4)":"rgba(240,200,74,0.3)"),color:snoozed?"#2ecc71":G,borderRadius:4,cursor:"pointer",fontSize:12,fontWeight:600}}>
              {snoozing?"Saving...":snoozed?"✓ Scheduled":"Schedule"}
            </button>
          </div>
        </div>}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10}}>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <button onClick={function(){dismiss("scheduled");}} style={{padding:"6px 12px",background:"rgba(74,158,186,0.1)",border:"1px solid rgba(74,158,186,0.2)",color:T.blue,borderRadius:4,cursor:"pointer",fontSize:12}}>Scheduled</button>
            <button onClick={function(){dismiss("not_interested");}} style={{padding:"6px 12px",background:"rgba(231,76,60,0.08)",border:"1px solid rgba(231,76,60,0.2)",color:T.red,borderRadius:4,cursor:"pointer",fontSize:12}}>Not Interested</button>
            <button onClick={function(){dismiss("opted_out");}} style={{padding:"6px 12px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",color:T.muted,borderRadius:4,cursor:"pointer",fontSize:12}}>Opted Out</button>
            <button onClick={function(){setShowSnooze(function(v){return !v;});}} style={{padding:"6px 12px",background:showSnooze?"rgba(240,200,74,0.12)":"rgba(255,255,255,0.03)",border:"1px solid "+(showSnooze?"rgba(240,200,74,0.3)":"rgba(255,255,255,0.08)"),color:showSnooze?G:"#8ab4cc",borderRadius:4,cursor:"pointer",fontSize:12}}>⏰ Snooze</button>
          </div>
          <SendButton onSend={sendReply}/>
        </div>
      </div>
    </div>
  );
}

// ─── Queue Card (left list item) ─────────────────────────────────────────────
function QueueCard({item, selected, onClick, gone}) {
  if (gone) return null;
  var isWarm = item.category==="warm";
  var isNeg  = item.category==="not_interested";
  var accent = isWarm?T.green:isNeg?T.red:T.blue;
  var isSelected = selected;
  return (
    <div onClick={onClick} style={{
      padding:"12px 14px",borderRadius:6,cursor:"pointer",
      background: isSelected?"rgba(240,200,74,0.06)":"rgba(255,255,255,0.01)",
      border:"1px solid "+(isSelected?G+"40":accent+"20"),
      borderLeft:"3px solid "+(isSelected?G:accent),
      transition:"all 0.12s",marginBottom:6
    }}>
      <div style={{display:"flex",gap:10,alignItems:"center"}}>
        <div style={{width:34,height:34,borderRadius:"50%",overflow:"hidden",flexShrink:0,background:"rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:G}}>
          {item.imageUrl?<img src={item.imageUrl} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:((item.firstName||"?")[0]+(item.lastName||"?")[0])}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:600,color:isSelected?"#fff":T.text,display:"flex",justifyContent:"space-between"}}>
            <span>{item.firstName} {item.lastName}</span>
            <span style={{fontSize:10,color:T.dim,fontWeight:400,flexShrink:0,marginLeft:6}}>{timeAgo(item.lastMessageAt)}</span>
          </div>
          <div style={{fontSize:11,color:T.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.company||item.title||""}</div>
          <div style={{fontSize:12,color:T.dim,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginTop:3,fontStyle:"italic"}}>"{item.lastMessage}"</div>
        </div>
      </div>
      {isWarm&&<div style={{marginTop:6,fontSize:10,color:T.green,letterSpacing:1}}>● WARM REPLY</div>}
      {isNeg&&<div style={{marginTop:6,fontSize:10,color:T.red,letterSpacing:1}}>● NOT INTERESTED</div>}
      {item.scheduledActions&&item.scheduledActions.length>0&&(
        <div style={{marginTop:5,display:"flex",gap:4,flexWrap:"wrap"}}>
          {item.scheduledActions.map(function(sa,i){
            var d=new Date(sa.send_at);
            var dateStr=d.toLocaleDateString("en-US",{month:"short",day:"numeric"});
            return(
              <span key={sa.id||i} style={{fontSize:9,padding:"1px 7px",borderRadius:9,background:"rgba(155,89,182,0.1)",border:"1px solid rgba(155,89,182,0.2)",color:"#9b59b6"}}>⏰ {dateStr}</span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main FollowUp Component ──────────────────────────────────────────────────
export default function FollowUp({onNavigate}) {
  var [queue,    setQueue]    = useState([]);
  var [snoozed,  setSnoozed]  = useState([]);
  var [done,     setDone]     = useState([]);
  var [loading,  setLoading]  = useState(true);
  var [error,    setError]    = useState("");
  var [selected, setSelected] = useState(null);
  var [goneIds,  setGoneIds]  = useState(new Set());
  var [daily,    setDaily]    = useState(0);
  var [voiceCmd, setVoiceCmd] = useState("");
  var [voiceRunning,setVoiceRunning] = useState(false);
  var [voiceResult,setVoiceResult]  = useState("");
  var [voiceListening,setVoiceListening] = useState(false);
  var [showVoice,setShowVoice] = useState(false);

  useEffect(function(){
    setLoading(true);
    fetch("/api/follow-up-queue")
      .then(function(r){return r.json();})
      .then(function(d){
        var q = Array.isArray(d.queue)?d.queue:[];
        setQueue(q);
        setDaily(d.todayCount||0);
        setSelected(q.length>0 ? q[0] : null);
      })
      .catch(function(e){setError(e.message);})
      .finally(function(){setLoading(false);});
  },[]);

  function handleDone(item, reason, msg) {
    setGoneIds(function(prev){ var n=new Set(prev); n.add(item.id); return n; });
    if (reason==="sent") {
      setDone(function(p){ return [{...item,sentMessage:msg,completedAt:new Date().toISOString()}].concat(p); });
      setDaily(function(d){return d+1;});
    }
    if (reason==="snoozed") {
      // reload snoozed list
      var SBU2 = process.env.NEXT_PUBLIC_SUPABASE_URL;
      var SBK2 = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      fetch("/api/scheduled-actions").then(function(r){return r.json();})
        .then(function(sa){setSnoozed(Array.isArray(sa)?sa:[]);}).catch(function(){});
    }
    // Select next card
    var remaining = queue.filter(function(q){ return !goneIds.has(q.id) && q.id!==item.id; });
    setSelected(remaining.length>0?remaining[0]:null);
  }

  function startGlobalVoice() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Voice input requires Chrome"); return; }
    var r = new SR(); r.lang="en-US"; r.interimResults=false;
    r.onresult=function(e){ setVoiceCmd(e.results[0][0].transcript); setVoiceListening(false); };
    r.onerror=function(){ setVoiceListening(false); };
    r.onend=function(){ setVoiceListening(false); };
    r.start(); setVoiceListening(true);
  }

  async function runGlobalVoice() {
    if (!voiceCmd.trim() || voiceRunning) return;
    setVoiceRunning(true); setVoiceResult("");
    try {
      var res = await fetch("/api/smart-action", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ command: voiceCmd, contact: null, conversationId: null })
      });
      var d = await res.json();
      setVoiceResult(d.confirmation || "Done");
      setVoiceCmd("");
      // Reload snoozed
      fetch("/api/scheduled-actions").then(function(r){return r.json();}).then(function(sa){setSnoozed(Array.isArray(sa)?sa:[]);}).catch(function(){});
    } catch(e){ setVoiceResult("Error — try again"); }
    setVoiceRunning(false);
  }

  var activeQueue = queue.filter(function(q){ return !goneIds.has(q.id); });
  var isEmpty = !loading && activeQueue.length===0;

  return (
    <div style={{fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,serif",display:"flex",height:"100%",overflow:"hidden",background:BG}}>

      {/* LEFT — Card list */}
      <div style={{width:320,flexShrink:0,display:"flex",flexDirection:"column",borderRight:"1px solid rgba(255,255,255,0.06)",background:BG2,overflow:"hidden"}}>

        {/* Header */}
        <div style={{padding:"14px 16px",borderBottom:"1px solid rgba(255,255,255,0.06)",flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:11,letterSpacing:3,color:G,textTransform:"uppercase",fontWeight:600}}>Follow-Up Queue</div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              {daily>0&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:9,background:"rgba(46,204,113,0.12)",border:"1px solid rgba(46,204,113,0.2)",color:T.green}}>{daily} sent today</span>}
              <span style={{fontSize:11,color:T.dim}}>{activeQueue.length} waiting</span>
            </div>
          </div>
        </div>

        {/* Global voice intake */}
        {showVoice&&<div style={{padding:"10px 12px",borderBottom:"1px solid rgba(255,255,255,0.06)",background:"rgba(240,200,74,0.03)",flexShrink:0}}>
          <div style={{fontSize:10,color:G,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Add to Follow-Up</div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={startGlobalVoice} style={{padding:"6px 10px",background:voiceListening?"rgba(231,76,60,0.15)":"rgba(74,158,186,0.08)",border:"1px solid "+(voiceListening?"rgba(231,76,60,0.3)":"rgba(74,158,186,0.2)"),color:voiceListening?"#e74c3c":"#4a9eba",borderRadius:4,cursor:"pointer",fontSize:11,flexShrink:0}}>{voiceListening?"🔴":"🎙"}</button>
            <input value={voiceCmd} onChange={function(e){setVoiceCmd(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter")runGlobalVoice();}} placeholder="Follow up with [name] about [topic]..." style={{flex:1,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",color:"#e8f2ff",padding:"6px 10px",borderRadius:4,fontSize:12,outline:"none",fontFamily:"inherit"}}/>
            <button onClick={runGlobalVoice} disabled={!voiceCmd.trim()||voiceRunning} style={{padding:"6px 12px",background:"rgba(240,200,74,0.1)",border:"1px solid rgba(240,200,74,0.25)",color:G,borderRadius:4,cursor:"pointer",fontSize:11,fontWeight:600,flexShrink:0}}>{voiceRunning?"...":"Go"}</button>
          </div>
          {voiceResult&&<div style={{marginTop:5,fontSize:11,color:"#2ecc71"}}>✓ {voiceResult}</div>}
        </div>}

        {/* Cards */}
        <div style={{flex:1,overflowY:"auto",padding:"10px 10px"}}>
          {loading&&<div style={{color:T.dim,fontSize:13,textAlign:"center",padding:"30px 0"}}>Loading…</div>}
          {error&&<div style={{color:T.red,fontSize:12,textAlign:"center",padding:"20px"}}>{error}</div>}
          {isEmpty&&!loading&&(
            <div style={{textAlign:"center",padding:"40px 20px"}}>
              <div style={{fontSize:28,marginBottom:10}}>✓</div>
              <div style={{fontSize:13,color:T.dim}}>Queue is clear</div>
            </div>
          )}
          {activeQueue.map(function(item){
            return <QueueCard key={item.id} item={item} selected={selected?.id===item.id} gone={goneIds.has(item.id)} onClick={function(){setSelected(item);}}/>;
          })}

          {/* Snoozed section */}
          {snoozed.length>0&&<>
            <div style={{fontSize:10,color:G,letterSpacing:2,textTransform:"uppercase",padding:"10px 4px 6px",display:"flex",justifyContent:"space-between"}}>
              <span>⏰ Snoozed ({snoozed.length})</span>
            </div>
            {snoozed.map(function(sa){
              var sendDate = new Date(sa.send_at);
              var daysOut  = Math.ceil((sendDate-Date.now())/86400000);
              var label    = daysOut<=0?"Today":daysOut===1?"Tomorrow":"In "+daysOut+" days";
              return (
                <div key={sa.id} style={{padding:"10px 12px",borderRadius:6,background:"rgba(240,200,74,0.03)",border:"1px solid rgba(240,200,74,0.12)",marginBottom:6,borderLeft:"3px solid rgba(240,200,74,0.3)"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div style={{fontSize:12,color:T.text,fontWeight:500}}>{sa.contact_first_name} {sa.contact_last_name}</div>
                    <span style={{fontSize:10,color:G,flexShrink:0,marginLeft:6}}>{label}</span>
                  </div>
                  <div style={{fontSize:11,color:T.muted}}>{sa.contact_company}</div>
                  <div style={{fontSize:11,color:T.dim,fontStyle:"italic",marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>"{sa.message_body}"</div>
                  <div style={{display:"flex",gap:4,marginTop:5,alignItems:"center"}}>
                    <span style={{fontSize:9,padding:"1px 6px",borderRadius:3,background:"rgba(74,158,186,0.1)",border:"1px solid rgba(74,158,186,0.2)",color:T.blue}}>{sa.channel.toUpperCase()}</span>
                    <span style={{fontSize:9,padding:"1px 6px",borderRadius:3,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)",color:T.dim}}>{sa.mode==="auto_send"?"AUTO-SEND":"REVIEW FIRST"}</span>
                    <span style={{fontSize:9,color:T.dim,marginLeft:"auto"}}>{sendDate.toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>
                  </div>
                </div>
              );
            })}
          </>}

          {/* Done section */}
          {done.length>0&&<>
            <div style={{fontSize:10,color:T.dim,letterSpacing:2,textTransform:"uppercase",padding:"10px 4px 6px"}}>Completed this session</div>
            {done.map(function(item){
              return (
                <div key={item.id+"done"} style={{padding:"10px 12px",borderRadius:6,background:"rgba(255,255,255,0.01)",border:"1px solid rgba(255,255,255,0.04)",marginBottom:6,opacity:0.5}}>
                  <div style={{fontSize:12,color:T.muted}}>{item.firstName} {item.lastName}</div>
                  <div style={{fontSize:11,color:T.dim,fontStyle:"italic",marginTop:2}}>Sent · {timeAgo(item.completedAt)}</div>
                </div>
              );
            })}
          </>}
        </div>
      </div>

      {/* RIGHT — Thread panel */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {selected
          ? <ThreadPanel key={selected.id} item={selected} onDone={handleDone} onClose={function(){setSelected(null);}} onNavigate={onNavigate}/>
          : <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",color:T.dim,gap:10}}>
              <div style={{fontSize:32,opacity:0.3}}>↩</div>
              <div style={{fontSize:14}}>Select a conversation</div>
              <div style={{fontSize:12,color:T.dim,opacity:0.7}}>Full thread appears here</div>
            </div>
        }
      </div>
    </div>
  );
}
