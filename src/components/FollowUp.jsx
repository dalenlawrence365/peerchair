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

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

function timeLabel(due_at) {
  if (!due_at) return null;
  var d = new Date(due_at);
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var itemDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var diff = Math.round((itemDay - today) / 86400000);
  if (diff < 0)  return { label:"Overdue",   color:T.red };
  if (diff === 0) return { label:"Today",    color:T.orange };
  if (diff === 1) return { label:"Tomorrow", color:G };
  if (diff <= 7)  return { label:"This Week",color:T.blue };
  return { label: d.toLocaleDateString("en-US",{month:"short",day:"numeric"}), color:T.muted };
}

function Avatar({ first, last, imageUrl, size }) {
  size = size || 34;
  if (imageUrl) return (
    <div style={{width:size,height:size,borderRadius:"50%",overflow:"hidden",flexShrink:0,border:"1px solid rgba(255,255,255,0.1)"}}>
      <img src={imageUrl} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>
    </div>
  );
  return (
    <div style={{width:size,height:size,borderRadius:"50%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:size>40?14:11,fontWeight:700,color:G,flexShrink:0}}>
      {((first||"?")[0]+(last||"?")[0]).toUpperCase()}
    </div>
  );
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
    timer.current = setTimeout(function(){setCount(function(c){return c-1;});},1000);
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

// ─── Inbound Queue Card ───────────────────────────────────────────────────────
function InboundCard({item, selected, onClick, gone}) {
  if (gone) return null;
  var isWarm = item.category==="warm";
  var isNeg  = item.category==="not_interested";
  var accent = isWarm?T.green:isNeg?T.red:T.blue;
  return (
    <div onClick={onClick} style={{padding:"12px 14px",borderRadius:6,cursor:"pointer",background:selected?"rgba(240,200,74,0.06)":"rgba(255,255,255,0.01)",border:"1px solid "+(selected?G+"40":accent+"20"),borderLeft:"3px solid "+(selected?G:accent),transition:"all 0.12s",marginBottom:6}}>
      <div style={{display:"flex",gap:10,alignItems:"center"}}>
        <Avatar first={item.firstName} last={item.lastName} imageUrl={item.imageUrl} size={34}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:600,color:selected?"#fff":T.text,display:"flex",justifyContent:"space-between"}}>
            <span>{item.firstName} {item.lastName}</span>
            <span style={{fontSize:10,color:T.dim,fontWeight:400,flexShrink:0,marginLeft:6}}>{timeAgo(item.lastMessageAt)}</span>
          </div>
          <div style={{fontSize:11,color:T.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.company||item.title||""}</div>
          <div style={{fontSize:12,color:T.dim,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginTop:3,fontStyle:"italic"}}>"{item.lastMessage}"</div>
        </div>
      </div>
      {isWarm&&<div style={{marginTop:6,fontSize:10,color:T.green,letterSpacing:1}}>● WARM REPLY</div>}
      {isNeg&&<div style={{marginTop:6,fontSize:10,color:T.red,letterSpacing:1}}>● NOT INTERESTED</div>}
      {item.hasUnconfirmed&&<div style={{marginTop:4,fontSize:10,color:T.orange,letterSpacing:1}}>⚠ UNCONFIRMED SEND — check thread</div>}
      <div style={{marginTop:4}}>
        <span style={{fontSize:9,padding:"1px 6px",borderRadius:3,background:"rgba(74,158,186,0.1)",border:"1px solid rgba(74,158,186,0.2)",color:T.blue}}>INBOUND</span>
      </div>
    </div>
  );
}

// ─── Scheduled / Task Card ────────────────────────────────────────────────────
function PlanCard({item, selected, onComplete, onClick}) {
  var tl = item.due_at ? timeLabel(item.due_at) : null;
  var isScheduled = item.itemType === "scheduled";
  var isOverdue = tl && tl.label === "Overdue";
  var accent = isScheduled ? T.purple : item.priority === "high" ? T.orange : T.blue;

  return (
    <div onClick={function(){ if(onClick) onClick(item); }} style={{padding:"11px 14px",borderRadius:6,cursor:"pointer",background:selected?"rgba(240,200,74,0.06)":"rgba(255,255,255,0.01)",border:"1px solid "+(selected?G+"40":isOverdue?"rgba(231,76,60,0.2)":"rgba(255,255,255,0.05)"),borderLeft:"3px solid "+(selected?G:accent),marginBottom:5,transition:"all 0.1s"}}>
      <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
        <Avatar first={item.contact_first_name} last={item.contact_last_name} size={34}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
            <span style={{fontSize:13,fontWeight:600,color:selected?"#fff":T.text}}>{item.contact_first_name} {item.contact_last_name}</span>
            <div style={{display:"flex",gap:5,alignItems:"center",flexShrink:0,marginLeft:6}}>
              {tl&&<span style={{fontSize:10,padding:"1px 7px",borderRadius:9,background:tl.color+"12",border:"1px solid "+tl.color+"30",color:tl.color,fontWeight:600}}>{tl.label}</span>}
              <button onClick={function(e){e.stopPropagation();onComplete(item);}} style={{background:"rgba(46,204,113,0.1)",border:"1px solid rgba(46,204,113,0.2)",color:T.green,borderRadius:4,cursor:"pointer",fontSize:10,padding:"2px 8px"}}>Done</button>
            </div>
          </div>
          <div style={{fontSize:11,color:T.muted,marginBottom:3}}>{item.contact_company}</div>
          <div style={{fontSize:12,color:isScheduled?T.purple:T.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {isScheduled?"→ ":"● "}{(item.note||item.message_body||"").slice(0,80)}
          </div>
          <div style={{display:"flex",gap:5,marginTop:5}}>
            {isScheduled&&<>
              <span style={{fontSize:9,padding:"1px 6px",borderRadius:3,background:"rgba(155,89,182,0.1)",border:"1px solid rgba(155,89,182,0.2)",color:T.purple}}>SCHEDULED</span>
              <span style={{fontSize:9,padding:"1px 6px",borderRadius:3,background:"rgba(155,89,182,0.08)",border:"1px solid rgba(155,89,182,0.15)",color:T.purple}}>{(item.channel||"linkedin").toUpperCase()} · {item.mode==="auto_send"?"AUTO-SEND":"REVIEW FIRST"}</span>
            </>}
            {!isScheduled&&<span style={{fontSize:9,padding:"1px 6px",borderRadius:3,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",color:T.dim}}>
              {item.source==="auto_reply"?"AUTO-DETECTED":item.source==="ask_claude"?"ASK CLAUDE":item.source==="voice"?"VOICE":"TASK"}
            </span>}
            {item.priority==="high"&&<span style={{fontSize:9,padding:"1px 6px",borderRadius:3,background:"rgba(230,126,34,0.1)",border:"1px solid rgba(230,126,34,0.2)",color:T.orange}}>HIGH</span>}
          </div>
        </div>
      </div>
    </div>
  );
}


// ─── Smart Command Bar ────────────────────────────────────────────────────────
// Full-width, editable after dictation, confirmation before execution
function SmartCommand({contact, conversationId, onRefresh, placeholder}) {
  var [cmd,         setCmd]         = useState("");
  var [interim,     setInterim]     = useState("");
  var [listening,   setListening]   = useState(false);
  var [confirming,  setConfirming]  = useState(false);
  var [running,     setRunning]     = useState(false);
  var [result,      setResult]      = useState("");
  var [resultOk,    setResultOk]    = useState(true);
  var recRef     = useRef(null);
  var streamRef  = useRef(null);
  var chunksRef  = useRef([]);
  var silenceRef = useRef(null);

  function playChime(type) {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var notes = type === "start"
        ? [{f:600,t:0,d:0.08},{f:900,t:0.09,d:0.12}]
        : [{f:900,t:0,d:0.08},{f:600,t:0.09,d:0.12}];
      notes.forEach(function(n) {
        var osc  = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(n.f, ctx.currentTime + n.t);
        gain.gain.setValueAtTime(0, ctx.currentTime + n.t);
        gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + n.t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + n.t + n.d);
        osc.start(ctx.currentTime + n.t);
        osc.stop(ctx.currentTime + n.t + n.d + 0.01);
      });
      setTimeout(function(){ ctx.close(); }, 500);
    } catch(e) {}
  }

  function startVoice() {
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      alert("Audio recording not supported in this browser.");
      return;
    }
    chunksRef.current = [];
    setInterim("Recording… release to transcribe");
    playChime("start");
    setListening(true);
    setResult("");
    setConfirming(false);

    navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
      streamRef.current = stream;
      var recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg" });
      recRef.current = recorder;
      recorder.ondataavailable = function(e) { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = function() { transcribeAudio(); };
      recorder.start();
      // Auto-stop after 10 seconds of no interaction
      silenceRef.current = setTimeout(function() {
        if (recRef.current && recRef.current.state !== "inactive") {
          setInterim("Auto-stopped after 10 seconds…");
          stopVoice();
        }
      }, 10000);
    }).catch(function(e) {
      setListening(false);
      setInterim("");
      alert("Microphone access denied: " + e.message);
    });
  }

  function stopVoice() {
    if (silenceRef.current) { clearTimeout(silenceRef.current); silenceRef.current = null; }
    if (recRef.current && recRef.current.state !== "inactive") {
      recRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(function(t){ t.stop(); });
      streamRef.current = null;
    }
    playChime("stop");
    setListening(false);
    setInterim("Transcribing…");
  }

  async function transcribeAudio() {
    var chunks = chunksRef.current;
    if (!chunks.length) { setInterim("No audio captured — try again"); setTimeout(function(){ setInterim(""); },3000); return; }
    setInterim("Sending to Whisper…");

    // Detect MIME type and pick correct extension
    var mimeType = chunks[0].type || "audio/webm";
    var ext = "webm";
    if (mimeType.includes("ogg"))  ext = "ogg";
    if (mimeType.includes("mp4"))  ext = "mp4";
    if (mimeType.includes("wav"))  ext = "wav";

    var blob = new Blob(chunks, { type: mimeType });
    console.log("Whisper: blob size", blob.size, "type", mimeType, "ext", ext);

    var form = new FormData();
    form.append("audio", blob, "recording." + ext);
    if (contact && contact.id) form.append("contact_id", contact.id);
    form.append("source", "followup_smart_command");
    try {
      var res = await fetch("/api/transcribe", { method: "POST", body: form });
      var d   = await res.json();
      console.log("Whisper response:", d);
      if (d.command_id) setCommandId(d.command_id);
      if (d.text && d.text.trim()) {
        setCmd(function(prev){ return (prev ? prev + " " : "") + d.text.trim(); });
        setInterim("");
      } else if (d.error) {
        setInterim("Error: " + d.error);
        setTimeout(function(){ setInterim(""); }, 4000);
      } else {
        setInterim("Nothing captured — speak closer to mic");
        setTimeout(function(){ setInterim(""); }, 3000);
      }
    } catch(e) {
      console.error("Whisper fetch error:", e);
      setInterim("Network error — " + e.message);
      setTimeout(function(){ setInterim(""); }, 4000);
    }
  }

  function handleGo() {
    if (!cmd.trim() || running || confirming) return;
    setConfirming(true);
  }

  async function confirm() {
    setConfirming(false);
    setRunning(true);
    setResult("");
    try {
      var res = await fetch("/api/smart-action", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({
          command: cmd,
          contact: contact || null,
          conversationId: conversationId || null,
          command_id: commandId || null,
        })
      });
      var d = await res.json();
      setResult(d.confirmation || "Done");
      setResultOk(true);
      setCmd("");
      if (onRefresh) onRefresh();
    } catch(e) {
      setResult("Error — " + e.message);
      setResultOk(false);
    }
    setRunning(false);
    setTimeout(function(){ setResult(""); }, 8000);
  }

  function cancel() {
    setConfirming(false);
  }

  var ph = placeholder || "Speak or type a command — e.g. \"Snooze until June 1\" or \"They opted out\"";

  return (
    <div style={{padding:"14px 20px",borderTop:"1px solid rgba(255,255,255,0.06)",background:"rgba(0,0,0,0.1)",flexShrink:0}}>

      {/* Label row */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{fontSize:10,color:T.dim,letterSpacing:2,textTransform:"uppercase"}}>Smart Command</div>
        {listening && (
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:T.red,animation:"pulse 1s infinite"}}/>
            <span style={{fontSize:10,color:T.red,fontWeight:600}}>Listening</span>
          </div>
        )}
      </div>

      {/* Interim transcript (shows while speaking) */}
      {(listening && interim) && (
        <div style={{padding:"6px 12px",marginBottom:8,background:"rgba(255,255,255,0.03)",border:"1px dashed rgba(255,255,255,0.1)",borderRadius:5,fontSize:13,color:T.dim,fontStyle:"italic",lineHeight:1.5}}>
          {interim}…
        </div>
      )}

      {/* Main textarea */}
      <textarea
        value={cmd}
        onChange={function(e){ if(!confirming) setCmd(e.target.value); }}
        onKeyDown={function(e){ if(e.key==="Enter"&&(e.metaKey||e.ctrlKey)) handleGo(); }}
        placeholder={ph}
        rows={4}
        readOnly={confirming}
        style={{
          width:"100%", boxSizing:"border-box",
          background: confirming ? "rgba(240,200,74,0.04)" : "rgba(255,255,255,0.03)",
          border:"1px solid "+(confirming?"rgba(240,200,74,0.3)":"rgba(255,255,255,0.08)"),
          color: T.text, padding:"10px 12px", borderRadius:6,
          fontSize:13, lineHeight:1.7, resize:"vertical",
          outline:"none", fontFamily:"inherit",
          marginBottom:8
        }}
      />

      {/* Confirmation banner */}
      {confirming && (
        <div style={{padding:"10px 14px",marginBottom:8,background:"rgba(240,200,74,0.06)",border:"1px solid rgba(240,200,74,0.25)",borderRadius:6}}>
          <div style={{fontSize:12,color:G,fontWeight:600,marginBottom:6}}>Run this command?</div>
          <div style={{fontSize:12,color:T.text,fontStyle:"italic",marginBottom:10,lineHeight:1.6}}>"{cmd}"</div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={confirm} style={{flex:1,padding:"7px",background:"rgba(46,204,113,0.12)",border:"1px solid rgba(46,204,113,0.3)",color:T.green,borderRadius:5,cursor:"pointer",fontSize:13,fontWeight:700}}>
              ✓ Confirm
            </button>
            <button onClick={cancel} style={{padding:"7px 16px",background:"rgba(231,76,60,0.08)",border:"1px solid rgba(231,76,60,0.2)",color:T.red,borderRadius:5,cursor:"pointer",fontSize:13}}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{padding:"8px 12px",marginBottom:8,background:resultOk?"rgba(46,204,113,0.08)":"rgba(231,76,60,0.08)",border:"1px solid "+(resultOk?"rgba(46,204,113,0.2)":"rgba(231,76,60,0.2)"),borderRadius:5,fontSize:12,color:resultOk?T.green:T.red}}>
          {resultOk?"✓":"✗"} {result}
        </div>
      )}

      {/* Button row */}
      {!confirming && (
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button
            onClick={listening ? stopVoice : startVoice}
            title={listening ? "Click to stop" : "Click to speak"}
            style={{flexShrink:0,width:34,height:34,borderRadius:"50%",background:listening?"rgba(231,76,60,0.15)":"rgba(74,158,186,0.08)",border:"1px solid "+(listening?"rgba(231,76,60,0.35)":"rgba(74,158,186,0.2)"),color:listening?T.red:T.blue,cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s"}}>
            {listening ? "■" : "🎙"}
          </button>
          {listening && <span style={{fontSize:11,color:T.red,fontWeight:600,letterSpacing:0.5}}>Listening…</span>}
          <div style={{flex:1}}/>
          <button
            onClick={handleGo}
            disabled={!cmd.trim() || running || listening}
            title="Send (⌘↵)"
            style={{flexShrink:0,width:34,height:34,borderRadius:"50%",background:cmd.trim()&&!running&&!listening?G:"rgba(255,255,255,0.06)",border:"none",color:cmd.trim()&&!running&&!listening?"#000":T.dim,cursor:cmd.trim()&&!running&&!listening?"pointer":"default",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s",fontWeight:700}}>
            {running ? "…" : "↑"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Item Detail Panel (scheduled sends + tasks) ──────────────────────────────
function ItemDetailPanel({item, onClose, onComplete, onRefresh}) {
  var [thread, setThread]   = useState([]);
  var [threadLoading, setThreadLoading] = useState(false);
  var threadRef = useRef(null);

  useEffect(function() {
    if (!item || !item.contact_id) return;
    setThreadLoading(true);
    var U=process.env.NEXT_PUBLIC_SUPABASE_URL;
    var K=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    fetch(U+"/rest/v1/communications?contact_id=eq."+item.contact_id+"&channel=in.(linkedin,LinkedIn,inmail,InMail)&order=occurred_at.asc&limit=100",
      {headers:{"apikey":K,"Authorization":"Bearer "+K}})
      .then(function(r){return r.json();})
      .then(function(d){
        setThread(Array.isArray(d)?d:[]);
        setThreadLoading(false);
        if(threadRef.current) setTimeout(function(){threadRef.current.scrollTop=threadRef.current.scrollHeight;},50);
      })
      .catch(function(){setThreadLoading(false);});
  }, [item?.contact_id]);

  if (!item) return (
    <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,color:T.dim}}>
      <div style={{fontSize:32,opacity:0.3}}>📋</div>
      <div style={{fontSize:14}}>Select an item to view details</div>
      <div style={{fontSize:12,opacity:0.7}}>Inbound replies, scheduled sends, and tasks all live here</div>
    </div>
  );

  var isScheduled = item.itemType === "scheduled";
  var tl = item.due_at ? timeLabel(item.due_at) : null;
  var messageBody = item.note || item.message_body || "";

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:BG2,borderLeft:"1px solid rgba(255,255,255,0.06)"}}>
      <div style={{padding:"14px 20px",borderBottom:"1px solid rgba(255,255,255,0.06)",background:"linear-gradient(90deg,#0c1520,#0f1e2e)",flexShrink:0,display:"flex",alignItems:"center",gap:12}}>
        <Avatar first={item.contact_first_name} last={item.contact_last_name} size={40}/>
        <div style={{flex:1}}>
          <div style={{fontSize:15,fontWeight:600,color:"#fff"}}>{item.contact_first_name} {item.contact_last_name}</div>
          <div style={{fontSize:12,color:T.muted}}>{item.contact_company}</div>
        </div>
        <button onClick={function(){onComplete(item);}} style={{padding:"6px 14px",background:"rgba(46,204,113,0.1)",border:"1px solid rgba(46,204,113,0.25)",color:T.green,borderRadius:5,cursor:"pointer",fontSize:12,fontWeight:600}}>Mark Done</button>
        <button onClick={onClose} style={{background:"transparent",border:"1px solid rgba(255,255,255,0.1)",color:T.muted,width:28,height:28,borderRadius:5,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
      </div>

      {/* Conversation thread */}
      {(thread.length > 0 || threadLoading) && (
        <div ref={threadRef} style={{maxHeight:200,overflowY:"auto",padding:"10px 20px",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column",gap:7,background:"rgba(0,0,0,0.12)",flexShrink:0}}>
          <div style={{fontSize:9,color:T.dim,letterSpacing:2,textTransform:"uppercase",marginBottom:3}}>Conversation History</div>
          {threadLoading&&<div style={{fontSize:11,color:T.dim}}>Loading…</div>}
          {thread.map(function(msg){
            var isOut=msg.direction==="OUT"||msg.direction==="outbound";
            return (
              <div key={msg.id} style={{display:"flex",flexDirection:"column",alignItems:isOut?"flex-end":"flex-start"}}>
                <div style={{maxWidth:"85%",padding:"7px 11px",borderRadius:isOut?"10px 3px 10px 10px":"3px 10px 10px 10px",background:isOut?"rgba(240,200,74,0.08)":"rgba(255,255,255,0.05)",border:"1px solid "+(isOut?"rgba(240,200,74,0.18)":"rgba(255,255,255,0.07)"),fontSize:12,color:isOut?"#f5e49a":T.text,lineHeight:1.6,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>
                  {msg.body}
                </div>
                <div style={{fontSize:9,color:T.dim,marginTop:2,paddingRight:2}}>
                  {new Date(msg.occurred_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})} · {msg.step_label}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{padding:"16px 20px",borderBottom:"1px solid rgba(255,255,255,0.06)",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
          <div style={{fontSize:11,color:T.dim,letterSpacing:2,textTransform:"uppercase"}}>{isScheduled?"Scheduled Send":"Follow-Up Task"}</div>
          {tl&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:9,background:tl.color+"12",border:"1px solid "+tl.color+"30",color:tl.color,fontWeight:600}}>{tl.label}</span>}
          {isScheduled&&<span style={{fontSize:9,padding:"1px 7px",borderRadius:3,background:"rgba(155,89,182,0.1)",border:"1px solid rgba(155,89,182,0.2)",color:T.purple}}>{(item.channel||"linkedin").toUpperCase()} · {item.mode==="auto_send"?"AUTO-SEND":"REVIEW FIRST"}</span>}
        </div>
        <div style={{fontSize:14,color:T.text,lineHeight:1.75,background:"rgba(255,255,255,0.03)",padding:"12px 14px",borderRadius:6,border:"1px solid rgba(255,255,255,0.06)",whiteSpace:"pre-wrap"}}>
          {messageBody||<span style={{color:T.dim,fontStyle:"italic"}}>No message body</span>}
        </div>
        {item.due_at&&<div style={{marginTop:8,fontSize:12,color:T.muted}}>
          {isScheduled?"Sends":"Due"}: {new Date(item.due_at).toLocaleString("en-US",{month:"long",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",hour12:true})}
        </div>}
      </div>

      <SmartCommand
        contact={item ? {id:item.contact_id,firstName:item.contact_first_name,lastName:item.contact_last_name,company:item.contact_company,type:item.contact_type||"CFO_PROSPECT"} : null}
        conversationId={item?.conversation_id||null}
        onRefresh={onRefresh}
        placeholder={"Command for " + (item?.contact_first_name||"this contact") + " — e.g. \"Snooze until June 1\" or \"They opted out\""}
      />
    </div>
  );
}

// ─── Thread Panel (inbound HeyReach items) ────────────────────────────────────
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

  useEffect(function(){
    if (!item) return;
    setLoading(true); setThread([]); setReply("");
    var sbMsgs=[]; var heyMsgs=[];
    var U=process.env.NEXT_PUBLIC_SUPABASE_URL; var K=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    var sbPromise = item.supabaseId
      ? fetch(U+"/rest/v1/communications?contact_id=eq."+item.supabaseId+"&order=occurred_at.asc&limit=100",{headers:{"apikey":K,"Authorization":"Bearer "+K}}).then(function(r){return r.json();}).then(function(d){sbMsgs=Array.isArray(d)?d:[];}).catch(function(){})
      : Promise.resolve();
    var hrPromise = fetch("/api/follow-up-queue/thread?conversationId="+encodeURIComponent(item.conversationId)+"&linkedInAccountId="+(item.linkedInAccountId||185228)+"&contactId="+(item.supabaseId||""))
      .then(function(r){return r.json();}).then(function(d){heyMsgs=Array.isArray(d.messages)?d.messages:[];}).catch(function(){});
    Promise.all([sbPromise,hrPromise]).then(function(){
      var merged=[];
      heyMsgs.forEach(function(m){merged.push({id:m.id||Math.random(),direction:m.sender==="ME"||m.senderType==="SENDER"?"OUT":"IN",body:m.text||m.message||m.content||"",sentAt:m.sentAt||m.createdAt||m.timestamp||"",channel:m.type==="INMAIL"?"InMail":"LinkedIn",seqKey:null,source:"heyreach"});});
      if (merged.length===0){sbMsgs.forEach(function(m){merged.push({id:m.id,direction:m.direction==="OUT"?"OUT":"IN",body:m.body||"",sentAt:m.occurred_at||"",channel:m.channel||"LinkedIn",seqKey:m.sequence_key||m.step_label||null,source:"supabase"});});}
      else{sbMsgs.forEach(function(sb){if(!sb.sequence_key)return;var sbTime=new Date(sb.occurred_at).getTime();var match=merged.find(function(m){return m.direction==="OUT"&&Math.abs(new Date(m.sentAt).getTime()-sbTime)<3600000;});if(match)match.seqKey=sb.sequence_key;});}
      merged.sort(function(a,b){return new Date(a.sentAt)-new Date(b.sentAt);});
      setThread(merged); setLoading(false);
      if(item.suggestedReply)setReply(item.suggestedReply);
    });
  },[item?.conversationId]);

  useEffect(function(){if(!loading&&threadRef.current)threadRef.current.scrollTop=threadRef.current.scrollHeight;},[loading,thread]);

  async function generateReply(){
    setGenerating(true);
    try{var res=await fetch("/api/ai-reply-suggest",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({firstName:item.firstName,lastName:item.lastName,title:item.title,company:item.company,thread,lastMessage:item.lastMessage,category:item.category})});var d=await res.json();if(d.reply)setReply(d.reply);}catch(e){}
    setGenerating(false);
  }

  async function sendReply(){
    var res=await fetch("/api/follow-up-queue",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({conversationId:item.conversationId,linkedInAccountId:item.linkedInAccountId,message:reply,profileUrl:item.profileUrl,contactId:item.supabaseId||null,firstName:item.firstName,lastName:item.lastName,fullName:item.fullName||(item.firstName+" "+item.lastName),title:item.title||"",company:item.company||"",location:item.location||"",imageUrl:item.imageUrl||"",campaign:item.campaign||""})});
    var data=await res.json();
    if(!data.success)throw new Error(data.error||"Send failed");
    if(onDone)onDone(item,"sent",reply);
    return data;
  }

  function dismiss(reason){
    fetch("/api/follow-up-queue",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"dismiss",reason,conversationId:item.conversationId,profileUrl:item.profileUrl,contactId:item.supabaseId||null,firstName:item.firstName,lastName:item.lastName||"",fullName:item.fullName||"",company:item.company||""})}).catch(function(){});
    if(onDone)onDone(item,reason,null);
  }

  async function handleSnooze(){
    if(!snoozeDate||!snoozeDraft.trim()||snoozing)return;
    setSnoozing(true);
    try{
      var U2=process.env.NEXT_PUBLIC_SUPABASE_URL;var K2=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      await fetch(U2+"/rest/v1/scheduled_actions",{method:"POST",headers:{"apikey":K2,"Authorization":"Bearer "+K2,"Content-Type":"application/json"},body:JSON.stringify({contact_id:item.supabaseId||null,conversation_id:item.conversationId,channel:"linkedin",send_at:new Date(snoozeDate+"T17:00:00Z").toISOString(),message_body:snoozeDraft,mode:snoozeMode,contact_first_name:item.firstName,contact_last_name:item.lastName,contact_company:item.company,contact_linkedin_url:item.profileUrl,status:"pending"})});
      setSnoozed(true);setShowSnooze(false);
      setTimeout(function(){if(onDone)onDone(item,"snoozed",null);},1000);
    }catch(e){}
    setSnoozing(false);
  }

  if(!item)return null;
  var isWarm=item.category==="warm";
  var isNeg=item.category==="not_interested";
  var accent=isWarm?T.green:isNeg?T.red:T.blue;

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",background:BG2,borderLeft:"1px solid rgba(255,255,255,0.06)"}}>
      <div style={{padding:"14px 20px",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",gap:12,flexShrink:0,background:"linear-gradient(90deg,#0c1520,#0f1e2e)"}}>
        <Avatar first={item.firstName} last={item.lastName} imageUrl={item.imageUrl} size={42}/>
        <div style={{flex:1,minWidth:0}}>
          <div onClick={function(){if(onNavigate&&item.supabaseId)onNavigate("profile",{id:item.supabaseId,first_name:item.firstName,last_name:item.lastName,title:item.title,company_name:item.company,linkedin_url:item.profileUrl});}} style={{fontSize:15,fontWeight:600,color:"#fff",cursor:item.supabaseId?"pointer":"default",textDecoration:item.supabaseId?"underline":"none"}}>{item.firstName} {item.lastName}</div>
          <div style={{fontSize:12,color:T.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}{item.company?" · "+item.company:""}</div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <span style={{fontSize:10,padding:"2px 8px",borderRadius:9,background:accent+"12",border:"1px solid "+accent+"30",color:accent,textTransform:"uppercase",letterSpacing:1}}>{isWarm?"Warm":isNeg?"Not Interested":"Neutral"}</span>
          {item.hasUnconfirmed&&<span title="A recent message was not confirmed by HeyReach" style={{fontSize:10,padding:"2px 8px",borderRadius:9,background:"rgba(230,126,34,0.15)",border:"1px solid rgba(230,126,34,0.4)",color:T.orange,fontWeight:600}}>⚠ UNCONFIRMED SEND</span>}
          <button onClick={onClose} style={{background:"transparent",border:"1px solid rgba(255,255,255,0.1)",color:T.muted,width:28,height:28,borderRadius:5,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>
      </div>

      <div ref={threadRef} style={{flex:1,overflowY:"auto",padding:"16px 20px",display:"flex",flexDirection:"column",gap:10}}>
        {loading&&<div style={{textAlign:"center",color:T.dim,fontSize:13,padding:"40px 0"}}><div style={{marginBottom:8,fontSize:20}}>⌛</div>Loading conversation…</div>}
        {!loading&&thread.length===0&&<div style={{textAlign:"center",color:T.dim,fontSize:13,padding:"40px 0"}}>No messages found — HeyReach API may be temporarily unavailable.</div>}
        {!loading&&thread.map(function(msg,i){
          var isOut=msg.direction==="OUT";
          return(
            <div key={msg.id||i} style={{display:"flex",flexDirection:"column",alignItems:isOut?"flex-end":"flex-start",width:"100%"}}>
              <div style={{display:"flex",gap:5,marginBottom:4,alignItems:"center",flexDirection:isOut?"row-reverse":"row"}}>
                {msg.seqKey&&<span style={{fontSize:9,padding:"1px 6px",borderRadius:3,background:"rgba(74,158,186,0.12)",border:"1px solid rgba(74,158,186,0.2)",color:T.blue,fontFamily:"'Courier New',monospace",letterSpacing:0.5}}>{msg.seqKey}</span>}
                {msg.channel==="InMail"&&<span style={{fontSize:9,padding:"1px 6px",borderRadius:3,background:"rgba(155,89,182,0.12)",border:"1px solid rgba(155,89,182,0.2)",color:T.purple}}>InMail</span>}
                <span style={{fontSize:10,color:T.dim}}>{fmt(msg.sentAt)}</span>
              </div>
              <div style={{maxWidth:"75%",minWidth:80,padding:"10px 14px",borderRadius:isOut?"14px 4px 14px 14px":"4px 14px 14px 14px",background:isOut?"rgba(240,200,74,0.09)":"rgba(255,255,255,0.05)",border:"1px solid "+(isOut?"rgba(240,200,74,0.25)":"rgba(255,255,255,0.09)"),fontSize:13,color:isOut?"#f5e49a":T.text,lineHeight:1.75,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>
                {msg.body}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{borderTop:"1px solid rgba(255,255,255,0.06)",padding:"14px 20px",flexShrink:0,background:"#0a1522"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{fontSize:11,color:T.dim,letterSpacing:2,textTransform:"uppercase"}}>Your Reply</div>
          <button onClick={generateReply} disabled={generating} style={{background:"rgba(155,89,182,0.1)",border:"1px solid rgba(155,89,182,0.25)",color:T.purple,padding:"4px 11px",borderRadius:4,cursor:"pointer",fontSize:11,letterSpacing:1}}>{generating?"Generating…":"✦ AI Suggest"}</button>
        </div>
        <textarea value={reply} onChange={function(e){setReply(e.target.value);}} placeholder={"Reply to "+item.firstName+"…"} rows={4} style={{width:"100%",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",color:T.text,padding:"10px 12px",borderRadius:6,fontSize:13,lineHeight:1.7,resize:"vertical",outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
        {showSnooze&&<div style={{background:"rgba(240,200,74,0.05)",border:"1px solid rgba(240,200,74,0.2)",borderRadius:6,padding:"12px 14px",marginTop:10}}>
          <div style={{fontSize:11,color:G,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Schedule This Message</div>
          <textarea value={snoozeDraft} onChange={function(e){setSnoozeDraft(e.target.value);}} placeholder="Write the message to send on the scheduled date..." rows={3} style={{width:"100%",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",color:T.text,padding:"8px 10px",borderRadius:5,fontSize:13,lineHeight:1.65,resize:"vertical",outline:"none",fontFamily:"inherit",boxSizing:"border-box",marginBottom:8}}/>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <input type="date" value={snoozeDate} onChange={function(e){setSnoozeDate(e.target.value);}} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",color:T.text,padding:"5px 9px",borderRadius:4,fontSize:12,outline:"none",cursor:"pointer"}}/>
            <div style={{display:"flex",gap:4}}>
              {["resurface","auto_send"].map(function(m){return(<button key={m} onClick={function(){setSnoozeMode(m);}} style={{padding:"4px 10px",borderRadius:4,cursor:"pointer",fontSize:11,border:"1px solid "+(snoozeMode===m?"rgba(240,200,74,0.4)":"rgba(255,255,255,0.08)"),background:snoozeMode===m?"rgba(240,200,74,0.1)":"transparent",color:snoozeMode===m?G:"#8ab4cc"}}>{m==="resurface"?"Review First":"Auto-Send"}</button>);})}
            </div>
            <button onClick={handleSnooze} disabled={!snoozeDate||!snoozeDraft.trim()||snoozing} style={{padding:"5px 14px",background:snoozed?"rgba(46,204,113,0.15)":"rgba(240,200,74,0.12)",border:"1px solid "+(snoozed?"rgba(46,204,113,0.4)":"rgba(240,200,74,0.3)"),color:snoozed?"#2ecc71":G,borderRadius:4,cursor:"pointer",fontSize:12,fontWeight:600}}>
              {snoozing?"Saving...":snoozed?"✓ Scheduled":"Schedule"}
            </button>
          </div>
        </div>}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10}}>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <button onClick={function(){dismiss("scheduled");}} style={{padding:"6px 12px",background:"rgba(46,204,113,0.1)",border:"1px solid rgba(46,204,113,0.25)",color:T.green,borderRadius:4,cursor:"pointer",fontSize:12,fontWeight:600}}>Done</button>
            <button onClick={function(){dismiss("not_interested");}} style={{padding:"6px 12px",background:"rgba(231,76,60,0.08)",border:"1px solid rgba(231,76,60,0.2)",color:T.red,borderRadius:4,cursor:"pointer",fontSize:12}}>Not Interested</button>
            <button onClick={function(){dismiss("opted_out");}} style={{padding:"6px 12px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",color:T.muted,borderRadius:4,cursor:"pointer",fontSize:12}}>Opted Out</button>
            <button onClick={function(){setShowSnooze(function(v){return !v;});}} style={{padding:"6px 12px",background:showSnooze?"rgba(240,200,74,0.12)":"rgba(255,255,255,0.03)",border:"1px solid "+(showSnooze?"rgba(240,200,74,0.3)":"rgba(255,255,255,0.08)"),color:showSnooze?G:"#8ab4cc",borderRadius:4,cursor:"pointer",fontSize:12}}>⏰ Snooze</button>
          </div>
          <SendButton onSend={sendReply}/>
        </div>
      </div>
      <SmartCommand
        contact={item ? {id:item.supabaseId,firstName:item.firstName,lastName:item.lastName,company:item.company,type:"CFO_PROSPECT"} : null}
        conversationId={item?.conversationId||null}
        placeholder={"Command for " + (item?.firstName||"this contact") + " — e.g. \"Schedule a follow-up\" or \"Move to Stalled\""}
      />
    </div>
  );
}

// ─── Add Task Panel ───────────────────────────────────────────────────────────
function AddTaskPanel({onAdd, onClose}) {
  var [search,   setSearch]   = useState("");
  var [contacts, setContacts] = useState([]);
  var [selected, setSelected] = useState(null);
  var [note,     setNote]     = useState("");
  var [dueDate,  setDueDate]  = useState("");
  var [priority, setPriority] = useState("normal");
  var [saving,   setSaving]   = useState(false);

  useEffect(function(){
    if(search.length<2){setContacts([]);return;}
    var U=process.env.NEXT_PUBLIC_SUPABASE_URL;var K=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    fetch(U+"/rest/v1/contacts?or=(first_name.ilike.*"+search+"*,last_name.ilike.*"+search+"*,company_name.ilike.*"+search+"*)&select=id,first_name,last_name,company_name,contact_type&limit=8",{headers:{"apikey":K,"Authorization":"Bearer "+K}})
      .then(function(r){return r.json();}).then(function(d){setContacts(Array.isArray(d)?d:[]);}).catch(function(){});
  },[search]);

  async function save(){
    if(!note.trim())return;
    setSaving(true);
    try{
      var res=await fetch("/api/my-plan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"create_task",contact_id:selected?.id||null,contact_first_name:selected?.first_name||search,contact_last_name:selected?.last_name||"",contact_company:selected?.company_name||"",contact_type:selected?.contact_type||"CFO_PROSPECT",note,priority,due_at:dueDate?new Date(dueDate+"T09:00:00").toISOString():null,source:"manual"})});
      var d=await res.json();
      if(d.success){onAdd();onClose();}
    }catch(e){}
    setSaving(false);
  }

  return(
    <div style={{position:"absolute",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100}}>
      <div style={{background:BG2,border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:24,width:440,maxWidth:"90vw"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:600,color:G,letterSpacing:2,textTransform:"uppercase"}}>Add Follow-Up Task</div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:18}}>×</button>
        </div>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,color:T.dim,marginBottom:5}}>CONTACT</div>
          {selected?(
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",background:"rgba(240,200,74,0.06)",border:"1px solid rgba(240,200,74,0.2)",borderRadius:5}}>
              <span style={{fontSize:13,color:G}}>{selected.first_name} {selected.last_name} · {selected.company_name}</span>
              <button onClick={function(){setSelected(null);setSearch("");}} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:14}}>×</button>
            </div>
          ):(
            <div style={{position:"relative"}}>
              <input value={search} onChange={function(e){setSearch(e.target.value);}} placeholder="Search by name or company..." style={{width:"100%",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",color:T.text,padding:"8px 12px",borderRadius:5,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
              {contacts.length>0&&(
                <div style={{position:"absolute",top:"100%",left:0,right:0,background:BG2,border:"1px solid rgba(255,255,255,0.1)",borderRadius:5,zIndex:10,maxHeight:160,overflowY:"auto"}}>
                  {contacts.map(function(ct){return(
                    <div key={ct.id} onClick={function(){setSelected(ct);setSearch("");setContacts([]);}} style={{padding:"8px 12px",cursor:"pointer",fontSize:13,color:T.text,borderBottom:"1px solid rgba(255,255,255,0.05)"}}
                      onMouseEnter={function(e){e.currentTarget.style.background="rgba(255,255,255,0.05)";}}
                      onMouseLeave={function(e){e.currentTarget.style.background="transparent";}}>
                      {ct.first_name} {ct.last_name} · <span style={{color:T.muted}}>{ct.company_name}</span>
                    </div>
                  );})}
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,color:T.dim,marginBottom:5}}>WHAT NEEDS TO HAPPEN</div>
          <textarea value={note} onChange={function(e){setNote(e.target.value);}} placeholder="e.g. Email his EA to book fit call, Follow up on proposal, Send Calendly link..." rows={3} style={{width:"100%",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",color:T.text,padding:"8px 12px",borderRadius:5,fontSize:13,outline:"none",fontFamily:"inherit",resize:"none",boxSizing:"border-box"}}/>
        </div>
        <div style={{display:"flex",gap:10,marginBottom:16}}>
          <div style={{flex:1}}>
            <div style={{fontSize:11,color:T.dim,marginBottom:5}}>DUE DATE (optional)</div>
            <input type="date" value={dueDate} onChange={function(e){setDueDate(e.target.value);}} style={{width:"100%",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",color:T.text,padding:"7px 10px",borderRadius:5,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div>
            <div style={{fontSize:11,color:T.dim,marginBottom:5}}>PRIORITY</div>
            <div style={{display:"flex",gap:4}}>
              {["high","normal","low"].map(function(p){var active=priority===p;var color=p==="high"?T.orange:p==="normal"?T.blue:T.dim;return(
                <button key={p} onClick={function(){setPriority(p);}} style={{padding:"6px 10px",borderRadius:4,cursor:"pointer",border:"1px solid "+(active?color+"50":"rgba(255,255,255,0.08)"),background:active?color+"14":"transparent",color:active?color:T.muted,fontSize:11,fontWeight:active?600:400}}>{p}</button>
              );})}
            </div>
          </div>
        </div>
        <button onClick={save} disabled={!note.trim()||saving} style={{width:"100%",padding:"10px",background:"rgba(240,200,74,0.12)",border:"1px solid rgba(240,200,74,0.3)",color:G,borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:600}}>
          {saving?"Adding...":"Add to Follow-Up"}
        </button>
      </div>
    </div>
  );
}

// ─── Main Follow-Up Component ─────────────────────────────────────────────────
export default function FollowUp({onNavigate}) {
  var [queue,     setQueue]     = useState([]);
  var [done,      setDone]      = useState([]);
  var [goneIds,   setGoneIds]   = useState(new Set());
  var [daily,     setDaily]     = useState(0);
  var [scheduled, setScheduled] = useState([]);
  var [tasks,     setTasks]     = useState([]);
  var [loading,   setLoading]   = useState(true);
  var [error,     setError]     = useState("");
  var [selected,  setSelected]  = useState(null);
  var [filter,    setFilter]    = useState("all");
  var [showAdd,   setShowAdd]   = useState(false);
  var [voiceCmd,       setVoiceCmd]       = useState("");
  var [voiceRunning,   setVoiceRunning]   = useState(false);
  var [voiceResult,    setVoiceResult]    = useState("");
  var [voiceListening, setVoiceListening] = useState(false);
  var [showVoice,      setShowVoice]      = useState(false);

  useEffect(function(){loadAll();},[]);

  async function loadAll(){
    setLoading(true);
    await Promise.all([loadQueue(),loadScheduled(),loadTasks()]);
    setLoading(false);
  }

  async function loadQueue(){
    try{
      var d=await fetch("/api/follow-up-queue").then(function(r){return r.json();});
      var q=Array.isArray(d.queue)?d.queue:[];
      // Check for unconfirmed sends
      try {
        var U=process.env.NEXT_PUBLIC_SUPABASE_URL;var K=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        var uc=await fetch(U+"/rest/v1/communications?send_status=eq.unconfirmed&select=contact_id&limit=200",{headers:{"apikey":K,"Authorization":"Bearer "+K}}).then(function(r){return r.json();});
        var ucIds=new Set((Array.isArray(uc)?uc:[]).map(function(c){return c.contact_id;}));
        q=q.map(function(i){return Object.assign({},i,{itemType:"inbound",hasUnconfirmed:ucIds.has(i.supabaseId)});});
      } catch(e){ q=q.map(function(i){return Object.assign({},i,{itemType:"inbound"});}); }
      setQueue(q);
      setDaily(d.todayCount||0);
    }catch(e){setError(e.message);}
  }

  async function loadScheduled(){
    try{
      var U=process.env.NEXT_PUBLIC_SUPABASE_URL;var K=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      var rows=await fetch(U+"/rest/v1/scheduled_actions?status=eq.pending&order=send_at.asc&limit=100",{headers:{"apikey":K,"Authorization":"Bearer "+K}}).then(function(r){return r.json();});
      setScheduled((Array.isArray(rows)?rows:[]).map(function(s){return{id:s.id,itemType:"scheduled",contact_id:s.contact_id,contact_first_name:s.contact_first_name||"",contact_last_name:s.contact_last_name||"",contact_company:s.contact_company||"",note:s.message_body||"",message_body:s.message_body||"",due_at:s.send_at,send_at:s.send_at,channel:s.channel||"linkedin",mode:s.mode||"resurface",conversation_id:s.conversation_id,priority:null,source:"scheduled"};})
      );
    }catch(e){}
  }

  async function loadTasks(){
    try{
      var U2=process.env.NEXT_PUBLIC_SUPABASE_URL;var K2=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      var rows=await fetch(U2+"/rest/v1/follow_up_tasks?status=eq.open&order=due_at.asc.nullslast&limit=100",{headers:{"apikey":K2,"Authorization":"Bearer "+K2}}).then(function(r){return r.json();});
      setTasks((Array.isArray(rows)?rows:[]).map(function(t){return{id:t.id,itemType:"task",contact_id:t.contact_id,contact_first_name:t.contact_first_name||"",contact_last_name:t.contact_last_name||"",contact_company:t.contact_company||"",note:t.note||"",due_at:t.due_at||null,priority:t.priority||"normal",source:t.source||"manual",contact_type:t.contact_type||"CFO_PROSPECT"};})
      );
    }catch(e){}
  }

  async function completePlanItem(item){
    try{await fetch("/api/my-plan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"complete",id:item.id,type:item.itemType==="scheduled"?"scheduled":"task"})});}catch(e){}
    if(item.itemType==="scheduled")setScheduled(function(p){return p.filter(function(i){return i.id!==item.id;});});
    if(item.itemType==="task")setTasks(function(p){return p.filter(function(i){return i.id!==item.id;});});
    setSelected(null);
  }

  function handleInboundDone(item,reason,msg){
    setGoneIds(function(prev){var n=new Set(prev);n.add(item.id);return n;});
    if(reason==="sent"){setDone(function(p){return[Object.assign({},item,{sentMessage:msg,completedAt:new Date().toISOString()})].concat(p);});setDaily(function(d){return d+1;});}
    var remaining=queue.filter(function(q){return !goneIds.has(q.id)&&q.id!==item.id;});
    setSelected(remaining.length>0?remaining[0]:null);
  }

  function startGlobalVoice(){
    var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){alert("Voice input requires Chrome");return;}
    var r=new SR();r.lang="en-US";r.interimResults=false;
    r.onresult=function(e){setVoiceCmd(e.results[0][0].transcript);setVoiceListening(false);};
    r.onerror=function(){setVoiceListening(false);};
    r.onend=function(){setVoiceListening(false);};
    r.start();setVoiceListening(true);
  }

  async function runGlobalVoice(){
    if(!voiceCmd.trim()||voiceRunning)return;
    setVoiceRunning(true);setVoiceResult("");
    try{
      var res=await fetch("/api/smart-action",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({command:voiceCmd,contact:null,conversationId:null})});
      var d=await res.json();
      setVoiceResult(d.confirmation||"Done");
      setVoiceCmd("");
      loadAll();
    }catch(e){setVoiceResult("Error — try again");}
    setVoiceRunning(false);
  }

  var activeQueue=queue.filter(function(q){return !goneIds.has(q.id);});
  var now=new Date();
  var overdueItems=[...activeQueue,...scheduled,...tasks].filter(function(i){return i.due_at&&new Date(i.due_at)<now;});

  var allItems=[];
  if(filter==="all")       allItems=[...activeQueue,...scheduled,...tasks];
  else if(filter==="inbound")   allItems=activeQueue;
  else if(filter==="scheduled") allItems=scheduled;
  else if(filter==="tasks")     allItems=tasks;
  else if(filter==="overdue")   allItems=overdueItems;

  allItems=allItems.slice().sort(function(a,b){
    var aOv=a.due_at&&new Date(a.due_at)<now;
    var bOv=b.due_at&&new Date(b.due_at)<now;
    if(aOv&&!bOv)return -1;
    if(!aOv&&bOv)return 1;
    if(a.due_at&&b.due_at)return new Date(a.due_at)-new Date(b.due_at);
    if(a.due_at&&!b.due_at)return -1;
    if(!a.due_at&&b.due_at)return 1;
    return 0;
  });

  var inboundCount=activeQueue.length;
  var scheduledCount=scheduled.length;
  var taskCount=tasks.length;
  var overdueCount=overdueItems.length;

  var FILTERS=[
    {id:"all",       label:"All",       count:inboundCount+scheduledCount+taskCount, color:G},
    {id:"inbound",   label:"Inbound",   count:inboundCount,   color:T.blue},
    {id:"scheduled", label:"Scheduled", count:scheduledCount, color:T.purple},
    {id:"tasks",     label:"Tasks",     count:taskCount,      color:T.blue},
    {id:"overdue",   label:"Overdue",   count:overdueCount,   color:T.red},
  ];

  return(
    <div style={{fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,serif",display:"flex",height:"100%",overflow:"hidden",background:BG,position:"relative"}}>
      {showAdd&&<AddTaskPanel onAdd={loadAll} onClose={function(){setShowAdd(false);}}/>}

      {/* LEFT */}
      <div style={{width:340,flexShrink:0,display:"flex",flexDirection:"column",borderRight:"1px solid rgba(255,255,255,0.06)",background:BG2,overflow:"hidden"}}>
        <div style={{padding:"14px 14px 10px",borderBottom:"1px solid rgba(255,255,255,0.06)",flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{fontSize:11,letterSpacing:3,color:G,textTransform:"uppercase",fontWeight:600}}>Follow-Up</div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              {daily>0&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:9,background:"rgba(46,204,113,0.12)",border:"1px solid rgba(46,204,113,0.2)",color:T.green}}>{daily} sent today</span>}
              <button onClick={function(){setShowAdd(true);}} style={{padding:"4px 10px",background:"rgba(240,200,74,0.1)",border:"1px solid rgba(240,200,74,0.25)",color:G,borderRadius:4,cursor:"pointer",fontSize:11,fontWeight:600}}>+ Add</button>
              <button onClick={function(){setShowVoice(function(v){return !v;});}} title="Smart command" style={{padding:"4px 8px",background:showVoice?"rgba(240,200,74,0.1)":"transparent",border:"1px solid "+(showVoice?"rgba(240,200,74,0.3)":"rgba(255,255,255,0.08)"),color:showVoice?G:T.dim,borderRadius:4,cursor:"pointer",fontSize:12}}>🎙</button>
            </div>
          </div>
          <div style={{display:"flex",gap:3}}>
            {FILTERS.map(function(f){
              var active=filter===f.id;
              return(
                <button key={f.id} onClick={function(){setFilter(f.id);}} style={{flex:1,padding:"4px 3px",borderRadius:4,cursor:"pointer",border:"1px solid "+(active?f.color+"40":"rgba(255,255,255,0.07)"),background:active?f.color+"10":"transparent",color:active?f.color:T.muted,fontSize:10}}>
                  {f.label}{f.count>0&&<span style={{marginLeft:3,fontSize:9,color:active?f.color:T.dim}}>({f.count})</span>}
                </button>
              );
            })}
          </div>
        </div>

        {showVoice&&<div style={{borderBottom:"1px solid rgba(255,255,255,0.06)",flexShrink:0}}>
          <SmartCommand
            contact={null}
            conversationId={null}
            onRefresh={loadAll}
            placeholder='e.g. "Put Jonathan Elbaz at Trinet on my follow-up list"'
          />
        </div>}

        <div style={{flex:1,overflowY:"auto",padding:"10px 10px"}}>
          {loading&&<div style={{color:T.dim,fontSize:13,textAlign:"center",padding:"30px 0"}}>Loading…</div>}
          {error&&<div style={{color:T.red,fontSize:12,textAlign:"center",padding:"20px"}}>{error}</div>}
          {!loading&&allItems.length===0&&(
            <div style={{textAlign:"center",padding:"40px 20px"}}>
              <div style={{fontSize:28,marginBottom:10,opacity:0.4}}>✓</div>
              <div style={{fontSize:13,color:T.dim}}>Nothing here</div>
              <button onClick={function(){setShowAdd(true);}} style={{marginTop:12,padding:"6px 16px",background:"rgba(240,200,74,0.08)",border:"1px solid rgba(240,200,74,0.2)",color:G,borderRadius:5,cursor:"pointer",fontSize:12}}>+ Add something</button>
            </div>
          )}

          {allItems.map(function(item){
            var isSelected=selected&&selected.id===item.id&&selected.itemType===item.itemType;
            if(item.itemType==="inbound"){
              return <InboundCard key={"inbound-"+item.id} item={item} selected={isSelected} gone={goneIds.has(item.id)} onClick={function(){setSelected(item);}}/>;
            }
            return <PlanCard key={item.itemType+"-"+item.id} item={item} selected={isSelected} onComplete={completePlanItem} onClick={function(){setSelected(item);}}/>;
          })}

          {done.length>0&&<>
            <div style={{fontSize:10,color:T.dim,letterSpacing:2,textTransform:"uppercase",padding:"10px 4px 6px"}}>Completed this session</div>
            {done.map(function(item){return(
              <div key={item.id+"done"} style={{padding:"10px 12px",borderRadius:6,background:"rgba(255,255,255,0.01)",border:"1px solid rgba(255,255,255,0.04)",marginBottom:6,opacity:0.5}}>
                <div style={{fontSize:12,color:T.muted}}>{item.firstName} {item.lastName}</div>
                <div style={{fontSize:11,color:T.dim,fontStyle:"italic",marginTop:2}}>Sent · {timeAgo(item.completedAt)}</div>
              </div>
            );})}
          </>}
        </div>
      </div>

      {/* RIGHT */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {selected&&selected.itemType==="inbound"
          ?<ThreadPanel key={selected.id} item={selected} onDone={handleInboundDone} onClose={function(){setSelected(null);}} onNavigate={onNavigate}/>
          :selected&&(selected.itemType==="scheduled"||selected.itemType==="task")
            ?<ItemDetailPanel item={selected} onClose={function(){setSelected(null);}} onComplete={completePlanItem} onRefresh={loadAll}/>
            :<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",color:T.dim,gap:10}}>
              <div style={{fontSize:32,opacity:0.3}}>↩</div>
              <div style={{fontSize:14}}>Select an item</div>
              <div style={{fontSize:12,opacity:0.7}}>Inbound replies, scheduled sends, and tasks all live here</div>
            </div>
        }
      </div>
    </div>
  );
}
