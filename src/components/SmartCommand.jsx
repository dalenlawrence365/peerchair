"use client"
import { useState, useRef } from "react"

var G  = "#f0c84a"
var T  = {
  text:"#e8f2ff", muted:"#7a9bb8", dim:"#3a5a74",
  green:"#2ecc71", red:"#e74c3c", blue:"#4a9eba"
}

export default function SmartCommand({ contact, conversationId, onRefresh, placeholder, systemContext }) {
  var [cmd,        setCmd]        = useState("")
  var [interim,    setInterim]    = useState("")
  var [listening,  setListening]  = useState(false)
  var [confirming, setConfirming] = useState(false)
  var [running,    setRunning]    = useState(false)
  var [result,     setResult]     = useState("")
  var [resultOk,   setResultOk]   = useState(true)
  var [commandId,  setCommandId]  = useState(null)
  var [draft,      setDraft]      = useState(null)
  var [savingDraft,setSavingDraft]= useState(false)
  var recRef     = useRef(null)
  var streamRef  = useRef(null)
  var chunksRef  = useRef([])
  var silenceRef = useRef(null)

  function playChime(type) {
    try {
      var ctx   = new (window.AudioContext || window.webkitAudioContext)()
      var notes = type === "start"
        ? [{f:600,t:0,d:0.08},{f:900,t:0.09,d:0.12}]
        : [{f:900,t:0,d:0.08},{f:600,t:0.09,d:0.12}]
      notes.forEach(function(n) {
        var osc  = ctx.createOscillator()
        var gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.type = "sine"
        osc.frequency.setValueAtTime(n.f, ctx.currentTime + n.t)
        gain.gain.setValueAtTime(0, ctx.currentTime + n.t)
        gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + n.t + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + n.t + n.d)
        osc.start(ctx.currentTime + n.t)
        osc.stop(ctx.currentTime  + n.t + n.d + 0.01)
      })
      setTimeout(function(){ ctx.close() }, 500)
    } catch(e) {}
  }

  function startVoice() {
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      alert("Audio recording not supported. Use Chrome or Safari.")
      return
    }
    // Request mic permission explicitly
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
      chunksRef.current = []
      playChime("start")
      setListening(true)
      setInterim("Listening…")
      setResult("")
      setConfirming(false)
      streamRef.current = stream
      var mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4"
      var recorder = new MediaRecorder(stream, { mimeType })
      recRef.current = recorder
      recorder.ondataavailable = function(e) { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = function() { transcribeAudio() }
      recorder.start()
      silenceRef.current = setTimeout(function() {
        if (recRef.current && recRef.current.state !== "inactive") {
          setInterim("Auto-stopped…")
          stopVoice()
        }
      }, 10000)
    }).catch(function(e) {
      alert("Microphone access denied. Go to your browser address bar, click the lock icon, and allow microphone for this site.")
    })
  }

  function stopVoice() {
    if (silenceRef.current) { clearTimeout(silenceRef.current); silenceRef.current = null }
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop()
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(function(t){ t.stop() })
      streamRef.current = null
    }
    playChime("stop")
    setListening(false)
    setInterim("Transcribing…")
  }

  async function transcribeAudio() {
    var chunks = chunksRef.current
    if (!chunks.length) { setInterim("No audio — try again"); setTimeout(function(){ setInterim("") }, 3000); return }
    setInterim("Sending to Whisper…")
    var mimeType = chunks[0].type || "audio/webm"
    var ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm"
    var blob = new Blob(chunks, { type: mimeType })
    var form = new FormData()
    form.append("audio", blob, "recording." + ext)
    if (contact && contact.id) form.append("contact_id", contact.id)
    form.append("source", "actions_tab")
    try {
      var res = await fetch("/api/transcribe", { method: "POST", body: form })
      var d   = await res.json()
      if (d.command_id) setCommandId(d.command_id)
      if (d.text && d.text.trim()) {
        setCmd(function(prev){ return (prev ? prev + " " : "") + d.text.trim() })
        setInterim("")
      } else if (d.error) {
        setInterim("Error: " + d.error)
        setTimeout(function(){ setInterim("") }, 4000)
      } else {
        setInterim("Nothing captured — try again")
        setTimeout(function(){ setInterim("") }, 3000)
      }
    } catch(e) {
      setInterim("Network error — " + e.message)
      setTimeout(function(){ setInterim("") }, 4000)
    }
  }

  async function saveDraft() {
    if (!draft) return
    setSavingDraft(true)
    try {
      var res = await fetch("/api/email/draft", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          to:          draft.to || (contact?.email || ""),
          subject:     draft.subject,
          text:        draft.body,
          contact_id:  contact?.id || null,
          attachments: draft.attachments || []
        })
      })
      var d = await res.json()
      if (d.success) {
        setResult("✓ Saved to Outlook Drafts")
        setResultOk(true)
        setDraft(null)
      } else {
        setResult("Draft save failed: " + d.error)
        setResultOk(false)
      }
    } catch(e) {
      setResult("Error: " + e.message)
      setResultOk(false)
    }
    setSavingDraft(false)
    setTimeout(function(){ setResult("") }, 6000)
  }

  function handleGo() {
    if (!cmd.trim() || running || confirming) return
    setConfirming(true)
  }

  async function confirm() {
    setConfirming(false)
    setRunning(true)
    setResult("")
    try {
      var res = await fetch("/api/smart-action", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({
          command: cmd,
          contact: contact || null,
          conversationId: conversationId || null,
          command_id: commandId || null,
          systemContext: systemContext || null,
        })
      })
      var d = await res.json()
      setResult(d.confirmation || "Done")
      setResultOk(true)
      setCmd("")
      setCommandId(null)
      if (d.draft_email) setDraft(d.draft_email)
      if (onRefresh) onRefresh()
    } catch(e) {
      setResult("Error — " + e.message)
      setResultOk(false)
    }
    setRunning(false)
    setTimeout(function(){ setResult("") }, 8000)
  }

  function cancel() { setConfirming(false) }

  var ph = placeholder || "Speak or type a command — e.g. \"Snooze until June 1\" or \"Draft a follow-up email\""

  return (
    <div style={{display:"flex",flexDirection:"column",gap:0}}>

      {/* Interim */}
      {interim && (
        <div style={{padding:"6px 16px",background:"rgba(255,255,255,0.02)",borderBottom:"1px solid rgba(255,255,255,0.05)",fontSize:12,color:listening?T.red:T.muted,fontStyle:"italic"}}>
          {interim}
        </div>
      )}

      {/* Textarea */}
      <div style={{position:"relative",padding:"12px 16px"}}>
        <textarea
          value={cmd}
          onChange={function(e){ if(!confirming) setCmd(e.target.value) }}
          onKeyDown={function(e){ if(e.key==="Enter"&&(e.metaKey||e.ctrlKey)) handleGo() }}
          placeholder={ph}
          rows={4}
          readOnly={confirming}
          style={{
            width:"100%", boxSizing:"border-box",
            background: confirming ? "rgba(240,200,74,0.04)" : "rgba(255,255,255,0.02)",
            border:"1px solid "+(confirming?"rgba(240,200,74,0.25)":"rgba(255,255,255,0.07)"),
            color:T.text, padding:"12px 14px", borderRadius:8,
            fontSize:14, lineHeight:1.75, resize:"none",
            outline:"none", fontFamily:"inherit",
          }}
        />
        {/* Button row inside/below textarea */}
        <div style={{display:"flex",alignItems:"center",marginTop:8,gap:8}}>
          <button
            onClick={listening ? stopVoice : startVoice}
            title={listening ? "Click to stop" : "Click to speak"}
            style={{
              width:36,height:36,borderRadius:"50%",flexShrink:0,
              background:listening?"rgba(231,76,60,0.15)":"rgba(74,158,186,0.08)",
              border:"1px solid "+(listening?"rgba(231,76,60,0.35)":"rgba(74,158,186,0.2)"),
              color:listening?T.red:T.blue,
              cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",
              transition:"all 0.15s"
            }}>
            {listening ? "■" : "🎙"}
          </button>
          {listening && <span style={{fontSize:11,color:T.red,fontWeight:600,letterSpacing:0.5}}>Listening…</span>}
          <div style={{flex:1}}/>
          <button
            onClick={handleGo}
            disabled={!cmd.trim() || running || listening}
            title="Send (⌘↵)"
            style={{
              width:36,height:36,borderRadius:"50%",flexShrink:0,
              background:cmd.trim()&&!running&&!listening?G:"rgba(255,255,255,0.05)",
              border:"none",
              color:cmd.trim()&&!running&&!listening?"#000":T.dim,
              cursor:cmd.trim()&&!running&&!listening?"pointer":"default",
              fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",
              transition:"all 0.15s",fontWeight:700
            }}>
            {running ? "…" : "↑"}
          </button>
        </div>
      </div>

      {/* Confirmation banner */}
      {confirming && (
        <div style={{margin:"0 16px 12px",padding:"12px 16px",background:"rgba(240,200,74,0.06)",border:"1px solid rgba(240,200,74,0.25)",borderRadius:8}}>
          <div style={{fontSize:12,color:G,fontWeight:600,marginBottom:6}}>Run this command?</div>
          <div style={{fontSize:13,color:T.text,fontStyle:"italic",marginBottom:12,lineHeight:1.65}}>"{cmd}"</div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={confirm} style={{flex:1,padding:"8px",background:"rgba(46,204,113,0.12)",border:"1px solid rgba(46,204,113,0.3)",color:T.green,borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:700}}>
              ✓ Confirm
            </button>
            <button onClick={cancel} style={{padding:"8px 20px",background:"rgba(231,76,60,0.08)",border:"1px solid rgba(231,76,60,0.2)",color:T.red,borderRadius:6,cursor:"pointer",fontSize:13}}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{margin:"0 16px 12px",padding:"10px 14px",background:resultOk?"rgba(46,204,113,0.08)":"rgba(231,76,60,0.08)",border:"1px solid "+(resultOk?"rgba(46,204,113,0.2)":"rgba(231,76,60,0.2)"),borderRadius:6,fontSize:13,color:resultOk?T.green:T.red}}>
          {resultOk?"✓":"✗"} {result}
        </div>
      )}
      {/* Email draft preview */}
      {draft && (
        <div style={{margin:"0 16px 16px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,overflow:"hidden"}}>
          <div style={{padding:"10px 14px",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:10,letterSpacing:2,color:G,textTransform:"uppercase",fontWeight:600}}>Email Draft</div>
            <button onClick={function(){setDraft(null)}} style={{background:"transparent",border:"none",color:T.dim,cursor:"pointer",fontSize:14}}>×</button>
          </div>
          <div style={{padding:"12px 14px"}}>
            <div style={{fontSize:11,color:T.dim,marginBottom:3}}>TO</div>
            <div style={{fontSize:13,color:T.muted,marginBottom:10}}>{draft.to || (contact?.email || "—")}</div>
            <div style={{fontSize:11,color:T.dim,marginBottom:3}}>SUBJECT</div>
            <div style={{fontSize:13,color:T.text,fontWeight:600,marginBottom:10}}>{draft.subject}</div>
            <div style={{fontSize:11,color:T.dim,marginBottom:3}}>BODY</div>
            <div style={{fontSize:13,color:T.text,lineHeight:1.7,whiteSpace:"pre-wrap",maxHeight:200,overflowY:"auto"}}>{draft.body}</div>
          </div>
          {draft.attachments && draft.attachments.length > 0 && (
            <div style={{padding:"6px 14px",borderTop:"1px solid rgba(255,255,255,0.04)"}}>
              <div style={{fontSize:10,color:T.dim,marginBottom:4}}>ATTACHMENTS</div>
              {draft.attachments.map(function(a,i){
                return <div key={i} style={{fontSize:12,color:T.muted,padding:"2px 0"}}>📎 {a.name}</div>
              })}
            </div>
          )}
          <div style={{padding:"10px 14px",borderTop:"1px solid rgba(255,255,255,0.06)",display:"flex",gap:8}}>
            <button onClick={saveDraft} disabled={savingDraft} style={{flex:1,padding:"8px",background:"rgba(46,204,113,0.12)",border:"1px solid rgba(46,204,113,0.3)",color:T.green,borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:700}}>
              {savingDraft ? "Saving…" : "📥 Save to Outlook Drafts" + (draft.attachments?.length > 0 ? " ("+draft.attachments.length+" attachment)" : "")}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
