"use client"
import { useState, useEffect, useRef } from "react"

var G   = "#f0c84a"
var BG  = "#080f1a"
var BG2 = "#0c1520"
var T   = {
  text:"#e8f2ff", muted:"#7a9bb8", dim:"#3a5a74",
  border:"rgba(255,255,255,0.06)",
  green:"#2ecc71", red:"#e74c3c", blue:"#4a9eba"
}

function fileIcon(mime) {
  if (mime.includes("pdf"))         return "📄"
  if (mime.includes("word") || mime.includes("document")) return "📝"
  if (mime.includes("presentation") || mime.includes("powerpoint")) return "📊"
  if (mime.includes("image"))       return "🖼"
  return "📎"
}

function fileSize(bytes) {
  if (!bytes) return ""
  if (bytes < 1024)        return bytes + " B"
  if (bytes < 1024*1024)   return Math.round(bytes/1024) + " KB"
  return (bytes/(1024*1024)).toFixed(1) + " MB"
}

export default function Files() {
  var [files,       setFiles]       = useState([])
  var [loading,     setLoading]     = useState(true)
  var [uploading,   setUploading]   = useState(false)
  var [uploadResult,setUploadResult]= useState(null)
  var [name,        setName]        = useState("")
  var [description, setDescription] = useState("")
  var [selectedFile,setSelectedFile]= useState(null)
  var [showUpload,  setShowUpload]  = useState(false)
  var [preview,     setPreview]     = useState(null)  // {url, name, mime_type}
  var fileRef = useRef(null)

  useEffect(function(){ loadFiles() }, [])

  async function openPreview(f) {
    var sb_url = process.env.NEXT_PUBLIC_SUPABASE_URL
    var sb_key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    // Get signed URL from Supabase storage
    var res = await fetch(sb_url + "/storage/v1/object/sign/peerchair-files/" + encodeURIComponent(f.storage_path), {
      method: "POST",
      headers: { "apikey": sb_key, "Authorization": "Bearer " + sb_key, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 300 })
    })
    var d = await res.json()
    var signedUrl = d.signedURL ? (sb_url + "/storage/v1" + d.signedURL) : null
    if (signedUrl) setPreview({ url: signedUrl, name: f.name, filename: f.filename, mime_type: f.mime_type })
  }

  async function loadFiles() {
    setLoading(true)
    try {
      var res = await fetch("/api/files")
      var d   = await res.json()
      setFiles(d.files || [])
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  function onFileChange(e) {
    var f = e.target.files[0]
    if (!f) return
    setSelectedFile(f)
    if (!name) setName(f.name.replace(/\.[^.]+$/,"").replace(/[-_]/g," "))
  }

  async function upload() {
    if (!selectedFile) return
    setUploading(true); setUploadResult(null)
    var form = new FormData()
    form.append("file", selectedFile)
    form.append("name", name || selectedFile.name)
    form.append("description", description)
    try {
      var res = await fetch("/api/files", { method:"POST", body:form })
      var d   = await res.json()
      if (d.file) {
        setUploadResult({ ok:true, msg:"Uploaded — "+d.file.name })
        setName(""); setDescription(""); setSelectedFile(null)
        if (fileRef.current) fileRef.current.value = ""
        setShowUpload(false)
        await loadFiles()
      } else {
        setUploadResult({ ok:false, msg: d.error||"Upload failed" })
      }
    } catch(e) {
      setUploadResult({ ok:false, msg: e.message })
    }
    setUploading(false)
    setTimeout(function(){ setUploadResult(null) }, 5000)
  }

  async function deleteFile(id, name) {
    if (!confirm("Delete \"" + name + "\"? This cannot be undone.")) return
    await fetch("/api/files?id="+id, { method:"DELETE" })
    await loadFiles()
  }

  return (
    <div style={{fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,serif",display:"flex",flexDirection:"column",height:"100%",overflow:"hidden",background:BG}}>

      {/* Header */}
      <div style={{padding:"14px 20px",borderBottom:"1px solid rgba(255,255,255,0.06)",background:BG2,flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:11,letterSpacing:3,color:G,textTransform:"uppercase",fontWeight:600,marginBottom:2}}>Files</div>
          <div style={{fontSize:12,color:T.dim}}>{files.length} file{files.length!==1?"s":""} · attach to email drafts by name</div>
        </div>
        <button
          onClick={function(){setShowUpload(function(v){return !v})}}
          style={{padding:"7px 16px",background:showUpload?"rgba(240,200,74,0.12)":"rgba(255,255,255,0.04)",border:"1px solid "+(showUpload?"rgba(240,200,74,0.3)":"rgba(255,255,255,0.1)"),color:showUpload?G:T.muted,borderRadius:5,cursor:"pointer",fontSize:12,fontWeight:600}}>
          {showUpload ? "Cancel" : "+ Upload File"}
        </button>
      </div>

      {/* Upload panel */}
      {showUpload && (
        <div style={{padding:"16px 20px",borderBottom:"1px solid rgba(255,255,255,0.06)",background:"rgba(240,200,74,0.02)",flexShrink:0}}>
          <div style={{display:"flex",flexDirection:"column",gap:10,maxWidth:600}}>

            {/* File picker */}
            <div
              onClick={function(){fileRef.current&&fileRef.current.click()}}
              style={{border:"2px dashed rgba(255,255,255,0.1)",borderRadius:8,padding:"20px",textAlign:"center",cursor:"pointer",background:selectedFile?"rgba(46,204,113,0.04)":"rgba(255,255,255,0.01)",transition:"all 0.15s"}}>
              <input ref={fileRef} type="file" accept=".pdf,.docx,.pptx,.doc,.ppt,.png,.jpg,.jpeg" onChange={onFileChange} style={{display:"none"}}/>
              {selectedFile
                ? <div><div style={{fontSize:20,marginBottom:4}}>{fileIcon(selectedFile.type)}</div><div style={{fontSize:13,color:T.green,fontWeight:600}}>{selectedFile.name}</div><div style={{fontSize:11,color:T.dim,marginTop:2}}>{fileSize(selectedFile.size)}</div></div>
                : <div><div style={{fontSize:24,marginBottom:6,opacity:0.4}}>📎</div><div style={{fontSize:13,color:T.muted}}>Click to select a file</div><div style={{fontSize:11,color:T.dim,marginTop:2}}>PDF, Word, PowerPoint, or image</div></div>
              }
            </div>

            {/* Name field */}
            <div>
              <div style={{fontSize:10,color:T.dim,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>Name <span style={{color:T.dim,fontWeight:400}}>(this is how you reference it in commands)</span></div>
              <input
                value={name}
                onChange={function(e){setName(e.target.value)}}
                placeholder="e.g. CFO Circle One Pager"
                style={{width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.1)",color:T.text,padding:"8px 12px",borderRadius:6,fontSize:13,outline:"none",fontFamily:"inherit"}}
              />
            </div>

            {/* Description field */}
            <div>
              <div style={{fontSize:10,color:T.dim,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>Description <span style={{color:T.dim,fontWeight:400}}>(optional)</span></div>
              <input
                value={description}
                onChange={function(e){setDescription(e.target.value)}}
                placeholder="e.g. 2-page CFO Circle membership overview"
                style={{width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.1)",color:T.text,padding:"8px 12px",borderRadius:6,fontSize:13,outline:"none",fontFamily:"inherit"}}
              />
            </div>

            {uploadResult && (
              <div style={{padding:"8px 12px",background:uploadResult.ok?"rgba(46,204,113,0.08)":"rgba(231,76,60,0.08)",border:"1px solid "+(uploadResult.ok?"rgba(46,204,113,0.2)":"rgba(231,76,60,0.2)"),borderRadius:5,fontSize:12,color:uploadResult.ok?T.green:T.red}}>
                {uploadResult.ok?"✓":"✗"} {uploadResult.msg}
              </div>
            )}

            <button
              onClick={upload}
              disabled={!selectedFile||uploading}
              style={{padding:"9px",background:selectedFile&&!uploading?"rgba(240,200,74,0.1)":"rgba(255,255,255,0.03)",border:"1px solid "+(selectedFile&&!uploading?"rgba(240,200,74,0.3)":"rgba(255,255,255,0.07)"),color:selectedFile&&!uploading?G:T.dim,borderRadius:6,cursor:selectedFile&&!uploading?"pointer":"default",fontSize:13,fontWeight:600}}>
              {uploading ? "Uploading…" : "↑ Upload"}
            </button>
          </div>
        </div>
      )}

      {/* File list */}
      <div style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>
        {loading && <div style={{textAlign:"center",padding:"40px",color:T.dim,fontSize:13}}>Loading…</div>}

        {!loading && files.length === 0 && (
          <div style={{textAlign:"center",padding:"60px 20px"}}>
            <div style={{fontSize:32,marginBottom:10,opacity:0.3}}>📎</div>
            <div style={{fontSize:14,color:T.dim}}>No files yet</div>
            <div style={{fontSize:12,color:T.dim,marginTop:6,opacity:0.7}}>Upload your one-pagers and decks to attach them to email drafts</div>
          </div>
        )}

        {files.map(function(f){
          return (
            <div key={f.id} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 16px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:8,marginBottom:8,cursor:"pointer"}} onClick={function(){openPreview(f)}}>
              <div style={{fontSize:28,flexShrink:0}}>{fileIcon(f.mime_type)}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:600,color:T.text,marginBottom:2}}>{f.name}</div>
                {f.description && <div style={{fontSize:12,color:T.muted,marginBottom:3}}>{f.description}</div>}
                <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                  <span style={{fontSize:11,color:T.dim}}>{f.filename}</span>
                  <span style={{fontSize:11,color:T.dim}}>{fileSize(f.size_bytes)}</span>
                  <span style={{fontSize:11,color:T.dim}}>{new Date(f.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</span>
                </div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
                <div style={{padding:"3px 10px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:4,fontSize:10,color:T.dim}}>
                  Say: "attach {f.name.toLowerCase()}"
                </div>
                <button
                  onClick={function(){deleteFile(f.id,f.name)}}
                  style={{width:28,height:28,borderRadius:"50%",background:"rgba(231,76,60,0.08)",border:"1px solid rgba(231,76,60,0.2)",color:T.red,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  ×
                </button>
              </div>
            </div>
          )
        })}
      </div>
      {/* Preview modal */}
      {preview && (
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.85)",zIndex:1000,display:"flex",flexDirection:"column"}} onClick={function(){setPreview(null)}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 20px",background:"rgba(12,21,32,0.95)",flexShrink:0}} onClick={function(e){e.stopPropagation()}}>
            <div>
              <div style={{fontSize:14,fontWeight:600,color:"#fff"}}>{preview.name}</div>
              <div style={{fontSize:11,color:"#3a5a74"}}>{preview.filename}</div>
            </div>
            <div style={{display:"flex",gap:10}}>
              <a href={preview.url} target="_blank" rel="noreferrer" style={{padding:"6px 14px",background:"rgba(74,154,186,0.1)",border:"1px solid rgba(74,154,186,0.25)",color:"#4a9eba",borderRadius:5,fontSize:12,textDecoration:"none",fontWeight:600}}>
                Open in new tab ↗
              </a>
              <button onClick={function(){setPreview(null)}} style={{width:32,height:32,borderRadius:"50%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",color:"#7a9bb8",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
            </div>
          </div>
          <div style={{flex:1,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={function(e){e.stopPropagation()}}>
            {preview.mime_type.includes("pdf") && (
              <iframe src={preview.url} style={{width:"100%",height:"100%",border:"none",borderRadius:6,background:"#fff"}} title={preview.name}/>
            )}
            {preview.mime_type.includes("image") && (
              <img src={preview.url} style={{maxWidth:"100%",maxHeight:"100%",borderRadius:6,objectFit:"contain"}} alt={preview.name}/>
            )}
            {!preview.mime_type.includes("pdf") && !preview.mime_type.includes("image") && (
              <div style={{textAlign:"center",color:"#7a9bb8"}}>
                <div style={{fontSize:48,marginBottom:16}}>📄</div>
                <div style={{fontSize:14,marginBottom:12}}>{preview.name}</div>
                <a href={preview.url} target="_blank" rel="noreferrer" style={{padding:"10px 24px",background:"rgba(74,154,186,0.1)",border:"1px solid rgba(74,154,186,0.25)",color:"#4a9eba",borderRadius:6,fontSize:13,textDecoration:"none",fontWeight:600}}>
                  Download to preview ↓
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
