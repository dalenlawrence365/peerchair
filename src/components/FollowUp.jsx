"use client"
import { useState, useEffect, useRef } from "react";

var G = "#f0c84a";
var BG = "#080f1a";
var BG2 = "#0c1520";
var BG3 = "#0f1e2e";
var T = {
  text:"#e8f2ff", muted:"#7a9bb8", dim:"#3a5a74",
  border:"rgba(255,255,255,0.06)",
  green:"#2ecc71", red:"#e74c3c", orange:"#e67e22", blue:"#4a9eba"
};

function timeAgo(dateStr) {
  if (!dateStr) return "";
  var diff = Date.now() - new Date(dateStr).getTime();
  var days = Math.floor(diff / 86400000);
  var hrs = Math.floor(diff / 3600000);
  if (days > 0) return days + "d ago";
  if (hrs > 0) return hrs + "h ago";
  return "just now";
}

function SendButton(props) {
  var onSend = props.onSend;
  var [state, setState] = useState("idle");
  var [count, setCount] = useState(5);
  var timer = useRef(null);

  useEffect(function() {
    if (state !== "counting") return;
    if (count <= 0) {
      setState("sending");
      onSend().then(function() {
        setState("sent");
      }).catch(function() {
        setState("idle");
        setCount(5);
      });
      return;
    }
    timer.current = setTimeout(function() {
      setCount(function(c) { return c - 1; });
    }, 1000);
    return function() { clearTimeout(timer.current); };
  }, [state, count]);

  if (state === "sent") {
    return <span style={{padding:"6px 14px",background:"rgba(46,204,113,0.1)",border:"1px solid rgba(46,204,113,0.3)",color:T.green,borderRadius:5,fontSize:12,fontWeight:600}}>Sent</span>;
  }
  if (state === "sending") {
    return <span style={{padding:"6px 14px",color:T.blue,fontSize:12}}>Sending...</span>;
  }
  if (state === "counting") {
    return (
      <span style={{display:"flex",gap:6,alignItems:"center"}}>
        <span style={{padding:"6px 14px",background:"rgba(240,200,74,0.1)",border:"1px solid rgba(240,200,74,0.3)",color:G,borderRadius:5,fontSize:12}}>Sending in {count}s</span>
        <button onClick={function(){ clearTimeout(timer.current); setState("idle"); setCount(5); }} style={{padding:"6px 12px",background:"rgba(231,76,60,0.1)",border:"1px solid rgba(231,76,60,0.3)",color:T.red,borderRadius:5,cursor:"pointer",fontSize:12}}>Undo</button>
      </span>
    );
  }
  return (
    <button onClick={function(){ setState("counting"); setCount(5); }} style={{padding:"6px 14px",background:"rgba(46,204,113,0.12)",border:"1px solid rgba(46,204,113,0.3)",color:T.green,borderRadius:5,cursor:"pointer",fontSize:12,fontWeight:600}}>Send via LinkedIn</button>
  );
}

function QueueCard(props) {
  var item = props.item;
  var onProfile = props.onProfile;
  var onDismiss = props.onDismiss;
  var [reply, setReply] = useState("");
  var [editing, setEditing] = useState(false);
  var [gone, setGone] = useState(false);

  useEffect(function() {
    if (item.suggestedReply) setReply(item.suggestedReply);
  }, [item.suggestedReply]);

  if (gone) return null;

  var isNeg = item.category === "not_interested";
  var isWarm = item.category === "warm";
  var borderColor = isWarm ? T.green : isNeg ? T.red : T.blue;

  async function sendReply() {
    var res = await fetch("/api/follow-up-queue", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({conversationId:item.conversationId,linkedInAccountId:item.linkedInAccountId,message:reply})
    });
    var data = await res.json();
    if (!data.success) throw new Error("Send failed");
    setGone(true);
    if (onDismiss) onDismiss(item.id);
  }

  function dismiss() { setGone(true); if (onDismiss) onDismiss(item.id); }

  return (
    <div style={{background:BG3,border:"1px solid "+borderColor+"30",borderLeft:"3px solid "+borderColor,borderRadius:7,padding:"14px 16px",marginBottom:10}}>
      <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:8}}>
        <div style={{width:38,height:38,borderRadius:"50%",background:"rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:600,color:G,flexShrink:0,overflow:"hidden"}}>
          {item.imageUrl ? <img src={item.imageUrl} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/> : ((item.firstName||"?")[0]+(item.lastName||"?")[0])}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:2}}>
            <span onClick={function(){ if(onProfile) onProfile(item); }} style={{fontSize:13,fontWeight:600,color:G,cursor:"pointer"}}>{item.firstName} {item.lastName}</span>
            <span style={{fontSize:9,padding:"1px 6px",borderRadius:8,background:borderColor+"14",color:borderColor,border:"1px solid "+borderColor+"30"}}>{isWarm?"Warm":isNeg?"Not Interested":"Neutral"}</span>
            <span style={{fontSize:10,color:T.dim,marginLeft:"auto"}}>{timeAgo(item.lastMessageAt)}</span>
          </div>
          <div style={{fontSize:11,color:T.muted}}>{item.title}{item.company ? " · "+item.company : ""}</div>
        </div>
      </div>

      <div style={{padding:"8px 11px",background:"rgba(255,255,255,0.02)",border:"1px solid "+T.border,borderRadius:5,marginBottom:10,fontSize:13,color:T.muted,lineHeight:1.6,fontStyle:"italic"}}>
        "{item.lastMessage}"
      </div>

      {isNeg ? (
        <div style={{display:"flex",gap:8}}>
          <button onClick={dismiss} style={{padding:"5px 12px",background:"rgba(231,76,60,0.1)",border:"1px solid rgba(231,76,60,0.3)",color:T.red,borderRadius:5,cursor:"pointer",fontSize:12}}>Mark Not a Fit</button>
          <button onClick={dismiss} style={{padding:"5px 12px",background:"transparent",border:"1px solid "+T.border,color:T.dim,borderRadius:5,cursor:"pointer",fontSize:12}}>Dismiss</button>
        </div>
      ) : (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <span style={{fontSize:10,color:G,letterSpacing:2,textTransform:"uppercase",fontWeight:600}}>Suggested Reply</span>
            <button onClick={function(){ setEditing(function(e){ return !e; }); }} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:11}}>
              {editing?"Done":"Edit"}
            </button>
          </div>
          {!item.suggestedReply && !editing ? (
            <div style={{padding:"10px 12px",background:"rgba(255,255,255,0.02)",border:"1px solid "+T.border,borderRadius:5,fontSize:12,color:T.dim}}>Generating reply...</div>
          ) : editing ? (
            <textarea value={reply} onChange={function(e){ setReply(e.target.value); }} style={{width:"100%",background:BG2,border:"1px solid rgba(240,200,74,0.3)",color:T.text,padding:"10px 12px",borderRadius:5,fontSize:13,lineHeight:1.7,resize:"vertical",outline:"none",fontFamily:"inherit",boxSizing:"border-box",minHeight:90}}/>
          ) : (
            <div onClick={function(){ setEditing(true); }} style={{padding:"10px 12px",background:"rgba(240,200,74,0.03)",border:"1px solid rgba(240,200,74,0.15)",borderRadius:5,fontSize:13,color:T.text,lineHeight:1.7,cursor:"text",whiteSpace:"pre-wrap"}}>{reply || "Click to add a reply..."}</div>
          )}
          <div style={{display:"flex",gap:8,marginTop:10,alignItems:"center"}}>
            <SendButton onSend={sendReply}/>
            <button onClick={dismiss} style={{padding:"6px 12px",background:"transparent",border:"1px solid "+T.border,color:T.dim,borderRadius:5,cursor:"pointer",fontSize:12}}>Snooze</button>
            <button onClick={dismiss} style={{padding:"6px 12px",background:"transparent",border:"1px solid rgba(231,76,60,0.3)",color:T.red,borderRadius:5,cursor:"pointer",fontSize:12}}>Not a Fit</button>
            {item.profileUrl && <a href={item.profileUrl} target="_blank" rel="noreferrer" style={{marginLeft:"auto",fontSize:11,color:T.dim,textDecoration:"none"}}>LinkedIn →</a>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function FollowUp(props) {
  var onNavigate = props.onNavigate;
  var [queue, setQueue] = useState([]);
  var [loading, setLoading] = useState(true);
  var [dismissed, setDismissed] = useState({});
  var mountedRef = useRef(true);

  useEffect(function() {
    mountedRef.current = true;
    loadQueue();
    return function() { mountedRef.current = false; };
  }, []);

  function loadQueue() {
    setLoading(true);
    fetch("/api/follow-up-queue")
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!mountedRef.current) return;
        var items = Array.isArray(data.queue) ? data.queue : [];
        setQueue(items);
        setLoading(false);
        generateReplies(items);
      })
      .catch(function(e) {
        if (!mountedRef.current) return;
        console.error("queue load error:", e);
        setLoading(false);
      });
  }

  function generateReplies(items) {
    var actionable = items.filter(function(i) { return i.category !== "not_interested"; });
    var idx = 0;
    function next() {
      if (idx >= actionable.length || !mountedRef.current) return;
      var item = actionable[idx];
      idx++;
      fetch("/api/generate-reply", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({firstName:item.firstName,title:item.title,company:item.company,lastMessage:item.lastMessage})
      })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (!mountedRef.current) return;
        if (d.reply) {
          var id = item.id;
          var rep = d.reply;
          setQueue(function(prev) {
            return prev.map(function(q) {
              if (q.id === id) {
                var updated = {};
                for (var k in q) updated[k] = q[k];
                updated.suggestedReply = rep;
                return updated;
              }
              return q;
            });
          });
        }
        next();
      })
      .catch(function() { next(); });
    }
    next();
  }

  function handleDismiss(id) {
    setDismissed(function(prev) {
      var next = {};
      for (var k in prev) next[k] = prev[k];
      next[id] = true;
      return next;
    });
  }

  function handleProfile(item) {
    if (!onNavigate) return;
    // Look up real Supabase contact by LinkedIn URL
    var SBU = process.env.NEXT_PUBLIC_SUPABASE_URL;
    var SBK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!SBU || !SBK || !item.profileUrl) {
      onNavigate("profile", {id:null,first_name:item.firstName,last_name:item.lastName,title:item.title,company_name:item.company,linkedin_url:item.profileUrl});
      return;
    }
    // Extract slug from LinkedIn URL for matching
    var slug = item.profileUrl.split("/in/").pop().replace(/\/+$/,"").toLowerCase();
    fetch(SBU+"/rest/v1/contacts?linkedin_url=ilike.*"+slug+"*&select=id,first_name,last_name,title,company_name,linkedin_url,pipeline_stage,linkedin_image_url&limit=1", {
      headers:{"apikey":SBK,"Authorization":"Bearer "+SBK}
    })
    .then(function(r){return r.json();})
    .then(function(data){
      if(Array.isArray(data) && data.length > 0) {
        onNavigate("profile", data[0]);
      } else {
        // Contact not in Supabase yet - navigate with what we have
        onNavigate("profile", {id:null,first_name:item.firstName,last_name:item.lastName,title:item.title,company_name:item.company,linkedin_url:item.profileUrl});
      }
    })
    .catch(function() {
      onNavigate("profile", {id:null,first_name:item.firstName,last_name:item.lastName,title:item.title,company_name:item.company,linkedin_url:item.profileUrl});
    });
  }

  var visible = queue.filter(function(i) { return !dismissed[i.id]; });
  var warmItems = visible.filter(function(i){ return i.category === "warm"; });
  var neutralItems = visible.filter(function(i){ return i.category === "neutral"; });
  var negItems = visible.filter(function(i){ return i.category === "not_interested"; });

  return (
    <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden",background:BG,fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,serif"}}>
      <div style={{padding:"16px 24px 12px",borderBottom:"1px solid "+T.border,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div>
            <h2 style={{fontSize:18,fontWeight:700,color:T.text,margin:"0 0 2px"}}>Follow-Up Queue</h2>
            <div style={{fontSize:12,color:T.muted}}>LinkedIn replies waiting for your response</div>
          </div>
          <button onClick={loadQueue} style={{padding:"6px 12px",background:"rgba(255,255,255,0.03)",border:"1px solid "+T.border,color:T.muted,borderRadius:5,cursor:"pointer",fontSize:11}}>Refresh</button>
        </div>
        {!loading && (
          <div style={{display:"flex",gap:8}}>
            {[{l:"Warm",c:warmItems.length,col:T.green},{l:"Neutral",c:neutralItems.length,col:T.blue},{l:"Not Interested",c:negItems.length,col:T.red},{l:"Total",c:visible.length,col:T.muted}].map(function(s){
              return <div key={s.l} style={{padding:"4px 12px",background:s.col+"10",border:"1px solid "+s.col+"30",borderRadius:5,fontSize:11,color:s.col}}><strong>{s.c}</strong> {s.l}</div>;
            })}
          </div>
        )}
      </div>

      <div style={{flex:1,overflowY:"auto",padding:"16px 24px"}}>
        {loading && <div style={{textAlign:"center",padding:60,color:T.dim,fontSize:13}}>Loading queue...</div>}
        {!loading && visible.length === 0 && (
          <div style={{textAlign:"center",padding:60,color:T.dim}}>
            <div style={{fontSize:32,marginBottom:12,opacity:0.2}}>✓</div>
            <div style={{fontSize:15,fontWeight:600,color:T.muted,marginBottom:6}}>Queue is empty</div>
            <div style={{fontSize:13}}>No open conversations waiting for a reply.</div>
          </div>
        )}
        {warmItems.length > 0 && (
          <div style={{marginBottom:20}}>
            <div style={{fontSize:10,color:T.green,letterSpacing:2,textTransform:"uppercase",fontWeight:600,marginBottom:10}}>Warm Replies</div>
            {warmItems.map(function(item){ return <QueueCard key={item.id} item={item} onProfile={handleProfile} onDismiss={handleDismiss}/>; })}
          </div>
        )}
        {neutralItems.length > 0 && (
          <div style={{marginBottom:20}}>
            <div style={{fontSize:10,color:T.blue,letterSpacing:2,textTransform:"uppercase",fontWeight:600,marginBottom:10}}>Neutral Replies</div>
            {neutralItems.map(function(item){ return <QueueCard key={item.id} item={item} onProfile={handleProfile} onDismiss={handleDismiss}/>; })}
          </div>
        )}
        {negItems.length > 0 && (
          <div style={{marginBottom:20}}>
            <div style={{fontSize:10,color:T.red,letterSpacing:2,textTransform:"uppercase",fontWeight:600,marginBottom:10}}>Not Interested</div>
            {negItems.map(function(item){ return <QueueCard key={item.id} item={item} onProfile={handleProfile} onDismiss={handleDismiss}/>; })}
          </div>
        )}
      </div>
    </div>
  );
}
