"use client"
import { useState } from "react"

var G  = "#f0c84a"
var T  = { text:"#e8f2ff", muted:"#7a9bb8", dim:"#3a5a74", border:"rgba(255,255,255,0.06)", green:"#2ecc71", red:"#e74c3c" }

export default function DraftEmail({ contact, onClose, onSaved }) {
  var [to,      setTo]      = useState(contact?.email || "")
  var [subject, setSubject] = useState("")
  var [body,    setBody]    = useState("")
  var [status,  setStatus]  = useState(null)  // null | "saving" | "saved" | "error"
  var [errMsg,  setErrMsg]  = useState("")

  var inp = { background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.1)", color:T.text, padding:"8px 12px", borderRadius:6, fontSize:13, outline:"none", fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,serif", width:"100%", boxSizing:"border-box" }

  async function save() {
    if (!subject.trim() || !body.trim()) { setStatus("error"); setErrMsg("Subject and body required"); return }
    setStatus("saving")
    try {
      var res = await fetch("/api/email/draft", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ to, subject, text:body, contact_id: contact?.id || null })
      })
      var d = await res.json()
      if (d.success) {
        setStatus("saved")
        if (onSaved) onSaved()
      } else {
        setStatus("error")
        setErrMsg(d.error || "Save failed")
      }
    } catch(e) {
      setStatus("error")
      setErrMsg(e.message)
    }
  }

  return (
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.7)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#0c1520",border:"1px solid rgba(255,255,255,0.1)",borderRadius:12,width:"100%",maxWidth:620,display:"flex",flexDirection:"column",maxHeight:"90vh"}}>

        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
          <div>
            <div style={{fontSize:11,letterSpacing:3,color:G,textTransform:"uppercase",fontWeight:600}}>Draft Email</div>
            <div style={{fontSize:12,color:T.dim,marginTop:2}}>Saves to Outlook Drafts</div>
          </div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:20,lineHeight:1}}>×</button>
        </div>

        {/* Form */}
        <div style={{padding:"20px",overflowY:"auto",flex:1,display:"flex",flexDirection:"column",gap:14}}>

          <div>
            <div style={{fontSize:10,color:T.dim,letterSpacing:1.5,textTransform:"uppercase",marginBottom:5}}>To</div>
            <input value={to} onChange={e=>setTo(e.target.value)} placeholder="recipient@email.com" style={inp}/>
          </div>

          <div>
            <div style={{fontSize:10,color:T.dim,letterSpacing:1.5,textTransform:"uppercase",marginBottom:5}}>Subject</div>
            <input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Subject line" style={inp}/>
          </div>

          <div style={{flex:1}}>
            <div style={{fontSize:10,color:T.dim,letterSpacing:1.5,textTransform:"uppercase",marginBottom:5}}>Body</div>
            <textarea
              value={body}
              onChange={e=>setBody(e.target.value)}
              placeholder={"Write your email here...\n\nTip: be direct and peer-to-peer."}
              rows={14}
              style={{...inp, resize:"vertical", lineHeight:1.7}}
            />
          </div>

          {status === "saved" && (
            <div style={{padding:"10px 14px",background:"rgba(46,204,113,0.08)",border:"1px solid rgba(46,204,113,0.2)",borderRadius:6,fontSize:13,color:T.green}}>
              ✓ Draft saved to Outlook — open Outlook to review and send
            </div>
          )}

          {status === "error" && (
            <div style={{padding:"10px 14px",background:"rgba(231,76,60,0.08)",border:"1px solid rgba(231,76,60,0.2)",borderRadius:6,fontSize:13,color:T.red}}>
              ✗ {errMsg}
            </div>
          )}

          <div style={{display:"flex",gap:10}}>
            {status !== "saved" && (
              <button
                onClick={save}
                disabled={status==="saving"}
                style={{flex:1,padding:"11px",background:"rgba(46,204,113,0.1)",border:"1px solid rgba(46,204,113,0.3)",color:T.green,borderRadius:7,cursor:status==="saving"?"default":"pointer",fontSize:13,fontWeight:700}}>
                {status === "saving" ? "Saving to Outlook…" : "Save to Outlook Drafts"}
              </button>
            )}
            {status === "saved" && (
              <button onClick={onClose} style={{flex:1,padding:"11px",background:"rgba(240,200,74,0.1)",border:"1px solid rgba(240,200,74,0.3)",color:G,borderRadius:7,cursor:"pointer",fontSize:13,fontWeight:700}}>
                Done
              </button>
            )}
            <button onClick={onClose} style={{padding:"11px 20px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.1)",color:T.muted,borderRadius:7,cursor:"pointer",fontSize:13}}>
              Cancel
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
