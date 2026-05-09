"use client"
import { useState, useEffect } from "react"
import { sbFetch, G, BG, BG2, T, stageColor, Pill, Avatar } from "@/lib/appShared"

function Pipeline({onNavigate}) {
  var [contacts,setContacts]=useState([]);var [loading,setLoading]=useState(true);var [error,setError]=useState(null);var [search,setSearch]=useState("");var [stageFilter,setStageFilter]=useState("All");var [total,setTotal]=useState(0);
  useEffect(function(){loadContacts();},[stageFilter]);
  var ACTIVE_PIPELINE=["Connected","Engaged","Fit Invite Sent","Fit Call Scheduled","Fit Call Completed","Event Waitlist","Event Invited","Event Confirmed","Event Attended","Membership Conversation Scheduled","Membership Conversation Completed","Verbal Commitment","Active Member"];
  async function loadContacts(){
    setLoading(true);setError(null);
    try{
      var qs="?select=id,first_name,last_name,title,company_name,email,email_type,pipeline_stage,member_status,lead_source,annual_revenue,industry,linkedin_location,linkedin_url,linkedin_image_url,created_at&order=created_at.desc&limit=200";
      if(stageFilter!=="All"){qs+="&pipeline_stage=eq."+encodeURIComponent(stageFilter);}else{qs+="&pipeline_stage=in.("+ACTIVE_PIPELINE.map(function(s){return encodeURIComponent(s);}).join(",")+")";}
      var data=await sbFetch("/contacts"+qs);
      setContacts(Array.isArray(data)?data:[]);setTotal(Array.isArray(data)?data.length:0);
    }catch(e){setError(e.message);}
    setLoading(false);
  }
  var filtered=contacts.filter(function(c){if(!search)return true;var n=((c.first_name||"")+" "+(c.last_name||"")).toLowerCase();var co=(c.company_name||"").toLowerCase();var q=search.toLowerCase();return n.indexOf(q)>-1||co.indexOf(q)>-1;});
  var stageOptions=["All","Connected","Engaged","Fit Invite Sent","Fit Call Scheduled","Fit Call Completed","Event Waitlist","Event Invited","Event Confirmed","Active Member","Stalled","No Reply / Reserve","Lost — Not a Fit"];
  return (
    <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
      <div style={{padding:"16px 28px 0",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div><h2 style={{fontSize:22,fontWeight:600,color:T.text,margin:0}}>CFO Pipeline</h2>
            <div style={{fontSize:13,color:T.muted,marginTop:3}}>{loading?"Loading…":(filtered.length+" of "+total+" contacts")}{!loading&&<span style={{fontSize:11,color:T.green,marginLeft:10}}>● live</span>}</div></div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <input value={search} onChange={function(e){setSearch(e.target.value);}} placeholder="Search…" style={{background:BG3,border:"1px solid "+T.border,color:T.text,padding:"7px 12px",borderRadius:6,fontSize:12,outline:"none",fontFamily:"inherit",width:200}}/>
            <button onClick={loadContacts} style={{padding:"7px 10px",background:"rgba(255,255,255,0.03)",border:"1px solid "+T.border,color:T.muted,borderRadius:5,cursor:"pointer",fontSize:11}}>↺</button>
          </div>
        </div>
        {/* Active Pipeline stage buckets — Connected through Active Member */}
        <div style={{display:"flex",gap:5,marginBottom:14,flexWrap:"wrap",alignItems:"stretch"}}>
          {[
            {s:"Connected",     c:T.blue,     label:"Connected"},
            {s:"Engaged",       c:T.orange,   label:"Engaged"},
            {s:"Fit Invite Sent",     c:T.orange,   label:"Invite Sent"},
            {s:"Fit Call Scheduled",  c:G,          label:"Fit Sched."},
            {s:"Fit Call Completed",  c:T.purple,   label:"Fit Done"},
            {s:"Event Waitlist",      c:"#9b59b6",  label:"Waitlist"},
            {s:"Event Invited",       c:"#1abc9c",  label:"Invited"},
            {s:"Event Confirmed",     c:T.green,    label:"Confirmed"},
            {s:"Event Attended",      c:T.green,    label:"Attended"},
            {s:"Membership Conversation Scheduled", c:T.blue, label:"Memb. Convo"},
            {s:"Verbal Commitment",   c:G,          label:"Verbal"},

          ].map(function(item){
            var isSelected = stageFilter === item.s;
            var count = contacts.filter(function(ct){ return ct.pipeline_stage === item.s; }).length;
            return (
              <div key={item.s} onClick={function(){setStageFilter(function(prev){return prev===item.s?"All":item.s;});}}
                style={{background:isSelected?item.c+"18":BG3,border:"1px solid "+(isSelected?item.c+"60":item.c+"20"),borderTop:"2px solid "+(isSelected?item.c:item.c+"60"),borderRadius:5,padding:"7px 10px",cursor:"pointer",transition:"all 0.15s",textAlign:"center",minWidth:50}}>
                <div style={{fontSize:18,fontWeight:700,color:item.c,lineHeight:1,marginBottom:3}}>{count}</div>
                <div style={{fontSize:8,color:isSelected?item.c:"#8ab4cc",letterSpacing:0.5,textTransform:"uppercase",lineHeight:1.3,whiteSpace:"nowrap"}}>{item.label}</div>
              </div>
            );
          })}
          {/* Separator */}
          <div style={{width:1,background:"rgba(255,255,255,0.12)",marginLeft:6,marginRight:2,borderRadius:1,alignSelf:"stretch"}}/>
          {/* Active Pipeline — same prominence as Active Members */}
          <div onClick={function(){setStageFilter("All");}}
            style={{background:"rgba(240,200,74,0.06)",border:"2px solid rgba(240,200,74,0.4)",borderRadius:6,padding:"8px 14px",cursor:"pointer",textAlign:"center",minWidth:70}}>
            <div style={{fontSize:26,fontWeight:800,color:G,lineHeight:1,marginBottom:3}}>{contacts.filter(function(ct){return ["Connected","Engaged","Fit Invite Sent","Fit Call Scheduled","Fit Call Completed","Event Waitlist","Event Invited","Event Confirmed","Event Attended","Membership Conversation Scheduled","Membership Conversation Completed","Verbal Commitment","Active Member"].indexOf(ct.pipeline_stage)>-1;}).length}</div>
            <div style={{fontSize:8,color:G,letterSpacing:1,textTransform:"uppercase",lineHeight:1.3,fontWeight:700}}>Active Pipeline</div>
            <div style={{fontSize:9,color:T.dim,marginTop:2}}>{total} total</div>
          </div>
          {/* Active Members — far right, primary goal metric */}
          <div onClick={function(){setStageFilter(function(prev){return prev==="Active Member"?"All":"Active Member";});}}
            style={{background:stageFilter==="Active Member"?T.green+"18":"rgba(46,204,113,0.06)",border:"2px solid "+(stageFilter==="Active Member"?T.green:T.green+"50"),borderRadius:6,padding:"8px 14px",cursor:"pointer",textAlign:"center",minWidth:70,marginLeft:4}}>
            <div style={{fontSize:26,fontWeight:800,color:T.green,lineHeight:1,marginBottom:3}}>{contacts.filter(function(ct){return ct.pipeline_stage==="Active Member";}).length}</div>
            <div style={{fontSize:8,color:T.green,letterSpacing:1,textTransform:"uppercase",lineHeight:1.3,fontWeight:700}}>Active Members</div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"200px 1fr 160px 90px 110px 70px",gap:10,padding:"7px 14px",borderRadius:"6px 6px 0 0",background:"rgba(255,255,255,0.02)",borderBottom:"1px solid "+T.border}}>
          {["Contact","Company / Title","Stage","Source","Revenue",""].map(function(h){return <div key={h} style={{fontSize:9,color:T.dim,letterSpacing:2,textTransform:"uppercase"}}>{h}</div>;})}
        </div>
      </div>
      <div style={{overflowY:"auto",flex:1,paddingBottom:20}}>
        {error&&<div style={{margin:"20px 28px",padding:"14px 18px",background:"rgba(231,76,60,0.08)",border:"1px solid rgba(231,76,60,0.25)",borderRadius:7,color:T.red,fontSize:13}}>⚠ {error}</div>}
        {loading&&!error&&<div style={{padding:"40px",textAlign:"center",color:T.dim,fontSize:13}}><div style={{fontSize:24,marginBottom:10,color:G+"60"}}>◎</div>Loading from Supabase…</div>}
        {!loading&&!error&&filtered.map(function(c,i){
          var sc=stageColor(c.pipeline_stage||"");var fn=c.first_name||"";var ln=c.last_name||"";
          return <div key={c.id} onClick={function(){onNavigate("profile",c);}} style={{display:"grid",gridTemplateColumns:"200px 1fr 160px 90px 110px 70px",gap:10,padding:"11px 14px",cursor:"pointer",background:i%2===0?"transparent":"rgba(255,255,255,0.008)",borderBottom:"1px solid rgba(255,255,255,0.03)"}}>
            <div style={{display:"flex",alignItems:"center",gap:9,minWidth:0}}><Avatar first={fn} last={ln} size={30}/><div style={{minWidth:0}}><div style={{fontSize:13,color:T.text,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{fn} {ln}</div><div style={{fontSize:10,color:T.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.email||"No email"}</div></div></div>
            <div style={{display:"flex",flexDirection:"column",justifyContent:"center",minWidth:0}}><div style={{fontSize:12,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.company_name||"—"}</div><div style={{fontSize:10,color:T.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.title||""}</div></div>
            <div style={{display:"flex",alignItems:"center"}}><Pill label={c.pipeline_stage||"Unknown"} color={sc}/></div>
            <div style={{display:"flex",alignItems:"center"}}><span style={{fontSize:11,color:T.muted}}>{c.lead_source?(c.lead_source.replace("LinkedIn / HeyReach","LinkedIn")):"—"}</span></div>
            <div style={{display:"flex",alignItems:"center"}}><span style={{fontSize:11,color:c.annual_revenue?T.muted:T.dim}}>{c.annual_revenue||"—"}</span></div>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <button onClick={function(e){e.stopPropagation();}} style={{padding:"4px 7px",background:"rgba(74,154,186,0.1)",border:"1px solid rgba(74,154,186,0.2)",color:T.blue,borderRadius:4,cursor:"pointer",fontSize:10}}>☎</button>
              <button onClick={function(e){e.stopPropagation();}} style={{padding:"4px 7px",background:"rgba(240,200,74,0.1)",border:"1px solid rgba(240,200,74,0.2)",color:G,borderRadius:4,cursor:"pointer",fontSize:10}}>✉</button>
            </div>
          </div>;
        })}
        {!loading&&!error&&filtered.length===0&&<div style={{padding:"40px",textAlign:"center",color:T.dim,fontSize:13}}>No contacts match your search or filter.</div>}
      </div>
    </div>
  );
}

function Placeholder({icon,title,description}){
  return <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,gap:16}}><div style={{fontSize:48,color:T.dim}}>{icon}</div><div style={{fontSize:20,color:T.muted,fontWeight:600}}>{title}</div><div style={{fontSize:14,color:T.dim,textAlign:"center",maxWidth:360,lineHeight:1.8}}>{description}</div><div style={{fontSize:11,color:T.dim,letterSpacing:2,textTransform:"uppercase",marginTop:8}}>Coming Soon</div></div>;
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

// ─── ASK CLAUDE SCREEN ────────────────────────────────────────────────────────

export default Pipeline
