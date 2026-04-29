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
function ThreadPanel({item, onDone, onClose}) {
  var [thread,     setThread]     = useState([]);
  var [loading,    setLoading]    = useState(true);
  var [reply,      setReply]      = useState("");
  var [generating, setGenerating] = useState(false);
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
          <div style={{fontSize:15,fontWeight:600,color:"#fff"}}>{item.firstName} {item.lastName}</div>
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
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10}}>
          <div style={{display:"flex",gap:6}}>
            <button onClick={function(){dismiss("scheduled");}} style={{padding:"6px 12px",background:"rgba(74,158,186,0.1)",border:"1px solid rgba(74,158,186,0.2)",color:T.blue,borderRadius:4,cursor:"pointer",fontSize:12}}>Scheduled</button>
            <button onClick={function(){dismiss("not_interested");}} style={{padding:"6px 12px",background:"rgba(231,76,60,0.08)",border:"1px solid rgba(231,76,60,0.2)",color:T.red,borderRadius:4,cursor:"pointer",fontSize:12}}>Not Interested</button>
            <button onClick={function(){dismiss("opted_out");}} style={{padding:"6px 12px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",color:T.muted,borderRadius:4,cursor:"pointer",fontSize:12}}>Opted Out</button>
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
    </div>
  );
}

// ─── Main FollowUp Component ──────────────────────────────────────────────────
export default function FollowUp({onNavigate}) {
  var [queue,   setQueue]   = useState([]);
  var [done,    setDone]    = useState([]);
  var [loading, setLoading] = useState(true);
  var [error,   setError]   = useState("");
  var [selected, setSelected] = useState(null); // item
  var [goneIds,  setGoneIds]  = useState(new Set());
  var [daily,    setDaily]    = useState(0);

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
    // Select next card
    var remaining = queue.filter(function(q){ return !goneIds.has(q.id) && q.id!==item.id; });
    setSelected(remaining.length>0?remaining[0]:null);
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
          ? <ThreadPanel key={selected.id} item={selected} onDone={handleDone} onClose={function(){setSelected(null);}}/>
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
