"use client"
import { useState, useRef, useEffect } from "react";

var G = "#f0c84a";
var BG = "#080f1a";
var BG2 = "#0c1520";
var BG3 = "#0f1e2e";
var T = {text:"#e8f2ff",muted:"#7a9bb8",dim:"#3a5a74",border:"rgba(255,255,255,0.06)",green:"#2ecc71",red:"#e74c3c",orange:"#e67e22",blue:"#4a9eba"};
var C = G;

var SCRIPT = [
  {id:"open",label:"Opening",tag:"INTRO",contextual:false,
    prompt:"Thanks for making time, {name}. I will keep this to about 15 minutes — understand your world, share what CFO Circle is, and we both decide if it makes sense to go further. Sound good?",
    fallback:null},
  {id:"co",label:"Company Context",tag:"FIRMOGRAPHIC",contextual:false,
    prompt:"Before I get into CFO Circle — tell me a bit about your company. Roughly what revenue range are you in, how large is the team, and how long have you been in the seat there?",
    fallback:"Is the company privately held? PE-backed? I ask because CFO Circle is built specifically for privately held environments — quite different dynamics from public companies."},
  {id:"q1",label:"The One Question",tag:"QUALIFY",contextual:false,
    prompt:"What is one challenge you are carrying right now that you cannot fully discuss with your CEO, board, or team — but you wish you had a trusted group of CFO peers to help you think through?",
    fallback:"That makes sense — which category has created the most pressure in the past 30 days: cash flow, forecasting, leadership accountability, talent, systems, or managing up?"},
  {id:"menu",label:"Pressure Menu",tag:"PRESSURE",contextual:false,
    prompt:"Cash and working capital, forecasting and KPIs, leadership accountability, talent and staffing, systems and reporting, managing up with the CEO and board — which of those is loudest right now?",
    fallback:"If you had a room of high-caliber CFOs for 60 minutes — what topic would you most want to bring?"},
  {id:"ai",label:"AI Probe",tag:"AI",contextual:false,
    prompt:"A lot of CFOs I speak with carry a quiet concern about AI — not just the tools, but what it means for their team and role, and whether they are moving fast enough. Is that on your radar?",
    fallback:null},
  {id:"screen",label:"Red Flag Screen",tag:"SCREENING",contextual:false,
    prompt:"CFO Circle is curated — 10 to 14 members — and quality depends on everyone showing up and contributing. Members who get the most lean in with real issues. Does that kind of peer accountability feel like something you would embrace?",
    fallback:"I ask because some people are looking for networking, which is valid — but CFO Circle is issue-based, not connection-based."},
  {id:"commit",label:"Commitment",tag:"CLOSE",contextual:false,
    prompt:"CFO Circle meets once a month for three hours. Does that kind of consistent monthly commitment feel realistic for where you are right now?",
    fallback:null},
  {id:"pricing",label:"If Asked Cost",tag:"CONTEXTUAL",contextual:true,
    prompt:"Membership is $500 per month, $1,500 per quarter, or $6,000 annually. Annual members receive a complimentary 13th month. Most members expense this as executive development.",
    fallback:null},
  {id:"close",label:"Closing",tag:"INVITE",contextual:false,
    prompt:"Based on what you have shared — I think you would be a strong fit. The next step is the Experience Event — a live sample of what a CFO Circle meeting looks like. Would you be open to attending?",
    fallback:"I can also share our 8 Key Drivers of CFO Success Assessment — 15 minutes, gives you a personalized report on where to focus next."},
];

var PRESSURE = ["Cash and working capital","Forecasting and KPIs","Leadership team accountability","Talent and staffing","Systems and reporting","Managing up with CEO / Board","AI Readiness & Finance Function Transformation"];
var CUES = ["Isolation / lonely in the seat","Wants to elevate to strategic","Complexity outpacing systems","Managing-up pressure","PE or investor pressure","Transaction / exit planning","Talent gaps in finance","KPI & forecasting discipline","Reactive decision making"];
var FLAGS = ["Won't commit to participation","Sales intent / wants to pitch","Dominant ego / knows-it-all","Uncomfortable with confidentiality","Not primary finance executive","Company too small or large"];
var REV = ["Under $10M","$10M-$20M","$20M-$50M","$50M-$100M","$100M-$250M","Over $250M"];
var EMP = ["Under 50","50-200","201-500","501-1,000","Over 1,000"];
var FIN_TEAM = ["Solo (CFO only)","2-3","4-6","7-10","11-20","Over 20"];
var OWN = ["Privately Held","PE-Backed","Founder-Led","Family-Owned","Public","Non-Profit"];
var RPT = ["CEO","Owner / Founder","Board","President / COO"];
var IND = ["Entertainment / Media","Technology","Real Estate","Healthcare","Manufacturing","Professional Services","Financial Services","Consumer / Retail","Construction","Non-Profit","Other"];
var OUTCOMES = [{v:"strong_fit",l:"Strong Fit",c:"#2ecc71"},{v:"possible_fit",l:"Possible Fit",c:"#f39c12"},{v:"bad_timing",l:"Bad Timing",c:"#e67e22"},{v:"not_a_fit",l:"Not a Fit",c:"#e74c3c"},{v:"no_show",l:"No Show",c:"#7f8c8d"}];

function Chip(props) {
  var on = props.on; var label = props.label; var color = props.color; var onClick = props.onClick;
  return (
    <div onClick={onClick} style={{display:"flex",alignItems:"flex-start",gap:5,padding:"5px 7px",borderRadius:4,cursor:"pointer",background:on?color+"12":"rgba(255,255,255,0.02)",border:"1px solid "+(on?color+"40":"rgba(255,255,255,0.05)"),fontSize:13,color:on?"#dce8f5":"#9ac4dc",lineHeight:1.3}}>
      <div style={{width:11,height:11,borderRadius:2,flexShrink:0,marginTop:1,border:"1px solid "+(on?color:"rgba(255,255,255,0.12)"),background:on?color:"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:"#0c1520",fontWeight:"bold"}}>{on?"v":""}</div>
      {label}
    </div>
  );
}

function Sel(props) {
  var label = props.label; var val = props.val; var set = props.set; var opts = props.opts; var highlight = props.highlight;
  return (
    <div>
      <div style={{fontSize:13,letterSpacing:2,color:highlight?C:"#7aaac8",textTransform:"uppercase",marginBottom:3}}>{label}</div>
      <select value={val} onChange={function(e){set(e.target.value);}} style={{width:"100%",background:"#0f1e2e",border:"1px solid "+(val&&highlight?C+"45":"rgba(255,255,255,0.08)"),color:val?"#e0ecf8":"#7aaac8",padding:"5px 7px",borderRadius:4,fontSize:14,outline:"none",cursor:"pointer",boxSizing:"border-box"}}>
        <option value="">-</option>
        {opts.map(function(o){return <option key={o}>{o}</option>;})}
      </select>
    </div>
  );
}

function STitle(props) {
  var label = props.label; var color = props.color || C;
  return <div style={{fontSize:13,letterSpacing:3,color:color,textTransform:"uppercase",marginBottom:8,display:"flex",alignItems:"center",gap:7}}>{label}<div style={{flex:1,height:1,background:color+"18"}}/></div>;
}

export default function LiveCallCompanion(props) {
  var contact = props.contact;
  var onEnd = props.onEnd;
  var onBack = props.onBack;

  var HR = {
    firstName:    contact ? (contact.firstName||"") : "Contact",
    lastName:     contact ? (contact.lastName||"")  : "",
    title:        contact ? (contact.title||"")     : "",
    company:      contact ? (contact.company||"")   : "",
    email:        contact ? (contact.email||"")     : "",
    emailType:    contact ? (contact.emailType||"") : "",
    linkedinUrl:  contact ? (contact.linkedinUrl||"") : "",
    contactId:    contact ? contact.id : null,
  };

  var [step,setStep]           = useState(0);
  var [fb,setFb]               = useState({});
  var [pressure,setPressure]   = useState([]);
  var [cues,setCues]           = useState([]);
  var [flags,setFlags]         = useState([]);
  var [rev,setRev]             = useState("");
  var [emp,setEmp]             = useState("");
  var [finTeam,setFinTeam]     = useState("");
  var [own,setOwn]             = useState("");
  var [rpt,setRpt]             = useState("");
  var [ind,setInd]             = useState("");
  var [challenge,setChallenge] = useState("");
  var [notes,setNotes]         = useState("");
  var [outcome,setOutcome]     = useState("");
  var [commit,setCommit]       = useState(null);
  var [live,setLive]           = useState(false);
  var [secs,setSecs]           = useState(0);
  var [saved,setSaved]         = useState(false);
  var [saving,setSaving]       = useState(false);
  var timer = useRef(null);

  useEffect(function() {
    if (live) {
      timer.current = setInterval(function(){setSecs(function(s){return s+1;});}, 1000);
    } else {
      clearInterval(timer.current);
    }
    return function(){clearInterval(timer.current);};
  }, [live]);

  function fmt(s) {
    return ("0"+Math.floor(s/60)).slice(-2)+":"+("0"+(s%60)).slice(-2);
  }

  var tc = secs>1200?"#e74c3c":secs>900?"#f39c12":"#2ecc71";

  function tog(arr, set, v) {
    set(function(p){ return p.includes(v)?p.filter(function(x){return x!==v;}):[...p,v]; });
  }

  function getSig() {
    if(flags.length>=2) return {l:"Caution",c:"#e74c3c"};
    if(cues.length>=3&&flags.length===0) return {l:"Strong Signal",c:"#2ecc71"};
    if(cues.length>=1) return {l:"Possible Fit",c:"#f39c12"};
    return {l:"Listening...",c:"#7aaac8"};
  }
  var sig = getSig();

  function getPrompt(sc) {
    return sc.prompt.replace("{name}", HR.firstName);
  }

  function renderMiddle() {
    var id = SCRIPT[step].id;
    var sc = SCRIPT[step];

    if(id==="open") return (
      <div style={{display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",height:"100%",gap:14}}>
        <div style={{fontSize:40,color:C,opacity:0.25}}>O</div>
        <div style={{fontSize:14,color:"#6a9aba",letterSpacing:2,textTransform:"uppercase"}}>Ready to start</div>
        <div style={{fontSize:14,color:"#5a8aaa",textAlign:"center",maxWidth:260,lineHeight:1.85}}>Press Start when the call begins. Work through the script on the left.</div>
      </div>
    );

    if(id==="co") return (
      <div style={{height:"100%",display:"flex",flexDirection:"column",gap:9}}>
        <STitle label="Firmographic - Capture as They Talk"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
          <Sel label="Annual Revenue" val={rev} set={setRev} opts={REV} highlight={true}/>
          <Sel label="Total Employees" val={emp} set={setEmp} opts={EMP}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
          <Sel label="Finance Team Size" val={finTeam} set={setFinTeam} opts={FIN_TEAM} highlight={true}/>
          <Sel label="Ownership Type" val={own} set={setOwn} opts={OWN}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
          <Sel label="Reports To" val={rpt} set={setRpt} opts={RPT}/>
          <Sel label="Industry" val={ind} set={setInd} opts={IND}/>
        </div>
        {own==="Public"&&<div style={{padding:"7px 11px",background:"rgba(231,76,60,0.07)",border:"1px solid rgba(231,76,60,0.18)",borderRadius:5,fontSize:13,color:"#e74c3c"}}>Public company - typically not a CFO Circle fit</div>}
      </div>
    );

    if(id==="q1") return (
      <div style={{height:"100%",display:"flex",flexDirection:"column",gap:9}}>
        <STitle label="Primary Challenge - Their Exact Words" color="#4a9eba"/>
        <textarea value={challenge} onChange={function(e){setChallenge(e.target.value);}} placeholder="Capture exactly what they said..." style={{background:"#0f1e2e",border:"1px solid rgba(74,154,186,0.22)",color:"#e0ecf8",padding:"9px 11px",borderRadius:6,fontSize:14,lineHeight:1.75,resize:"none",outline:"none",fontFamily:"inherit",boxSizing:"border-box",flex:"0 0 120px"}}/>
        <STitle label="High Fit Cues" color="#2ecc71"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,flex:1,alignContent:"start"}}>
          {CUES.map(function(c){ return <Chip key={c} label={c} on={cues.includes(c)} color="#2ecc71" onClick={function(){tog(cues,setCues,c);}}/>;  })}
        </div>
      </div>
    );

    if(id==="menu"||id==="ai") return (
      <div style={{height:"100%",display:"flex",flexDirection:"column",gap:8}}>
        <STitle label="Pressure Categories" color="#4a9eba"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,flex:1,alignContent:"start"}}>
          {PRESSURE.map(function(p){ return <Chip key={p} label={p} on={pressure.includes(p)} color="#4a9eba" onClick={function(){tog(pressure,setPressure,p);}}/>;  })}
        </div>
      </div>
    );

    if(id==="screen") return (
      <div style={{height:"100%",display:"flex",flexDirection:"column",gap:8}}>
        <STitle label="Red Flags" color="#e74c3c"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
          {FLAGS.map(function(f){ return <Chip key={f} label={f} on={flags.includes(f)} color="#e74c3c" onClick={function(){tog(flags,setFlags,f);}}/>;  })}
        </div>
      </div>
    );

    if(id==="commit") return (
      <div style={{height:"100%",display:"flex",flexDirection:"column",gap:9}}>
        <STitle label="Monthly Commitment - Get a Clear Answer"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11}}>
          <button onClick={function(){setCommit(true);}} style={{padding:"16px 10px",borderRadius:7,cursor:"pointer",border:"1px solid "+(commit===true?"#2ecc71":"rgba(255,255,255,0.08)"),background:commit===true?"#2ecc7114":"rgba(255,255,255,0.02)",color:commit===true?"#2ecc71":"#cce4f8",fontSize:13}}>Yes - can commit</button>
          <button onClick={function(){setCommit(false);}} style={{padding:"16px 10px",borderRadius:7,cursor:"pointer",border:"1px solid "+(commit===false?"#e74c3c":"rgba(255,255,255,0.08)"),background:commit===false?"#e74c3c14":"rgba(255,255,255,0.02)",color:commit===false?"#e74c3c":"#cce4f8",fontSize:13}}>Uncertain / No</button>
        </div>
      </div>
    );

    if(id==="pricing") return (
      <div style={{height:"100%",display:"flex",flexDirection:"column",gap:9}}>
        <STitle label="If Asked - Membership Investment"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7}}>
          <div style={{padding:"11px 8px",borderRadius:6,textAlign:"center",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)"}}>
            <div style={{fontSize:14,color:"#7aaac8",textTransform:"uppercase",marginBottom:5}}>Monthly</div>
            <div style={{fontSize:19,fontWeight:"bold",color:"#dce8f5"}}>$500</div>
            <div style={{fontSize:14,color:"#7aaac8",marginTop:2}}>per month</div>
          </div>
          <div style={{padding:"11px 8px",borderRadius:6,textAlign:"center",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)"}}>
            <div style={{fontSize:14,color:"#7aaac8",textTransform:"uppercase",marginBottom:5}}>Quarterly</div>
            <div style={{fontSize:19,fontWeight:"bold",color:"#dce8f5"}}>$1,500</div>
            <div style={{fontSize:14,color:"#7aaac8",marginTop:2}}>per quarter</div>
          </div>
          <div style={{padding:"11px 8px",borderRadius:6,textAlign:"center",background:"rgba(201,168,76,0.07)",border:"1px solid rgba(201,168,76,0.28)"}}>
            <div style={{fontSize:14,color:C,textTransform:"uppercase",marginBottom:5}}>Annual</div>
            <div style={{fontSize:19,fontWeight:"bold",color:C}}>$6,000</div>
            <div style={{fontSize:14,color:"#7aaac8",marginTop:2}}>13 months included</div>
          </div>
        </div>
        <div style={{padding:"9px 12px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:6,fontSize:14,color:"#ddeaf8",lineHeight:1.8,fontStyle:"italic"}}>"Most members expense this as executive development."</div>
      </div>
    );

    if(id==="close") return (
      <div style={{height:"100%",display:"flex",flexDirection:"column",gap:9}}>
        <STitle label="Fit Call Outcome"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
          {OUTCOMES.map(function(o){ return (
            <button key={o.v} onClick={function(){setOutcome(o.v);}} style={{padding:"13px 10px",borderRadius:6,cursor:"pointer",border:"1px solid "+(outcome===o.v?o.c:"rgba(255,255,255,0.08)"),background:outcome===o.v?o.c+"14":"rgba(255,255,255,0.02)",color:outcome===o.v?o.c:"#8ab4cc",fontSize:14}}>{o.l}</button>
          );  })}
        </div>
        {outcome&&<div style={{padding:"9px 12px",borderRadius:5,fontSize:14,lineHeight:1.75,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",color:"#c0dcf0"}}>
          {outcome==="strong_fit"&&"Move to Event Path - send formal invitation within 24 hours."}
          {outcome==="possible_fit"&&"Follow up within 24 hrs. One more touch before deciding on event invitation."}
          {outcome==="bad_timing"&&"Warm close. Add to nurture sequence. Re-engage when event is scheduled."}
          {outcome==="not_a_fit"&&"Gracious close. Maintain goodwill."}
          {outcome==="no_show"&&"Send reschedule message within 1 hour. Offer 2 alternative times."}
        </div>}
        <STitle label="Notes" color="#4a9eba"/>
        <textarea value={notes} onChange={function(e){setNotes(e.target.value);}} placeholder="Anything else..." style={{flex:1,background:"#0f1e2e",border:"1px solid rgba(255,255,255,0.05)",color:"#e0ecf8",padding:"5px 7px",borderRadius:4,fontSize:14,lineHeight:1.65,resize:"none",outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
      </div>
    );

    return null;
  }

  async function handleSave() {
    if (!outcome || saving) return;
    setSaving(true);
    try {
      if (contact && contact.id) {
        var SBU = process.env.NEXT_PUBLIC_SUPABASE_URL;
        var SBK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        var h = {"apikey":SBK,"Authorization":"Bearer "+SBK,"Content-Type":"application/json","Prefer":"return=representation"};
        var newStage = outcome==="not_a_fit"?"Lost - Not a Fit":"Fit Call Completed";
        var newStatus = outcome==="not_a_fit"?"Not a Fit":"Prospect";
        await fetch(SBU+"/rest/v1/contacts?id=eq."+contact.id, {
          method:"PATCH", headers:h,
          body:JSON.stringify({pipeline_stage:newStage,member_status:newStatus,fit_call_outcome:outcome,primary_challenge:challenge,pressure_categories:pressure,high_fit_cues:cues,red_flags:flags,fit_call_notes:notes,commitment_confirmed:String(commit),annual_revenue:rev,employee_count:emp,finance_team_size:finTeam,ownership_type:own,reports_to:rpt,industry:ind})
        });
        await fetch(SBU+"/rest/v1/communications", {
          method:"POST", headers:h,
          body:JSON.stringify({contact_id:contact.id,occurred_at:new Date().toISOString(),channel:"Phone",direction:"IN",step_label:"Fit Call Completed",body:"Fit call completed. Outcome: "+outcome+". Challenge: "+challenge+". Notes: "+notes,source:"PeerChair",logged_by:"Dalen Lawrence"})
        });
        if (onEnd) onEnd(outcome);
      }
      setSaved(true);
      setTimeout(function(){setSaved(false);}, 3000);
    } catch(e) { console.error("Save error:",e); }
    setSaving(false);
  }

  var sc = SCRIPT[step];

  return (
    <div style={{fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,serif",background:"#0c1520",flex:1,minHeight:0,color:"#eaf2fc",display:"flex",flexDirection:"column",overflow:"hidden"}}>

      {/* HEADER */}
      <div style={{background:"linear-gradient(90deg,#0f1e30,#132840)",borderBottom:"1px solid rgba(180,150,80,0.2)",padding:"9px 20px",display:"flex",alignItems:"center",gap:14,flexShrink:0}}>
        <div style={{flex:1}}>
          <div style={{fontSize:15,fontWeight:600,color:"#fff"}}>{HR.firstName} {HR.lastName}</div>
          <div style={{fontSize:13,color:"#8ab4cc"}}>{HR.title}{HR.company?" - "+HR.company:""}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:live?"#2ecc71":"#6a9aba",boxShadow:live?"0 0 6px #2ecc71":"none"}}/>
          <span style={{fontSize:13,color:"#6a9aba",letterSpacing:1,textTransform:"uppercase"}}>{live?"Live":"Ready"}</span>
        </div>
        <div style={{fontFamily:"'Courier New',monospace",fontSize:22,fontWeight:"bold",color:tc,letterSpacing:2}}>{fmt(secs)}</div>
        <button onClick={function(){setLive(function(v){return !v;});}} style={{background:live?"rgba(231,76,60,0.15)":"rgba(46,204,113,0.15)",border:"1px solid "+(live?"#e74c3c":"#2ecc71"),color:live?"#e74c3c":"#2ecc71",padding:"5px 13px",borderRadius:4,cursor:"pointer",fontSize:14,letterSpacing:1,textTransform:"uppercase"}}>{live?"End":"Start"}</button>
      </div>

      {/* BODY - 3 column */}
      <div style={{display:"grid",gridTemplateColumns:"255px 1fr 255px",flex:1,overflow:"hidden",minHeight:0}}>

        {/* LEFT - Script */}
        <div style={{background:"#0f1e2e",borderRight:"1px solid rgba(255,255,255,0.06)",padding:"12px 11px",overflowY:"auto",display:"flex",flexDirection:"column"}}>
          <div style={{fontSize:13,letterSpacing:3,color:C,textTransform:"uppercase",marginBottom:9,flexShrink:0}}>Conversation Guide</div>
          <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:3}}>
            {SCRIPT.map(function(s, i) {
              var isActive = i === step;
              var isDone = i < step;
              return (
                <div key={s.id} onClick={function(){setStep(i);}} style={{borderRadius:5,border:"1px solid "+(isActive?s.contextual?"rgba(230,126,34,0.35)":"rgba(201,168,76,0.32)":"rgba(255,255,255,0.04)"),background:isActive?s.contextual?"rgba(230,126,34,0.04)":"rgba(201,168,76,0.04)":"transparent",cursor:"pointer",transition:"all 0.2s",marginBottom:2}}>
                  <div style={{padding:"6px 9px",display:"flex",alignItems:"center",gap:7}}>
                    <div style={{width:16,height:16,borderRadius:"50%",flexShrink:0,background:isActive?(s.contextual?"#e67e22":C):isDone?"rgba(201,168,76,0.22)":"rgba(255,255,255,0.06)",color:isActive?"#0c1520":isDone?"#f0c84a":"#8ab4cc",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:"bold"}}>
                      {isDone?"v":s.contextual?"?":i+1}
                    </div>
                    <div>
                      <div style={{fontSize:12,color:isActive?(s.contextual?"#e67e22":C):isDone?"rgba(201,168,76,0.5)":"#8ab4cc",letterSpacing:"0.5px",textTransform:"uppercase"}}>{s.label}</div>
                      <div style={{fontSize:11,color:s.contextual?"rgba(230,126,34,0.35)":"#5a8aaa",letterSpacing:1}}>{s.tag}</div>
                    </div>
                  </div>
                  {isActive&&<div style={{padding:"0 9px 9px 32px",overflow:"hidden"}}>
                    <div style={{fontSize:14,color:"#f0f6ff",lineHeight:1.85,fontStyle:"italic",marginBottom:8,padding:"8px 12px",background:"rgba(255,255,255,0.04)",borderRadius:5,borderLeft:"2px solid rgba(255,255,255,0.2)"}}>"{getPrompt(s)}"</div>
                    {s.fallback&&<div>
                      <div style={{fontSize:11,color:"#5a8aaa",letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>If no response:</div>
                      <div style={{fontSize:13,color:"#e8f2ff",lineHeight:1.75,fontStyle:"italic",padding:"8px 12px",background:"rgba(240,200,74,0.05)",borderRadius:5,borderLeft:"2px solid #f0c84a"}}>"{s.fallback}"</div>
                    </div>}
                  </div>}
                </div>
              );
            })}
          </div>
          <div style={{display:"flex",gap:5,paddingTop:9,borderTop:"1px solid rgba(255,255,255,0.04)",flexShrink:0,marginTop:"auto"}}>
            <button onClick={function(){setStep(function(s){return Math.max(0,s-1);});}} style={{flex:1,padding:"5px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",color:"#8ab4cc",borderRadius:4,cursor:"pointer",fontSize:13,textTransform:"uppercase"}}>Prev</button>
            <button onClick={function(){setStep(function(s){return Math.min(SCRIPT.length-1,s+1);});}} style={{flex:1,padding:"5px",background:"rgba(201,168,76,0.05)",border:"1px solid rgba(201,168,76,0.18)",color:C,borderRadius:4,cursor:"pointer",fontSize:13,textTransform:"uppercase"}}>Next</button>
          </div>
        </div>

        {/* CENTER - Dynamic */}
        <div style={{padding:"14px 16px",overflow:"auto",display:"flex",flexDirection:"column"}}>
          {renderMiddle()}
        </div>

        {/* RIGHT - Contact + Notes */}
        <div style={{background:"#0a1825",borderLeft:"1px solid rgba(255,255,255,0.06)",padding:"12px",overflow:"auto",display:"flex",flexDirection:"column",gap:7}}>

          {/* Contact card */}
          <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:6,padding:"9px 10px",flexShrink:0}}>
            <div style={{fontSize:13,fontWeight:600,color:"#fff",marginBottom:1}}>{HR.firstName} {HR.lastName}</div>
            <div style={{fontSize:13,color:"#9ac4dc"}}>{HR.title}</div>
            <div style={{fontSize:13,color:"#9ac4dc",marginBottom:6}}>{HR.company}</div>
            {HR.email&&<div style={{fontSize:12,color:"#6a9aba"}}>{HR.email}</div>}
          </div>

          {/* Signal */}
          <div style={{padding:"6px 9px",borderRadius:5,background:sig.c+"0e",border:"1px solid "+sig.c+"28",fontSize:13,color:sig.c,textAlign:"center",flexShrink:0}}>{sig.l}</div>

          {/* Counters */}
          <div style={{display:"flex",gap:4,flexShrink:0}}>
            {[["Cues",cues.length,"#2ecc71"],["Flags",flags.length,"#e74c3c"],["Press.",pressure.length,"#4a9eba"]].map(function(row){
              return (
                <div key={row[0]} style={{flex:1,background:"rgba(255,255,255,0.02)",border:"1px solid "+row[2]+"12",borderRadius:5,padding:"6px 3px",textAlign:"center"}}>
                  <div style={{fontSize:17,fontWeight:"bold",color:row[2],lineHeight:1}}>{row[1]}</div>
                  <div style={{fontSize:11,color:"#6a9aba",letterSpacing:1,textTransform:"uppercase",marginTop:2}}>{row[0]}</div>
                </div>
              );
            })}
          </div>

          {/* Company profile - live */}
          {(rev||finTeam||own)&&<div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:5,padding:"7px 9px",flexShrink:0}}>
            <div style={{fontSize:11,letterSpacing:2,color:"#6a9aba",textTransform:"uppercase",marginBottom:5}}>Company Profile</div>
            {[["Revenue",rev],["Finance Team",finTeam],["Ownership",own],["Reports To",rpt],["Industry",ind]].filter(function(item){return item[1];}).map(function(item){
              return (
                <div key={item[0]} style={{display:"flex",justifyContent:"space-between",padding:"2px 0",borderBottom:"1px solid rgba(255,255,255,0.03)",fontSize:13}}>
                  <span style={{color:"#6a9aba"}}>{item[0]}</span><span style={{color:"#c0dcf0"}}>{item[1]}</span>
                </div>
              );
            })}
          </div>}

          {/* Notes */}
          <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:60}}>
            <div style={{fontSize:11,letterSpacing:2,color:"#6a9aba",textTransform:"uppercase",marginBottom:3}}>Notes</div>
            <textarea value={notes} onChange={function(e){setNotes(e.target.value);}} placeholder="Anything else..." style={{flex:1,width:"100%",background:"#0f1e2e",border:"1px solid rgba(255,255,255,0.05)",color:"#e0ecf8",padding:"5px 7px",borderRadius:4,fontSize:13,lineHeight:1.65,resize:"none",outline:"none",fontFamily:"inherit",boxSizing:"border-box",minHeight:60}}/>
          </div>
        </div>
      </div>

      {/* BOTTOM BAR */}
      <div style={{background:"#0a1522",borderTop:"1px solid rgba(255,255,255,0.05)",padding:"7px 20px",display:"flex",alignItems:"center",gap:9,flexShrink:0,flexWrap:"wrap"}}>
        <div style={{fontSize:13,color:"#6a9aba",letterSpacing:2,textTransform:"uppercase",flexShrink:0}}>Outcome:</div>
        <div style={{display:"flex",gap:5,flex:1,flexWrap:"wrap"}}>
          {OUTCOMES.map(function(o){ return (
            <button key={o.v} onClick={function(){setOutcome(o.v);}} style={{padding:"4px 9px",borderRadius:4,cursor:"pointer",border:"1px solid "+(outcome===o.v?o.c:"rgba(255,255,255,0.07)"),background:outcome===o.v?o.c+"12":"rgba(255,255,255,0.02)",color:outcome===o.v?o.c:"#7aaac8",fontSize:13}}>{o.l}</button>
          );  })}
        </div>
        {onBack&&<button onClick={onBack} style={{padding:"7px 14px",background:"transparent",border:"1px solid rgba(255,255,255,0.1)",color:"#7a9bb8",borderRadius:4,cursor:"pointer",fontSize:13,flexShrink:0}}>Back</button>}
        <button onClick={handleSave} disabled={!outcome||saving} style={{padding:"7px 20px",background:saved?"rgba(46,204,113,0.16)":"rgba(201,168,76,0.18)",border:"1px solid "+(saved?"#2ecc71":"rgba(201,168,76,0.35)"),color:saved?"#2ecc71":C,borderRadius:5,cursor:outcome?"pointer":"default",fontSize:13,letterSpacing:"1px",textTransform:"uppercase",flexShrink:0}}>
          {saving?"Saving...":saved?"Saved":"Save & Close"}
        </button>
      </div>
    </div>
  );
}
