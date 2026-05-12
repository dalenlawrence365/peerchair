"use client"
import { useState, useRef, useEffect } from "react"
import SmartCommand from "@/components/SmartCommand"
import DraftEmail from "@/components/DraftEmail"
import CopyPromptButton from "@/components/CopyPromptButton"
import { sbFetch, dbToLocal, localToDb, G, BG, BG2, BG3, T, stageColor, chColor, chIcon, PIPELINE, STATUSES, OUTCOMES, OWNERSHIP, RPT, IND, REV, EMP, FIN, PRESSURE, CUES, FLAGS, MEMB_T, JOURNEY, STAGE_TO_NODE, CHAPTERS, SOURCES, Pill, Avatar, Drawer, DField, DSelect, DMulti, Section, FL, FV, Grid2, Tags, HRPopup, CircleJourney } from "@/lib/appShared"

function ContactProfile({contactId,contactData,onBack,onStartFitCall}) {
  var [data,setData]           = useState(null);
  var [loading,setLoading]     = useState(true);
  var [saving,setSaving]       = useState(false);
  var [saveMsg,setSaveMsg]     = useState("");
  var [comms,setComms]         = useState([]);
  var [commsLoading,setCommsLoading] = useState(true);
  var [tab,setTab]             = useState("summary");
  var [linkedinMsgs,setLinkedinMsgs] = useState([]);
  var [linkedinLoading,setLinkedinLoading] = useState(false);
  var [emailMsgs,setEmailMsgs]   = useState([]);
  var [emailLoading,setEmailLoading] = useState(false);
  var [liReply,setLiReply] = useState("");
  var [liSending,setLiSending] = useState(false);
  var [liSent,setLiSent] = useState(false);
  var [showHR,setShowHR]       = useState(false);
  var [drawer,setDrawer]       = useState(null);
  var [tlFilter,setTlFilter]   = useState("All");
  var [addingNote,setAddingNote] = useState(false);
  var [draftOpen,setDraftOpen] = useState(false);
  var [noteText,setNoteText]   = useState("");
  var [editEmail,setEditEmail] = useState(false);
  var [editPhone,setEditPhone] = useState(false);
  var [smartCmd,setSmartCmd]   = useState("");
  var [smartRunning,setSmartRunning] = useState(false);
  var [smartResult,setSmartResult] = useState("");
  var [smartListening,setSmartListening] = useState(false);
  var [showSnooze,setShowSnooze] = useState(false);
  var [snoozeMsg,setSnoozeMsg] = useState("");
  var [snoozeDate,setSnoozeDate] = useState("");
  var [snoozeMode,setSnoozeMode] = useState("resurface");
  var [snoozeSaving,setSnoozeSaving] = useState(false);
  var [snoozeSaved,setSnoozeSaved] = useState(false);
  var [futureItems,setFutureItems] = useState([]);

  useEffect(function(){
    if(!contactId) {
      // No ID — try email lookup first, then fall back to contactData prop
      var email = contactData?.email || contactData?.contact_email;
      if (email) {
        (async function() {
        try {
          var rows = await sbFetch("/contacts?email=eq."+encodeURIComponent(email)+"&limit=1");
          if (rows && rows.length > 0) {
            setData(dbToLocal(rows[0]));
            setLoading(false);
            // Now load comms with the found ID
            var foundId = rows[0].id;
            try {
              var commRows = await sbFetch("/communications?contact_id=eq."+foundId+"&order=occurred_at.desc&limit=100");
              setComms(commRows||[]);
            } catch(e) {}
            setCommsLoading(false);
            return;
          }
        } catch(e) { console.error("email lookup error:", e); }
        })();
        return;
      }
      if(contactData) {
        setData({
          id: null,
          firstName: contactData.first_name || contactData.firstName || "",
          lastName: contactData.last_name || contactData.lastName || "",
          title: contactData.title || "",
          company: contactData.company_name || contactData.company || "",
          email: contactData.email || "",
          linkedinUrl: contactData.linkedin_url || contactData.linkedinUrl || "",
          pipelineStage: contactData.pipeline_stage || "Target",
          memberStatus: "Prospect",
          contactType: contactData.contact_type || "SPONSOR_CONTACT",
        });
      }
      setLoading(false);
      setCommsLoading(false);
      return;
    }
    loadContact();
    loadComms();
  }, [contactId]);

  async function loadContact() {
    setLoading(true);
    try {
      var rows = await sbFetch("/contacts?id=eq."+contactId+"&limit=1");
      if(rows && rows.length>0) setData(dbToLocal(rows[0]));
    } catch(e) { console.error("loadContact error:",e); }
    setLoading(false);
  }

  async function loadLinkedinMsgs() {
    if (!contactId) return;
    setLinkedinLoading(true);
    try {
      // Get conversation record for this contact
      var convRows = await sbFetch("/conversations?contact_id=eq."+contactId+"&limit=1");
      if (convRows && convRows.length > 0) {
        var conv = convRows[0];
        var msgs = await sbFetch("/conversation_messages?conversation_id=eq."+conv.id+"&order=sent_at.asc&limit=200");
        setLinkedinMsgs(Array.isArray(msgs) ? msgs : []);
      } else {
        setLinkedinMsgs([]);
      }
    } catch(e) { setLinkedinMsgs([]); }
    setLinkedinLoading(false);
  }

  async function loadEmailMsgs() {
    if (!contactId) return;
    setEmailLoading(true);
    try {
      var rows = await sbFetch("/email_messages?contact_id=eq."+contactId+"&order=sent_at.desc&limit=100");
      setEmailMsgs(Array.isArray(rows) ? rows : []);
    } catch(e) { setEmailMsgs([]); }
    setEmailLoading(false);
  }

  async function loadComms() {
    setCommsLoading(true);
    try {
      // queryDB only handles contacts table in artifact mode.
      // Communications are stored in Supabase but fetched via direct REST when deployed.
      // In artifact mode, comms are populated via local state (stage changes, notes).
      var rows=await sbFetch("/communications?contact_id=eq."+contactId+"&order=occurred_at.desc&limit=100");
      setComms(Array.isArray(rows)?rows:[]);
    } catch(e) { setComms([]); }
    setCommsLoading(false);
  }

  async function saveContact() {
    if(!data||!data.id) return;
    setSaving(true);setSaveMsg("");
    try {
      var d=localToDb(data);
      var sets=Object.keys(d).map(function(k){
        var v=d[k];
        if(v===null||v===undefined)return k+"=NULL";
        if(typeof v==="boolean")return k+"="+v;
        if(Array.isArray(v))return k+"=ARRAY["+v.map(function(x){return "'"+String(x).replace(/'/g,"''")+"'";}).join(",")+"]::text[]";
        return k+"='"+String(v).replace(/'/g,"''")+"'";
      }).join(",");
      await sbFetch("/contacts?id=eq."+data.id,{method:"PATCH",body:JSON.stringify(localToDb(data))});
      setSaveMsg("Saved");
      setTimeout(function(){setSaveMsg("");},2000);
    } catch(e) { console.error("save error:",e); setSaveMsg("Error saving"); }
    setSaving(false);setDrawer(null);
  }

  async function saveNote() {
    if(!noteText.trim()||!data||!data.id) return;
    try {
      var body=noteText.trim().replace(/'/g,"''");
      await sbFetch("/communications",{method:"POST",body:JSON.stringify({contact_id:data.id,occurred_at:new Date().toISOString(),channel:"App",direction:"INTERNAL",step_label:"Note",body:noteText.trim(),source:"Manual",logged_by:"Dalen Lawrence"})});
      setNoteText("");setAddingNote(false);loadComms();
    } catch(e) { console.error("saveNote error:",e); }
  }

  // Load future commitments for this contact
  useEffect(function(){
    if (!data || !data.id) return;
    var U = process.env.NEXT_PUBLIC_SUPABASE_URL;
    var K = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    var h = {"apikey":K,"Authorization":"Bearer "+K};
    Promise.all([
      fetch(U+"/rest/v1/scheduled_actions?contact_id=eq."+data.id+"&status=eq.pending&order=send_at.asc", {headers:h}).then(function(r){return r.json();}),
      fetch(U+"/rest/v1/follow_up_tasks?contact_id=eq."+data.id+"&status=eq.open&order=due_at.asc.nullslast", {headers:h}).then(function(r){return r.json();})
    ]).then(function(results){
      var scheduled = (Array.isArray(results[0])?results[0]:[]).map(function(s){return {type:"scheduled",id:s.id,note:s.message_body,due_at:s.send_at,channel:s.channel,mode:s.mode};});
      var tasks = (Array.isArray(results[1])?results[1]:[]).map(function(t){return {type:"task",id:t.id,note:t.note,due_at:t.due_at,source:t.source};});
      setFutureItems(scheduled.concat(tasks).sort(function(a,b){
        if (!a.due_at && !b.due_at) return 0;
        if (!a.due_at) return 1;
        if (!b.due_at) return -1;
        return new Date(a.due_at)-new Date(b.due_at);
      }));
    }).catch(function(){});
  }, [data?.id]);

  function startSmartVoice() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Voice input requires Chrome"); return; }
    var r = new SR(); r.lang="en-US"; r.interimResults=false;
    r.onresult=function(e){ setSmartCmd(e.results[0][0].transcript); setSmartListening(false); };
    r.onerror=function(){ setSmartListening(false); };
    r.onend=function(){ setSmartListening(false); };
    r.start(); setSmartListening(true);
  }

  async function runSmartAction() {
    if (!smartCmd.trim() || smartRunning || !data) return;
    setSmartRunning(true); setSmartResult("");
    try {
      var res = await fetch("/api/smart-action", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          command: smartCmd,
          contact: {id:data.id, firstName:data.firstName, lastName:data.lastName, company:data.company, type:data.contactType||"CFO_PROSPECT"},
          conversationId: null
        })
      });
      var d = await res.json();
      setSmartResult(d.confirmation || "Done");
      setSmartCmd("");
      // Reload future items
      if (data.id) {
        var U2=process.env.NEXT_PUBLIC_SUPABASE_URL; var K2=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        var h2={"apikey":K2,"Authorization":"Bearer "+K2};
        var [sa,ft] = await Promise.all([
          fetch(U2+"/rest/v1/scheduled_actions?contact_id=eq."+data.id+"&status=eq.pending&order=send_at.asc",{headers:h2}).then(function(r){return r.json();}),
          fetch(U2+"/rest/v1/follow_up_tasks?contact_id=eq."+data.id+"&status=eq.open&order=due_at.asc.nullslast",{headers:h2}).then(function(r){return r.json();})
        ]);
        var scheduled=(Array.isArray(sa)?sa:[]).map(function(s){return {type:"scheduled",id:s.id,note:s.message_body,due_at:s.send_at,channel:s.channel,mode:s.mode};});
        var tasks=(Array.isArray(ft)?ft:[]).map(function(t){return {type:"task",id:t.id,note:t.note,due_at:t.due_at,source:t.source};});
        setFutureItems(scheduled.concat(tasks).sort(function(a,b){ if(!a.due_at&&!b.due_at)return 0; if(!a.due_at)return 1; if(!b.due_at)return -1; return new Date(a.due_at)-new Date(b.due_at); }));
      }
    } catch(e){ setSmartResult("Error — try again"); }
    setSmartRunning(false);
  }

  async function saveSnooze() {
    if (!snoozeDate || !snoozeMsg.trim() || !data) return;
    setSnoozeSaving(true);
    try {
      var U3=process.env.NEXT_PUBLIC_SUPABASE_URL; var K3=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      var h3={"apikey":K3,"Authorization":"Bearer "+K3,"Content-Type":"application/json","Prefer":"return=minimal"};
      await fetch(U3+"/rest/v1/scheduled_actions", {
        method:"POST", headers:h3,
        body: JSON.stringify({
          contact_id:data.id, channel:"linkedin",
          send_at: new Date(snoozeDate+"T17:00:00Z").toISOString(),
          message_body:snoozeMsg, mode:snoozeMode,
          contact_first_name:data.firstName, contact_last_name:data.lastName,
          contact_company:data.company||"", status:"pending"
        })
      });
      setSnoozeSaved(true); setShowSnooze(false); setSnoozeMsg(""); setSnoozeDate("");
      setTimeout(function(){setSnoozeSaved(false);},3000);
    } catch(e){}
    setSnoozeSaving(false);
  }

  async function sendLiReply() {
    if (!liReply.trim() || liSending || !data) return;
    setLiSending(true);
    try {
      // Get conversation record for this contact
      var convRows = await sbFetch("/conversations?contact_id=eq."+data.id+"&limit=1");
      var conv = convRows && convRows[0];
      var res = await fetch("/api/follow-up-queue", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          conversationId: conv ? conv.conversation_id : "sb-"+data.id,
          linkedInAccountId: 185228,
          message: liReply,
          profileUrl: data.linkedinUrl||"",
          contactId: data.id,
          firstName: data.firstName, lastName: data.lastName,
          fullName: data.firstName+" "+data.lastName,
          title: data.title||"", company: data.company||""
        })
      });
      var d = await res.json();
      if (d.success) {
        setLiSent(true);
        setLinkedinMsgs(function(prev){ return prev.concat([{id:Date.now(),direction:"OUT",body:liReply,sent_at:new Date().toISOString(),channel:"linkedin"}]); });
        setLiReply("");
        setTimeout(function(){ setLiSent(false); }, 3000);
      }
    } catch(e){ console.error(e); }
    setLiSending(false);
  }

  useEffect(function(){
    if (tab === "linkedin" && linkedinMsgs.length === 0) loadLinkedinMsgs();
    if (tab === "email"    && emailMsgs.length    === 0) loadEmailMsgs();
  }, [tab]);

  function set(field){return function(val){setData(function(d){return Object.assign({},d,{[field]:val});});};}
  function tog(field){return function(){setData(function(d){return Object.assign({},d,{[field]:!d[field]});});};}

  if(loading) return (
    <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}>
      <div style={{fontSize:28,color:G+"40"}}>◎</div>
      <div style={{fontSize:13,color:T.muted}}>Loading contact…</div>
    </div>
  );
  if(!data) return (
    <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{fontSize:13,color:T.red}}>Contact not found.</div>
    </div>
  );

  var isSponsor = data.contactType === "SPONSOR_CONTACT" || data.contactType === "REFERRAL_PARTNER";
  var isReferralPartner = data.contactType === "REFERRAL_PARTNER";
  var sc = stageColor(data.pipelineStage);
  var channels = ["All","LinkedIn","Email","Phone","Calendly","App","Note"];
  // Tab definitions including new communication tabs
  var profileTabs = ["summary","linkedin","email","timeline","notes"];
  var filtered = comms
    .filter(function(c){ return c.body && c.channel && c.direction; })
    .filter(function(c){ return tlFilter==="All" || c.channel===tlFilter; });

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,serif",color:T.text}}>
      {draftOpen && data && <DraftEmail contact={{id:data.id||null,email:data.email||null,firstName:data.firstName||null,lastName:data.lastName||null}} onClose={function(){setDraftOpen(false)}} onSaved={function(){setDraftOpen(false);loadComms();}}/>}

      {/* PROFILE HEADER */}
      <div style={{background:"linear-gradient(135deg,#0f1e30 0%,#132840 60%,#0f1a28 100%)",borderBottom:"1px solid "+G+"18",padding:"16px 24px",flexShrink:0,position:"relative"}}>
        {saveMsg?<div style={{position:"absolute",top:12,right:20,fontSize:11,color:saveMsg==="Saved"?T.green:T.red,letterSpacing:1}}>{saveMsg}</div>:null}
        <div style={{display:"flex",gap:16,alignItems:"flex-start"}}>
          <Avatar first={data.firstName} last={data.lastName} size={52} imageUrl={data.linkedinImageUrl}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:3}}>
              <h2 style={{fontSize:20,fontWeight:600,color:"#fff",margin:0}}>{data.firstName} {data.lastName}</h2>
              <Pill label={data.pipelineStage} color={sc}/>
              {data.contactType==="REFERRAL_PARTNER" ? <Pill label="Referral Partner" color={T.green}/> : isSponsor ? <Pill label="Sponsor Contact" color={T.purple}/> : <Pill label={data.memberStatus} color={data.memberStatus==="Active"?T.green:data.memberStatus==="Not a Fit"?T.red:data.memberStatus==="Inactive / Churned"?T.orange:T.blue}/>}
              {data.fitCallOutcome?<Pill label={data.fitCallOutcome} color={data.fitCallOutcome==="Strong Fit"?T.green:data.fitCallOutcome==="Not a Fit"?T.red:G}/>:null}
            </div>
            <div style={{fontSize:12,color:"#9ac4dc",marginBottom:4}}>{data.title} · {data.company}</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",fontSize:11,color:T.muted}}>
              {data.linkedinLocation?<span>{"📍 "+data.linkedinLocation}</span>:null}
              {data.leadSource?<span style={{color:T.dim}}>· {"⚡ "+data.leadSource}</span>:null}
              {data.connectedDate?<span style={{color:T.dim}}>· {"🔗 "+data.connectedDate}</span>:null}
            </div>
          </div>
        </div>
      </div>

      {/* BODY */}
      <div style={{display:"grid",gridTemplateColumns:"210px 1fr",flex:1,overflow:"hidden"}}>

        {/* LEFT RAIL */}
        <div style={{background:"#060d17",borderRight:"1px solid "+T.border,padding:"14px 12px",display:"flex",flexDirection:"column",overflowY:"auto"}}>

          {/* Pipeline info */}
          {[["Campaign",data.campaign],["Connected",data.connectedDate],["Last Activity",data.lastActivity]].map(function(kv){
            return <div key={kv[0]} style={{marginBottom:10}}>
              <div style={{fontSize:9,letterSpacing:2,color:T.dim,textTransform:"uppercase",marginBottom:2}}>{kv[0]}</div>
              <div style={{fontSize:12,color:kv[1]?T.muted:T.dim,lineHeight:1.4}}>{kv[1]||"—"}</div>
            </div>;
          })}

          {/* Quick Actions */}
          <div style={{borderTop:"1px solid "+T.border,paddingTop:12,marginBottom:12}}>
            <div style={{fontSize:9,letterSpacing:2,color:T.dim,textTransform:"uppercase",marginBottom:8}}>Quick Actions</div>
            {(data.contactType==="REFERRAL_PARTNER" ? [["Draft Email",T.green],["Log Call",T.blue],["Add Note",T.gold]] : isSponsor ? [["Discovery Call",T.purple],["Send One Pager",T.blue],["Add Note",T.green]] : [["Start Fit Call",T.gold],["Schedule Fit Call",G],["Send Assessment",T.blue],["Event Invite",T.purple],["Add Note",T.green],["Reserve Pool",T.orange]]).map(function(item){
              return <button key={item[0]} onClick={function(){if(item[0].indexOf("Note")>-1){setAddingNote(true);setTab("timeline");}
                    else if(item[0].indexOf("Start Fit Call")>-1 && onStartFitCall){onStartFitCall({id:data.id,firstName:data.firstName,lastName:data.lastName,title:data.title,company:data.company,email:data.email,linkedinUrl:data.linkedinUrl,fit_call_date:data.fitCallDate});}}} style={{display:"block",width:"100%",marginBottom:5,padding:"7px 10px",background:"rgba(255,255,255,0.02)",border:"1px solid "+T.border,color:item[1],borderRadius:5,cursor:"pointer",fontSize:11,textAlign:"left"}}>{item[0]}</button>;
            })}
          </div>

          {/* Compliance */}
          <div style={{borderTop:"1px solid "+T.border,paddingTop:12,marginTop:"auto"}}>
            <div style={{fontSize:9,letterSpacing:2,color:T.dim,textTransform:"uppercase",marginBottom:8}}>Compliance</div>
            {[["Do Not Contact",data.doNotContact,tog("doNotContact")],["Opt Out — CFO Circle",data.optOutCFO,tog("optOutCFO")],["Unsubscribed Email",data.unsubscribedEmail,tog("unsubscribedEmail")]].map(function(row){
              return <div key={row[0]} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <span style={{fontSize:11,color:row[1]?T.red:T.muted}}>{row[0]}</span>
                <button onClick={row[2]} style={{background:row[1]?"rgba(231,76,60,0.15)":"rgba(255,255,255,0.03)",border:"1px solid "+(row[1]?"#e74c3c50":"rgba(255,255,255,0.08)"),color:row[1]?T.red:T.dim,padding:"2px 8px",borderRadius:10,cursor:"pointer",fontSize:10,fontWeight:600}}>{row[1]?"ON":"off"}</button>
              </div>;
            })}
          </div>
        </div>

        {/* RIGHT TABS */}
        <div style={{display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{display:"flex",borderBottom:"1px solid "+T.border,background:BG2,flexShrink:0}}>
            {[["summary","Summary"],["timeline","Timeline"],["actions","⚡ Actions"]].map(function(t){
              return <button key={t[0]} onClick={function(){setTab(t[0]);}} style={{padding:"11px 22px",background:"transparent",border:"none",borderBottom:"2px solid "+(tab===t[0]?G:"transparent"),color:tab===t[0]?G:T.muted,cursor:"pointer",fontSize:13,fontWeight:tab===t[0]?600:400}}>
                {t[1]}{t[0]==="timeline"?<span style={{marginLeft:6,fontSize:10,color:T.dim}}>{comms.length||""}</span>:null}
              </button>;
            })}
          </div>

          {/* SUMMARY */}
          {tab==="summary"
            ?<div style={{overflowY:"auto",flex:1}}>

              {isReferralPartner && <Section title="Referral Notes" icon="◈" defaultOpen={true}>
                <Grid2>
                  <FL label="How We Met"><FV>{data.howWeMet||"—"}</FV></FL>
                  <FL label="Source"><FV>{data.leadSource||"—"}</FV></FL>
                </Grid2>
                <FL label="Notes"><FV>{data.personalNotes||"—"}</FV></FL>
              </Section>}
              {!isSponsor && <Section title="Circle Journey" icon="→" defaultOpen={true}>
                <CircleJourney data={data} onNodeClick={function(stage, idx){
                  var prevStage = data.pipelineStage;
                  if(prevStage === stage) return;
                  var now = new Date();
                  var iso = now.toISOString();
                  var body = "Stage moved: " + prevStage + " → " + stage;

                  // Update local state immediately
                  setData(function(d){ return Object.assign({},d,{pipelineStage:stage}); });

                  // Add to local comms timeline immediately
                  var newEntry = {
                    id: "local-"+iso, contact_id: data.id,
                    occurred_at: iso, channel:"App", direction:"INTERNAL",
                    step_label:"Stage Change", body:body, source:"App", logged_by:"Dalen Lawrence"
                  };
                  setComms(function(prev){ return [newEntry].concat(prev); });

                  setSaveMsg("Stage updated");
                  setTimeout(function(){setSaveMsg("");}, 2500);

                  // Persist both stage update and stage-change log to Supabase
                  if(data && data.id){
                    var bodyEsc = body.replace(/'/g,"''");
                    var stageEsc = stage.replace(/'/g,"''");
                    var sql1 = "UPDATE contacts SET pipeline_stage='"+stageEsc+"' WHERE id='"+data.id+"'";
                    var sql2 = "INSERT INTO communications (contact_id,occurred_at,channel,direction,step_label,body,source,logged_by) VALUES ('"+data.id+"','"+iso+"','App','INTERNAL','Stage Change','"+bodyEsc+"','App','Dalen Lawrence')";
                    sbFetch("/contacts?id=eq."+data.id,{method:"PATCH",body:JSON.stringify({pipeline_stage:stage})}).catch(function(e){console.error("stage:",e);});
                    sbFetch("/communications",{method:"POST",body:JSON.stringify({contact_id:data.id,occurred_at:iso,channel:"App",direction:"INTERNAL",step_label:"Stage Change",body:body,source:"App",logged_by:"Dalen Lawrence"})}).catch(function(e){console.error("log:",e);});
                  }
                }}/>
              </Section>}

              <Section title="Identity" icon="◎" defaultOpen={true} onEdit={function(){setDrawer("identity");}}>
                <Grid2>
                  <div><FL label="First Name"/><FV val={data.firstName}/></div>
                  <div><FL label="Last Name"/><FV val={data.lastName}/></div>
                  <div><FL label="Title"/><FV val={data.title}/></div>
                  <div><FL label="Company"/><FV val={data.company}/></div>
                  <div><FL label="LinkedIn URL"/>{data.linkedinUrl?<a href={data.linkedinUrl} target="_blank" rel="noreferrer" style={{fontSize:13,color:T.blue,textDecoration:"none"}}>View Profile →</a>:<FV val=""/>}</div>
                  <div><FL label="Location"/><FV val={data.linkedinLocation}/></div>
                  <div><FL label="Chapter Interest"/><FV val={data.chapterInterest}/></div>
                  <div><FL label="Email"/><FV val={data.email ? data.email + (data.emailType ? " · " + data.emailType : "") : "—"}/></div>
                  <div><FL label="Phone"/><FV val={data.phone}/></div>
                  <div><FL label="Referred By"/><FV val={data.referredBy}/></div>
                </Grid2>
              </Section>

              <Section title="Outreach & Source" icon="⚡">
                <Grid2>
                  <div><FL label="Lead Source"/><FV val={data.leadSource}/></div>
                  <div><FL label="Campaign"/><FV val={data.campaign}/></div>
                  <div><FL label="Connected Date"/><FV val={data.connectedDate}/></div>
                  <div><FL label="Last Activity"/><FV val={data.lastActivity}/></div>
                  <div><FL label="Pipeline Stage"/><div style={{marginTop:3}}><Pill label={data.pipelineStage||"—"} color={sc}/></div></div>
                  <div><FL label="Member Status"/><div style={{marginTop:3}}><Pill label={data.memberStatus||"—"} color={T.blue}/></div></div>
                </Grid2>
              </Section>

              {!isReferralPartner && <Section title="Firmographic" icon="🏢" onEdit={function(){setDrawer("firmographic");}}>
                <Grid2>
                  <div><FL label="Industry"/><FV val={data.industry}/></div>
                  <div><FL label="Annual Revenue"/><FV val={data.revenue}/></div>
                  <div><FL label="Employee Count"/><FV val={data.employees}/></div>
                  <div><FL label="Finance Team Size"/><FV val={data.financeTeam}/></div>
                  <div><FL label="Ownership Type"/><FV val={data.ownership}/></div>
                  <div><FL label="Reports To"/><FV val={data.reportsTo}/></div>
                  <div><FL label="Website"/><FV val={data.companyWebsite}/></div>
                  <div><FL label="City / State"/><FV val={data.companyCity}/></div>
                </Grid2>
              </Section>}

              {!isSponsor && <Section title="Fit Call" icon="☎" defaultOpen={!!data.fitCallOutcome} onEdit={function(){setDrawer("fitcall");}} badge={data.fitCallOutcome||""}>
                <Grid2>
                  <div><FL label="Fit Call Date"/><FV val={data.fitCallDate}/></div>
                  <div><FL label="Outcome"/>{data.fitCallOutcome?<div style={{marginTop:3}}><Pill label={data.fitCallOutcome} color={data.fitCallOutcome==="Strong Fit"?T.green:data.fitCallOutcome==="Not a Fit"?T.red:G}/></div>:<FV val=""/>}</div>
                  <div><FL label="Commitment Confirmed"/><FV val={data.commitmentConfirmed}/></div>
                </Grid2>
                {data.primaryChallenge?<div><FL label="Primary Challenge"/><div style={{fontSize:13,color:"#ddeaf8",lineHeight:1.8,padding:"9px 12px",background:"rgba(255,255,255,0.03)",borderRadius:6,borderLeft:"2px solid rgba(255,255,255,0.12)",fontStyle:"italic"}}>{data.primaryChallenge}</div></div>:null}
                <div><FL label="Pressure Categories"/><Tags items={data.pressureCategories} color={T.blue}/></div>
                <div><FL label="High Fit Cues"/><Tags items={data.highFitCues} color={T.green}/></div>
                {(data.redFlags||[]).length>0?<div><FL label="Red Flags"/><Tags items={data.redFlags} color={T.red}/></div>:null}
                {data.fitCallNotes?<div><FL label="Notes"/><div style={{fontSize:13,color:"#c0dcf0",lineHeight:1.75,padding:"8px 12px",background:"rgba(255,255,255,0.02)",borderRadius:5,borderLeft:"2px solid rgba(255,255,255,0.1)"}}>{data.fitCallNotes}</div></div>:null}
              </Section>

              }
              {!isSponsor && <Section title="Assessment" icon="◈" badge={data.assessmentCompleted==="Yes"?"Completed":data.assessmentOffered==="Yes"?"Offered":""}>
                <Grid2>
                  <div><FL label="Assessment Offered"/><FV val={data.assessmentOffered}/></div>
                  <div><FL label="Assessment Completed"/><FV val={data.assessmentCompleted}/></div>
                  <div><FL label="Completed Date"/><FV val={data.assessmentDate}/></div>
                </Grid2>
              </Section>}

              <Section title="Event & Conversion" icon="✦" onEdit={function(){setDrawer("event");}}>
                <Grid2>
                  <div><FL label="Event Name"/><FV val={data.eventName}/></div>
                  <div><FL label="Event Invited Date"/><FV val={data.eventInvitedDate}/></div>
                  <div><FL label="Event Confirmed"/><FV val={data.eventConfirmed}/></div>
                  <div><FL label="Event Attended"/><FV val={data.eventAttended}/></div>
                  <div><FL label="Membership Convo Date"/><FV val={data.membershipConvoDate}/></div>
                  <div><FL label="Membership Outcome"/><FV val={data.membershipOutcome}/></div>
                  <div><FL label="Verbal Commitment Date"/><FV val={data.verbalCommitmentDate}/></div>
                  <div><FL label="Membership Type"/><FV val={data.membershipType}/></div>
                  <div><FL label="Membership Start Date"/><FV val={data.membershipStartDate}/></div>
                </Grid2>
              </Section>

            </div>
          :null}

          {/* LINKEDIN MESSAGES TAB */}
          {tab==="linkedin"
            ?<div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
              <div style={{flex:1,overflow:"auto",padding:"16px 20px"}}>
                {linkedinLoading&&<div style={{color:T.muted,fontSize:13,textAlign:"center",padding:"30px 0"}}>Loading...</div>}
                {!linkedinLoading&&linkedinMsgs.length===0&&<div style={{color:T.dim,fontSize:13,textAlign:"center",padding:"30px 0"}}>No LinkedIn messages stored yet. Hit Sync.</div>}
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {linkedinMsgs.map(function(msg,i){
                  var isOut=msg.direction==="OUT";
                  return(
                    <div key={msg.id||i} style={{display:"flex",flexDirection:"column",alignItems:isOut?"flex-end":"flex-start",width:"100%"}}>
                      <div style={{display:"flex",gap:5,marginBottom:3,flexDirection:isOut?"row-reverse":"row",alignItems:"center"}}>
                        {msg.channel==="inmail"&&<span style={{fontSize:9,padding:"1px 6px",borderRadius:3,background:"rgba(155,89,182,0.12)",border:"1px solid rgba(155,89,182,0.2)",color:"#9b59b6"}}>InMail</span>}
                        <span style={{fontSize:10,color:T.dim}}>{new Date(msg.sent_at).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit",hour12:true})}</span>
                      </div>
                      <div style={{maxWidth:"75%",padding:"10px 14px",borderRadius:isOut?"14px 4px 14px 14px":"4px 14px 14px 14px",background:isOut?"rgba(240,200,74,0.09)":"rgba(255,255,255,0.05)",border:"1px solid "+(isOut?"rgba(240,200,74,0.25)":"rgba(255,255,255,0.09)"),fontSize:13,color:isOut?"#f5e49a":T.text,lineHeight:1.75,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>
                        {msg.body}
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
              <div style={{borderTop:"1px solid rgba(255,255,255,0.06)",padding:"12px 16px",flexShrink:0,background:"#0a1522"}}>
                <textarea value={liReply} onChange={function(e){setLiReply(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter"&&(e.metaKey||e.ctrlKey))sendLiReply();}} placeholder={"Reply to "+((data&&data.firstName)||"")+"..."} rows={3} style={{width:"100%",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",color:T.text,padding:"9px 12px",borderRadius:6,fontSize:13,lineHeight:1.65,resize:"none",outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
                <div style={{display:"flex",justifyContent:"flex-end",marginTop:8}}>
                  <button onClick={sendLiReply} disabled={!liReply.trim()||liSending} style={{padding:"7px 18px",background:liSent?"rgba(46,204,113,0.15)":"rgba(46,204,113,0.12)",border:"1px solid "+(liSent?"rgba(46,204,113,0.4)":"rgba(46,204,113,0.3)"),color:T.green,borderRadius:5,cursor:"pointer",fontSize:12,fontWeight:600}}>
                    {liSending?"Sending...":liSent?"Sent":"Send via LinkedIn"}
                  </button>
                </div>
              </div>
            </div>
          :null}

          {/* EMAIL TAB */}
          {tab==="email"
            ?<div style={{flex:1,overflow:"auto",padding:"16px 20px"}}>
              {emailLoading&&<div style={{color:T.muted,fontSize:13,textAlign:"center",padding:"30px 0"}}>Loading…</div>}
              {!emailLoading&&emailMsgs.length===0&&(
                <div style={{textAlign:"center",padding:"30px 0",color:T.dim}}>
                  <div style={{fontSize:13,marginBottom:6}}>No emails synced yet</div>
                  <div style={{fontSize:11}}>{data&&data.email?"Syncs hourly from CFO Circle inbox":"Add email address to enable"}</div>
                </div>
              )}
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {emailMsgs.map(function(msg,i){
                var isOut=msg.direction==="OUT";
                return(
                  <div key={msg.id||i} style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:7,overflow:"hidden"}}>
                    <div style={{padding:"10px 14px",borderBottom:"1px solid rgba(255,255,255,0.05)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:12,fontWeight:600,color:isOut?G:T.text}}>{isOut?"You":data.firstName+" "+data.lastName}</span>
                      <span style={{fontSize:11,color:T.dim,marginLeft:8}}>{new Date(msg.sent_at).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit",hour12:true})}</span>
                      <span style={{fontSize:11,color:T.muted,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginLeft:"auto"}}>{msg.subject}</span>
                    </div>
                    <div style={{padding:"12px 14px",fontSize:13,color:T.muted,lineHeight:1.75,whiteSpace:"pre-wrap",wordBreak:"break-word",maxHeight:200,overflow:"auto"}}>
                      {msg.body||msg.body_preview||"(no content)"}
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          :null}

          {/* FUTURE COMMITMENTS in Timeline */}
          {tab==="timeline" && futureItems.length>0&&(
            <div style={{padding:"12px 20px 0",flexShrink:0}}>
              <div style={{fontSize:10,letterSpacing:2,color:T.purple,textTransform:"uppercase",marginBottom:8}}>Scheduled & Upcoming</div>
              {futureItems.map(function(fi,i){
                var isScheduled=fi.type==="scheduled";
                var color=isScheduled?T.purple:T.blue;
                var dateStr=fi.due_at?new Date(fi.due_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"No date";
                return(
                  <div key={fi.id||i} style={{display:"flex",gap:10,alignItems:"flex-start",padding:"8px 12px",background:color+"08",border:"1px solid "+color+"15",borderRadius:6,marginBottom:6}}>
                    <span style={{fontSize:12,color:color,marginTop:1}}>{isScheduled?"→":"●"}</span>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:11,fontWeight:600,color:color}}>{isScheduled?"Scheduled Send":"Follow-Up Task"}</span>
                        <span style={{fontSize:10,color:T.dim}}>{dateStr}</span>
                      </div>
                      <div style={{fontSize:12,color:T.muted,marginTop:2}}>{(fi.note||"").slice(0,120)}</div>
                      {isScheduled&&<span style={{fontSize:9,color:color,marginTop:3,display:"inline-block"}}>{fi.mode==="auto_send"?"AUTO-SEND":"REVIEW FIRST"}</span>}
                    </div>
                  </div>
                );
              })}
              <div style={{borderBottom:"1px solid rgba(255,255,255,0.06)",marginBottom:12,marginTop:4}}/>
            </div>
          )}

          {/* TIMELINE */}
          {tab==="timeline"
            ?<div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
              <div style={{display:"flex",alignItems:"center",gap:7,padding:"10px 18px",borderBottom:"1px solid "+T.border,background:BG2,flexWrap:"wrap",flexShrink:0}}>
                {channels.map(function(ch){
                  return <button key={ch} onClick={function(){setTlFilter(ch);}} style={{padding:"3px 10px",borderRadius:12,cursor:"pointer",fontSize:11,fontWeight:tlFilter===ch?600:400,background:tlFilter===ch?T.goldDim:"transparent",border:"1px solid "+(tlFilter===ch?G+"50":T.border),color:tlFilter===ch?G:T.muted}}>{ch}</button>;
                })}
                <button onClick={function(){setAddingNote(true);}} style={{marginLeft:"auto",padding:"4px 12px",background:"rgba(46,204,113,0.08)",border:"1px solid rgba(46,204,113,0.25)",color:T.green,borderRadius:5,cursor:"pointer",fontSize:11,fontWeight:600}}>+ Add Note</button>
              </div>

              {addingNote?<div style={{padding:"12px 18px",background:"rgba(46,204,113,0.04)",borderBottom:"1px solid rgba(46,204,113,0.12)",flexShrink:0}}>
                <textarea value={noteText} onChange={function(e){setNoteText(e.target.value);}} placeholder="Add a note, observation, or log entry…" autoFocus style={{width:"100%",background:BG3,border:"1px solid rgba(46,204,113,0.25)",color:T.text,padding:"8px 11px",borderRadius:5,fontSize:13,lineHeight:1.7,resize:"none",outline:"none",fontFamily:"inherit",boxSizing:"border-box",minHeight:65}}/>
                <div style={{display:"flex",gap:8,marginTop:7}}>
                  <button onClick={function(){setNoteText("");setAddingNote(false);}} style={{padding:"5px 13px",background:"transparent",border:"1px solid "+T.border,color:T.muted,borderRadius:4,cursor:"pointer",fontSize:11}}>Cancel</button>
                  <button onClick={saveNote} style={{padding:"5px 13px",background:"rgba(46,204,113,0.1)",border:"1px solid rgba(46,204,113,0.25)",color:T.green,borderRadius:4,cursor:"pointer",fontSize:11,fontWeight:600}}>Save Note</button>
                </div>
              </div>:null}

              <div style={{flex:1,overflowY:"auto",padding:"18px"}}>
                {commsLoading?<div style={{textAlign:"center",color:T.dim,padding:40,fontSize:13}}>Loading timeline…</div>:null}
                {!commsLoading&&filtered.length===0?<div style={{textAlign:"center",color:T.dim,padding:40,fontSize:13}}>No communications logged yet.<br/><span style={{fontSize:11}}>Use Add Note or connect HeyReach to auto-populate.</span></div>:null}
                <div style={{display:"flex",flexDirection:"column",gap:12,maxWidth:700}}>
                  {filtered.map(function(msg){
                    var cc=chColor(msg.channel);
                    var isIn=msg.direction==="IN";
                    var isNote=msg.direction==="INTERNAL";
                    var d=msg.occurred_at?new Date(msg.occurred_at):null;
                    var dateStr=d?d.toLocaleDateString("en-US",{month:"short",day:"numeric"}):"";
                    var timeStr=d?d.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}):"";
                    return (
                      <div key={msg.id} style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                        <div style={{width:30,height:30,borderRadius:"50%",background:msg.step_label==="Stage Change"?G+"15":cc+"18",border:"1px solid "+(msg.step_label==="Stage Change"?G+"35":cc+"35"),display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:msg.step_label==="Stage Change"?G:cc,flexShrink:0,marginTop:2}}>{msg.step_label==="Stage Change"?"→":chIcon(msg.channel)}</div>
                        <div style={{flex:1}}>
                          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:4,flexWrap:"wrap"}}>
                            <span style={{fontSize:11,fontWeight:600,color:msg.step_label==="Stage Change"?G:isNote?T.gold:isIn?T.green:T.blue}}>{msg.step_label==="Stage Change"?"Pipeline":isNote?"Note":isIn?data.firstName:"You"}</span>
                            <span style={{fontSize:10,color:T.dim}}>via {msg.channel}</span>
                            <span style={{fontSize:10,color:T.dim}}>·</span>
                            <span style={{fontSize:10,color:T.muted}}>{dateStr} · {timeStr}</span>
                            {msg.step_label?<span style={{fontSize:9,padding:"1px 7px",borderRadius:10,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",color:T.dim}}>{msg.step_label}</span>:null}
                          </div>
                          {msg.step_label==="Stage Change"
                            ?<div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:"rgba(240,200,74,0.04)",border:"1px solid rgba(240,200,74,0.15)",borderRadius:8}}>
                              <div style={{width:8,height:8,borderRadius:"50%",background:G,flexShrink:0}}/>
                              <div style={{fontSize:12,color:G+"cc",fontWeight:500}}>{msg.body}</div>
                            </div>
                            :<div style={{background:isNote?"rgba(240,200,74,0.05)":isIn?"rgba(46,204,113,0.05)":"rgba(74,154,186,0.05)",border:"1px solid "+(isNote?G+"20":isIn?"rgba(46,204,113,0.12)":"rgba(74,154,186,0.1)"),borderRadius:8,padding:"9px 13px",fontSize:13,color:"#d8eeff",lineHeight:1.75}}>
                              {msg.body}
                            </div>
                          }
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          :null}

          {/* ACTIONS TAB */}
          {tab==="actions" && data && (
            <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",background:"#080f1a"}}>

              {/* Context summary strip */}
              <div style={{padding:"14px 20px",borderBottom:"1px solid rgba(255,255,255,0.06)",background:"rgba(12,21,32,0.8)",flexShrink:0}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><div style={{fontSize:10,color:"#3a5a74",letterSpacing:2,textTransform:"uppercase"}}>Context Loaded</div><div style={{display:"flex",gap:8}}><CopyPromptButton data={data} comms={comms}/><button onClick={function(){setDraftOpen(true)}} style={{padding:"5px 14px",background:"rgba(46,204,113,0.1)",border:"1px solid rgba(46,204,113,0.25)",color:"#2ecc71",borderRadius:5,cursor:"pointer",fontSize:11,fontWeight:700}}>Draft Email</button></div></div>
                <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
                  <span style={{fontSize:12,color:"#7a9bb8"}}><b style={{color:"#e8f2ff"}}>{data.firstName} {data.lastName}</b> · {data.title||"—"} · {data.company||"—"}</span>
                  <span style={{fontSize:12,color:"#7a9bb8"}}>Stage: <b style={{color:"#f0c84a"}}>{data.pipelineStage||"—"}</b></span>
                  <span style={{fontSize:12,color:"#7a9bb8"}}>{comms.length} messages logged</span>
                  {data.email && <span style={{fontSize:12,color:"#7a9bb8"}}>{data.email}</span>}
                </div>
              </div>

              {/* Recent thread preview */}
              {comms.length > 0 && (
                <div style={{padding:"14px 20px 0",flexShrink:0}}>
                  <div style={{fontSize:10,color:"#3a5a74",letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Recent Activity</div>
                  <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:280,overflowY:"auto"}}>
                    {comms.slice(0,6).reverse().map(function(msg){
                      var isOut = msg.direction==="OUT"||msg.direction==="outbound"
                      var isIn  = msg.direction==="IN"||msg.direction==="inbound"
                      if (!msg.body) return null
                      return (
                        <div key={msg.id} style={{display:"flex",flexDirection:"column",alignItems:isOut?"flex-end":"flex-start"}}>
                          <div style={{maxWidth:"85%",padding:"8px 12px",borderRadius:isOut?"10px 3px 10px 10px":"3px 10px 10px 10px",background:isOut?"rgba(240,200,74,0.07)":"rgba(255,255,255,0.04)",border:"1px solid "+(isOut?"rgba(240,200,74,0.15)":"rgba(255,255,255,0.07)"),fontSize:13,color:isOut?"#f5e49a":"#d8eeff",lineHeight:1.65}}>
                            {msg.body.length>200?msg.body.slice(0,200)+"…":msg.body}
                          </div>
                          <div style={{fontSize:9,color:"#3a5a74",marginTop:2,padding:"0 4px"}}>
                            {isOut?"You":""}  {msg.step_label} · {msg.occurred_at?new Date(msg.occurred_at).toLocaleDateString("en-US",{month:"short",day:"numeric"}):""}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* SmartCommand — full context */}
              <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"flex-end",padding:"14px 20px 20px"}}>
                <div style={{fontSize:10,color:"#3a5a74",letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Actions</div>
                <div style={{background:"rgba(12,21,32,0.6)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:10,overflow:"hidden"}}>
                  <SmartCommand
                    contact={{id:data.id||null, firstName:data.firstName, lastName:data.lastName, company:data.company, email:data.email, type:data.contactType||"CFO_PROSPECT"}}
                    conversationId={null}
                    onRefresh={function(){ loadComms(); loadContact(); }}
                    placeholder={"What do you want to do with " + (data.firstName||"this contact") + "? e.g. Draft a follow-up email, Snooze until June 1, Move to Event Waitlist"}
                    systemContext={(function(){
                      var base = "Contact: "+data.firstName+" "+data.lastName+" | Company: "+(data.company||"?")+" | Title: "+(data.title||"?")+" | Stage: "+(data.pipelineStage||"?")+" | Email: "+(data.email||"none")+" | Location: "+(data.location||"?")
                      var thread = comms.slice(0,10).reverse().map(function(m){
                        var dir = (m.direction==="OUT"||m.direction==="outbound") ? "Dalen" : data.firstName
                        var date = m.occurred_at ? new Date(m.occurred_at).toLocaleDateString("en-US",{month:"short",day:"numeric"}) : ""
                        return "["+date+" "+dir+"]: "+(m.body||m.step_label||"").slice(0,300)
                      }).join("\n")
                      return base + (thread ? "\n\nMessage history:\n"+thread : "")
                    })()}
                  />
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* DRAWERS */}
      <Drawer title="Edit Identity" open={drawer==="identity"} onClose={function(){setDrawer(null);}} onSave={saveContact}>
        <DField label="First Name" val={data.firstName} set={set("firstName")}/>
        <DField label="Last Name" val={data.lastName} set={set("lastName")}/>
        <DField label="Title / Role" val={data.title} set={set("title")}/>
        <DField label="Company" val={data.company} set={set("company")}/>
        <DField label="Email" val={data.email} set={set("email")}/>
        <DSelect label="Email Type" val={data.emailType} set={set("emailType")} opts={["Personal","Company","Unknown"]}/>
        <DField label="Phone" val={data.phone} set={set("phone")}/>
        <DField label="LinkedIn URL" val={data.linkedinUrl} set={set("linkedinUrl")}/>
        <DField label="LinkedIn Location" val={data.linkedinLocation} set={set("linkedinLocation")}/>
        <DSelect label="Chapter Interest" val={data.chapterInterest} set={set("chapterInterest")} opts={CHAPTERS}/>
        <DSelect label="Lead Source" val={data.leadSource} set={set("leadSource")} opts={SOURCES}/>
        <DField label="Referred By" val={data.referredBy} set={set("referredBy")}/>
      </Drawer>

      <Drawer title="Edit Firmographic" open={drawer==="firmographic"} onClose={function(){setDrawer(null);}} onSave={saveContact}>
        <DSelect label="Industry" val={data.industry} set={set("industry")} opts={IND}/>
        <DSelect label="Annual Revenue" val={data.revenue} set={set("revenue")} opts={REV}/>
        <DSelect label="Employee Count" val={data.employees} set={set("employees")} opts={EMP}/>
        <DSelect label="Finance Team Size" val={data.financeTeam} set={set("financeTeam")} opts={FIN}/>
        <DSelect label="Ownership Type" val={data.ownership} set={set("ownership")} opts={OWNERSHIP}/>
        <DSelect label="Reports To" val={data.reportsTo} set={set("reportsTo")} opts={RPT}/>
        <DField label="Company Website" val={data.companyWebsite} set={set("companyWebsite")}/>
        <DField label="City / State" val={data.companyCity} set={set("companyCity")}/>
      </Drawer>

      <Drawer title="Edit Fit Call" open={drawer==="fitcall"} onClose={function(){setDrawer(null);}} onSave={saveContact}>
        <DField label="Fit Call Date" val={data.fitCallDate} set={set("fitCallDate")}/>
        <DSelect label="Outcome" val={data.fitCallOutcome} set={set("fitCallOutcome")} opts={OUTCOMES}/>
        <DSelect label="Commitment Confirmed" val={data.commitmentConfirmed} set={set("commitmentConfirmed")} opts={["Yes","No","Uncertain"]}/>
        <DField label="Primary Challenge — Their Exact Words" val={data.primaryChallenge} set={set("primaryChallenge")} multiline={true}/>
        <DMulti label="Pressure Categories" val={data.pressureCategories} set={set("pressureCategories")} opts={PRESSURE}/>
        <DMulti label="High Fit Cues" val={data.highFitCues} set={set("highFitCues")} opts={CUES}/>
        <DMulti label="Red Flags" val={data.redFlags} set={set("redFlags")} opts={FLAGS}/>
        <DField label="Fit Call Notes" val={data.fitCallNotes} set={set("fitCallNotes")} multiline={true}/>
        <DSelect label="Assessment Offered" val={data.assessmentOffered} set={set("assessmentOffered")} opts={["Yes","No"]}/>
        <DSelect label="Assessment Completed" val={data.assessmentCompleted} set={set("assessmentCompleted")} opts={["Yes","No"]}/>
        <DField label="Assessment Date" val={data.assessmentDate} set={set("assessmentDate")}/>
      </Drawer>

      <Drawer title="Edit Event & Conversion" open={drawer==="event"} onClose={function(){setDrawer(null);}} onSave={saveContact}>
        <DField label="Event Name" val={data.eventName} set={set("eventName")}/>
        <DField label="Event Invited Date" val={data.eventInvitedDate} set={set("eventInvitedDate")}/>
        <DSelect label="Event Confirmed" val={data.eventConfirmed} set={set("eventConfirmed")} opts={["Yes","No"]}/>
        <DSelect label="Event Attended" val={data.eventAttended} set={set("eventAttended")} opts={["Yes","No","No Show"]}/>
        <DField label="Membership Convo Date" val={data.membershipConvoDate} set={set("membershipConvoDate")}/>
        <DSelect label="Membership Outcome" val={data.membershipOutcome} set={set("membershipOutcome")} opts={["Joined","Bad Timing","Not Ready","Declined"]}/>
        <DField label="Verbal Commitment Date" val={data.verbalCommitmentDate} set={set("verbalCommitmentDate")}/>
        <DSelect label="Membership Type" val={data.membershipType} set={set("membershipType")} opts={MEMB_T}/>
        <DField label="Membership Start Date" val={data.membershipStartDate} set={set("membershipStartDate")}/>
      </Drawer>

      <Drawer title="Edit Pipeline Stage" open={drawer==="stage"} onClose={function(){setDrawer(null);}} onSave={saveContact}>
        <DSelect label="Pipeline Stage" val={data.pipelineStage} set={set("pipelineStage")} opts={PIPELINE}/>
        <DSelect label="Member Status" val={data.memberStatus} set={set("memberStatus")} opts={STATUSES}/>
      </Drawer>

      {showHR?<HRPopup data={data} onClose={function(){setShowHR(false);}}/>:null}

      {/* ─── SMART ACTION BAR ──────────────────────────────────────────── */}
      <div style={{borderTop:"1px solid rgba(255,255,255,0.07)",background:"#060d17",padding:"10px 20px",flexShrink:0}}>
        {/* Future commitments strip */}
        {futureItems.length>0&&<div style={{display:"flex",gap:8,marginBottom:8,overflowX:"auto",paddingBottom:4}}>
          {futureItems.map(function(fi,i){
            var isScheduled=fi.type==="scheduled";
            var color=isScheduled?T.purple:T.blue;
            var dateStr=fi.due_at?new Date(fi.due_at).toLocaleDateString("en-US",{month:"short",day:"numeric"}):"No date";
            return(
              <div key={fi.id||i} style={{flexShrink:0,padding:"4px 10px",borderRadius:20,background:color+"10",border:"1px solid "+color+"25",display:"flex",alignItems:"center",gap:5}}>
                <span style={{fontSize:9,color:color}}>{isScheduled?"→":"●"}</span>
                <span style={{fontSize:11,color:color,fontWeight:600}}>{dateStr}</span>
                <span style={{fontSize:11,color:T.muted,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(fi.note||"").slice(0,40)}</span>
              </div>
            );
          })}
        </div>}
        {/* Command row */}
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={startSmartVoice} style={{padding:"6px 10px",background:smartListening?"rgba(231,76,60,0.15)":"rgba(74,158,186,0.08)",border:"1px solid "+(smartListening?"rgba(231,76,60,0.3)":"rgba(74,158,186,0.2)"),color:smartListening?T.red:T.blue,borderRadius:5,cursor:"pointer",fontSize:11,flexShrink:0}}>
            {smartListening?"🔴":"🎙"}
          </button>
          <input value={smartCmd} onChange={function(e){setSmartCmd(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter")runSmartAction();}} placeholder={"Smart action for "+(data?data.firstName:"")+"... (send, schedule, follow up, snooze)"} style={{flex:1,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",color:T.text,padding:"7px 12px",borderRadius:5,fontSize:12,outline:"none",fontFamily:"inherit"}}/>
          <button onClick={runSmartAction} disabled={!smartCmd.trim()||smartRunning} style={{padding:"6px 14px",background:"rgba(240,200,74,0.1)",border:"1px solid rgba(240,200,74,0.25)",color:G,borderRadius:5,cursor:"pointer",fontSize:11,fontWeight:600,flexShrink:0}}>
            {smartRunning?"...":"Go"}
          </button>
          <button onClick={function(){setShowSnooze(function(v){return !v;});}} style={{padding:"6px 10px",background:showSnooze?"rgba(155,89,182,0.15)":"rgba(255,255,255,0.03)",border:"1px solid "+(showSnooze?"rgba(155,89,182,0.3)":"rgba(255,255,255,0.08)"),color:showSnooze?T.purple:T.dim,borderRadius:5,cursor:"pointer",fontSize:11,flexShrink:0}}>
            ⏰
          </button>
        </div>
        {smartResult&&<div style={{marginTop:6,fontSize:11,color:T.green,padding:"4px 8px",background:"rgba(46,204,113,0.08)",borderRadius:4}}>✓ {smartResult}</div>}
        {/* Snooze panel */}
        {showSnooze&&<div style={{marginTop:10,padding:"12px",background:"rgba(155,89,182,0.06)",border:"1px solid rgba(155,89,182,0.15)",borderRadius:6}}>
          <div style={{fontSize:11,color:T.purple,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Schedule Message</div>
          <textarea value={snoozeMsg} onChange={function(e){setSnoozeMsg(e.target.value);}} placeholder="Write the message to send on the scheduled date..." rows={2} style={{width:"100%",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",color:T.text,padding:"7px 10px",borderRadius:5,fontSize:12,outline:"none",fontFamily:"inherit",resize:"none",boxSizing:"border-box",marginBottom:8}}/>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <input type="date" value={snoozeDate} onChange={function(e){setSnoozeDate(e.target.value);}} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",color:T.text,padding:"5px 8px",borderRadius:4,fontSize:11,outline:"none"}}/>
            <div style={{display:"flex",gap:4}}>
              {["resurface","auto_send"].map(function(m){return(
                <button key={m} onClick={function(){setSnoozeMode(m);}} style={{padding:"4px 10px",borderRadius:4,cursor:"pointer",fontSize:10,border:"1px solid "+(snoozeMode===m?"rgba(155,89,182,0.4)":"rgba(255,255,255,0.08)"),background:snoozeMode===m?"rgba(155,89,182,0.1)":"transparent",color:snoozeMode===m?T.purple:T.muted}}>{m==="resurface"?"Review First":"Auto-Send"}</button>
              );})}
            </div>
            <button onClick={saveSnooze} disabled={!snoozeDate||!snoozeMsg.trim()||snoozeSaving} style={{marginLeft:"auto",padding:"5px 14px",background:snoozeSaved?"rgba(46,204,113,0.15)":"rgba(155,89,182,0.12)",border:"1px solid "+(snoozeSaved?"rgba(46,204,113,0.4)":"rgba(155,89,182,0.3)"),color:snoozeSaved?T.green:T.purple,borderRadius:4,cursor:"pointer",fontSize:11,fontWeight:600}}>
              {snoozeSaving?"Saving...":snoozeSaved?"✓ Scheduled":"Schedule"}
            </button>
          </div>
        </div>}
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

export default ContactProfile
