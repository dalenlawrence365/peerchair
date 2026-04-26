"use client"
import { useState, useEffect, useRef } from "react";

var G = "#f0c84a";
var BG = "#080f1a";
var BG2 = "#0c1520";
var BG3 = "#0f1e2e";
var T = {
  text:"#e8f2ff", muted:"#7a9bb8", dim:"#3a5a74",
  border:"rgba(255,255,255,0.06)", gold:G,
  green:"#2ecc71", red:"#e74c3c", orange:"#e67e22",
  blue:"#4a9eba", purple:"#9b59b6"
};

function timeAgo(dateStr) {
  var diff = Date.now() - new Date(dateStr).getTime();
  var hrs = Math.floor(diff / 3600000);
  var days = Math.floor(diff / 86400000);
  if (days > 1) return days + "d ago";
  if (hrs > 0) return hrs + "h ago";
  return "just now";
}

function Avatar(props) {
  var item = props.item;
  return (
    <div style={{width:40,height:40,borderRadius:"50%",flexShrink:0,overflow:"hidden",background:"rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:600,color:G,border:"1px solid rgba(255,255,255,0.08)"}}>
      {item.imageUrl
        ? <img src={item.imageUrl} style={{width:"100%",height:"100%",objectFit:"cover"}} alt={item.firstName}/>
        : (item.firstName||"?")[0]+(item.lastName||"?")[0]
      }
    </div>
  );
}

function SendButton(props) {
  var onSend = props.onSend;
  var [countdown, setCountdown] = useState(null);
  var [sending, setSending] = useState(false);
  var [sent, setSent] = useState(false);
  var timerRef = useRef(null);

  function handleClick() {
    if (sending || sent) return;
    setCountdown(5);
  }

  useEffect(function() {
    if (countdown === null) return;
    if (countdown === 0) {
      clearInterval(timerRef.current);
      setSending(true);
      onSend().then(function() {
        setSending(false);
        setSent(true);
      }).catch(function() {
        setSending(false);
        setCountdown(null);
      });
      return;
    }
    timerRef.current = setTimeout(function() {
      setCountdown(function(c) { return c - 1; });
    }, 1000);
    return function() { clearTimeout(timerRef.current); };
  }, [countdown]);

  function handleUndo() {
    clearTimeout(timerRef.current);
    setCountdown(null);
  }

  if (sent) return <div style={{padding:"6px 14px",background:"rgba(46,204,113,0.1)",border:"1px solid #2ecc7140",color:T.green,borderRadius:5,fontSize:12,fontWeight:600}}>Sent</div>;

  if (countdown !== null && countdown > 0) return (
    <div style={{display:"flex",gap:6,alignItems:"center"}}>
      <div style={{padding:"6px 14px",background:"rgba(240,200,74,0.1)",border:"1px solid "+G+"40",color:G,borderRadius:5,fontSize:12}}>Sending in {countdown}s...</div>
      <button onClick={handleUndo} style={{padding:"6px 12px",background:"rgba(231,76,60,0.1)",border:"1px solid #e74c3c40",color:T.red,borderRadius:5,cursor:"pointer",fontSize:12}}>Undo</button>
    </div>
  );

  if (sending) return <div style={{padding:"6px 14px",background:"rgba(74,158,186,0.1)",border:"1px solid "+T.blue+"40",color:T.blue,borderRadius:5,fontSize:12}}>Sending...</div>;

  return (
    <button onClick={handleClick} style={{padding:"6px 14px",background:"rgba(46,204,113,0.12)",border:"1px solid #2ecc7140",color:T.green,borderRadius:5,cursor:"pointer",fontSize:12,fontWeight:600}}>Send via LinkedIn</button>
  );
}

function QueueItem(props) {
  var item = props.item;
  var onNavigate = props.onNavigate;
  var onDismiss = props.onDismiss;
  var [reply, setReply] = useState(item.suggestedReply || "");
  var [editing, setEditing] = useState(false);
  var [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  var isNotInterested = item.category === "not_interested";
  var isWarm = item.category === "warm";

  async function sendReply() {
    var res = await fetch("/api/follow-up-queue", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({
        conversationId: item.conversationId,
        linkedInAccountId: item.linkedInAccountId,
        message: reply
      })
    });
    var data = await res.json();
    if (!data.success) throw new Error(data.error || "Send failed");
    if (onDismiss) onDismiss(item.id);
  }

  function handleMarkNotFit() {
    setDismissed(true);
    if (onDismiss) onDismiss(item.id);
  }

  return (
    <div style={{background:BG3,border:"1px solid "+(isWarm?T.green+"30":isNotInterested?T.red+"30":T.border),borderLeft:"3px solid "+(isWarm?T.green:isNotInterested?T.red:T.blue),borderRadius:7,padding:"14px 16px",marginBottom:10,transition:"all 0.2s"}}>

      {/* Header */}
      <div style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:10}}>
        <Avatar item={item}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
            <span onClick={function(){onNavigate(item);}} style={{fontSize:14,fontWeight:600,color:G,cursor:"pointer"}}>{item.fullName}</span>
            <span style={{fontSize:10,padding:"1px 7px",borderRadius:10,background:isWarm?T.green+"14":isNotInterested?T.red+"14":T.blue+"14",color:isWarm?T.green:isNotInterested?T.red:T.blue,border:"1px solid "+(isWarm?T.green+"30":isNotInterested?T.red+"30":T.blue+"30")}}>
              {isWarm?"Warm":isNotInterested?"Not Interested":"Neutral"}
            </span>
            <span style={{fontSize:10,color:T.dim,marginLeft:"auto"}}>{timeAgo(item.lastMessageAt)}</span>
          </div>
          <div style={{fontSize:12,color:T.muted}}>{item.title}{item.company?" · "+item.company:""}</div>
        </div>
      </div>

      {/* Their message */}
      <div style={{padding:"8px 12px",background:"rgba(255,255,255,0.03)",border:"1px solid "+T.border,borderRadius:5,marginBottom:10,fontSize:13,color:T.muted,lineHeight:1.6,fontStyle:"italic"}}>
        "{item.lastMessage}"
      </div>

      {/* Not interested — just show dismiss options */}
      {isNotInterested && (
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <span style={{fontSize:12,color:T.dim}}>No reply needed.</span>
          <button onClick={handleMarkNotFit} style={{padding:"5px 12px",background:"rgba(231,76,60,0.1)",border:"1px solid "+T.red+"40",color:T.red,borderRadius:5,cursor:"pointer",fontSize:12}}>Mark Not a Fit</button>
          <button onClick={function(){setDismissed(true);}} style={{padding:"5px 12px",background:"rgba(255,255,255,0.03)",border:"1px solid "+T.border,color:T.dim,borderRadius:5,cursor:"pointer",fontSize:12}}>Dismiss</button>
        </div>
      )}

      {/* Suggested reply */}
      {!isNotInterested && (
        <div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
            <div style={{fontSize:10,color:G,letterSpacing:2,textTransform:"uppercase",fontWeight:600}}>Suggested Reply</div>
            <button onClick={function(){setEditing(function(v){return !v;});}} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:11,padding:"2px 6px"}}>
              {editing ? "Done editing" : "Edit"}
            </button>
          </div>
          {!item.suggestedReply && !editing && (
            <div style={{fontSize:12,color:T.dim,padding:"8px 0"}}>Generating reply...</div>
          )}
          {editing ? (
            <textarea value={reply} onChange={function(e){setReply(e.target.value);}}
              style={{width:"100%",background:BG2,border:"1px solid "+G+"40",color:T.text,padding:"10px 12px",borderRadius:5,fontSize:13,lineHeight:1.7,resize:"vertical",outline:"none",fontFamily:"inherit",boxSizing:"border-box",minHeight:100}}/>
          ) : (
            <div onClick={function(){setEditing(true);}} style={{padding:"10px 12px",background:"rgba(240,200,74,0.04)",border:"1px solid "+G+"20",borderRadius:5,fontSize:13,color:T.text,lineHeight:1.7,cursor:"text",whiteSpace:"pre-wrap"}}>{reply||"Click to add a reply..."}</div>
          )}
          <div style={{display:"flex",gap:8,marginTop:10,alignItems:"center"}}>
            <SendButton onSend={sendReply}/>
            <button onClick={function(){setDismissed(true);}} style={{padding:"6px 12px",background:"transparent",border:"1px solid "+T.border,color:T.dim,borderRadius:5,cursor:"pointer",fontSize:12}}>Snooze</button>
            <button onClick={handleMarkNotFit} style={{padding:"6px 12px",background:"transparent",border:"1px solid "+T.red+"30",color:T.red,borderRadius:5,cursor:"pointer",fontSize:12}}>Not a Fit</button>
            <a href={item.profileUrl} target="_blank" rel="noreferrer" style={{marginLeft:"auto",fontSize:11,color:T.dim,textDecoration:"none"}}>View on LinkedIn →</a>
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
  var [error, setError] = useState(null);
  var [dismissed, setDismissed] = useState([]);

  useEffect(function() { load(); }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      var res = await fetch("/api/follow-up-queue");
      var data = await res.json();
      setQueue(data.queue || []);
    } catch(e) {
      setError("Failed to load queue: " + e.message);
    }
    setLoading(false);
  }

  function handleDismiss(id) {
    setDismissed(function(prev) { return [...prev, id]; });
  }

  function handleNavigate(item) {
    if (onNavigate) onNavigate("profile", {
      id: null,
      firstName: item.firstName,
      lastName: item.lastName,
      title: item.title,
      company: item.company,
      linkedinUrl: item.profileUrl,
    });
  }

  var visible = queue.filter(function(item) { return dismissed.indexOf(item.id) === -1; });
  var warmCount = visible.filter(function(i){ return i.category === "warm"; }).length;
  var neutralCount = visible.filter(function(i){ return i.category === "neutral"; }).length;
  var notIntCount = visible.filter(function(i){ return i.category === "not_interested"; }).length;

  return (
    <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden",background:BG,fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,serif"}}>

      {/* Header */}
      <div style={{padding:"16px 24px 12px",borderBottom:"1px solid "+T.border,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
          <div style={{flex:1}}>
            <h2 style={{fontSize:18,fontWeight:700,color:T.text,margin:"0 0 2px"}}>Follow-Up Queue</h2>
            <div style={{fontSize:12,color:T.muted}}>Replies waiting for your response</div>
          </div>
          <button onClick={load} style={{padding:"6px 12px",background:"rgba(255,255,255,0.03)",border:"1px solid "+T.border,color:T.muted,borderRadius:5,cursor:"pointer",fontSize:11}}>↺ Refresh</button>
        </div>
        {!loading && (
          <div style={{display:"flex",gap:8}}>
            {[
              {label:"Warm",count:warmCount,color:T.green},
              {label:"Neutral",count:neutralCount,color:T.blue},
              {label:"Not Interested",count:notIntCount,color:T.red},
              {label:"Total",count:visible.length,color:T.muted},
            ].map(function(s){
              return (
                <div key={s.label} style={{padding:"5px 12px",background:s.color+"10",border:"1px solid "+s.color+"30",borderRadius:5,fontSize:11,color:s.color}}>
                  <strong>{s.count}</strong> {s.label}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Queue */}
      <div style={{flex:1,overflowY:"auto",padding:"16px 24px"}}>
        {loading && (
          <div style={{textAlign:"center",padding:60,color:T.dim}}>
            <div style={{fontSize:20,marginBottom:8,opacity:0.3}}>⏳</div>
            <div style={{fontSize:13}}>Loading queue and generating replies...</div>
          </div>
        )}
        {error && <div style={{padding:20,color:T.red,fontSize:13}}>{error}</div>}
        {!loading && visible.length === 0 && (
          <div style={{textAlign:"center",padding:60,color:T.dim}}>
            <div style={{fontSize:32,marginBottom:12,opacity:0.2}}>✓</div>
            <div style={{fontSize:15,fontWeight:600,color:T.muted,marginBottom:6}}>Queue is empty</div>
            <div style={{fontSize:13}}>No open conversations waiting for a reply.</div>
          </div>
        )}
        {/* Warm first, then neutral, then not interested */}
        {["warm","neutral","not_interested"].map(function(cat) {
          var items = visible.filter(function(i){ return i.category === cat; });
          if (items.length === 0) return null;
          return (
            <div key={cat} style={{marginBottom:20}}>
              <div style={{fontSize:10,color:cat==="warm"?T.green:cat==="not_interested"?T.red:T.blue,letterSpacing:2,textTransform:"uppercase",fontWeight:600,marginBottom:10}}>
                {cat==="warm"?"Warm Replies":cat==="not_interested"?"Not Interested":"Neutral Replies"}
              </div>
              {items.map(function(item) {
                return <QueueItem key={item.id} item={item} onNavigate={handleNavigate} onDismiss={handleDismiss}/>;
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
