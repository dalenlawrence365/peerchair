"use client"
import { useState, useEffect, useRef } from "react";

// ── HEYREACH PRE-POPULATED DATA ───────────────────────────────────────────────
// HR is populated from the contact prop when called from the app
// Falls back to demo data when used as standalone artifact
var HR = {
  firstName:    contact ? (contact.firstName||"") : "Paolo",
  lastName:     contact ? (contact.lastName||"")  : "Casarella",
  title:        contact ? (contact.title||"")     : "CFO, Chairman of the Board",
  company:      contact ? (contact.company||"")   : "Hidonix Inc.",
  location:     contact ? (contact.linkedinLocation||"") : "Santa Monica, CA",
  source:       "LinkedIn / HeyReach",
  connectedDate:contact ? (contact.connectedDate||"") : "Apr 22, 2026",
  email:        contact ? (contact.email||"")     : "p.casarella@gmail.com",
  emailType:    contact ? (contact.emailType||"") : "Personal",
  lastMsg:      "",
  headline:     contact ? (contact.title||"")     : "CFO, Chairman of the Board at Hidonix Inc.",
  connections:  "500+",
  campaignStep: contact ? "Fit Call" : "Step 2 — Post-Accept Welcome",
  mutualConnections:"0",
  profileUrl:   contact ? (contact.linkedinUrl||"") : "https://linkedin.com/in/paolo-casarella",
  contactId:    contact ? contact.id : null,
};

// ── CURRENT ROOM MEMBERS ─────────────────────────────────────────────────────
const ROOM = [
  { name:"Member 1", industry:"Entertainment / Media",  revenue:"$50–100M"  },
  { name:"Member 2", industry:"Real Estate",            revenue:"$100–250M" },
  { name:"Member 3", industry:"Technology",             revenue:"$50–100M"  },
  { name:"Member 4", industry:"Healthcare",             revenue:"$20–50M"   },
  { name:"Member 5", industry:"Manufacturing",          revenue:"$100–250M" },
];

// ── SCRIPT ───────────────────────────────────────────────────────────────────
const SCRIPT = [
  { id:"open",    label:"Opening",          tag:"INTRO",        contextual:false,
    prompt:"Thanks for making time, "+HR.firstName+". I'll keep this to about 15 minutes — understand your world, share what CFO Circle is, and we both decide if it makes sense to go further. Sound good?",
    fallback:null },
  { id:"co",      label:"Company Context",  tag:"FIRMOGRAPHIC", contextual:false,
    prompt:"Before I get into CFO Circle — tell me a bit about your company. Roughly what revenue range are you in, how large is the team, and how long have you been in the seat there?",
    fallback:"Is the company privately held? PE-backed? I ask because CFO Circle is built specifically for privately held environments — quite different dynamics from public companies." },
  { id:"q1",      label:"The One Question", tag:"QUALIFY",      contextual:false,
    prompt:"What is one challenge you're carrying right now that you can't fully discuss with your CEO, board, or team — but you wish you had a trusted group of CFO peers to help you think through?",
    fallback:"That makes sense — which category has created the most pressure in the past 30 days: cash flow, forecasting, leadership accountability, talent, systems, or managing up?" },
  { id:"menu",    label:"Pressure Menu",    tag:"PRESSURE",     contextual:false,
    prompt:"Cash and working capital, forecasting and KPIs, leadership accountability, talent and staffing, systems and reporting, managing up with the CEO and board — which of those is loudest right now?",
    fallback:"If you had a room of high-caliber CFOs for 60 minutes — what topic would you most want to bring?" },
  { id:"ai",      label:"AI Probe",         tag:"AI",           contextual:false,
    prompt:"A lot of CFOs I speak with carry a quiet concern about AI — not just the tools, but what it means for their team and role, and whether they're moving fast enough. Is that on your radar?",
    fallback:null },
  { id:"screen",  label:"Red Flag Screen",  tag:"SCREENING",    contextual:false,
    prompt:"CFO Circle is curated — 10 to 14 members — and quality depends on everyone showing up and contributing. Members who get the most lean in with real issues. Does that kind of peer accountability feel like something you'd embrace?",
    fallback:"I ask because some people are looking for networking, which is valid — but CFO Circle is issue-based, not connection-based." },
  { id:"commit",  label:"Commitment",       tag:"CLOSE",        contextual:false,
    prompt:"CFO Circle meets once a month for three hours. Does that kind of consistent monthly commitment feel realistic for where you are right now?",
    fallback:null },
  { id:"pricing", label:"If Asked — Cost",  tag:"CONTEXTUAL",   contextual:true,
    prompt:"Membership is $500 per month, $1,500 per quarter, or $6,000 annually. Annual members receive a complimentary 13th month — a full year for the price of eleven months. Most members expense this as executive development.",
    fallback:null,
    objections:[
      { q:"Will my company pay for this?",  a:"Most members expense it as executive development. Clean line item for a CFO-level investment." },
      { q:"That seems like a lot.",         a:"One well-timed peer conversation that changes a decision can generate value many times the annual cost. That's what members tell us." },
      { q:"Can I try before committing?",   a:"That's exactly what the Experience Event is for. Come as a guest, experience the room, decide from there. No obligation." },
      { q:"I need to think about it.",      a:"Of course. Would it help to see the membership overview, or would you prefer to experience the group at an upcoming event?" },
    ]},
  { id:"close",   label:"Closing",          tag:"INVITE",       contextual:false,
    prompt:"That is exactly the kind of real issue CFO Circle was built for — a curated, confidential peer forum where CFOs work through challenges with peers who have no agenda other than mutual support. I'd like to invite you to experience the group so you can assess fit yourself.",
    fallback:"I can also share our 8 Key Drivers of CFO Success Assessment — 15 minutes, gives you a personalized report on where to focus next." },
];

const PRESSURE = ["Cash and working capital","Forecasting and KPIs","Leadership team accountability","Talent and staffing","Systems and reporting","Managing up with CEO / Board","AI Readiness & Finance Function Transformation"];
const CUES     = ["Isolation / lonely in the seat","Wants to elevate to strategic","Complexity outpacing systems","Managing-up pressure","PE or investor pressure","Transaction / exit planning","Talent gaps in finance","KPI & forecasting discipline","Reactive decision making","Acquisition integration"];
const FLAGS    = ["Won't commit to participation","Sales intent / wants to pitch","Dominant ego / knows-it-all","Uncomfortable with confidentiality","Chronic negativity / no ownership","Not primary finance executive","Company too small / large","Public company","Conflict with existing member"];
const REV      = ["Under $10M","$10M–$20M","$20M–$50M","$50M–$100M","$100M–$250M","$250M–$500M","Over $500M"];
const EMP      = ["Under 50","50–200","201–500","501–1,000","Over 1,000"];
const FIN_TEAM = ["Solo (CFO only)","2–3","4–6","7–10","11–20","Over 20"];
const OWN      = ["Privately Held","PE-Backed","Founder-Led","Family-Owned","Public","Non-Profit"];
const RPT      = ["CEO","Owner / Founder","Board","President / COO","Other"];
const IND      = ["Entertainment / Media","Technology","Real Estate","Healthcare","Manufacturing","Professional Services","Financial Services","Consumer / Retail","Construction","Logistics / Distribution","Non-Profit","Other"];
const OUTCOMES = [{v:"strong_fit",l:"✦ Strong Fit",c:"#2ecc71"},{v:"possible_fit",l:"◎ Possible Fit",c:"#f39c12"},{v:"bad_timing",l:"⏱ Bad Timing",c:"#e67e22"},{v:"not_a_fit",l:"✗ Not a Fit",c:"#e74c3c"},{v:"no_show",l:"— No Show",c:"#7f8c8d"}];
const STALLIANT_REV  = ["$10M–$20M","$20M–$50M","$50M–$100M","$100M–$250M","$250M–$500M"];
const SMALL_FIN_TEAM = ["Solo (CFO only)","2–3","4–6"];
const LARGE_FIN_TEAM = ["7–10","11–20","Over 20"];
const C = "#f0c84a";

function getStalliantSignal(rev,finTeam,own,pressureList) {
  if (!STALLIANT_REV.includes(rev)||own==="Public"||!finTeam) return null;
  const ai=pressureList.includes("AI Readiness & Finance Function Transformation");
  if (SMALL_FIN_TEAM.includes(finTeam)) return {type:"understaffed", label:"★ Build the Function",   detail:"Small team relative to revenue. CFO likely overworked and reactive.", color:"#f0c84a"};
  if (LARGE_FIN_TEAM.includes(finTeam)&&ai) return {type:"ai_opt",    label:"★ AI & Automation Play", detail:"Large team + AI concern. Automate, restructure, lead transformation.", color:"#9b59b6"};
  if (LARGE_FIN_TEAM.includes(finTeam)) return {type:"opt",           label:"★ Optimization Play",   detail:"Organizational mass may not be optimized. Monitor for AI concern.", color:"#e67e22"};
  return null;
}

// ── MICRO COMPONENTS ─────────────────────────────────────────────────────────
function Chip({on,label,color,onClick}) {
  return (
    <div onClick={onClick} style={{display:"flex",alignItems:"flex-start",gap:5,padding:"5px 7px",borderRadius:4,cursor:"pointer",transition:"all 0.1s",background:on?color+"12":"rgba(255,255,255,0.02)",border:"1px solid "+(on?color+"40":"rgba(255,255,255,0.05)"),fontSize:13,color:on?"#dce8f5":"#9ac4dc",lineHeight:1.3}}>
      <div style={{width:11,height:11,borderRadius:2,flexShrink:0,marginTop:1,border:"1px solid "+(on?color:"rgba(255,255,255,0.12)"),background:on?color:"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:"#0c1520",fontWeight:"bold"}}>{on?"✓":""}</div>
      {label}
    </div>
  );
}
function Sel({label,val,set,opts,highlight}) {
  return (
    <div>
      <div style={{fontSize:13,letterSpacing:2,color:highlight?C:"#7aaac8",textTransform:"uppercase",marginBottom:3}}>{label}</div>
      <select value={val} onChange={function(e){set(e.target.value);}} style={{width:"100%",background:"#0f1e2e",border:"1px solid "+(val&&highlight?C+"45":"rgba(255,255,255,0.08)"),color:val?"#e0ecf8":"#7aaac8",padding:"5px 7px",borderRadius:4,fontSize:14,outline:"none",cursor:"pointer",boxSizing:"border-box"}}>
        <option value="">—</option>
        {opts.map(function(o){return <option key={o}>{o}</option>;})}
      </select>
    </div>
  );
}
function STitle({label,color=C}) {
  return <div style={{fontSize:13,letterSpacing:3,color,textTransform:"uppercase",marginBottom:8,display:"flex",alignItems:"center",gap:7}}>{label}<div style={{flex:1,height:1,background:(color)+"18"}}/></div>;
}

// ── HEYREACH POPUP ────────────────────────────────────────────────────────────
function HeyReachPopup({onClose}) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={onClose}>
      <div onClick={function(e){e.stopPropagation();}} style={{background:"#0f1e2e",border:"1px solid rgba(201,168,76,0.3)",borderRadius:10,padding:24,width:380,maxWidth:"90vw",boxShadow:"0 20px 60px rgba(0,0,0,0.6)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:14,letterSpacing:3,color:C,textTransform:"uppercase"}}>HeyReach — Pre-Populated Data</div>
          <div onClick={onClose} style={{cursor:"pointer",color:"#7aaac8",fontSize:16,lineHeight:1}}>✕</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
          {[
            ["Full Name",(HR.firstName)+" "+(HR.lastName)],
            ["Title",HR.title],
            ["Company",HR.company],
            ["Location",HR.location],
            ["Source",HR.source],
            ["Connected",HR.connectedDate],
            ["Email",HR.email],
            ["Email Type",HR.emailType],
            ["Campaign Step",HR.campaignStep],
            ["Connections",HR.connections],
          ].map(function(item){ var k=item[0]; var v=item[1]; return (
            <div key={k} style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:5,padding:"7px 9px"}}>
              <div style={{fontSize:13,letterSpacing:2,color:"#6a9aba",textTransform:"uppercase",marginBottom:2}}>{k}</div>
              <div style={{fontSize:14,color:"#e0ecf8",lineHeight:1.4}}>{v}</div>
            </div>
          );})}
        </div>
        <div style={{background:"rgba(74,154,186,0.06)",border:"1px solid rgba(74,154,186,0.15)",borderRadius:6,padding:"9px 11px",marginBottom:12}}>
          <div style={{fontSize:13,letterSpacing:2,color:"#6a9aba",textTransform:"uppercase",marginBottom:4}}>LinkedIn Headline</div>
          <div style={{fontSize:14,color:"#b8d8f0",fontStyle:"italic"}}>{HR.headline}</div>
        </div>
        <div style={{background:"rgba(74,154,186,0.06)",border:"1px solid rgba(74,154,186,0.15)",borderRadius:6,padding:"9px 11px"}}>
          <div style={{fontSize:13,letterSpacing:2,color:"#6a9aba",textTransform:"uppercase",marginBottom:4}}>Last LinkedIn Message</div>
          <div style={{fontSize:14,color:"#b8d8f0",fontStyle:"italic"}}>"{HR.lastMsg}"</div>
        </div>
        <div style={{marginTop:14,textAlign:"center"}}>
          <a href={HR.profileUrl} target="_blank" rel="noreferrer" style={{fontSize:13,color:"#4a7aa0",letterSpacing:1,textDecoration:"none"}}>↗ Open LinkedIn Profile</a>
        </div>
      </div>
    </div>
  );
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
export default function LiveCallCompanion(props) {
  var contact = props.contact;
  var onEnd = props.onEnd;
  var onBack = props.onBack;
  const [step,setStep]           = useState(0);
  const [fb,setFb]               = useState({});
  const [pressure,setPressure]   = useState([]);
  const [cues,setCues]           = useState([]);
  const [flags,setFlags]         = useState([]);
  const [rev,setRev]             = useState("");
  const [emp,setEmp]             = useState("");
  const [finTeam,setFinTeam]     = useState("");
  const [own,setOwn]             = useState("");
  const [rpt,setRpt]             = useState("");
  const [ind,setInd]             = useState("");
  const [challenge,setChallenge] = useState("");
  const [notes,setNotes]         = useState("");
  const [outcome,setOutcome]     = useState("");
  const [commit,setCommit]       = useState(null);
  const [assess,setAssess]       = useState(null);
  const [showPricing,setShowPricing] = useState(false);
  const [showHR,setShowHR]       = useState(false);
  const [live,setLive]           = useState(false);
  const [secs,setSecs]           = useState(0);
  const [saved,setSaved]         = useState(false);
  const timer = useRef(null);

  useEffect(function(){ if(live){ timer.current=setInterval(function(){setSecs(function(s){return s+1;});},1000); } else { clearInterval(timer.current); } return function(){clearInterval(timer.current);}; },[live]);

  function fmt(s){ return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0"); }
  var tc=secs>1200?"#e74c3c":secs>900?"#f39c12":"#2ecc71";
  function tog(arr,set,v){ set(function(p){ return p.includes(v)?p.filter(function(x){return x!==v;}):[...p,v]; }); }
  var stalliant=getStalliantSignal(rev,finTeam,own,pressure);
  function sig(){
    if(flags.length>=2) return{l:"⚠ Caution",c:"#e74c3c"};
    if(cues.length>=3&&flags.length===0) return{l:"✦ Strong Signal",c:"#2ecc71"};
    if(cues.length>=1) return{l:"◎ Possible Fit",c:"#f39c12"};
    return{l:"— Listening…",c:"#7aaac8"};
  }
  var s=sig();

  // room conflict check
  var roomConflict = ind && ROOM.some(function(r){return r.industry.toLowerCase().includes(ind.split(" ")[0].toLowerCase());});

  // ── MIDDLE PANEL ─────────────────────────────────────────────────────────
  function renderMiddle(){
    const id=SCRIPT[step].id;

    if(id==="open") return(
      <div style={{display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",height:"100%",gap:14}}>
        <div style={{fontSize:40,color:C,opacity:0.25}}>◎</div>
        <div style={{fontSize:14,color:"#6a9aba",letterSpacing:2,textTransform:"uppercase"}}>Ready to start</div>
        <div style={{fontSize:14,color:"#5a8aaa",textAlign:"center",maxWidth:260,lineHeight:1.85}}>Press Start when the call begins. Work through the script on the left — the center panel updates at each step.</div>
        <div onClick={function(){setStep(SCRIPT.findIndex(function(s){return s.id==="pricing";}));}} style={{marginTop:6,padding:"6px 14px",background:"rgba(230,126,34,0.07)",border:"1px dashed rgba(230,126,34,0.2)",borderRadius:5,cursor:"pointer",fontSize:13,color:"#e0b840",letterSpacing:1}}>↗ Jump to Pricing if asked</div>
      </div>
    );

    if(id==="co") return(
      <div style={{height:"100%",display:"flex",flexDirection:"column",gap:9}}>
        <STitle label="Firmographic — Capture as They Talk"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
          <Sel label="Annual Revenue ★" val={rev} set={setRev} opts={REV} highlight/>
          <Sel label="Total Employees" val={emp} set={setEmp} opts={EMP}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
          <Sel label="Finance Team Size ★" val={finTeam} set={setFinTeam} opts={FIN_TEAM} highlight/>
          <Sel label="Ownership Type" val={own} set={setOwn} opts={OWN}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
          <Sel label="Reports To" val={rpt} set={setRpt} opts={RPT}/>
          <Sel label="Industry" val={ind} set={setInd} opts={IND}/>
        </div>
        {stalliant&&<div style={{padding:"9px 12px",background:(stalliant.color)+"0d",border:"1px solid "+(stalliant.color)+"30",borderLeft:"3px solid "+(stalliant.color),borderRadius:6}}>
          <div style={{fontSize:14,color:stalliant.color,fontWeight:600,marginBottom:2}}>{stalliant.label}</div>
          <div style={{fontSize:13,color:"#9ac4dc",lineHeight:1.6}}>{stalliant.detail}</div>
        </div>}
        {own==="Public"&&<div style={{padding:"7px 11px",background:"rgba(231,76,60,0.07)",border:"1px solid rgba(231,76,60,0.18)",borderRadius:5,fontSize:13,color:"#e74c3c"}}>⚠ Public company — typically not a CFO Circle fit</div>}
        {finTeam==="Solo (CFO only)"&&<div style={{padding:"7px 11px",background:"rgba(201,168,76,0.06)",border:"1px dashed rgba(201,168,76,0.18)",borderRadius:5,fontSize:13,color:"#f0c84a",lineHeight:1.6}}>Solo CFO — high isolation signal. Strong fit cue and Stalliant indicator.</div>}
        {roomConflict&&<div style={{padding:"7px 11px",background:"rgba(231,76,60,0.07)",border:"1px dashed rgba(231,76,60,0.2)",borderRadius:5,fontSize:13,color:"#e07070"}}>⚠ {ind} already represented in current room</div>}
      </div>
    );

    if(id==="q1") return(
      <div style={{height:"100%",display:"flex",flexDirection:"column",gap:9}}>
        <STitle label="Primary Challenge — Their Exact Words" color="#4a9eba"/>
        <textarea value={challenge} onChange={function(e){setChallenge(e.target.value);}} placeholder={"Capture exactly what they said…\n\nThis is the most important field on this screen."} style={{background:"#0f1e2e",border:"1px solid rgba(74,154,186,0.22)",color:"#e0ecf8",padding:"9px 11px",borderRadius:6,fontSize:14,lineHeight:1.75,resize:"none",outline:"none",fontFamily:"inherit",boxSizing:"border-box",flex:"0 0 105px"}}/>
        <STitle label="High Fit Cues — Check as You Hear Them" color="#2ecc71"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,flex:1,alignContent:"start"}}>
          {CUES.map(function(c){return <Chip key={c} label={c} on={cues.includes(c)} color="#2ecc71" onClick={function(){tog(cues,setCues,c);}}/>;})}
        </div>
      </div>
    );

    if(id==="menu"||id==="ai") return(
      <div style={{height:"100%",display:"flex",flexDirection:"column",gap:8}}>
        <STitle label="Pressure Categories" color="#4a9eba"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,flex:1,alignContent:"start"}}>
          {PRESSURE.map(function(p){return <Chip key={p} label={p} on={pressure.includes(p)} color={p.includes("AI")?"#9b59b6":"#4a9eba"} onClick={function(){tog(pressure,setPressure,p);}}/>;})}
        </div>
        {id==="ai"&&<div style={{padding:"7px 10px",background:"rgba(155,89,182,0.06)",border:"1px dashed rgba(155,89,182,0.18)",borderRadius:4,fontSize:13,color:"#9b59b6",lineHeight:1.65}}>If yes — check AI Readiness above. Note their specific fear: team relevance, personal relevance, or pace of change.</div>}
      </div>
    );

    if(id==="screen") return(
      <div style={{height:"100%",display:"flex",flexDirection:"column",gap:8}}>
        <STitle label="Red Flags — Note Any Hesitation" color="#e74c3c"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,flex:1,alignContent:"start"}}>
          {FLAGS.map(function(f){return <Chip key={f} label={f} on={flags.includes(f)} color="#e74c3c" onClick={function(){tog(flags,setFlags,f);}}/>;})}
        </div>
        {flags.length>=2&&<div style={{padding:"7px 10px",background:"rgba(231,76,60,0.06)",border:"1px solid rgba(231,76,60,0.18)",borderRadius:4,fontSize:13,color:"#e74c3c"}}>⚠ {flags.length} red flags — consider gracious close. Maintain goodwill regardless.</div>}
      </div>
    );

    if(id==="commit") return(
      <div style={{height:"100%",display:"flex",flexDirection:"column",gap:12}}>
        <STitle label="Monthly Commitment — Get a Clear Answer"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11}}>
          {[{v:true,l:"Yes - can commit",c:"#2ecc71"},{v:false,l:"Uncertain / No",c:"#e74c3c"}].map(function(item){ var v=item.v; var l=item.l; var c=item.c; return (
            <button key={String(v)} onClick={function(){setCommit(v);}} style={{padding:"16px 10px",borderRadius:7,cursor:"pointer",transition:"all 0.15s",border:"1px solid "+(commit===v?c:"rgba(255,255,255,0.08)"),background:commit===v?c+"14":"rgba(255,255,255,0.02)",color:commit===v?c:"#cce4f8",fontSize:13}}>{l}</button>
          );})}</div>
      </div>
    );

    if(id==="pricing") return(
      <div style={{height:"100%",display:"flex",flexDirection:"column",gap:9}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <STitle label="If Asked — Membership Investment"/>
          <div style={{fontSize:13,letterSpacing:2,color:"#e67e22",textTransform:"uppercase",background:"rgba(230,126,34,0.1)",border:"1px solid rgba(230,126,34,0.22)",borderRadius:3,padding:"2px 6px",marginBottom:8,flexShrink:0}}>CONTEXTUAL</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7}}>
          {[{t:"Monthly",p:"$500",s:"per month",n:null,h:false},{t:"Quarterly",p:"$1,500",s:"per quarter",n:"$500/mo effective",h:false},{t:"Annual ★",p:"$6,000",s:"per year",n:"13 months included\n≈ $461/mo",h:true}].map(function(item){ var t=item.t; var p=item.p; var s=item.s; var n=item.n; var h=item.h; return (
            <div key={t} style={{padding:"11px 8px",borderRadius:6,textAlign:"center",background:h?"rgba(201,168,76,0.07)":"rgba(255,255,255,0.02)",border:h?"1px solid rgba(201,168,76,0.28)":"1px solid rgba(255,255,255,0.06)"}}>
              <div style={{fontSize:14,letterSpacing:2,color:h?C:"#7aaac8",textTransform:"uppercase",marginBottom:5}}>{t}</div>
              <div style={{fontSize:19,fontWeight:"bold",color:h?C:"#dce8f5",lineHeight:1}}>{p}</div>
              <div style={{fontSize:14,color:"#7aaac8",marginTop:2,marginBottom:n?4:0}}>{s}</div>
              {n&&<div style={{fontSize:14,color:h?"#e0b840":"#7aaac8",lineHeight:1.55,whiteSpace:"pre-line"}}>{n}</div>}
            </div>
          );})}
        </div>
        <div style={{padding:"9px 12px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:6}}>
          <div style={{fontSize:13,letterSpacing:2,color:"#7aaac8",textTransform:"uppercase",marginBottom:5}}>Suggested Response</div>
          <div style={{fontSize:14,color:"#ddeaf8",lineHeight:1.8,fontStyle:"italic"}}>"Membership is $500 per month, $1,500 per quarter, or $6,000 annually. Annual members receive a complimentary 13th month — a full year for the price of eleven months. Most members expense this as executive development."</div>
        </div>
        <div style={{flex:1,display:"flex",flexDirection:"column",gap:4,overflow:"hidden"}}>
          <div style={{fontSize:13,letterSpacing:2,color:"#7aaac8",textTransform:"uppercase",marginBottom:2}}>If They Push Back</div>
          {SCRIPT.find(function(s){return s.id==="pricing";}).objections.map(function(o,i){ return (
            <div key={i} style={{padding:"7px 9px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.04)",borderRadius:4}}>
              <div style={{fontSize:13,color:"#e67e22",marginBottom:3,fontStyle:"italic"}}>"{o.q}"</div>
              <div style={{fontSize:13,color:"#b8d8f0",lineHeight:1.6}}>↳ {o.a}</div>
            </div>
          
        </div>
      </div>
    );

    if(id==="close") return(
      <div style={{height:"100%",display:"flex",flexDirection:"column",gap:9}}>
        <STitle label="Fit Call Outcome"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
          {OUTCOMES.map(function(o){return <button key={o.v} onClick={function(){setOutcome(o.v);}} style={{padding:"13px 10px",borderRadius:6,cursor:"pointer",transition:"all 0.15s",border:"1px solid "+(outcome===o.v?o.c:"rgba(255,255,255,0.08)"),background:outcome===o.v?(o.c)+"14":"rgba(255,255,255,0.02)",color:outcome===o.v?o.c:"#8ab4cc",fontSize:14}}>{o.l}</button>)}
        </div>
        <STitle label="Assessment Offered?" color="#4a9eba"/>
        <div style={{display:"flex",gap:7}}>
          {["Yes — sent link","No — not needed"].map(function(v){return <button key={v} onClick={function(){setAssess(v);}} style={{flex:1,padding:"9px",borderRadius:5,cursor:"pointer",border:"1px solid "+(assess===v?"rgba(74,154,186,0.45)":"rgba(255,255,255,0.08)"),background:assess===v?"rgba(74,154,186,0.09)":"rgba(255,255,255,0.02)",color:assess===v?"#4a9eba":"#8ab4cc",fontSize:14}}>{v}</button>)}
        </div>
        {outcome?<div style={{padding:"9px 12px",borderRadius:5,fontSize:14,lineHeight:1.75,background:(OUTCOMES.find(function(o){return o.v===outcome;})||{c:"#888"}).c+"0d",border:"1px solid "+(OUTCOMES.find(function(o){return o.v===outcome;})||{c:"#888"}).c+"30",color:(OUTCOMES.find(function(o){return o.v===outcome;})||{c:"#888"}).c}}>
          {outcome==="strong_fit"&&"Move to Event Path → send formal invitation and assessment link within 24 hours."}
          {outcome==="possible_fit"&&"Follow up within 24 hrs. One more touch before deciding on event invitation."}
          {outcome==="bad_timing"&&"Warm close. Add to nurture sequence. Re-engage when event is scheduled."}
          {outcome==="not_a_fit"&&"Gracious close. Maintain goodwill. Flag Stalliant potential if applicable."}
          {outcome==="no_show"&&"Send reschedule message within 1 hour. Offer 2 alternative times."}
        </div>}
      </div>
    );
  };

  // ── RENDER ────────────────────────────────────────────────────────────────
  return(
    <div style={{fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,serif",background:"#0c1520",flex:1,minHeight:0,height:"100%",color:"#eaf2fc",display:"flex",flexDirection:"column",overflow:"hidden"}}>

      {/* HEADER */}
      <div style={{background:"linear-gradient(90deg,#0f1e30,#132840)",borderBottom:"1px solid rgba(180,150,80,0.2)",padding:"9px 20px",display:"flex",alignItems:"center",gap:14,flexShrink:0}}>
        <div style={{fontSize:14,letterSpacing:3,color:C,textTransform:"uppercase",flexShrink:0}}>CFO Circle · Fit Call</div>
        <div style={{borderLeft:"1px solid rgba(255,255,255,0.1)",paddingLeft:14}}>
          <div style={{fontSize:15,fontWeight:600,color:"#fff",lineHeight:1.2}}>{HR.firstName} {HR.lastName}</div>
          <div style={{fontSize:13,color:"#cce4f8"}}>{HR.title} · {HR.company}</div>
        </div>
        <div style={{display:"flex",gap:4,marginLeft:8,alignItems:"center"}}>
          {SCRIPT.map(function(sc,i){
return (            <div key={sc.id} onClick={function(){setStep(i);}} title={sc.label} style={{width:i===step?20:6,height:6,borderRadius:3,cursor:"pointer",background:sc.contextual?"rgba(230,126,34,0.5)":i===step?C:i<step?"rgba(201,168,76,0.3)":"rgba(255,255,255,0.1)",transition:"all 0.25s"}}/>
          
        </div>
        <div style={{display:"flex",alignItems:"center",gap:4,marginLeft:4}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:live?"#2ecc71":"#6a9aba",boxShadow:live?"0 0 6px #2ecc71":"none"}}/>
          <span style={{fontSize:14,color:"#6a9aba",letterSpacing:1,textTransform:"uppercase"}}>{live?"Live":"Ready"}</span>
        </div>
        <div style={{marginLeft:"auto",fontFamily:"'Courier New',monospace",fontSize:22,fontWeight:"bold",color:tc,letterSpacing:2,transition:"color 0.5s"}}>{fmt(secs)}</div>
        <button onClick={function(){setLive(function(v){return !v;});}} style={{background:live?"rgba(231,76,60,0.15)":"rgba(46,204,113,0.15)",border:"1px solid "+(live?"#e74c3c":"#2ecc71"),color:live?"#e74c3c":"#2ecc71",padding:"5px 13px",borderRadius:4,cursor:"pointer",fontSize:14,letterSpacing:1,textTransform:"uppercase"}}>{live?"■ End":"▶ Start"}</button>
      </div>

      {/* BODY */}
      <div style={{display:"grid",gridTemplateColumns:"255px 1fr 255px",flex:1,overflow:"hidden",minHeight:0}}>

        {/* LEFT — Script */}
        <div style={{background:"#0f1e2e",borderRight:"1px solid rgba(255,255,255,0.06)",padding:"12px 11px",overflow:"hidden",display:"flex",flexDirection:"column"}}>
          <div style={{fontSize:13,letterSpacing:3,color:C,textTransform:"uppercase",marginBottom:9,flexShrink:0}}>Conversation Guide</div>
          <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column",gap:3}}>
            {SCRIPT.map(function(sc,i){
return (              <div key={sc.id} onClick={function(){setStep(i);}} style={{borderRadius:5,border:"1px solid "+(step===i?sc.contextual?"rgba(230,126,34,0.35)":"rgba(201,168,76,0.32)":"rgba(255,255,255,0.04)"),background:step===i?sc.contextual?"rgba(230,126,34,0.04)":"rgba(201,168,76,0.04)":"transparent",cursor:"pointer",transition:"all 0.2s",flex:step===i?"1 1 auto":"0 0 auto",overflow:"hidden"}}>
                <div style={{padding:"6px 9px",display:"flex",alignItems:"center",gap:7}}>
                  <div style={{width:16,height:16,borderRadius:"50%",flexShrink:0,background:step===i?(sc.contextual?"#e67e22":C):i<step?"rgba(201,168,76,0.22)":"rgba(255,255,255,0.06)",color:step===i?"#0c1520":i<step?"#f0c84a":"#8ab4cc",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:"bold"}}>
                    {i<step?"✓":sc.contextual?"?":i+1}
                  </div>
                  <div>
                    <div style={{fontSize:14,color:step===i?(sc.contextual?"#e67e22":C):i<step?"rgba(201,168,76,0.5)":"#8ab4cc",fontFamily:"'Courier New',monospace",letterSpacing:"0.5px",textTransform:"uppercase"}}>{sc.label}</div>
                    <div style={{fontSize:13,color:sc.contextual?"rgba(230,126,34,0.35)":"#5a8aaa",letterSpacing:1}}>{sc.tag}</div>
                  </div>
                </div>
                {step===i&&<div style={{padding:"0 9px 9px 32px",overflow:"hidden"}}>
                  <div style={{fontSize:15,color:"#f0f6ff",lineHeight:1.85,fontStyle:"italic",marginBottom:10,padding:"8px 12px",background:"rgba(255,255,255,0.04)",borderRadius:5,borderLeft:"2px solid rgba(255,255,255,0.2)"}}>"{"+sc.prompt.replace("{name}",HR.firstName)+"}"</div>
                  {sc.fallback&&<>
                    <button onClick={function(e){e.stopPropagation();setFb(function(v){var n=Object.assign({},v);n[sc.id]=!v[sc.id];return n;});}} style={{display:"block",marginBottom:8,background:"rgba(240,200,74,0.12)",border:"1px solid #f0c84a",color:"#f0c84a",fontSize:12,fontWeight:"700",padding:"4px 12px",borderRadius:4,cursor:"pointer"}}>{fb[sc.id]?"▾ Hide Fallback":"▸ Show Fallback"}</button>
                    {fb[sc.id]&&<div style={{fontSize:14,color:"#e8f2ff",lineHeight:1.75,fontStyle:"italic",padding:"8px 12px",background:"rgba(240,200,74,0.05)",borderRadius:5,borderLeft:"2px solid #f0c84a"}}>"{sc.fallback}"</div>}
                  </>}
                </div>}
              </div>
            
          </div>
          <div style={{display:"flex",gap:5,paddingTop:9,borderTop:"1px solid rgba(255,255,255,0.04)",flexShrink:0,marginTop:7}}>
            <button onClick={function(){setStep(function(s){return Math.max(0,s-1 style={{flex:1,padding:"5px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",color:"#8ab4cc",borderRadius:4,cursor:"pointer",fontSize:14,letterSpacing:1,textTransform:"uppercase"}}>← Prev</button>
            <button onClick={function(){setStep(function(s){return Math.min(SCRIPT.length-1,s+1 style={{flex:1,padding:"5px",background:"rgba(201,168,76,0.05)",border:"1px solid rgba(201,168,76,0.18)",color:C,borderRadius:4,cursor:"pointer",fontSize:14,letterSpacing:1,textTransform:"uppercase"}}>Next →</button>
          </div>
        </div>

        {/* CENTER — Dynamic */}
        <div style={{padding:"14px 16px",overflow:"hidden",display:"flex",flexDirection:"column"}}>
          {renderMiddle()}
        </div>

        {/* RIGHT — Static, no scroll */}
        <div style={{background:"#0a1825",borderLeft:"1px solid rgba(255,255,255,0.06)",padding:"12px 12px",overflow:"hidden",display:"flex",flexDirection:"column",gap:7}}>

          {/* Contact — compact with HeyReach popup trigger */}
          <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:6,padding:"9px 10px",flexShrink:0}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:"#fff",lineHeight:1.2,marginBottom:1}}>{HR.firstName} {HR.lastName}</div>
                <div style={{fontSize:14,color:"#9ac4dc",lineHeight:1.4}}>{HR.title}</div>
                <div style={{fontSize:14,color:"#9ac4dc"}}>{HR.company}</div>
              </div>
              <button onClick={function(){setShowHR(true);}} title="View HeyReach data" style={{background:"rgba(74,154,186,0.1)",border:"1px solid rgba(74,154,186,0.25)",color:"#4a9eba",borderRadius:4,padding:"4px 7px",cursor:"pointer",fontSize:14,letterSpacing:0.5,flexShrink:0,marginLeft:8}}>ℹ LinkedIn</button>
            </div>
            <div style={{display:"flex",gap:5,marginTop:7}}>
              <div style={{flex:1,background:"rgba(255,255,255,0.02)",borderRadius:3,padding:"4px 6px"}}>
                <div style={{fontSize:13,color:"#6a9aba",letterSpacing:2,textTransform:"uppercase",marginBottom:1}}>Email</div>
                <div style={{fontSize:14,color:"#c0dcf0"}}>{HR.email}</div>
              </div>
              <div style={{flex:"0 0 auto",background:"rgba(255,255,255,0.02)",borderRadius:3,padding:"4px 6px"}}>
                <div style={{fontSize:13,color:"#6a9aba",letterSpacing:2,textTransform:"uppercase",marginBottom:1}}>Type</div>
                <div style={{fontSize:14,color:"#c0dcf0"}}>{HR.emailType}</div>
              </div>
            </div>
          </div>

          {/* Signal + Stalliant */}
          <div style={{display:"flex",gap:5,flexShrink:0}}>
            <div style={{flex:1,padding:"5px 7px",borderRadius:5,background:(s.c)+"0e",border:"1px solid "+(s.c)+"28",fontSize:14,color:s.c,textAlign:"center"}}>{s.l}</div>
            {stalliant&&<div style={{flex:1,padding:"5px 7px",borderRadius:5,background:(stalliant.color)+"0d",border:"1px solid "+(stalliant.color)+"30",borderLeft:"2px solid "+(stalliant.color),fontSize:14,color:stalliant.color,lineHeight:1.4,textAlign:"center"}}>★ Stalliant<br/><span style={{fontSize:13,opacity:0.75}}>{stalliant.type==="understaffed"?"Build function":"Automate/optimize"}</span></div>}
          </div>

          {/* Counters */}
          <div style={{display:"flex",gap:4,flexShrink:0}}>
            {[["Cues",cues.length,"#2ecc71"],["Flags",flags.length,"#e74c3c"],["Press.",pressure.length,"#4a9eba"]].map(function(row){ var lbl=row[0]; var val=row[1]; var col=row[2]; return (
              <div key={lbl} style={{flex:1,background:"rgba(255,255,255,0.02)",border:"1px solid "+col+"12",borderRadius:5,padding:"6px 3px",textAlign:"center"}}>
                <div style={{fontSize:17,fontWeight:"bold",color:col,lineHeight:1}}>{val}</div>
                <div style={{fontSize:13,color:"#6a9aba",letterSpacing:1,textTransform:"uppercase",marginTop:2}}>{lbl}</div>
              </div>
            
          </div>

          {/* Room Makeup */}
          <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:6,padding:"8px 10px",flexShrink:0}}>
            <div style={{fontSize:13,letterSpacing:2,color:"#4a9eba",textTransform:"uppercase",marginBottom:7}}>Current Room Makeup</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:"3px 8px",alignItems:"center"}}>
              <div style={{fontSize:13,color:"#6a9aba",letterSpacing:1,textTransform:"uppercase"}}>Industry</div>
              <div style={{fontSize:13,color:"#6a9aba",letterSpacing:1,textTransform:"uppercase",textAlign:"right"}}>Revenue</div>
              {ROOM.map(function(r,i){
                const conflict=ind&&r.industry.toLowerCase().includes(ind.split(" ")[0].toLowerCase());
                return[
                  <div key={"i"+(i)} style={{fontSize:14,color:conflict?"#e07070":"#9ac4dc",lineHeight:1.35}}>{r.industry}</div>,
                  <div key={"r"+(i)} style={{fontSize:14,color:conflict?"#e07070":"#7aaac8",textAlign:"right"}}>{r.revenue}</div>,
                ];
              })}
            </div>
            {roomConflict&&<div style={{marginTop:6,padding:"4px 7px",background:"rgba(231,76,60,0.07)",border:"1px dashed rgba(231,76,60,0.2)",borderRadius:3,fontSize:14,color:"#e07070"}}>⚠ Industry conflict — discuss with {HR.firstName}</div>}
            {ind&&!roomConflict&&<div style={{marginTop:6,padding:"4px 7px",background:"rgba(46,204,113,0.06)",border:"1px dashed rgba(46,204,113,0.18)",borderRadius:3,fontSize:14,color:"#4caf7d"}}>✓ {ind} adds diversity</div>}
          </div>

          {/* Company profile — live */}
          {(rev||finTeam||own)&&<div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:5,padding:"7px 9px",flexShrink:0}}>
            <div style={{fontSize:13,letterSpacing:2,color:"#6a9aba",textTransform:"uppercase",marginBottom:5}}>Company Profile</div>
            {[["Revenue",rev],["Finance Team",finTeam],["Ownership",own],["Reports To",rpt]].filter(function(item){return item[1];}).map(function(item){ var k=item[0]; var v=item[1]; return (
              <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"2px 0",borderBottom:"1px solid rgba(255,255,255,0.03)",fontSize:14}}>
                <span style={{color:"#6a9aba"}}>{k}</span><span style={{color:"#c0dcf0"}}>{v}</span>
              </div>
            
          </div>}

          {/* Pricing quick ref */}
          <div style={{flexShrink:0}}>
            <div onClick={function(){setShowPricing(function(v){return !v;});}} style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",padding:"5px 8px",background:"rgba(201,168,76,0.04)",border:"1px solid rgba(201,168,76,0.12)",borderRadius:4,marginBottom:showPricing?4:0}}>
              <div style={{fontSize:13,letterSpacing:2,color:"#d4a832",textTransform:"uppercase"}}>$ Pricing Reference</div>
              <div style={{fontSize:14,color:"#d4a832"}}>{showPricing?"▾":"▸"}</div>
            </div>
            {showPricing&&<div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(201,168,76,0.1)",borderRadius:4,padding:"7px 9px"}}>
              {[["Monthly","$500/mo",false],["Quarterly","$1,500/qtr",false],["Annual \u2605","$6,000/yr · 13 mos",true]].map(function(row){ var t=row[0]; var p=row[1]; var h=row[2]; return (
                <div key={t} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",borderBottom:"1px solid rgba(255,255,255,0.03)",fontSize:14}}>
                  <span style={{color:h?C:"#8ab4cc"}}>{t}</span><span style={{color:h?C:"#cce4f8"}}>{p}</span>
                </div>
              );})}
              <div style={{marginTop:5,fontSize:14,color:"#d4a832",lineHeight:1.55}}>Expense as executive development</div>
            </div>}
          </div>

          {/* Challenge */}
          <div style={{flexShrink:0}}>
            <div style={{fontSize:13,letterSpacing:2,color:"#6a9aba",textTransform:"uppercase",marginBottom:3}}>Primary Challenge</div>
            <textarea value={challenge} onChange={function(e){setChallenge(e.target.value);}} placeholder="Their exact words…" style={{width:"100%",background:"#0f1e2e",border:"1px solid rgba(74,154,186,0.15)",color:"#e0ecf8",padding:"5px 7px",borderRadius:4,fontSize:14,lineHeight:1.65,resize:"none",outline:"none",fontFamily:"inherit",boxSizing:"border-box",height:44}}/>
          </div>

          {/* Notes */}
          <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:0}}>
            <div style={{fontSize:13,letterSpacing:2,color:"#6a9aba",textTransform:"uppercase",marginBottom:3}}>Notes</div>
            <textarea value={notes} onChange={function(e){setNotes(e.target.value);}} placeholder="Anything else…" style={{flex:1,width:"100%",background:"#0f1e2e",border:"1px solid rgba(255,255,255,0.05)",color:"#e0ecf8",padding:"5px 7px",borderRadius:4,fontSize:14,lineHeight:1.65,resize:"none",outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
          </div>
        </div>
      </div>

      {/* BOTTOM BAR */}
      <div style={{background:"#0a1522",borderTop:"1px solid rgba(255,255,255,0.05)",padding:"7px 20px",display:"flex",alignItems:"center",gap:9,flexShrink:0,flexWrap:"wrap"}}>
        <div style={{fontSize:13,color:"#6a9aba",letterSpacing:2,textTransform:"uppercase",flexShrink:0}}>Outcome:</div>
        <div style={{display:"flex",gap:5,flex:1,flexWrap:"wrap"}}>
          {OUTCOMES.map(function(o){return <button key={o.v} onClick={function(){setOutcome(o.v);}} style={{padding:"4px 9px",borderRadius:4,cursor:"pointer",transition:"all 0.12s",border:"1px solid "+(outcome===o.v?o.c:"rgba(255,255,255,0.07)"),background:outcome===o.v?(o.c)+"12":"rgba(255,255,255,0.02)",color:outcome===o.v?o.c:"#7aaac8",fontSize:14}}>{o.l}</button>)}
        </div>
        <button onClick={function(){
      setSaved(true);
      if(contact && contact.id && outcome) {
        var SBU=process.env.NEXT_PUBLIC_SUPABASE_URL;
        var SBK=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        var h={"apikey":SBK,"Authorization":"Bearer "+SBK,"Content-Type":"application/json","Prefer":"return=representation"};
        var newStage=outcome==="not_a_fit"?"Lost — Not a Fit":"Fit Call Completed";
        var newStatus=outcome==="not_a_fit"?"Not a Fit":"Prospect";
        fetch(SBU+"/rest/v1/contacts?id=eq."+contact.id,{method:"PATCH",headers:h,body:JSON.stringify({pipeline_stage:newStage,member_status:newStatus,fit_call_outcome:outcome,primary_challenge:challenge,pressure_categories:pressure,high_fit_cues:cues,red_flags:flags,fit_call_notes:notes,commitment_confirmed:String(commit),annual_revenue:rev,employee_count:emp,finance_team_size:finTeam,ownership_type:own,reports_to:rpt,industry:ind})})
          .then(function(){ if(onEnd) onEnd(outcome); });
        fetch(SBU+"/rest/v1/communications",{method:"POST",headers:h,body:JSON.stringify({contact_id:contact.id,occurred_at:new Date().toISOString(),channel:"Phone",direction:"IN",step_label:"Fit Call Completed",body:"Fit call completed. Outcome: "+outcome+". Challenge: "+challenge+". Notes: "+notes,source:"PeerChair",logged_by:"Dalen Lawrence"})});
      }
      setTimeout(function(){setSaved(false);},3000);
    }} style={{padding:"7px 20px",background:saved?"rgba(46,204,113,0.16)":"linear-gradient(135deg,rgba(201,168,76,0.18),rgba(201,168,76,0.07))",border:"1px solid "+(saved?"#2ecc71":"rgba(201,168,76,0.35)"),color:saved?"#2ecc71":C,borderRadius:5,cursor:"pointer",fontSize:14,letterSpacing:"1.5px",textTransform:"uppercase",transition:"all 0.2s",flexShrink:0}}>
          {saved?"✓ Saved":"Save & Close"}
        </button>
      </div>

      {/* HEYREACH POPUP */}
      {showHR&&<HeyReachPopup onClose={function(){setShowHR(false);}}/>}
    </div>
  );
}
