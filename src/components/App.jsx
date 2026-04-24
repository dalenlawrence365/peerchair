"use client"
import { useState, useEffect } from "react";


// ─── DATA LAYER: Live Supabase ──────────────────────────────────────────────
var SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
var SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

async function sbFetch(path, opts) {
  var h = {"apikey":SB_KEY,"Authorization":"Bearer "+SB_KEY,"Content-Type":"application/json","Prefer":"return=representation"};
  if(opts&&opts.headers) Object.assign(h,opts.headers);
  var res = await fetch(SB_URL+"/rest/v1"+path, Object.assign({},opts||{},{headers:h}));
  if(!res.ok){var err=await res.text();throw new Error(err);}
  var ct=res.headers.get("content-type")||"";
  return ct.includes("json")?res.json():[];
}

// ─── FIELD MAPPING ────────────────────────────────────────────────────────────
function dbToLocal(row) {
  if (!row) return {};
  function fmt(v) {
    if (!v) return "";
    try { var d = new Date(v); if (!isNaN(d)) return d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}); } catch(e) {}
    return String(v);
  }
  return {
    id:                   row.id||"",
    firstName:            row.first_name||"",
    lastName:             row.last_name||"",
    title:                row.title||"",
    company:              row.company_name||"",
    email:                row.email||"",
    emailType:            row.email_type||"Personal",
    email2:               row.email2||"",
    phone:                row.phone||"",
    linkedinUrl:          row.linkedin_url||"",
    linkedinLocation:     row.linkedin_location||"",
    chapterInterest:      row.chapter_interest||"Los Angeles",
    leadSource:           row.lead_source||"",
    referredBy:           row.referred_by||"",
    campaign:             row.heyreach_campaign||"",
    connectedDate:        fmt(row.linkedin_connected_date),
    pipelineStage:        row.pipeline_stage||"Connected",
    memberStatus:         row.member_status||"Prospect",
    lastActivity:         fmt(row.last_activity_date||row.updated_at),
    doNotContact:         !!row.do_not_contact,
    optOutCFO:            !!row.opt_out_cfo_circle,
    unsubscribedEmail:    !!row.unsubscribed_email,
    industry:             row.industry||"",
    revenue:              row.annual_revenue||"",
    employees:            row.employee_count||"",
    financeTeam:          row.finance_team_size||"",
    ownership:            row.ownership_type||"",
    reportsTo:            row.reports_to||"",
    companyWebsite:       row.company_website||"",
    companyCity:          row.company_city||"",
    fitCallDate:          fmt(row.fit_call_date),
    fitCallOutcome:       row.fit_call_outcome||"",
    commitmentConfirmed:  row.commitment_confirmed||"",
    primaryChallenge:     row.primary_challenge||"",
    pressureCategories:   row.pressure_categories||[],
    highFitCues:          row.high_fit_cues||[],
    redFlags:             row.red_flags||[],
    fitCallNotes:         row.fit_call_notes||"",
    assessmentOffered:    row.assessment_offered||"",
    assessmentCompleted:  row.assessment_completed||"",
    assessmentDate:       fmt(row.assessment_date),
    eventName:            row.event_name||"",
    eventInvitedDate:     fmt(row.event_invited_date),
    eventConfirmed:       row.event_confirmed||"",
    eventAttended:        row.event_attended||"",
    membershipConvoDate:  fmt(row.membership_convo_date),
    membershipOutcome:    row.membership_outcome||"",
    verbalCommitmentDate: fmt(row.verbal_commitment_date),
    membershipType:       row.membership_type||"",
    membershipStartDate:  fmt(row.membership_start_date),
  };
}

function localToDb(d) {
  return {
    first_name:          d.firstName,
    last_name:           d.lastName,
    title:               d.title,
    company_name:        d.company,
    email:               d.email,
    email_type:          d.emailType,
    email2:              d.email2,
    phone:               d.phone,
    linkedin_url:        d.linkedinUrl,
    linkedin_location:   d.linkedinLocation,
    chapter_interest:    d.chapterInterest,
    lead_source:         d.leadSource,
    referred_by:         d.referredBy,
    heyreach_campaign:   d.campaign,
    pipeline_stage:      d.pipelineStage,
    member_status:       d.memberStatus,
    do_not_contact:      d.doNotContact,
    opt_out_cfo_circle:  d.optOutCFO,
    unsubscribed_email:  d.unsubscribedEmail,
    industry:            d.industry,
    annual_revenue:      d.revenue,
    employee_count:      d.employees,
    finance_team_size:   d.financeTeam,
    ownership_type:      d.ownership,
    reports_to:          d.reportsTo,
    company_website:     d.companyWebsite,
    company_city:        d.companyCity,
    fit_call_outcome:    d.fitCallOutcome,
    commitment_confirmed:d.commitmentConfirmed,
    primary_challenge:   d.primaryChallenge,
    pressure_categories: d.pressureCategories,
    high_fit_cues:       d.highFitCues,
    red_flags:           d.redFlags,
    fit_call_notes:      d.fitCallNotes,
    assessment_offered:  d.assessmentOffered,
    assessment_completed:d.assessmentCompleted,
    event_name:          d.eventName,
    event_confirmed:     d.eventConfirmed,
    event_attended:      d.eventAttended,
    membership_outcome:  d.membershipOutcome,
    membership_type:     d.membershipType,
  };
}

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
var G   = "#f0c84a";
var BG  = "#080f1a";
var BG2 = "#0c1520";
var BG3 = "#0f1e2e";
var T = { bg:BG, bg2:BG2, bg3:BG3, bg4:"#132438", rail:"#060d17", border:"rgba(255,255,255,0.06)", gold:G, goldDim:"rgba(240,200,74,0.15)", blue:"#4a9eba", green:"#2ecc71", red:"#e74c3c", orange:"#e67e22", purple:"#9b59b6", text:"#e8f2ff", muted:"#7a9bb8", dim:"#3a5a74" };

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
var JOURNEY  = [
  {id:"connected",  label:"Connected",      date:"connectedDate",       stage:"Connected"},
  {id:"fit_sched",  label:"Fit Scheduled",  date:"fitCallDate",         stage:"Fit Call Scheduled"},
  {id:"fit_done",   label:"Fit Completed",  date:"fitCallDate",         stage:"Fit Call Completed"},
  {id:"event_inv",  label:"Event Invited",  date:"eventInvitedDate",    stage:"Event Invited"},
  {id:"event_conf", label:"Event Confirmed",date:"eventInvitedDate",    stage:"Event Confirmed"},
  {id:"event_att",  label:"Attended",       date:"eventAttended",       stage:"Event Attended"},
  {id:"memb_convo", label:"Memb. Convo",    date:"membershipConvoDate", stage:"Membership Conversation Scheduled"},
  {id:"verbal",     label:"Verbal Commit",  date:"verbalCommitmentDate",stage:"Verbal Commitment"},
  {id:"member",     label:"Active Member",  date:"membershipStartDate", stage:"Active Member"},
];

// Stage → Journey node index (primary driver of Circle Journey display)
var STAGE_TO_NODE = {
  "Connected":0,"Engaged":0,"Requested":0,
  "Fit Call Scheduled":1,
  "Fit Call Completed":2,"Strong Fit":2,"Possible Fit":2,"Bad Timing":2,
  "Event Invited":3,
  "Event Confirmed":4,
  "Event Attended":5,"No Show":5,
  "Membership Conversation Scheduled":6,"Membership Conversation Completed":6,
  "Verbal Commitment":7,
  "Active Member":8
};
var CHAPTERS = ["Los Angeles","San Fernando Valley"];
var SOURCES  = ["LinkedIn / HeyReach","Sponsor","Networking","Referral"];
var PIPELINE = ["Target","Requested","Connected","Engaged","Fit Call Scheduled","Fit Call Completed","Strong Fit","Possible Fit","Bad Timing","Not a Fit","Event Invited","Event Confirmed","Event Attended","No Show","Membership Conversation Scheduled","Membership Conversation Completed","Verbal Commitment","Active Member","Lost — Bad Timing","Lost — Not a Fit","Reserve Pool"];
var STATUSES = ["Prospect","Active","Inactive / Churned","No Response","Not a Fit"];
var OUTCOMES = ["Strong Fit","Possible Fit","Bad Timing","Not a Fit","No Show"];
var OWNERSHIP= ["Privately Held","PE-Backed","Founder-Led","Family-Owned","Public","Non-Profit"];
var RPT      = ["CEO","Owner / Founder","Board","President / COO","Other"];
var IND      = ["Entertainment / Media","Technology","Real Estate","Healthcare","Manufacturing","Professional Services","Financial Services","Consumer / Retail","Construction","Logistics / Distribution","Non-Profit","Other"];
var REV      = ["Under $10M","$10M–$20M","$20M–$50M","$50M–$100M","$100M–$250M","$250M–$500M","Over $500M"];
var EMP      = ["Under 50","50–200","201–500","501–1,000","Over 1,000"];
var FIN      = ["Solo (CFO only)","2–3","4–6","7–10","11–20","Over 20"];
var PRESSURE = ["Cash and working capital","Forecasting and KPIs","Leadership team accountability","Talent and staffing","Systems and reporting","Managing up with CEO / Board","AI Readiness & Finance Function Transformation"];
var CUES     = ["Isolation / lonely in the seat","Wants to elevate to strategic","Complexity outpacing systems","Managing-up pressure","PE or investor pressure","Transaction / exit planning","Talent gaps in finance","KPI & forecasting discipline","Reactive decision making","Acquisition integration"];
var FLAGS    = ["Won't commit to participation","Sales intent / wants to pitch","Dominant ego / knows-it-all","Uncomfortable with confidentiality","Chronic negativity / no ownership","Not primary finance executive","Company too small / large","Public company","Conflict with existing member"];
var MEMB_T   = ["Monthly — $500/mo","Quarterly — $1,500/qtr","Annual — $6,000/yr"];

// ─── UTILITIES ────────────────────────────────────────────────────────────────
function stageColor(s) {
  if (s==="Active Member") return T.green;
  if (["Strong Fit","Verbal Commitment","Membership Conversation Completed"].indexOf(s)>-1) return "#27ae60";
  if (["Fit Call Completed","Fit Call Scheduled","Event Attended"].indexOf(s)>-1) return G;
  if (["Lost — Not a Fit","Not a Fit"].indexOf(s)>-1) return T.red;
  if (["Bad Timing","Lost — Bad Timing","Reserve Pool","No Show"].indexOf(s)>-1) return T.orange;
  if (s==="Possible Fit") return "#f39c12";
  return T.blue;
}
function chColor(ch) { return ({LinkedIn:T.blue,Email:T.blue,Phone:T.green,Calendly:G,App:T.purple}[ch])||"#6a8daa"; }
function chIcon(ch)  { return ({LinkedIn:"in",Email:"✉",Phone:"☎",Calendly:"◈",App:"◎"}[ch])||"·"; }

// ─── SHARED UI ────────────────────────────────────────────────────────────────
function Pill({label,color}) {
  return <span style={{display:"inline-block",padding:"2px 9px",borderRadius:20,border:"1px solid "+color+"50",background:color+"14",color:color,fontSize:10,fontWeight:600,letterSpacing:0.3,whiteSpace:"nowrap"}}>{label}</span>;
}
function Avatar({first,last,size}) {
  var s=size||32;
  return <div style={{width:s,height:s,borderRadius:"50%",background:"linear-gradient(135deg,#1a3a5c,#0f2235)",border:"1px solid "+G+"30",display:"flex",alignItems:"center",justifyContent:"center",fontSize:Math.floor(s*0.35),fontWeight:600,color:G,flexShrink:0}}>{(first||"?")[0]}{(last||"")[0]}</div>;
}
function NavItem({icon,label,badge,active,onClick}) {
  return (
    <div onClick={onClick} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 14px",borderRadius:6,cursor:"pointer",userSelect:"none",background:active?T.goldDim:"transparent",border:active?"1px solid "+G+"30":"1px solid transparent"}}>
      <span style={{fontSize:15,color:active?G:T.muted,width:18,textAlign:"center"}}>{icon}</span>
      <span style={{fontSize:13,color:active?G:T.muted,fontWeight:active?600:400,flex:1}}>{label}</span>
      {badge?<span style={{fontSize:10,color:active?G:T.dim,background:active?T.goldDim:"rgba(255,255,255,0.04)",padding:"1px 7px",borderRadius:10,fontWeight:600}}>{badge}</span>:null}
    </div>
  );
}

// ─── PROFILE UI COMPONENTS ────────────────────────────────────────────────────
function HRPopup({data,onClose}) {
  var fields = [["Full Name",data.firstName+" "+data.lastName],["Title",data.title],["Company",data.company],["Location",data.linkedinLocation||"—"],["Source",data.leadSource||"—"],["Connected",data.connectedDate||"—"],["Email",data.email||"—"],["Email Type",data.emailType||"—"],["Campaign",data.campaign||"—"]];
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300}}>
      <div onClick={function(e){e.stopPropagation();}} style={{background:BG3,border:"1px solid "+G+"40",borderRadius:10,padding:24,width:400,maxWidth:"90vw",boxShadow:"0 20px 60px rgba(0,0,0,0.6)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:10,letterSpacing:3,color:G,textTransform:"uppercase"}}>LinkedIn / HeyReach Data</div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:18,lineHeight:1}}>✕</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:12}}>
          {fields.map(function(kv){
            return <div key={kv[0]} style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:5,padding:"6px 9px"}}><div style={{fontSize:8,letterSpacing:2,color:T.dim,textTransform:"uppercase",marginBottom:2}}>{kv[0]}</div><div style={{fontSize:12,color:"#c8dff0",lineHeight:1.4}}>{kv[1]}</div></div>;
          })}
        </div>
        {data.linkedinUrl?<a href={data.linkedinUrl} target="_blank" rel="noreferrer" style={{display:"block",textAlign:"center",fontSize:12,color:T.blue,letterSpacing:1,textDecoration:"none",marginTop:4}}>Open LinkedIn Profile →</a>:null}
      </div>
    </div>
  );
}

function Drawer({title,open,onClose,onSave,children}) {
  if (!open) return null;
  return (
    <div style={{position:"fixed",inset:0,zIndex:200}}>
      <div onClick={onClose} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.55)"}}/>
      <div style={{position:"absolute",top:0,right:0,bottom:0,width:460,background:BG3,borderLeft:"1px solid "+G+"25",display:"flex",flexDirection:"column",boxShadow:"-20px 0 60px rgba(0,0,0,0.5)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 22px",borderBottom:"1px solid rgba(255,255,255,0.07)",flexShrink:0}}>
          <div style={{fontSize:12,color:G,letterSpacing:2,textTransform:"uppercase",fontWeight:600}}>{title}</div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:18,lineHeight:1}}>✕</button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"20px 22px",display:"flex",flexDirection:"column",gap:14}}>{children}</div>
        <div style={{padding:"13px 22px",borderTop:"1px solid rgba(255,255,255,0.07)",flexShrink:0,display:"flex",justifyContent:"flex-end",gap:10}}>
          <button onClick={onClose} style={{padding:"7px 16px",background:"transparent",border:"1px solid rgba(255,255,255,0.1)",color:T.muted,borderRadius:5,cursor:"pointer",fontSize:12}}>Cancel</button>
          <button onClick={onSave||onClose} style={{padding:"7px 18px",background:G+"18",border:"1px solid "+G+"50",color:G,borderRadius:5,cursor:"pointer",fontSize:12,fontWeight:700}}>Save Changes</button>
        </div>
      </div>

    </div>
  );
}

function DField({label,val,set,multiline}) {
  return (
    <div>
      <div style={{fontSize:9,letterSpacing:2,color:T.muted,textTransform:"uppercase",marginBottom:4}}>{label}</div>
      {multiline
        ?<textarea value={val||""} onChange={function(e){set(e.target.value);}} style={{width:"100%",background:BG2,border:"1px solid rgba(255,255,255,0.1)",color:T.text,padding:"7px 10px",borderRadius:5,fontSize:13,lineHeight:1.7,resize:"vertical",outline:"none",fontFamily:"inherit",boxSizing:"border-box",minHeight:80}}/>
        :<input value={val||""} onChange={function(e){set(e.target.value);}} style={{width:"100%",background:BG2,border:"1px solid rgba(255,255,255,0.1)",color:T.text,padding:"7px 10px",borderRadius:5,fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
      }
    </div>
  );
}
function DSelect({label,val,set,opts}) {
  return (
    <div>
      <div style={{fontSize:9,letterSpacing:2,color:T.muted,textTransform:"uppercase",marginBottom:4}}>{label}</div>
      <select value={val||""} onChange={function(e){set(e.target.value);}} style={{width:"100%",background:BG2,border:"1px solid rgba(255,255,255,0.1)",color:T.text,padding:"7px 10px",borderRadius:5,fontSize:13,outline:"none",cursor:"pointer",boxSizing:"border-box"}}>
        <option value="">—</option>
        {opts.map(function(o){return <option key={o}>{o}</option>;})}
      </select>
    </div>
  );
}
function DMulti({label,val,set,opts}) {
  function tog(v){set((val||[]).indexOf(v)>-1?(val||[]).filter(function(x){return x!==v;}):(val||[]).concat([v]));}
  return (
    <div>
      <div style={{fontSize:9,letterSpacing:2,color:T.muted,textTransform:"uppercase",marginBottom:6}}>{label}</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
        {opts.map(function(o){
          var on=(val||[]).indexOf(o)>-1;
          return <div key={o} onClick={function(){tog(o);}} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 8px",borderRadius:4,cursor:"pointer",background:on?"rgba(240,200,74,0.08)":"rgba(255,255,255,0.02)",border:"1px solid "+(on?G+"50":"rgba(255,255,255,0.07)"),fontSize:11,color:on?T.text:T.dim}}>
            <div style={{width:11,height:11,borderRadius:2,border:"1px solid "+(on?G:"rgba(255,255,255,0.15)"),background:on?G:"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,color:BG,fontWeight:"bold",flexShrink:0}}>{on?"✓":""}</div>
            {o}
          </div>;
        })}
      </div>
    </div>
  );
}

function Section({title,icon,badge,onEdit,defaultOpen,children}) {
  var [open,setOpen]=useState(!!defaultOpen);
  return (
    <div style={{borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
      <div onClick={function(){setOpen(function(v){return !v;});}} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 16px",cursor:"pointer",background:open?"rgba(255,255,255,0.015)":"transparent"}}>
        <span style={{fontSize:13,color:G,width:18,textAlign:"center"}}>{icon}</span>
        <span style={{fontSize:12,color:open?T.text:"#9ac4dc",letterSpacing:1,textTransform:"uppercase",fontWeight:600,flex:1}}>{title}</span>
        {badge?<span style={{fontSize:10,color:T.muted,background:"rgba(255,255,255,0.04)",padding:"1px 7px",borderRadius:10}}>{badge}</span>:null}
        {onEdit?<span onClick={function(e){e.stopPropagation();onEdit();}} style={{fontSize:10,color:T.blue,cursor:"pointer",padding:"2px 8px",borderRadius:4,background:"rgba(74,154,186,0.08)",border:"1px solid rgba(74,154,186,0.2)",marginRight:4}}>Edit</span>:null}
        <span style={{fontSize:10,color:T.dim,transform:open?"rotate(90deg)":"rotate(0deg)",display:"inline-block",transition:"transform 0.2s"}}>▶</span>
      </div>
      {open?<div style={{padding:"12px 16px 16px",display:"flex",flexDirection:"column",gap:14}}>{children}</div>:null}
    </div>
  );
}

function FL({label}){return <div style={{fontSize:9,letterSpacing:2,color:T.muted,textTransform:"uppercase",marginBottom:3}}>{label}</div>;}
function FV({val}){return <div style={{fontSize:13,color:val?T.text:T.dim,lineHeight:1.5}}>{val||"—"}</div>;}
function Grid2({children}){
  var arr=Array.isArray(children)?children.flat():[children];
  var rows=[];
  for(var i=0;i<arr.length;i+=2){rows.push(<div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}><div>{arr[i]}</div><div>{arr[i+1]||null}</div></div>);}
  return <div style={{display:"flex",flexDirection:"column",gap:14}}>{rows}</div>;
}
function Tags({items,color}){
  if(!items||items.length===0)return <div style={{fontSize:13,color:T.dim}}>—</div>;
  return <div style={{display:"flex",flexWrap:"wrap",gap:5}}>{items.map(function(v){return <span key={v} style={{fontSize:11,padding:"2px 8px",borderRadius:12,background:color+"10",border:"1px solid "+color+"30",color:color+"dd"}}>{v}</span>;})}</div>;
}

function CircleJourney({data, onNodeClick}){
  var currentIdx = STAGE_TO_NODE[data.pipelineStage];
  if(currentIdx === undefined) currentIdx = -1;

  // Determine if this contact is lost/disqualified
  var isLost = data.pipelineStage === "Lost — Not a Fit" || 
               data.pipelineStage === "Lost — Bad Timing" ||
               data.memberStatus === "Not a Fit";
  var isBadTiming = data.pipelineStage === "Lost — Bad Timing" || 
                    data.pipelineStage === "Reserve Pool" ||
                    data.pipelineStage === "Bad Timing";

  // For lost contacts, show where they stopped based on fit_call_outcome or last meaningful stage
  var stoppedIdx = currentIdx;
  if(isLost && stoppedIdx < 0) stoppedIdx = 1; // at least made it to fit call
  
  function getDate(m){if(m.date&&data[m.date])return data[m.date].split(" · ")[0];return "";}
  var pct = stoppedIdx >= 0 ? ((stoppedIdx/(JOURNEY.length-1))*100) : 0;

  var lostColor = isLost ? T.red : isBadTiming ? T.orange : null;

  return (
    <div style={{padding:"8px 0 16px",overflowX:"auto"}}>
      {/* Lost/Bad Timing banner */}
      {(isLost||isBadTiming)?<div style={{
        display:"flex",alignItems:"center",gap:8,padding:"7px 12px",
        background:isLost?"rgba(231,76,60,0.08)":"rgba(230,126,34,0.08)",
        border:"1px solid "+(isLost?"rgba(231,76,60,0.25)":"rgba(230,126,34,0.25)"),
        borderRadius:6,marginBottom:12,fontSize:12,
        color:isLost?T.red:T.orange
      }}>
        <span>{isLost?"✕":"⏸"}</span>
        <span style={{fontWeight:600}}>{isLost?"Not a Fit":"Bad Timing / Reserve"}</span>
        {data.fitCallOutcome?<span style={{color:T.muted,fontSize:11}}>· {data.fitCallOutcome}</span>:null}
        <span style={{marginLeft:"auto",fontSize:11,color:T.dim}}>
          {isLost?"Exited at:":"Paused at:"} {stoppedIdx>=0?JOURNEY[stoppedIdx].label:"Connected"}
        </span>
      </div>:null}

      <div style={{position:"relative",display:"flex",alignItems:"flex-start",minWidth:500,paddingTop:4}}>
        {/* Track line */}
        <div style={{position:"absolute",top:14,left:14,right:14,height:2,background:"rgba(255,255,255,0.06)",zIndex:0}}/>
        {/* Progress line */}
        {stoppedIdx>=0?<div style={{position:"absolute",top:14,left:14,width:"calc("+pct+"% - 14px)",height:2,
          background:isLost?"linear-gradient(90deg,"+T.red+","+T.red+"80)":
                     isBadTiming?"linear-gradient(90deg,"+T.orange+","+T.orange+"80)":
                     "linear-gradient(90deg,"+G+","+G+"80)",
          zIndex:1}}/>:null}

        {/* Nodes */}
        {JOURNEY.map(function(m,idx){
          var isPast    = idx < stoppedIdx;
          var isStopped = idx === stoppedIdx && (isLost||isBadTiming);
          var isCurrent = idx === currentIdx && !isLost && !isBadTiming;
          var isDone    = idx <= currentIdx && !isLost && !isBadTiming;
          var isNext    = !isLost && !isBadTiming && idx === currentIdx + 1;
          var isFuture  = idx > stoppedIdx;
          var d = getDate(m);

          var nodeBg, nodeBorder, nodeColor, nodeText;
          if(isStopped && isLost){
            nodeBg="#e74c3c30"; nodeBorder=T.red; nodeColor=T.red; nodeText="✕";
          } else if(isStopped && isBadTiming){
            nodeBg="#e67e2230"; nodeBorder=T.orange; nodeColor=T.orange; nodeText="⏸";
          } else if(isPast){
            nodeBg=G+"20"; nodeBorder=G+"50"; nodeColor=G; nodeText="✓";
          } else if(isCurrent){
            nodeBg=G; nodeBorder=G; nodeColor=BG; nodeText="✓";
          } else if(isDone){
            nodeBg=G+"30"; nodeBorder=G+"60"; nodeColor=G; nodeText="✓";
          } else if(isNext){
            nodeBg="rgba(240,200,74,0.06)"; nodeBorder="rgba(240,200,74,0.2)"; nodeColor=G+"60"; nodeText=String(idx+1);
          } else {
            nodeBg="rgba(255,255,255,0.04)"; nodeBorder="rgba(255,255,255,0.08)"; nodeColor=T.dim; nodeText=String(idx+1);
          }

          var labelColor = isStopped?(isLost?T.red:T.orange):isPast?"#c0dcf0":isCurrent?G:isFuture?T.dim:T.dim;

          return (
            <div key={m.id}
              onClick={function(){ if(onNodeClick && !isLost && !isBadTiming) onNodeClick(m.stage, idx); }}
              title={isLost||isBadTiming?"":"Move to: "+m.stage}
              style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:5,position:"relative",zIndex:2,cursor:isLost||isBadTiming?"default":"pointer"}}>
              <div style={{
                width:28,height:28,borderRadius:"50%",
                background:nodeBg, border:"2px solid "+nodeBorder,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:isStopped?12:10, color:nodeColor, fontWeight:"bold",
                boxShadow:isCurrent?"0 0 10px "+G+"60":isStopped&&isLost?"0 0 8px "+T.red+"40":isNext?"0 0 4px "+G+"20":"none",
                opacity:isFuture&&(isLost||isBadTiming)?0.3:1,
                transition:"all 0.2s",
              }}>{nodeText}</div>
              <div style={{fontSize:9,color:labelColor,textAlign:"center",lineHeight:1.4,maxWidth:58,
                fontWeight:isCurrent||isStopped?600:400,
                opacity:isFuture&&(isLost||isBadTiming)?0.3:1}}>
                {m.label}
              </div>
              {d&&!isFuture?<div style={{fontSize:8,color:isPast||isDone?G:T.dim,textAlign:"center",fontStyle:"italic"}}>{d}</div>:null}
            </div>
          );
        })}
      </div>
      {!isLost&&!isBadTiming?<div style={{marginTop:10,fontSize:10,color:T.dim,textAlign:"center",letterSpacing:0.5}}>
        Click any node to move {data.firstName} to that stage
      </div>:null}
    </div>
  );
}

// ─── CONTACT PROFILE ─────────────────────────────────────────────────────────
function ContactProfile({contactId,onBack}) {
  var [data,setData]           = useState(null);
  var [loading,setLoading]     = useState(true);
  var [saving,setSaving]       = useState(false);
  var [saveMsg,setSaveMsg]     = useState("");
  var [comms,setComms]         = useState([]);
  var [commsLoading,setCommsLoading] = useState(true);
  var [tab,setTab]             = useState("summary");
  var [showHR,setShowHR]       = useState(false);
  var [drawer,setDrawer]       = useState(null);
  var [tlFilter,setTlFilter]   = useState("All");
  var [addingNote,setAddingNote] = useState(false);
  var [noteText,setNoteText]   = useState("");
  var [editEmail,setEditEmail] = useState(false);
  var [editPhone,setEditPhone] = useState(false);

  useEffect(function(){
    if(!contactId) return;
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

  var sc = stageColor(data.pipelineStage);
  var channels = ["All","LinkedIn","Email","Phone","Calendly","App","Note"];
  var filtered = comms
    .filter(function(c){ return c.body && c.channel && c.direction; })
    .filter(function(c){ return tlFilter==="All" || c.channel===tlFilter; });

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,serif",color:T.text}}>

      {/* PROFILE HEADER */}
      <div style={{background:"linear-gradient(135deg,#0f1e30 0%,#132840 60%,#0f1a28 100%)",borderBottom:"1px solid "+G+"18",padding:"16px 24px",flexShrink:0,position:"relative"}}>
        {saveMsg?<div style={{position:"absolute",top:12,right:20,fontSize:11,color:saveMsg==="Saved"?T.green:T.red,letterSpacing:1}}>{saveMsg}</div>:null}
        <div style={{display:"flex",gap:16,alignItems:"flex-start"}}>
          <Avatar first={data.firstName} last={data.lastName} size={52}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:3}}>
              <h2 style={{fontSize:20,fontWeight:600,color:"#fff",margin:0}}>{data.firstName} {data.lastName}</h2>
              <Pill label={data.pipelineStage} color={sc}/>
              <Pill label={data.memberStatus} color={data.memberStatus==="Active"?T.green:data.memberStatus==="Not a Fit"?T.red:data.memberStatus==="Inactive / Churned"?T.orange:T.blue}/>
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

          {/* Email */}
          <div style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
              <div style={{fontSize:9,letterSpacing:2,color:T.dim,textTransform:"uppercase"}}>Email</div>
              <button onClick={function(){setEditEmail(function(v){return !v;});}} style={{background:"transparent",border:"none",color:editEmail?G:T.blue,cursor:"pointer",fontSize:10}}>{editEmail?"✓":"✎"}</button>
            </div>
            {editEmail
              ?<div style={{display:"flex",flexDirection:"column",gap:4}}>
                <input value={data.email||""} onChange={function(e){set("email")(e.target.value);}} autoFocus style={{width:"100%",background:BG3,border:"1px solid "+G,color:T.text,padding:"5px 7px",borderRadius:4,fontSize:12,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
                <select value={data.emailType||"Personal"} onChange={function(e){set("emailType")(e.target.value);}} style={{background:BG3,border:"1px solid rgba(255,255,255,0.1)",color:T.text,padding:"4px 7px",borderRadius:4,fontSize:11,outline:"none",cursor:"pointer"}}>
                  <option>Personal</option><option>Company</option><option>Unknown</option>
                </select>
              </div>
              :<div style={{fontSize:12,color:data.email?T.muted:T.dim,wordBreak:"break-all",lineHeight:1.4}}>{data.email||"No email"}<span style={{color:T.dim,fontSize:10}}>{data.email?" · "+data.emailType:""}</span></div>
            }
          </div>

          {/* Phone */}
          <div style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
              <div style={{fontSize:9,letterSpacing:2,color:T.dim,textTransform:"uppercase"}}>Phone</div>
              <button onClick={function(){setEditPhone(function(v){return !v;});}} style={{background:"transparent",border:"none",color:editPhone?G:T.blue,cursor:"pointer",fontSize:10}}>{editPhone?"✓":"✎"}</button>
            </div>
            {editPhone
              ?<input value={data.phone||""} onChange={function(e){set("phone")(e.target.value);}} autoFocus placeholder="Add phone" style={{width:"100%",background:BG3,border:"1px solid "+G,color:T.text,padding:"5px 7px",borderRadius:4,fontSize:12,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
              :<div style={{fontSize:12,color:data.phone?T.muted:T.dim}}>{data.phone||"—"}</div>
            }
          </div>

          {/* LinkedIn */}
          <div style={{marginBottom:12}}>
            <div style={{fontSize:9,letterSpacing:2,color:T.dim,textTransform:"uppercase",marginBottom:4}}>LinkedIn</div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              {data.linkedinUrl?<a href={data.linkedinUrl} target="_blank" rel="noreferrer" style={{fontSize:12,color:T.blue,textDecoration:"none",flex:1}}>View Profile →</a>:<span style={{fontSize:12,color:T.dim,flex:1}}>—</span>}
              <button onClick={function(){setShowHR(true);}} style={{background:"rgba(74,154,186,0.1)",border:"1px solid rgba(74,154,186,0.25)",color:T.blue,borderRadius:4,padding:"3px 7px",cursor:"pointer",fontSize:10,fontWeight:600,flexShrink:0}}>ℹ Data</button>
            </div>
          </div>

          {/* Other fields */}
          {[["Campaign",data.campaign],["Chapter",data.chapterInterest],["Connected",data.connectedDate],["Last Activity",data.lastActivity],["Stage",data.pipelineStage]].map(function(kv){
            return <div key={kv[0]} style={{marginBottom:10}}>
              <div style={{fontSize:9,letterSpacing:2,color:T.dim,textTransform:"uppercase",marginBottom:2}}>{kv[0]}</div>
              <div style={{fontSize:12,color:kv[1]?T.muted:T.dim,lineHeight:1.4}}>{kv[1]||"—"}</div>
            </div>;
          })}

          {/* Quick Actions */}
          <div style={{borderTop:"1px solid "+T.border,paddingTop:12,marginBottom:12}}>
            <div style={{fontSize:9,letterSpacing:2,color:T.dim,textTransform:"uppercase",marginBottom:8}}>Quick Actions</div>
            {[["📅 Schedule Fit Call",G],["✉ Send Assessment",T.blue],["📨 Event Invite",T.purple],["✎ Add Note",T.green],["📋 Reserve Pool",T.orange]].map(function(item){
              return <button key={item[0]} onClick={function(){if(item[0].indexOf("Note")>-1){setAddingNote(true);setTab("timeline");}}} style={{display:"block",width:"100%",marginBottom:5,padding:"7px 10px",background:"rgba(255,255,255,0.02)",border:"1px solid "+T.border,color:item[1],borderRadius:5,cursor:"pointer",fontSize:11,textAlign:"left"}}>{item[0]}</button>;
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
            {[["summary","Summary"],["timeline","Timeline"]].map(function(t){
              return <button key={t[0]} onClick={function(){setTab(t[0]);}} style={{padding:"11px 22px",background:"transparent",border:"none",borderBottom:"2px solid "+(tab===t[0]?G:"transparent"),color:tab===t[0]?G:T.muted,cursor:"pointer",fontSize:13,fontWeight:tab===t[0]?600:400}}>
                {t[1]}{t[0]==="timeline"?<span style={{marginLeft:6,fontSize:10,color:T.dim}}>{comms.length||""}</span>:null}
              </button>;
            })}
          </div>

          {/* SUMMARY */}
          {tab==="summary"
            ?<div style={{overflowY:"auto",flex:1}}>

              <Section title="Circle Journey" icon="→" defaultOpen={true}>
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
              </Section>

              <Section title="Identity" icon="◎" defaultOpen={true} onEdit={function(){setDrawer("identity");}}>
                <Grid2>
                  <div><FL label="First Name"/><FV val={data.firstName}/></div>
                  <div><FL label="Last Name"/><FV val={data.lastName}/></div>
                  <div><FL label="Title"/><FV val={data.title}/></div>
                  <div><FL label="Company"/><FV val={data.company}/></div>
                  <div><FL label="LinkedIn URL"/>{data.linkedinUrl?<a href={data.linkedinUrl} target="_blank" rel="noreferrer" style={{fontSize:13,color:T.blue,textDecoration:"none"}}>View Profile →</a>:<FV val=""/>}</div>
                  <div><FL label="Location"/><FV val={data.linkedinLocation}/></div>
                  <div><FL label="Chapter Interest"/><FV val={data.chapterInterest}/></div>
                  <div><FL label="Phone"/><FV val={data.phone}/></div>
                  <div><FL label="Email 2"/><FV val={data.email2}/></div>
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

              <Section title="Firmographic" icon="🏢" onEdit={function(){setDrawer("firmographic");}}>
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
              </Section>

              <Section title="Fit Call" icon="☎" defaultOpen={!!data.fitCallOutcome} onEdit={function(){setDrawer("fitcall");}} badge={data.fitCallOutcome||""}>
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

              <Section title="Assessment" icon="◈" badge={data.assessmentCompleted==="Yes"?"Completed":data.assessmentOffered==="Yes"?"Offered":""}>
                <Grid2>
                  <div><FL label="Assessment Offered"/><FV val={data.assessmentOffered}/></div>
                  <div><FL label="Assessment Completed"/><FV val={data.assessmentCompleted}/></div>
                  <div><FL label="Completed Date"/><FV val={data.assessmentDate}/></div>
                </Grid2>
              </Section>

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
        </div>
      </div>

      {/* DRAWERS */}
      <Drawer title="Edit Identity" open={drawer==="identity"} onClose={function(){setDrawer(null);}} onSave={saveContact}>
        <DField label="First Name" val={data.firstName} set={set("firstName")}/>
        <DField label="Last Name" val={data.lastName} set={set("lastName")}/>
        <DField label="Title / Role" val={data.title} set={set("title")}/>
        <DField label="Company" val={data.company} set={set("company")}/>
        <DField label="LinkedIn URL" val={data.linkedinUrl} set={set("linkedinUrl")}/>
        <DField label="LinkedIn Location" val={data.linkedinLocation} set={set("linkedinLocation")}/>
        <DSelect label="Chapter Interest" val={data.chapterInterest} set={set("chapterInterest")} opts={CHAPTERS}/>
        <DField label="Email 2 (Optional)" val={data.email2} set={set("email2")}/>
        <DField label="Phone" val={data.phone} set={set("phone")}/>
        <DSelect label="Email Type" val={data.emailType} set={set("emailType")} opts={["Personal","Company","Unknown"]}/>
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
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({onNavigate,totalContacts,stageCounts}) {
  var today=new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"});
  var ACTIONS=[{label:"Paolo Casarella — fit call yesterday, follow-up not sent",type:"warning",action:"Send Follow-Up"},{label:"Event needs scheduling — 0 of 8 minimum CFOs registered",type:"alert",action:"Set Event Date"},{label:"6 contacts connected 30+ days with no reply",type:"info",action:"Move to Reserve"},{label:"Eric Stoneburner — replied on LinkedIn yesterday",type:"good",action:"View Thread"}];
  var pStages=[{label:"Target",color:T.dim},{label:"Connected",color:T.blue},{label:"Fit Scheduled",color:T.gold},{label:"Fit Completed",color:T.gold},{label:"Strong Fit",color:T.green},{label:"Event Invited",color:T.purple},{label:"Active Member",color:T.green},{label:"Reserve Pool",color:T.dim}];
  function getCount(label){if(label==="Fit Scheduled")return stageCounts["Fit Call Scheduled"]||0;if(label==="Fit Completed")return stageCounts["Fit Call Completed"]||0;return stageCounts[label]||0;}
  return (
    <div style={{padding:"28px 32px",overflowY:"auto",flex:1}}>
      <div style={{marginBottom:24}}>
        <div style={{fontSize:11,color:T.muted,letterSpacing:3,textTransform:"uppercase",marginBottom:6}}>{today}</div>
        <h1 style={{fontSize:26,fontWeight:600,color:T.text,margin:0}}>Good morning, Dalen.</h1>
        <div style={{fontSize:14,color:T.muted,marginTop:4}}>Here's where things stand with your Los Angeles chapter.</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:24}}>
        {[{label:"Active Prospects",val:String(totalContacts),sub:"in pipeline",color:T.blue,icon:"◎"},{label:"Fit Calls Scheduled",val:String(getCount("Fit Scheduled")||0),sub:"this week",color:T.gold,icon:"☎"},{label:"Days to Next Event",val:"—",sub:"no event scheduled",color:T.purple,icon:"✦"},{label:"Active Members",val:String(getCount("Active Member")||0),sub:"in chapter",color:T.green,icon:"★"}].map(function(k){
          return <div key={k.label} style={{background:BG3,border:"1px solid "+T.border,borderTop:"2px solid "+k.color+"40",borderRadius:8,padding:"18px 20px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
              <div style={{fontSize:11,color:T.muted,letterSpacing:1.5,textTransform:"uppercase"}}>{k.label}</div>
              <span style={{fontSize:16,color:k.color+"60"}}>{k.icon}</span>
            </div>
            <div style={{fontSize:32,fontWeight:700,color:k.color,lineHeight:1,marginBottom:5}}>{k.val}</div>
            <div style={{fontSize:11,color:T.dim}}>{k.sub}</div>
          </div>;
        })}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:20}}>
        <div style={{display:"flex",flexDirection:"column",gap:20}}>
          <div style={{background:BG3,border:"1px solid "+T.border,borderRadius:8,overflow:"hidden"}}>
            <div style={{padding:"14px 18px",borderBottom:"1px solid "+T.border,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontSize:11,color:G,letterSpacing:3,textTransform:"uppercase",fontWeight:600}}>Today's Action Items</div>
              <span style={{fontSize:10,color:T.dim}}>Powered by Claude ◎</span>
            </div>
            {ACTIONS.map(function(a,i){
              var colors={warning:G,alert:T.red,info:T.blue,good:T.green};var c=colors[a.type];
              return <div key={i} style={{display:"flex",alignItems:"center",gap:14,padding:"13px 18px",borderBottom:i<ACTIONS.length-1?"1px solid "+T.border:"none",background:i%2===0?"rgba(255,255,255,0.01)":"transparent"}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:c,flexShrink:0}}/>
                <div style={{flex:1,fontSize:13,color:T.text,lineHeight:1.5}}>{a.label}</div>
                <button style={{padding:"5px 12px",background:c+"14",border:"1px solid "+c+"40",color:c,borderRadius:5,cursor:"pointer",fontSize:11,fontWeight:600,flexShrink:0}}>{a.action}</button>
              </div>;
            })}
          </div>
          <div style={{background:BG3,border:"1px solid "+T.border,borderRadius:8,overflow:"hidden"}}>
            <div style={{padding:"14px 18px",borderBottom:"1px solid "+T.border,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontSize:11,color:G,letterSpacing:3,textTransform:"uppercase",fontWeight:600}}>Ask Claude</div>
              <span style={{fontSize:10,color:T.dim}}>Natural language · live data</span>
            </div>
            <div style={{padding:"14px 16px"}}>
              {["Who hasn't been touched in 30 days?","What's my strongest Stalliant prospect?","Draft follow-up for Paolo Casarella"].map(function(q){
                return <button key={q} onClick={function(){onNavigate("claude");}} style={{display:"block",width:"100%",marginBottom:6,padding:"8px 12px",background:"rgba(255,255,255,0.02)",border:"1px solid "+T.border,color:T.muted,borderRadius:5,cursor:"pointer",fontSize:12,textAlign:"left"}}>{q}</button>;
              })}
              <div style={{display:"flex",gap:6,marginTop:4}}>
                <input placeholder="Ask anything about your pipeline…" style={{flex:1,background:BG2,border:"1px solid "+T.border,color:T.text,padding:"8px 11px",borderRadius:5,fontSize:12,outline:"none",fontFamily:"inherit"}}/>
                <button style={{padding:"8px 12px",background:T.goldDim,border:"1px solid "+G+"40",color:G,borderRadius:5,cursor:"pointer",fontSize:13,fontWeight:700}}>→</button>
              </div>
            </div>
          </div>
        </div>
        <div style={{background:BG3,border:"1px solid "+T.border,borderRadius:8,overflow:"hidden",alignSelf:"flex-start"}}>
          <div style={{padding:"14px 18px",borderBottom:"1px solid "+T.border}}>
            <div style={{fontSize:11,color:G,letterSpacing:3,textTransform:"uppercase",fontWeight:600}}>Pipeline Health</div>
            <div style={{fontSize:11,color:T.dim,marginTop:3}}>{totalContacts} contacts · live</div>
          </div>
          <div style={{padding:"14px 16px",display:"flex",flexDirection:"column",gap:9}}>
            {pStages.map(function(s){
              var n=getCount(s.label);var pct=totalContacts>0?Math.max(n>0?5:0,(n/totalContacts)*100):0;
              return <div key={s.label}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:11,color:n>0?T.muted:T.dim}}>{s.label}</span><span style={{fontSize:11,color:n>0?s.color:T.dim,fontWeight:600}}>{n}</span></div>
                <div style={{height:4,background:"rgba(255,255,255,0.04)",borderRadius:2,overflow:"hidden"}}>{n>0?<div style={{width:pct+"%",height:"100%",background:s.color,borderRadius:2}}/>:null}</div>
              </div>;
            })}
          </div>
          <div style={{padding:"10px 16px 14px"}}><button onClick={function(){onNavigate("pipeline");}} style={{width:"100%",padding:"8px",background:T.goldDim,border:"1px solid "+G+"40",color:G,borderRadius:5,cursor:"pointer",fontSize:12,fontWeight:600}}>Open Full Pipeline →</button></div>
        </div>
      </div>

    </div>
  );
}

// ─── PIPELINE ─────────────────────────────────────────────────────────────────
function Pipeline({onNavigate}) {
  var [contacts,setContacts]=useState([]);var [loading,setLoading]=useState(true);var [error,setError]=useState(null);var [search,setSearch]=useState("");var [stageFilter,setStageFilter]=useState("All");var [total,setTotal]=useState(0);
  useEffect(function(){loadContacts();},[stageFilter]);
  async function loadContacts(){
    setLoading(true);setError(null);
    try{
      var where=stageFilter!=="All"?"WHERE pipeline_stage='"+stageFilter.replace(/'/g,"''")+"' ":"";
      var qs="?select=id,first_name,last_name,title,company_name,email,email_type,pipeline_stage,member_status,lead_source,annual_revenue,industry,linkedin_location,linkedin_url,created_at&order=created_at.desc&limit=200";
      if(stageFilter!=="All")qs+="&pipeline_stage=eq."+encodeURIComponent(stageFilter);
      var data=await sbFetch("/contacts"+qs);
      setContacts(Array.isArray(data)?data:[]);setTotal(Array.isArray(data)?data.length:0);
    }catch(e){setError(e.message);}
    setLoading(false);
  }
  var filtered=contacts.filter(function(c){if(!search)return true;var n=((c.first_name||"")+" "+(c.last_name||"")).toLowerCase();var co=(c.company_name||"").toLowerCase();var q=search.toLowerCase();return n.indexOf(q)>-1||co.indexOf(q)>-1;});
  var stageOptions=["All","Connected","Fit Call Scheduled","Fit Call Completed","Strong Fit","Event Invited","Event Confirmed","Active Member","Reserve Pool","Lost — Not a Fit"];
  return (
    <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
      <div style={{padding:"20px 28px 0",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <div><h2 style={{fontSize:22,fontWeight:600,color:T.text,margin:0}}>Pipeline</h2>
            <div style={{fontSize:13,color:T.muted,marginTop:3}}>{loading?"Loading…":(filtered.length+" of "+total+" contacts")}{!loading&&<span style={{fontSize:11,color:T.green,marginLeft:10}}>● live</span>}</div></div>
          <button style={{padding:"8px 16px",background:T.goldDim,border:"1px solid "+G+"40",color:G,borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:600}}>+ Add Contact</button>
        </div>
        <div style={{display:"flex",gap:10,marginBottom:12,alignItems:"center"}}>
          <input value={search} onChange={function(e){setSearch(e.target.value);}} placeholder="Search name or company…" style={{background:BG3,border:"1px solid "+T.border,color:T.text,padding:"8px 13px",borderRadius:6,fontSize:13,outline:"none",fontFamily:"inherit",width:240}}/>
          <button onClick={loadContacts} style={{padding:"8px 12px",background:"rgba(255,255,255,0.03)",border:"1px solid "+T.border,color:T.muted,borderRadius:5,cursor:"pointer",fontSize:11}}>↺ Refresh</button>
        </div>
        <div style={{display:"flex",gap:5,marginBottom:14,flexWrap:"wrap"}}>
          {stageOptions.map(function(s){return <button key={s} onClick={function(){setStageFilter(s);}} style={{padding:"4px 10px",borderRadius:12,cursor:"pointer",fontSize:11,fontWeight:stageFilter===s?600:400,background:stageFilter===s?T.goldDim:"rgba(255,255,255,0.02)",border:"1px solid "+(stageFilter===s?G+"50":T.border),color:stageFilter===s?G:T.muted,whiteSpace:"nowrap"}}>{s}</button>;})}
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
function AskClaude() {
  var QUICK = [
    "Who should I call today?",
    "Who has been stuck in Connected the longest?",
    "Draft a follow-up message for Paolo Casarella",
    "Who are my strongest fit call candidates?",
    "Who hasn't had any activity logged?",
    "Give me a status report on Ben Chavez and Sayeed Chowdhury",
    "Who should I invite to the Experience Event first?",
    "Draft a LinkedIn message inviting someone to a fit call",
  ];

  var [input, setInput]   = useState("");
  var [loading, setLoading] = useState(false);
  var [messages, setMessages] = useState([
    {role:"assistant", text:"Good morning, Dalen. I have your full pipeline loaded — 73 contacts across all stages. Ask me anything about who to call, what to say, or what needs attention today."}
  ]);

  async function ask(q) {
    var question = q || input.trim();
    if (!question) return;
    setInput("");
    setMessages(function(prev){ return prev.concat([{role:"user", text:question}]); });
    setLoading(true);
    try {
      var res = await fetch("/api/ask-claude", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({question:question})
      });
      var data = await res.json();
      setMessages(function(prev){ return prev.concat([{role:"assistant", text:data.answer||data.error||"No response"}]); });
    } catch(e) {
      setMessages(function(prev){ return prev.concat([{role:"assistant", text:"Error: "+e.message}]); });
    }
    setLoading(false);
  }

  function handleKey(e) {
    if(e.key==="Enter" && !e.shiftKey) { e.preventDefault(); ask(); }
  }

  return (
    <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden",fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,serif"}}>
      {/* Header */}
      <div style={{padding:"20px 28px 16px",borderBottom:"1px solid rgba(255,255,255,0.06)",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:4}}>
          <div style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg,rgba(240,200,74,0.2),rgba(240,200,74,0.05))",border:"1px solid rgba(240,200,74,0.4)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>★</div>
          <h2 style={{fontSize:20,fontWeight:600,color:"#e8f2ff",margin:0}}>Ask Claude</h2>
          <span style={{fontSize:10,color:"#2ecc71",letterSpacing:2,textTransform:"uppercase",padding:"2px 8px",background:"rgba(46,204,113,0.08)",border:"1px solid rgba(46,204,113,0.2)",borderRadius:10}}>Live Pipeline</span>
        </div>
        <div style={{fontSize:12,color:"#7a9bb8"}}>Natural language access to your full CFO Circle LA pipeline</div>
      </div>

      {/* Quick questions */}
      <div style={{padding:"12px 28px",borderBottom:"1px solid rgba(255,255,255,0.06)",flexShrink:0,display:"flex",gap:7,flexWrap:"wrap"}}>
        {QUICK.map(function(q){
          return <button key={q} onClick={function(){ask(q);}} style={{padding:"5px 12px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",color:"#7a9bb8",borderRadius:16,cursor:"pointer",fontSize:11,fontFamily:"inherit",whiteSpace:"nowrap",transition:"all 0.15s"}}
            onMouseOver={function(e){e.target.style.borderColor="rgba(240,200,74,0.4)";e.target.style.color="#f0c84a";}}
            onMouseOut={function(e){e.target.style.borderColor="rgba(255,255,255,0.08)";e.target.style.color="#7a9bb8";}}
          >{q}</button>;
        })}
      </div>

      {/* Messages */}
      <div style={{flex:1,overflowY:"auto",padding:"20px 28px",display:"flex",flexDirection:"column",gap:16}}>
        {messages.map(function(msg, i){
          var isUser = msg.role==="user";
          return (
            <div key={i} style={{display:"flex",gap:12,alignItems:"flex-start",flexDirection:isUser?"row-reverse":"row"}}>
              <div style={{width:30,height:30,borderRadius:"50%",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:600,
                background:isUser?"linear-gradient(135deg,#1a3a5c,#0f2235)":"linear-gradient(135deg,rgba(240,200,74,0.2),rgba(240,200,74,0.05))",
                border:isUser?"1px solid rgba(240,200,74,0.3)":"1px solid rgba(240,200,74,0.4)",
                color:"#f0c84a",marginTop:2}}>
                {isUser?"DL":"★"}
              </div>
              <div style={{maxWidth:"80%",background:isUser?"rgba(255,255,255,0.04)":"rgba(240,200,74,0.04)",border:"1px solid "+(isUser?"rgba(255,255,255,0.08)":"rgba(240,200,74,0.12)"),borderRadius:isUser?"12px 4px 12px 12px":"4px 12px 12px 12px",padding:"12px 16px"}}>
                <div style={{fontSize:13,color:"#d8eeff",lineHeight:1.8,whiteSpace:"pre-wrap"}}>{msg.text}</div>
              </div>
            </div>
          );
        })}
        {loading?<div style={{display:"flex",gap:12,alignItems:"center"}}>
          <div style={{width:30,height:30,borderRadius:"50%",background:"linear-gradient(135deg,rgba(240,200,74,0.2),rgba(240,200,74,0.05))",border:"1px solid rgba(240,200,74,0.4)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"#f0c84a"}}>★</div>
          <div style={{display:"flex",gap:5,padding:"12px 16px",background:"rgba(240,200,74,0.04)",border:"1px solid rgba(240,200,74,0.12)",borderRadius:"4px 12px 12px 12px"}}>
            {[0,1,2].map(function(n){return <div key={n} style={{width:6,height:6,borderRadius:"50%",background:"#f0c84a",opacity:0.6,animation:"pulse 1s ease-in-out "+n*0.2+"s infinite"}}/>;})}
          </div>
        </div>:null}
      </div>

      {/* Input */}
      <div style={{padding:"16px 28px",borderTop:"1px solid rgba(255,255,255,0.06)",flexShrink:0,display:"flex",gap:10}}>
        <textarea
          value={input}
          onChange={function(e){setInput(e.target.value);}}
          onKeyDown={handleKey}
          placeholder="Ask anything about your pipeline... (Enter to send)"
          rows={2}
          style={{flex:1,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.1)",color:"#e8f2ff",padding:"10px 14px",borderRadius:8,fontSize:13,outline:"none",fontFamily:"inherit",resize:"none",lineHeight:1.6}}
        />
        <button onClick={function(){ask();}} disabled={loading||!input.trim()} style={{padding:"10px 18px",background:input.trim()?"rgba(240,200,74,0.15)":"rgba(255,255,255,0.03)",border:"1px solid "+(input.trim()?"rgba(240,200,74,0.4)":"rgba(255,255,255,0.08)"),color:input.trim()?"#f0c84a":"#3a5a74",borderRadius:8,cursor:input.trim()?"pointer":"default",fontSize:18,fontWeight:700,alignSelf:"stretch",minWidth:48}}>→</button>
      </div>
    </div>
  );
}

export default function CFOCircleApp() {
  var [screen,setScreen]             = useState("dashboard");
  var [selectedContact,setContact]   = useState(null);
  var [totalContacts,setTotal]       = useState(0);
  var [stageCounts,setStageCounts]   = useState({});
  var [statsLoading,setStatsLoading] = useState(true);

  useEffect(function(){loadStats();},[]);



  async function loadStats(){
    setStatsLoading(true);
    try{
      var rows=await sbFetch("/contacts?select=pipeline_stage");
      var counts={};var tot=0;
      (Array.isArray(rows)?rows:[]).forEach(function(r){var s=r.pipeline_stage||"Unknown";counts[s]=(counts[s]||0)+1;tot++;});
      setStageCounts(counts);setTotal(tot);
    }catch(e){console.error("Stats error:",e);}
    setStatsLoading(false);
  }

  function navigate(s,contact){setScreen(s);if(contact)setContact(contact);}

  var NAV=[{id:"dashboard",icon:"⌂",label:"Dashboard"},{id:"pipeline",icon:"◎",label:"Pipeline",badge:statsLoading?"…":String(totalContacts)},{id:"events",icon:"✦",label:"Events",badge:"0"},{id:"templates",icon:"✉",label:"Templates"},{id:"claude",icon:"★",label:"Ask Claude"}];

  var screenLabel={dashboard:"Dashboard",pipeline:"Pipeline",events:"Events",templates:"Templates",claude:"Ask Claude",profile:selectedContact?((selectedContact.first_name||"")+" "+(selectedContact.last_name||"")):"Contact",stalliant:"Stalliant Prospects"}[screen]||screen;

  return (
    <div style={{display:"flex",height:"100vh",width:"100%",overflow:"hidden",background:BG,fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,serif",color:T.text}}>

      {/* LEFT RAIL */}
      <div style={{width:220,background:T.rail,flexShrink:0,borderRight:"1px solid "+T.border,display:"flex",flexDirection:"column",padding:"0 10px"}}>
        <div style={{padding:"20px 6px 16px",borderBottom:"1px solid "+T.border,marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:32,height:32,borderRadius:"50%",border:"1.5px solid "+G+"60",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <div style={{width:18,height:18,borderRadius:"50%",border:"1.5px solid "+G+"60",position:"relative"}}>
                <div style={{position:"absolute",bottom:-4,right:-7,width:10,height:10,borderRadius:"50%",border:"1.5px solid "+G+"60",background:T.rail}}/>
              </div>
            </div>
            <div><div style={{fontSize:13,fontWeight:700,color:G,letterSpacing:2,textTransform:"uppercase",lineHeight:1}}>CFO Circle</div><div style={{fontSize:9,color:T.dim,letterSpacing:1.5,textTransform:"uppercase",marginTop:2}}>Los Angeles</div></div>
          </div>
        </div>
        <div style={{flex:1,display:"flex",flexDirection:"column",gap:2}}>
          {NAV.map(function(n){return <NavItem key={n.id} icon={n.icon} label={n.label} badge={n.badge} active={screen===n.id} onClick={function(){navigate(n.id);}}/>;  })}
          <div style={{margin:"14px 6px 8px",fontSize:9,color:T.dim,letterSpacing:2,textTransform:"uppercase"}}>Stalliant</div>
          <NavItem icon="★" label="Prospects" badge="12" active={screen==="stalliant"} onClick={function(){navigate("stalliant");}}/>
        </div>
        <div style={{borderTop:"1px solid "+T.border,padding:"14px 6px",display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:30,height:30,borderRadius:"50%",background:"linear-gradient(135deg,#1a3a5c,#0f2235)",border:"1px solid "+G+"30",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:600,color:G,flexShrink:0}}>DL</div>
          <div style={{minWidth:0}}><div style={{fontSize:12,color:T.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>Dalen Lawrence</div><div style={{fontSize:10,color:T.dim}}>Chapter Director</div></div>
          <button style={{background:"transparent",border:"none",color:T.dim,cursor:"pointer",fontSize:14,padding:"2px",flexShrink:0}}>⚙</button>
        </div>
      </div>

      {/* CONTENT */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:BG2}}>
        <div style={{height:48,borderBottom:"1px solid "+T.border,display:"flex",alignItems:"center",padding:"0 24px",flexShrink:0,background:BG,gap:10}}>
          {screen==="profile"&&<button onClick={function(){navigate("pipeline");}} style={{background:"transparent",border:"none",color:T.blue,cursor:"pointer",fontSize:13,padding:0,marginRight:8}}>← Pipeline</button>}
          <div style={{fontSize:13,color:T.muted,flex:1}}>{screenLabel}</div>
          <div style={{display:"flex",gap:7,alignItems:"center"}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:T.green,boxShadow:"0 0 6px "+T.green}}/>
            <span style={{fontSize:10,color:T.dim,letterSpacing:1,textTransform:"uppercase"}}>Live · Supabase</span>
          </div>
        </div>
        <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
          {screen==="dashboard" && <Dashboard onNavigate={navigate} totalContacts={totalContacts} stageCounts={stageCounts}/>}
          {screen==="pipeline"  && <Pipeline  onNavigate={navigate}/>}
          {screen==="profile"   && selectedContact && <ContactProfile contactId={selectedContact.id} onBack={function(){navigate("pipeline");}}/>}
          {screen==="events"    && <Placeholder icon="✦" title="Events" description="Manage your Experience Events — attendee lists, confirmations, and post-event follow-up."/>}
          {screen==="templates" && <Placeholder icon="✉" title="Templates" description="Your LinkedIn and email message library, organized by pipeline stage."/>}
          {screen==="claude"    && <AskClaude/>}
          {screen==="stalliant" && <Placeholder icon="★" title="Stalliant Prospects" description="CFO Circle contacts flagged as Stalliant prospects with signal type and revenue range."/>}
        </div>
      </div>

    </div>

  );
}
