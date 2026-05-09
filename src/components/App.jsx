"use client"
import Sponsors from "@/components/Sponsors";
import FollowUp from "@/components/FollowUp";
import LinkedInMessages from "@/components/LinkedInMessages";
import SmartCommand from "@/components/SmartCommand";
import Files from "@/components/Files";
import EmailMessages from "@/components/EmailMessages";
import Templates from "@/components/Templates";
import Meetings from "@/components/Meetings";
import SponsorCompanion from "@/components/SponsorCompanion";
import LiveCallCompanion from "@/components/LiveCallCompanion";
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
  {id:"fit_invite", label:"Fit Invite Sent",date:"",                   stage:"Fit Invite Sent"},
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
  "Fit Invite Sent":1,
  "Fit Call Scheduled":2,
  "Fit Call Completed":3,"Strong Fit":3,"Possible Fit":3,"Bad Timing":3,
  "Event Waitlist":4,
  "Event Invited":5,
  "Event Confirmed":5,
  "Event Attended":6,"No Show":6,
  "Membership Conversation Scheduled":7,"Membership Conversation Completed":7,
  "Verbal Commitment":8,
  "Active Member":9
};
var CHAPTERS = ["Los Angeles","San Fernando Valley"];
var SOURCES  = ["LinkedIn / HeyReach","Sponsor","Networking","Referral"];
var PIPELINE = ["Target","Requested","Connected","Engaged","Fit Invite Sent","Fit Call Scheduled","Fit Call Completed","Strong Fit","Possible Fit","Bad Timing","Not a Fit","Event Invited","Event Confirmed","Event Attended","No Show","Membership Conversation Scheduled","Membership Conversation Completed","Verbal Commitment","Active Member","Lost — Bad Timing","Lost — Not a Fit","Reserve Pool"];
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

  var sc = stageColor(data.pipelineStage);
  var channels = ["All","LinkedIn","Email","Phone","Calendly","App","Note"];
  // Tab definitions including new communication tabs
  var profileTabs = ["summary","linkedin","email","timeline","notes"];
  var filtered = comms
    .filter(function(c){ return c.body && c.channel && c.direction; })
    .filter(function(c){ return tlFilter==="All" || c.channel===tlFilter; });

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,serif",color:T.text}}>

      {/* PROFILE HEADER */}
      <div style={{background:"linear-gradient(135deg,#0f1e30 0%,#132840 60%,#0f1a28 100%)",borderBottom:"1px solid "+G+"18",padding:"16px 24px",flexShrink:0,position:"relative"}}>
        {saveMsg?<div style={{position:"absolute",top:12,right:20,fontSize:11,color:saveMsg==="Saved"?T.green:T.red,letterSpacing:1}}>{saveMsg}</div>:null}
        <div style={{display:"flex",gap:16,alignItems:"flex-start"}}>
          <Avatar first={data.firstName} last={data.lastName} size={52} imageUrl={data.linkedinImageUrl}/>
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
            {[["🔴 Start Fit Call",T.gold],["📅 Schedule Fit Call",G],["✉ Send Assessment",T.blue],["📨 Event Invite",T.purple],["✎ Add Note",T.green],["📋 Reserve Pool",T.orange]].map(function(item){
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
                <div style={{fontSize:10,color:"#3a5a74",letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Context Loaded</div>
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
                    contact={data.id ? {id:data.id, firstName:data.firstName, lastName:data.lastName, company:data.company, type:"CFO_PROSPECT"} : null}
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
function SponsorMetrics(props) {
  var counts = props.stageCounts || {};
  var onStartDiscovery = props.onStartDiscovery;
  var [openStage, setOpenStage] = useState(null);
  var [stageDeals, setStageDeals] = useState([]);
  var [loadingDeals, setLoadingDeals] = useState(false);

  function loadStageDeals(stage) {
    if (openStage === stage) { setOpenStage(null); setStageDeals([]); return; }
    setOpenStage(stage);
    setLoadingDeals(true);
    var SBU = process.env.NEXT_PUBLIC_SUPABASE_URL;
    var SBK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    var h = {"apikey":SBK,"Authorization":"Bearer "+SBK};
    fetch(SBU+"/rest/v1/sponsor_deals?stage=eq."+encodeURIComponent(stage)+"&select=id,group_name,stage,category_seat,company_id&limit=50", {headers:h})
      .then(function(r){return r.json();})
      .then(function(deals){
        if (!Array.isArray(deals)) { setLoadingDeals(false); return; }
        var ids = deals.map(function(d){return d.company_id;}).filter(Boolean);
        if (ids.length === 0) { setStageDeals([]); setLoadingDeals(false); return; }
        fetch(SBU+"/rest/v1/sponsor_companies?id=in.("+ids.join(",")+")"+"&select=id,name,category,host_viable,host_tier&limit=50", {headers:h})
          .then(function(r){return r.json();})
          .then(function(companies){
            fetch(SBU+"/rest/v1/sponsor_contacts?company_id=in.("+ids.join(",")+")"+"&select=id,full_name,title,email,company_id&order=created_at.asc&limit=100", {headers:h})
              .then(function(r){return r.json();})
              .then(function(contacts){
                var enriched = deals.map(function(deal){
                  var co = (Array.isArray(companies)?companies:[]).find(function(c){return c.id===deal.company_id;}) || {};
                  var primaryContact = (Array.isArray(contacts)?contacts:[]).find(function(ct){return ct.company_id===deal.company_id;}) || null;
                  return Object.assign({},deal,{company:co,primaryContact:primaryContact});
                });
                setStageDeals(enriched);
                setLoadingDeals(false);
              });
          });
      })
      .catch(function(e){console.error(e);setLoadingDeals(false);});
  }

  var items = [
    {label:"Discovery Sched.",stage:"Discovery Scheduled",val:(counts["Discovery Scheduled"]||0),color:"#9b59b6",clickable:true},
    {label:"Discovery Done",stage:"_discoveryDone",val:(counts["_discoveryDone"]||0),color:"#7b2fbe",clickable:false},
    {label:"Proposal Sent",stage:"Proposal Sent",val:(counts["Proposal Sent"]||0),color:"#4a9eba",clickable:false},
    {label:"Committed",stage:"Verbal Commitment",val:(counts["Verbal Commitment"]||0),color:"#f0c84a",clickable:false},
    {label:"Active Sponsors",stage:"Active",val:(counts["Active"]||0),color:"#2ecc71",clickable:false},
  ];

  return (
    <div style={{marginBottom:16}}>
      <div style={{display:"flex",gap:10}}>
        {items.map(function(item){
          var isOpen = openStage === item.stage;
          return (
            <div key={item.label} onClick={function(){if(item.clickable)loadStageDeals(item.stage);}}
              style={{flex:1,background:isOpen?item.color+"14":BG3,border:"1px solid "+(isOpen?item.color+"50":item.color+"25"),borderTop:"2px solid "+item.color+(isOpen?"":"70"),borderRadius:7,padding:"10px 12px",cursor:item.clickable?"pointer":"default",transition:"all 0.15s"}}>
              <div style={{fontSize:10,color:item.color,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>{item.label}</div>
              <div style={{fontSize:24,fontWeight:700,color:item.color}}>{item.val}</div>
              {item.clickable&&<div style={{fontSize:9,color:T.dim,marginTop:2}}>click for list</div>}
            </div>
          );
        })}
      </div>

      {openStage&&<div style={{background:BG3,border:"1px solid "+T.border,borderRadius:7,padding:"14px 18px",marginTop:10}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div style={{fontSize:12,fontWeight:600,color:"#9b59b6"}}>{openStage} — {stageDeals.length} {stageDeals.length===1?"company":"companies"}</div>
          <div onClick={function(){setOpenStage(null);setStageDeals([]);}} style={{cursor:"pointer",color:T.dim,fontSize:16}}>x</div>
        </div>
        {loadingDeals&&<div style={{fontSize:12,color:T.dim}}>Loading...</div>}
        {!loadingDeals&&stageDeals.length===0&&<div style={{fontSize:12,color:T.dim}}>No companies in this stage.</div>}
        {stageDeals.map(function(deal){
          var co = deal.company || {};
          var ct = deal.primaryContact;
          return (
            <div key={deal.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",background:"rgba(255,255,255,0.02)",border:"1px solid "+T.border,borderRadius:6,marginBottom:8}}>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:T.text}}>{co.name||"Unknown"}</div>
                <div style={{fontSize:11,color:T.muted}}>{co.category||""} · {deal.group_name}</div>
                {ct&&<div style={{fontSize:11,color:T.dim,marginTop:2}}>{ct.full_name} — {ct.title}</div>}
              </div>
              {openStage==="Discovery Scheduled"&&<button
                onClick={function(){
                  if(onStartDiscovery){
                    var contact = ct ? Object.assign({},ct,{company:co.name,company_id:co.id,category:co.category}) : {company:co.name,company_id:co.id,category:co.category};
                    onStartDiscovery(co, contact, deal);
                  }
                }}
                style={{padding:"6px 14px",background:"rgba(155,89,182,0.15)",border:"1px solid rgba(155,89,182,0.4)",color:"#9b59b6",borderRadius:5,cursor:"pointer",fontSize:12,fontWeight:600,flexShrink:0}}>
                Start Call
              </button>}
            </div>
          );
        })}
      </div>}
    </div>
  );
}

function Dashboard({onNavigate,totalContacts,stageCounts,sponsorStageCounts,pipelineTotal,fitCallContacts,onStartFitCall,onNavigateToBucket,onStartDiscovery}) {
  var [openBucket,setOpenBucket] = useState(null);
  var [bucketContacts,setBucketContacts] = useState([]);
  var [bucketLoading,setBucketLoading] = useState(false);
  var [snapshots,setSnapshots] = useState([]);
  var [hrStats,setHrStats] = useState({sent:187,accepted:63,msgSent:65,replies:22,acceptRate:34,replyRate:34,campaigns:[]});
  var [meetingStats,setMeetingStats] = useState(null);

  useEffect(function(){ loadSnapshots(); loadHeyReach(); loadMeetingStats(); },[]);

  async function loadMeetingStats(){
    try{
      var res=await fetch("/api/meeting-stats");
      if(res.ok){var d=await res.json();setMeetingStats(d);}
    }catch(e){ console.warn("meeting stats error",e.message); }
  }

  async function loadHeyReach(){
    try{
      var res=await fetch("/api/heyreach-stats");
      if(res.ok){var d=await res.json();setHrStats(d);}
    }catch(e){
      // Fall back to cached values
      setHrStats({sent:187,accepted:63,msgSent:65,replies:22,acceptRate:34,replyRate:34});
    }
  }

  async function loadSnapshots(){
    try{
      var SBU=process.env.NEXT_PUBLIC_SUPABASE_URL;
      var SBK=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      var h={"apikey":SBK,"Authorization":"Bearer "+SBK};
      var res=await fetch(SBU+"/rest/v1/pipeline_snapshots?order=snapshot_date.asc&limit=12",{headers:h});
      var data=await res.json();
      setSnapshots(Array.isArray(data)?data:[]);
    }catch(e){console.error(e);}
  }

  async function loadBucket(stages,label){
    if(openBucket===label){setOpenBucket(null);setBucketContacts([]);return;}
    setOpenBucket(label);setBucketLoading(true);
    try{
      var SBU=process.env.NEXT_PUBLIC_SUPABASE_URL;
      var SBK=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      var h={"apikey":SBK,"Authorization":"Bearer "+SBK};
      var stageList=stages.map(function(s){return encodeURIComponent(s);}).join(",");
      var res=await fetch(SBU+"/rest/v1/contacts?pipeline_stage=in.("+stageList+")&select=id,first_name,last_name,title,company_name,pipeline_stage&order=last_name.asc&limit=100",{headers:h});
      var data=await res.json();
      setBucketContacts(Array.isArray(data)?data:[]);
    }catch(e){console.error(e);}
    setBucketLoading(false);
  }
  var [showFitCallList,setShowFitCallList] = useState(false);
  var today=new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"});

  var pStages=[{label:"Target",color:T.dim},{label:"Connected",color:T.blue},{label:"Fit Scheduled",color:T.gold},{label:"Fit Completed",color:T.gold},{label:"Strong Fit",color:T.green},{label:"Event Invited",color:T.purple},{label:"Active Member",color:T.green},{label:"Reserve Pool",color:T.dim}];
  function getCount(label){if(label==="Fit Scheduled")return stageCounts["Fit Call Scheduled"]||0;if(label==="Fit Completed")return stageCounts["Fit Call Completed"]||0;return stageCounts[label]||0;}
  return (
    <div style={{padding:"28px 32px",overflowY:"auto",flex:1}}>
      <div style={{marginBottom:24}}>
        <div style={{fontSize:11,color:T.muted,letterSpacing:3,textTransform:"uppercase",marginBottom:6}}>{today}</div>
        <h1 style={{fontSize:26,fontWeight:600,color:T.text,margin:0}}>{(function(){var h=new Date().getHours();return h<12?"Good morning":h<17?"Good afternoon":"Good evening";})()}, Dalen.</h1>
        <div style={{fontSize:14,color:T.muted,marginTop:4}}>Here's where things stand with your Los Angeles chapter.</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:14,marginBottom:16}}>
        {[{label:"Days to Next Event",val:"—",sub:"no event scheduled",color:T.purple,icon:"✦",action:null},{label:"Active Members",val:String(getCount("Active Member")||0),sub:"in chapter",color:T.green,icon:"★",action:function(){navigate("pipeline");}}].map(function(k){
          return <div key={k.label} onClick={k.action||undefined} style={{background:BG3,border:"1px solid "+T.border,borderTop:"2px solid "+k.color+"40",borderRadius:8,padding:"18px 20px",cursor:k.action?"pointer":"default",transition:"all 0.15s"}}
            onMouseOver={function(e){if(k.action)e.currentTarget.style.borderColor=k.color+"40";}}
            onMouseOut={function(e){if(k.action)e.currentTarget.style.borderColor=T.border;}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
              <div style={{fontSize:11,color:T.muted,letterSpacing:1.5,textTransform:"uppercase"}}>{k.label}</div>
              <span style={{fontSize:16,color:k.color+"60"}}>{k.icon}</span>
            </div>
            <div style={{fontSize:32,fontWeight:700,color:k.color,lineHeight:1,marginBottom:5}}>{k.val}</div>
            <div style={{fontSize:11,color:T.dim}}>{k.sub}</div>
          </div>;
        })}
      </div>

        {/* SPONSOR DISCOVERY METRICS */}
        <SponsorMetrics stageCounts={sponsorStageCounts} onStartDiscovery={onStartDiscovery}/>

        {/* HEYREACH OUTREACH FUNNEL */}
        <div style={{background:BG3,border:"1px solid "+T.border,borderRadius:8,padding:"14px 18px",marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <div style={{fontSize:11,color:G,letterSpacing:2,textTransform:"uppercase",fontWeight:600}}>LinkedIn Outreach Funnel</div>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              {hrStats.campaigns && hrStats.campaigns.map(function(camp){
                var isActive = camp.status === "IN_PROGRESS";
                var isPaused = camp.status === "PAUSED";
                var color = isActive ? T.green : isPaused ? T.orange : T.dim;
                var statusLabel = isActive ? "Active" : isPaused ? "Paused" : camp.status;
                var shortName = camp.name.replace("CFO Circle - ","").replace("Los Angeles ","LA ");
                return (
                  <div key={camp.id} style={{display:"flex",alignItems:"center",gap:4}}>
                    <div style={{width:6,height:6,borderRadius:"50%",background:color,boxShadow:isActive?"0 0 4px "+color:"none"}}/>
                    <span style={{fontSize:10,color:color}}>{shortName} — {statusLabel}</span>
                    <span style={{fontSize:9,color:T.dim}}>({camp.inProgress} active)</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10}}>
            {[
              {label:"Requests Sent",val:hrStats.sent,color:T.muted,sub:null},
              {label:"Connected",val:hrStats.accepted,color:T.blue,sub:hrStats.sent>0?Math.round((hrStats.accepted/hrStats.sent)*100)+"%":"-"},
              {label:"Messages Sent",val:hrStats.msgSent,color:T.purple,sub:"Step 2"},
              {label:"Replies",val:hrStats.replies,color:G,sub:hrStats.msgSent>0?Math.round((hrStats.replies/hrStats.msgSent)*100)+"%":"-"},
              {label:"Fit Calls",val:fitCallContacts.length,color:T.green,sub:"scheduled"},
            ].map(function(item){
              return (
                <div key={item.label} style={{textAlign:"center",padding:"10px 6px",background:"rgba(255,255,255,0.02)",border:"1px solid "+T.border,borderRadius:6}}>
                  <div style={{fontSize:24,fontWeight:700,color:item.color,lineHeight:1,marginBottom:4}}>{item.val}</div>
                  {item.sub&&<div style={{fontSize:11,color:item.color,marginBottom:4,fontWeight:600}}>{item.sub}</div>}
                  <div style={{fontSize:9,color:T.dim,letterSpacing:1,textTransform:"uppercase"}}>{item.label}</div>
                </div>
              );
            })}
          </div>
          <div style={{display:"flex",gap:8,marginTop:10,alignItems:"center"}}>
            <div style={{height:4,flex:hrStats.sent,background:T.muted+"60",borderRadius:2}}/>
            <div style={{height:4,flex:hrStats.accepted,background:T.blue+"80",borderRadius:2}}/>
            <div style={{height:4,flex:hrStats.msgSent,background:T.purple+"80",borderRadius:2}}/>
            <div style={{height:4,flex:hrStats.replies,background:G+"80",borderRadius:2}}/>
            <div style={{height:4,flex:Math.max(fitCallContacts.length,1),background:T.green+"80",borderRadius:2}}/>
          </div>
        </div>

        {/* PIPELINE HEALTH ROW */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr 1fr",gap:10,marginBottom:16}}>
          {/* Active Pipeline — hero metric */}
          <div style={{background:BG3,border:"1px solid "+G+"30",borderTop:"2px solid "+G,borderRadius:7,padding:"12px 14px",gridColumn:"span 1"}}>
            <div style={{fontSize:10,color:G,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4,fontWeight:600}}>Active Pipeline</div>
            <div style={{fontSize:32,fontWeight:700,color:G,lineHeight:1,marginBottom:4}}>{pipelineTotal}</div>
            {snapshots.length>=2&&<div style={{fontSize:10,color:snapshots[snapshots.length-1].active_pipeline_count>snapshots[snapshots.length-2].active_pipeline_count?T.green:T.red}}>{snapshots[snapshots.length-1].active_pipeline_count>snapshots[snapshots.length-2].active_pipeline_count?"▲":"▼"} {Math.abs(snapshots[snapshots.length-1].active_pipeline_count-(snapshots[snapshots.length-2]?snapshots[snapshots.length-2].active_pipeline_count:0))} vs last snapshot</div>}
          </div>
          {/* Pipeline Trend — sparkline with context */}
          <div style={{background:BG3,border:"1px solid "+T.border,borderRadius:7,padding:"12px 14px",display:"flex",flexDirection:"column",gap:6}}>
            <div style={{fontSize:10,color:T.muted,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600}}>Pipeline Trend</div>
            {(function(){
              if(snapshots.length===0) return <div style={{fontSize:11,color:T.dim,marginTop:4}}>First snapshot taken today</div>;
              var first=snapshots[0]; var last=snapshots[snapshots.length-1];
              var delta=last.active_pipeline_count-(first.active_pipeline_count||0);
              var days=Math.round((new Date(last.snapshot_date)-new Date(first.snapshot_date))/86400000)||1;
              var perWeek=Math.round((delta/days)*7);
              var maxVal=Math.max.apply(null,snapshots.map(function(s){return s.active_pipeline_count;}));
              return <>
                <div style={{display:"flex",alignItems:"baseline",gap:8}}>
                  <span style={{fontSize:11,color:delta>=0?T.green:T.red,fontWeight:700}}>{delta>=0?"+":""}{delta}</span>
                  <span style={{fontSize:10,color:T.dim}}>since {first.snapshot_date}</span>
                  {snapshots.length>=3&&<span style={{fontSize:10,color:delta>=0?T.green:T.red}}>{perWeek>=0?"+":""}{perWeek}/wk</span>}
                </div>
                <div style={{display:"flex",alignItems:"flex-end",gap:2,height:36,marginTop:2}}>
                  {snapshots.map(function(snap,i){
                    var h=maxVal>0?Math.max(3,Math.round((snap.active_pipeline_count/maxVal)*36)):3;
                    var isLast=i===snapshots.length-1;
                    return <div key={snap.snapshot_date} title={snap.snapshot_date+": "+snap.active_pipeline_count+" active"} style={{flex:1,height:h,background:isLast?G:G+"45",borderRadius:"2px 2px 0 0",cursor:"default"}}/>;
                  })}
                </div>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:8,color:T.dim}}>{first.snapshot_date}</span>
                  <span style={{fontSize:8,color:T.dim}}>today</span>
                </div>
              </>;
            })()}
          </div>
          {/* Off-pipeline buckets */}
          {[
            {label:"Opted Out",stages:["Opted Out"],color:T.red},
            {label:"Not a Fit",stages:["Not a Fit","Lost — Not a Fit"],color:T.orange},
            {label:"No Reply / Reserve",stages:["Reserve Pool","No Reply/Reserve","No Reply / Reserve"],color:T.muted},
            {label:"Stalled",stages:["Stalled"],color:T.orange},
            {label:"Total Contacts",stages:null,color:T.blue},
          ].map(function(bucket){
            var count=bucket.stages?bucket.stages.reduce(function(sum,s){return sum+(stageCounts[s]||0);},0):totalContacts;
            var isOpen=openBucket===bucket.label;
            return (
              <div key={bucket.label} onClick={function(){if(bucket.stages)loadBucket(bucket.stages,bucket.label);}}
                style={{background:isOpen?bucket.color+"12":BG3,border:"1px solid "+(isOpen?bucket.color+"50":bucket.color+"25"),borderTop:"2px solid "+bucket.color+(isOpen?"":"80"),borderRadius:7,padding:"12px 14px",cursor:bucket.stages?"pointer":"default",transition:"all 0.15s"}}>
                <div style={{fontSize:10,color:bucket.color,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4,fontWeight:600}}>{bucket.label}</div>
                <div style={{fontSize:28,fontWeight:700,color:bucket.color,lineHeight:1}}>{count}</div>
                {bucket.stages&&<div style={{fontSize:9,color:T.dim,marginTop:4}}>{isOpen?"click to close":"click for list"}</div>}
              </div>
            );
          })}
        </div>

        {/* Bucket drill-down list */}
        {openBucket&&<div style={{background:BG3,border:"1px solid "+T.border,borderRadius:7,padding:"14px 18px",marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <div style={{fontSize:12,fontWeight:600,color:T.text}}>{openBucket}</div>
            <div onClick={function(){setOpenBucket(null);setBucketContacts([]);}} style={{cursor:"pointer",color:T.dim,fontSize:16}}>✕</div>
          </div>
          {bucketLoading&&<div style={{fontSize:12,color:T.dim}}>Loading...</div>}
          {!bucketLoading&&bucketContacts.length===0&&<div style={{fontSize:12,color:T.dim}}>No contacts in this bucket.</div>}
          {!bucketLoading&&bucketContacts.map(function(ct){
            return (
              <div key={ct.id} onClick={function(){onNavigate("profile",ct);}} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 10px",borderBottom:"1px solid "+T.border,cursor:"pointer"}}
                onMouseOver={function(e){e.currentTarget.style.background="rgba(255,255,255,0.03)";}}
                onMouseOut={function(e){e.currentTarget.style.background="transparent";}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600,color:G}}>{ct.first_name} {ct.last_name}</div>
                  <div style={{fontSize:11,color:T.muted}}>{ct.title}{ct.company_name?" · "+ct.company_name:""}</div>
                </div>
                <div style={{fontSize:10,color:T.dim}}>{ct.pipeline_stage}</div>
                <div style={{fontSize:11,color:T.dim}}>→</div>
              </div>
            );
          })}
        </div>}

        {showFitCallList&&<div style={{background:BG3,border:"1px solid "+T.gold+"40",borderRadius:8,padding:"16px 20px",marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <div style={{fontSize:12,color:T.gold,letterSpacing:2,textTransform:"uppercase",fontWeight:600}}>Fit Calls Scheduled</div>
            <div onClick={function(){setShowFitCallList(false);}} style={{cursor:"pointer",color:T.muted,fontSize:18,lineHeight:1}}>x</div>
          </div>
          {fitCallContacts.length===0&&<div style={{fontSize:13,color:T.dim,padding:"8px 0"}}>No fit calls currently scheduled.</div>}
          {fitCallContacts.map(function(ct){
            var timeStr=ct.fit_call_date?new Date(ct.fit_call_date).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",timeZone:"America/Los_Angeles"}):"Time TBD";
            var dateStr=ct.fit_call_date?new Date(ct.fit_call_date).toLocaleDateString("en-US",{month:"short",day:"numeric"}):"";
            return (
              <div key={ct.id} style={{display:"flex",alignItems:"center",gap:14,padding:"10px 14px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:6,marginBottom:8}}>
                <div style={{flex:1,cursor:"pointer"}} onClick={function(){if(onNavigate){onNavigate("profile",ct);}setShowFitCallList(false);}}>
                  <div style={{fontSize:14,fontWeight:600,color:T.gold}}>{ct.first_name} {ct.last_name}</div>
                  <div style={{fontSize:12,color:T.muted}}>{ct.company_name||""}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:14,fontWeight:700,color:T.gold}}>{timeStr}</div>
                  <div style={{fontSize:11,color:T.dim}}>{dateStr}</div>
                </div>
                <button onClick={function(){if(onStartFitCall)onStartFitCall(ct);setShowFitCallList(false);}} style={{padding:"6px 14px",background:"rgba(240,200,74,0.12)",border:"1px solid rgba(240,200,74,0.3)",borderRadius:5,fontSize:12,color:T.gold,fontWeight:600,cursor:"pointer",flexShrink:0}}>Start Call</button>
              </div>
            );
          })}
        </div>}
      {/* MEETINGS TRACKER */}
      {meetingStats&&<div style={{background:BG3,border:"1px solid "+T.border,borderRadius:8,padding:"14px 18px",marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <div style={{fontSize:11,color:G,letterSpacing:2,textTransform:"uppercase",fontWeight:600}}>Meeting Activity</div>
          <button onClick={function(){onNavigate("meetings");}} style={{fontSize:11,color:G,background:"transparent",border:"1px solid rgba(240,200,74,0.25)",borderRadius:4,padding:"3px 10px",cursor:"pointer"}}>View All →</button>
        </div>
        {/* This week summary */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
          {[
            {label:"Fit Calls",scheduled:(meetingStats.scheduled&&meetingStats.scheduled.fit_call)||0,completed:(meetingStats.completed&&meetingStats.completed.fit_call)||0,color:G,icon:"☎"},
            {label:"Sponsor Discovery",scheduled:(meetingStats.scheduled&&meetingStats.scheduled.sponsor_discovery)||0,completed:(meetingStats.completed&&meetingStats.completed.sponsor_discovery)||0,color:"#9b59b6",icon:"💼"},
            {label:"Other Meetings",scheduled:(meetingStats.scheduled&&meetingStats.scheduled.other)||0,completed:(meetingStats.completed&&meetingStats.completed.other)||0,color:"#4a9eba",icon:"📋"},
          ].map(function(k){
            return <div key={k.label} style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderTop:"2px solid "+k.color+"40",borderRadius:6,padding:"12px 14px",textAlign:"center"}}>
              <div style={{fontSize:9,color:T.dim,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8}}>{k.icon} {k.label}</div>
              <div style={{display:"flex",justifyContent:"center",gap:16,marginBottom:4}}>
                <div>
                  <div style={{fontSize:26,fontWeight:700,color:k.color,lineHeight:1}}>{k.scheduled}</div>
                  <div style={{fontSize:9,color:T.dim,marginTop:2,letterSpacing:1}}>SCHEDULED</div>
                </div>
                <div style={{width:1,background:"rgba(255,255,255,0.06)"}}/>
                <div>
                  <div style={{fontSize:26,fontWeight:700,color:k.completed>0?T.green:T.dim,lineHeight:1}}>{k.completed}</div>
                  <div style={{fontSize:9,color:T.dim,marginTop:2,letterSpacing:1}}>COMPLETED</div>
                </div>
              </div>
            </div>;
          })}
        </div>
        {/* 8-week bar chart */}
        {meetingStats.weeks&&meetingStats.weeks.length>0&&(function(){
          var weeks=meetingStats.weeks.slice(-8);
          var maxVal=Math.max(1,...weeks.map(function(w){return (w.fit_call||0)+(w.sponsor_discovery||0)+(w.other||0);}));
          var chartH=60;
          return <div>
            <div style={{fontSize:9,color:T.dim,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>8-Week Trend</div>
            <div style={{display:"flex",alignItems:"flex-end",gap:4,height:chartH+24}}>
              {weeks.map(function(w,i){
                var total=(w.fit_call||0)+(w.sponsor_discovery||0)+(w.other||0);
                var h=total>0?Math.max(4,Math.round((total/maxVal)*chartH)):2;
                var fcH=total>0?Math.round(((w.fit_call||0)/total)*h):0;
                var sdH=total>0?Math.round(((w.sponsor_discovery||0)/total)*h):0;
                var otH=Math.max(0,h-fcH-sdH);
                var isThisWeek=w.week===(function(){var d=new Date();var day=d.getDay();var mon=new Date(d);mon.setDate(d.getDate()-((day+6)%7));return mon.toISOString().slice(0,10);})();
                return <div key={w.week} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:0}}>
                  <div style={{fontSize:9,color:total>0?T.muted:T.dim,marginBottom:2,fontWeight:isThisWeek?700:400}}>{total>0?total:""}</div>
                  <div style={{width:"100%",display:"flex",flexDirection:"column",justifyContent:"flex-end",height:chartH}}>
                    {otH>0&&<div style={{height:otH,background:"#4a9eba"+(isThisWeek?"":"80"),borderRadius:total===otH?"2px 2px 2px 2px":"0 0 0 0",marginBottom:0}}/>}
                    {sdH>0&&<div style={{height:sdH,background:"#9b59b6"+(isThisWeek?"":"80"),borderRadius:0}}/>}
                    {fcH>0&&<div style={{height:fcH,background:G+(isThisWeek?"":"80"),borderRadius:"2px 2px 0 0"}}/>}
                    {total===0&&<div style={{height:2,background:"rgba(255,255,255,0.05)",borderRadius:1}}/>}
                  </div>
                  <div style={{fontSize:8,color:isThisWeek?G:T.dim,marginTop:4,whiteSpace:"nowrap",fontWeight:isThisWeek?700:400}}>{w.label}</div>
                </div>;
              })}
            </div>
            <div style={{display:"flex",gap:14,marginTop:8,justifyContent:"flex-end"}}>
              {[{color:G,label:"Fit Call"},{color:"#9b59b6",label:"Sponsor Discovery"},{color:"#4a9eba",label:"Other"}].map(function(l){
                return <div key={l.label} style={{display:"flex",alignItems:"center",gap:4}}>
                  <div style={{width:8,height:8,background:l.color,borderRadius:2}}/>
                  <span style={{fontSize:9,color:T.dim}}>{l.label}</span>
                </div>;
              })}
            </div>
          </div>;
        })()}
      </div>}

      <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:20}}>
        <div style={{display:"flex",flexDirection:"column",gap:20}}>

          <div style={{background:BG3,border:"1px solid "+T.border,borderRadius:8,overflow:"hidden"}}>
            <div style={{padding:"14px 18px",borderBottom:"1px solid "+T.border,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontSize:11,color:G,letterSpacing:3,textTransform:"uppercase",fontWeight:600}}>Ask Claude</div>
              <span style={{fontSize:10,color:T.dim}}>Natural language · live data</span>
            </div>
            <div style={{padding:"14px 16px"}}>
              {["How many new people connected to me this week?","Who in my pipeline is closest to booking a fit call?","Which CFOs haven't heard from me in 14+ days?"].map(function(q){
                return <button key={q} onClick={function(){onNavigate("claude",null,q);}} style={{display:"block",width:"100%",marginBottom:6,padding:"8px 12px",background:"rgba(255,255,255,0.02)",border:"1px solid "+T.border,color:T.muted,borderRadius:5,cursor:"pointer",fontSize:12,textAlign:"left"}}>{q}</button>;
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
function AskClaude(props) {
  var initialQ = props.initialQ || "";
  var onQuestionConsumed = props.onQuestionConsumed;
  var QUICK = [
    "Who should I call today?",
    "Who has been stuck in Connected the longest?",
    "Who in my pipeline needs attention today?",
    "Who are my strongest fit call candidates?",
    "Who hasn't had any activity logged?",
    "Give me a status report on Ben Chavez and Sayeed Chowdhury",
    "Who should I invite to the Experience Event first?",
    "Draft a LinkedIn message inviting someone to a fit call",
  ];

  var [input, setInput]   = useState("");
  var [loading, setLoading] = useState(false);
  var [messages, setMessages] = useState([
    {role:"assistant", text:(function(){var h=new Date().getHours();var g=h<12?"Good morning":h<17?"Good afternoon":"Good evening";return g+", Dalen. I have your full pipeline loaded. Ask me anything about who to call, what to say, or what needs attention today.";})()} 
  ]);

  useEffect(function(){
    if (initialQ) { ask(initialQ); if (onQuestionConsumed) onQuestionConsumed(); }
  }, [initialQ]);

  async function ask(q) {
    var question = q || input.trim();
    if (!question) return;
    setInput("");
    setMessages(function(prev){ var next=prev.concat([{role:"user", text:question}]); return next.slice(-20); });
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
      <div style={{flex:1,overflowY:"auto",padding:"20px 28px",display:"flex",flexDirection:"column-reverse",gap:16}}>
        {messages.slice().reverse().map(function(msg, i){
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
  var [fitCallContact,setFitCallContact] = useState(null);
  var [fitCallContacts,setFitCallContacts] = useState([]);
  var [followUpCount,setFollowUpCount] = useState(0);
  var [sponsorCompanyCount,setSponsorCompanyCount] = useState(0);
  var [sponsorContact,setSponsorContact] = useState(null);
  var [sponsorDeal,setSponsorDeal] = useState(null);

  var [selectedContact,setContact]   = useState(null);
  var [prevScreen,setPrevScreen]      = useState("pipeline");
  var [claudeQ,setClaudeQ]           = useState("");
  var [totalContacts,setTotal]       = useState(0);
  var [stageCounts,setStageCounts]   = useState({});
  var [pipelineTotal,setPipelineTotal] = useState(0);
  var [statsLoading,setStatsLoading] = useState(true);

  useEffect(function(){loadStats();loadFitCalls();loadFollowUpCount();},[]);

  async function loadFollowUpCount(){
    try{
      var res=await fetch("/api/follow-up-queue");
      var data=await res.json();
      setFollowUpCount((data.queue||[]).filter(function(i){return i.category!=="not_interested";}).length);
    }catch(e){}
  }

  async function loadFitCalls(){
    try{
      var SBU=process.env.NEXT_PUBLIC_SUPABASE_URL;
      var SBK=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      var h={"apikey":SBK,"Authorization":"Bearer "+SBK};
      var res=await fetch(SBU+"/rest/v1/contacts?pipeline_stage=eq.Fit%20Call%20Scheduled&select=id,first_name,last_name,title,company_name,email,linkedin_url,fit_call_date,pipeline_stage",{headers:h});
      var data=await res.json();
      setFitCallContacts(Array.isArray(data)?data:[]);
    }catch(e){console.error("loadFitCalls error:",e);}
  }



  var [sponsorStageCounts,setSponsorStageCounts] = useState({});

  async function loadStats(){
    setStatsLoading(true);
    try{
      // Load sponsor deal counts
      var sDeals = await sbFetch("/sponsor_deals?select=stage,discovery_date&limit=500");
      var sCounts = {};
      (Array.isArray(sDeals)?sDeals:[]).forEach(function(d){
        var s = d.stage||"Unknown";
        sCounts[s] = (sCounts[s]||0) + 1;
      });
      sCounts["_discoveryDone"] = (Array.isArray(sDeals)?sDeals:[]).filter(function(d){return d.discovery_date;}).length;
      setSponsorStageCounts(sCounts);

      var rows=await sbFetch("/contacts?select=pipeline_stage");
      var counts={};var tot=0;var activePipelineStages=["Connected","Engaged","Fit Invite Sent","Fit Call Scheduled","Fit Call Completed","Event Waitlist","Event Invited","Event Confirmed","Event Attended","Membership Conversation Scheduled","Membership Conversation Completed","Verbal Commitment","Active Member"];var pipelineTot=0;
      (Array.isArray(rows)?rows:[]).forEach(function(r){var s=r.pipeline_stage||"Unknown";counts[s]=(counts[s]||0)+1;tot++;if(activePipelineStages.indexOf(s)>-1)pipelineTot++;});
      setStageCounts(counts);setTotal(tot);setPipelineTotal(pipelineTot);

      // Load sponsor company count
      var sCompanies = await sbFetch("/sponsor_companies?select=id&limit=500");
      setSponsorCompanyCount(Array.isArray(sCompanies)?sCompanies.length:0);
    }catch(e){console.error("Stats error:",e);}
    setStatsLoading(false);
  }

  function navigate(s,contact,q){setScreen(s);if(contact)setContact(contact);if(q)setClaudeQ(q);}

  var NAV=[{id:"dashboard",icon:"⌂",label:"Dashboard"},{id:"followup",icon:"✉",label:"Follow-Up",badge:String(followUpCount)},{id:"linkedin_msgs",icon:"◈",label:"LinkedIn",badge:""},{id:"email_msgs",icon:"✦",label:"Email",badge:""},{id:"pipeline",icon:"◎",label:"CFO Pipeline",badge:statsLoading?"…":String(pipelineTotal)},{id:"sponsors",icon:"$",label:"Sponsors",badge:sponsorCompanyCount>0?String(sponsorCompanyCount):""},{id:"events",icon:"✦",label:"Events",badge:"0"},{id:"meetings",icon:"📅",label:"Meetings",badge:""},{id:"templates",icon:"✉",label:"Templates"},{id:"files",icon:"📎",label:"Files"},{id:"claude",icon:"★",label:"Ask Claude"}];

  var screenLabel={dashboard:"Dashboard",pipeline:"Pipeline",events:"Events",templates:"Templates",claude:"Ask Claude",profile:selectedContact?((selectedContact.first_name||"")+" "+(selectedContact.last_name||"")):"Contact",sponsors:"Sponsors",followup:"Follow-Up Queue",meetings:"Meetings",stalliant:"Sponsors"}[screen]||screen;

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
        <div style={{flex:1,display:"flex",flexDirection:"column",gap:2,overflowY:"auto"}}>
          {NAV.map(function(n){return <NavItem key={n.id} icon={n.icon} label={n.label} badge={n.badge} active={screen===n.id} onClick={function(){navigate(n.id);}}/>;  })}

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
            <span style={{color:"#3a5a74",fontSize:10,margin:"0 4px"}}>·</span>
            <button id="sync-btn" onClick={async function(){
              var btn=document.getElementById("sync-btn");
              if(btn){btn.textContent="Syncing...";btn.style.color="#f0c84a";}
              try{
                var h={"Authorization":"Bearer peerchair2026"};
                var [ar,cr]=await Promise.all([fetch("/api/audit",{headers:h}),fetch("/api/sync-conversations",{headers:h})]);
                var d=await ar.json().catch(function(){return {};});
                var cd=await cr.json().catch(function(){return {};});
                var added=(d.contacts_created||0)+(cd.contacts_created||0);
                var convos=cd.conversations_synced||0;
                var parts=[];
                if(added>0) parts.push(added+" contacts");
                if(convos>0) parts.push(convos+" convos synced");
                if(parts.length===0) parts.push("Up to date");
                if(btn){btn.textContent=parts.join(" · ");btn.style.color="#2ecc71";}
              }catch(e){if(btn){btn.textContent="Sync failed";btn.style.color="#e74c3c";}}
              setTimeout(function(){if(btn){btn.textContent="↻ Sync";btn.style.color="#3a5a74";}},6000);
            }} style={{background:"transparent",border:"none",color:"#3a5a74",fontSize:10,cursor:"pointer",letterSpacing:1,textTransform:"uppercase",padding:0}}>↻ Sync</button>
          </div>
        </div>
        <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
          {screen==="dashboard" && <Dashboard onNavigate={navigate} totalContacts={totalContacts} stageCounts={stageCounts} sponsorStageCounts={sponsorStageCounts} pipelineTotal={pipelineTotal} fitCallContacts={fitCallContacts} onStartFitCall={function(ct){setFitCallContact({id:ct.id,firstName:ct.first_name,lastName:ct.last_name,title:ct.title,company:ct.company_name,email:ct.email,linkedinUrl:ct.linkedin_url,fit_call_date:ct.fit_call_date});setScreen("fitcall");}} onNavigateToBucket={function(stage){navigate("pipeline");}} onStartDiscovery={function(co,contact,deal){setSponsorContact(Object.assign({},contact||{},{company:co.name||"",company_id:co.id,category:co.category}));setSponsorDeal(deal);setScreen("sponsor_call");}}/>}
          {screen==="pipeline"  && <Pipeline  onNavigate={navigate}/>}
          {screen==="profile"   && selectedContact && <ContactProfile contactId={selectedContact?selectedContact.id:null} contactData={selectedContact} onBack={function(){navigate(prevScreen||"pipeline");}} onStartFitCall={function(d){ setFitCallContact(d); setScreen("fitcall"); }}/>}
          {screen==="events"    && <Placeholder icon="✦" title="Events" description="Manage your Experience Events — attendee lists, confirmations, and post-event follow-up."/>}
          {screen==="meetings"  && <Meetings onNavigate={navigate}/>}
          {screen==="templates" && <Templates/>}
          {screen==="claude"    && <AskClaude initialQ={claudeQ} onQuestionConsumed={function(){setClaudeQ("");}}/>}
          {screen==="sponsors"  && <Sponsors onNavigate={function(sc,d){ if(sc==="profile"){ setContact(d); setPrevScreen("sponsors"); setScreen("profile"); } else navigate(sc,d); }} onStartDiscovery={function(co,contact,deal){setSponsorContact(Object.assign({},contact||{},{company:co.name,company_id:co.id,category:co.category}));setSponsorDeal(deal);setScreen("sponsor_call");}}/>}
          {screen==="followup"      && <FollowUp onNavigate={navigate}/>}
          {screen==="linkedin_msgs" && <LinkedInMessages onNavigate={navigate}/>}
          {screen==="email_msgs"    && <EmailMessages onNavigate={navigate}/>}
          {screen==="files"         && <Files/>}
          {screen==="sponsor_call" && <SponsorCompanion contact={sponsorContact||{}} deal={sponsorDeal} onBack={function(){navigate("sponsors");}} onEnd={function(){navigate("sponsors");}}/>}
          {screen==="fitcall" && fitCallContact && <LiveCallCompanion contact={fitCallContact} onEnd={function(){ setScreen("profile"); }} onBack={function(){ setScreen("profile"); }}/>}
        </div>
      </div>

    </div>

  );
}
