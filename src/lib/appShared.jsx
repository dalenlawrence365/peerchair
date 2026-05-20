"use client"
import { useState, useRef, useEffect } from "react"

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
    contactType:          row.contact_type||"CFO_PROSPECT",
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
    contact_type:        d.contactType,
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
  {id:"fit_invite", label:"Fit Invite Sent",date:"",                   stage:"Fit Invite Sent"},
  {id:"fit_sched",  label:"Fit Scheduled",  date:"fitCallDate",         stage:"Fit Call Scheduled"},
  {id:"fit_done",   label:"Fit Completed",  date:"fitCallDate",         stage:"Fit Call Completed"},
  {id:"waitlist",   label:"Event Waitlist", date:"eventWaitlistDate",   stage:"Event Waitlist"},
  {id:"event_inv",  label:"Event Invited",  date:"eventInvitedDate",    stage:"Event Invited"},
  {id:"event_conf", label:"Event Confirmed",date:"eventInvitedDate",    stage:"Event Confirmed"},
  {id:"event_att",  label:"Attended",       date:"eventAttended",       stage:"Event Attended"},
  {id:"memb_convo", label:"Memb. Convo",    date:"membershipConvoDate", stage:"Membership Conversation Scheduled"},
  {id:"verbal",     label:"Verbal Commit",  date:"verbalCommitmentDate",stage:"Verbal Commitment"},
  {id:"member",     label:"Active Member",  date:"membershipStartDate", stage:"Active Member"},
];

// Stage → Journey node index (primary driver of Circle Journey display)
// Indices correspond to JOURNEY array positions (0-based)
var STAGE_TO_NODE = {
  "Connected":0,"Engaged":0,"Requested":0,
  "Fit Invite Sent":1,
  "Fit Call Scheduled":2,
  "Fit Call Completed":3,"Strong Fit":3,"Possible Fit":3,"Bad Timing":3,
  "Event Waitlist":4,
  "Event Invited":5,
  "Event Confirmed":6,
  "Event Attended":7,"No Show":7,
  "Membership Conversation Scheduled":8,"Membership Conversation Completed":8,
  "Verbal Commitment":9,
  "Active Member":10
};
var CHAPTERS = ["Los Angeles","San Fernando Valley"];
var SOURCES  = ["LinkedIn / HeyReach","Sponsor","Networking","Referral"];
var CONTACT_TYPES = ["CFO_PROSPECT","SPONSOR_CONTACT","REFERRAL_PARTNER"];
var PIPELINE = ["Target","Requested","Connected","Engaged","Fit Invite Sent","Fit Call Scheduled","Fit Call Completed","Strong Fit","Possible Fit","Bad Timing","Not a Fit","Event Waitlist","Event Invited","Event Confirmed","Event Attended","No Show","Membership Conversation Scheduled","Membership Conversation Completed","Verbal Commitment","Active Member","Lost — Bad Timing","Lost — Not a Fit","Reserve Pool"];
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
  if (s==="Fit Invite Sent") return T.orange;
  if (s==="Event Waitlist") return "#9b59b6";
  if (["Lost — Not a Fit","Not a Fit"].indexOf(s)>-1) return T.red;
  if (["Bad Timing","Lost — Bad Timing","Reserve Pool","No Show","Stalled"].indexOf(s)>-1) return T.orange;
  if (s==="No Reply / Reserve") return T.dim;
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
    <div style={{padding:"8px 0 16px",overflowX:"auto",overflowY:"hidden"}}>
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

      <div style={{position:"relative",display:"flex",alignItems:"flex-start",minWidth:500,paddingTop:4,paddingBottom:4}}>
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

async function SBpatch(table, id, data) {
  return sbFetch('/'+table+'?id=eq.'+id, {method:'PATCH', body:JSON.stringify(data)})
}

export { sbFetch, SBpatch, dbToLocal, localToDb }
export { G, BG, BG2, BG3, T }
export { JOURNEY, STAGE_TO_NODE, CHAPTERS, SOURCES, CONTACT_TYPES, PIPELINE, STATUSES, OUTCOMES, OWNERSHIP, RPT, IND, REV, EMP, FIN, PRESSURE, CUES, FLAGS, MEMB_T }
export { stageColor, chColor, chIcon }
export { Pill, Avatar, NavItem, HRPopup, Drawer, DField, DSelect, DMulti, Section, FL, FV, Grid2, Tags, CircleJourney }
