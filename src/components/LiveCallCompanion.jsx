"use client"
import { useState, useRef, useEffect } from "react";

var G = "#f0c84a";
var BG = "#080f1a";
var BG2 = "#0c1520";
var BG3 = "#0f1e2e";
var T = {text:"#e8f2ff",muted:"#7a9bb8",dim:"#3a5a74",border:"rgba(255,255,255,0.06)",green:"#2ecc71",red:"#e74c3c",orange:"#e67e22",blue:"#4a9eba"};

var SCRIPT = [
  {id:"open",label:"Opening",tag:"INTRO",prompt:"Thanks for making time, {name}. I'll keep this to about 15 minutes — understand your world, share what CFO Circle is, and we both decide if it makes sense to go further. Sound good?",fallback:null},
  {id:"co",label:"Company Context",tag:"FIRMOGRAPHIC",prompt:"Before I get into CFO Circle — tell me a bit about your company. Roughly what revenue range are you in, how large is the team, and how long have you been in the seat there?",fallback:"Is the company privately held? PE-backed? I ask because CFO Circle is built specifically for privately held environments — quite different dynamics from public companies."},
  {id:"q1",label:"The One Question",tag:"QUALIFY",prompt:"What is one challenge you're carrying right now that you can't fully discuss with your CEO, board, or team — but you wish you had a trusted group of CFO peers to help you think through?",fallback:"That makes sense — which category has created the most pressure in the past 30 days: cash flow, forecasting, leadership accountability, talent, systems, or managing up?"},
  {id:"menu",label:"Pressure Menu",tag:"PRESSURE",prompt:"Cash and working capital, forecasting and KPIs, leadership accountability, talent and staffing, systems and reporting, managing up with the CEO and board — which of those is loudest right now?",fallback:"If you had a room of high-caliber CFOs for 60 minutes — what topic would you most want to bring?"},
  {id:"ai",label:"AI Probe",tag:"AI",prompt:"A lot of CFOs I speak with carry a quiet concern about AI — not just the tools, but what it means for their team and role, and whether they're moving fast enough. Is that on your radar?",fallback:null},
  {id:"screen",label:"Red Flag Screen",tag:"SCREENING",prompt:"CFO Circle is curated — 10 to 14 members — and quality depends on everyone showing up and contributing. Members who get the most lean in with real issues. Does that kind of peer accountability feel like something you'd embrace?",fallback:"I ask because some people are looking for networking, which is valid — but CFO Circle is issue-based, not connection-based."},
  {id:"commit",label:"Commitment",tag:"CLOSE",prompt:"CFO Circle meets once a month for three hours. Does that kind of consistent monthly commitment feel realistic for where you are right now?",fallback:null},
  {id:"pricing",label:"If Asked — Cost",tag:"CONTEXTUAL",prompt:"Membership is $500 per month, $1,500 per quarter, or $6,000 annually. Annual members receive a complimentary 13th month. Most members expense this as executive development.",fallback:null},
  {id:"close",label:"Close / Next Step",tag:"CLOSE",prompt:"Based on what you've shared — I think you'd be a strong fit. The next step is the Experience Event. Would you be open to attending?",fallback:"Even if the timing isn't perfect right now, I'd love to stay in touch. Would it be okay if I kept you on the list for future events?"},
];

var PRESSURE_OPTS = ["Cash and working capital","Forecasting and KPIs","Leadership team accountability","Talent and staffing","Systems and reporting","Managing up with CEO / Board","AI Readiness & Finance Function Transformation"];
var FIT_CUES = ["Isolation / lonely in the seat","Wants to elevate to strategic","Complexity outpacing systems","Managing-up pressure","PE or investor pressure","Transaction / exit planning","Talent gaps in finance","KPI & forecasting discipline","Reactive decision making"];
var RED_FLAGS = ["Won't commit to participation","Sales intent / wants to pitch","Dominant ego / knows-it-all","Uncomfortable with confidentiality","Not primary finance executive","Company too small or large"];
var OUTCOMES = [{v:"Strong Fit",c:"#2ecc71"},{v:"Possible Fit",c:"#f0c84a"},{v:"Bad Timing",c:"#e67e22"},{v:"Not a Fit",c:"#e74c3c"}];
var REV_OPTS = ["Under $10M","$10M-$20M","$20M-$50M","$50M-$100M","$100M-$250M","Over $250M"];
var EMP_OPTS = ["Under 50","50-200","201-500","501-1,000","Over 1,000"];
var OWN_OPTS = ["Privately Held","PE-Backed","Founder-Led","Family-Owned"];
var RPT_OPTS = ["CEO","Owner / Founder","Board","President / COO"];

function Multi(props) {
  var opts = props.opts;
  var selected = props.selected;
  var onToggle = props.onToggle;
  var color = props.color || G;
  return (
    <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
      {opts.map(function(o) {
        var on = selected.indexOf(o) > -1;
        return (
          <div key={o} onClick={function(){onToggle(o);}} style={{
            padding:"4px 10px",borderRadius:12,cursor:"pointer",fontSize:11,
            background:on?color+"14":"rgba(255,255,255,0.02)",
            border:"1px solid "+(on?color+"50":"rgba(255,255,255,0.08)"),
            color:on?color:T.muted
          }}>{o}</div>
        );
      })}
    </div>
  );
}

function Field(props) {
  var label = props.label;
  var val = props.val;
  var setter = props.setter;
  var opts = props.opts;
  return (
    <div>
      <div style={{fontSize:9,color:T.dim,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>{label}</div>
      <select value={val} onChange={function(e){setter(e.target.value);}} style={{width:"100%",background:BG2,border:"1px solid rgba(255,255,255,0.1)",color:val?T.text:T.dim,padding:"6px 8px",borderRadius:5,fontSize:12,outline:"none",cursor:"pointer",boxSizing:"border-box"}}>
        <option value="">—</option>
        {opts.map(function(o){return <option key={o}>{o}</option>;})}
      </select>
    </div>
  );
}

export default function LiveCallCompanion(props) {
  var contact = props.contact;
  var onEnd = props.onEnd;
  var onBack = props.onBack;

  var name = contact ? (contact.firstName || "Contact") : "Contact";
  var company = contact ? (contact.company || "") : "";
  var title = contact ? (contact.title || "") : "";

  var [step, setStep] = useState(0);
  var [secs, setSecs] = useState(0);
  var [live, setLive] = useState(false);
  var timer = useRef(null);

  var [revenue, setRevenue] = useState("");
  var [employees, setEmployees] = useState("");
  var [ownership, setOwnership] = useState("");
  var [reportsTo, setReportsTo] = useState("");
  var [challenge, setChallenge] = useState("");
  var [pressure, setPressure] = useState([]);
  var [cues, setCues] = useState([]);
  var [flags, setFlags] = useState([]);
  var [notes, setNotes] = useState("");
  var [outcome, setOutcome] = useState("");
  var [commit, setCommit] = useState("");
  var [saving, setSaving] = useState(false);
  var [saved, setSaved] = useState(false);

  useEffect(function() {
    if (live) {
      timer.current = setInterval(function() { setSecs(function(s){ return s+1; }); }, 1000);
    } else {
      clearInterval(timer.current);
    }
    return function() { clearInterval(timer.current); };
  }, [live]);

  function fmt(s) {
    return String(Math.floor(s/60)).padStart(2,"0") + ":" + String(s%60).padStart(2,"0");
  }

  function toggle(arr, setArr, v) {
    if (arr.indexOf(v) > -1) {
      setArr(arr.filter(function(x){ return x !== v; }));
    } else {
      setArr(arr.concat([v]));
    }
  }

  async function handleSave() {
    if (!contact || !contact.id || !outcome) return;
    setSaving(true);
    try {
      var SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
      var SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      var h = {"apikey":SB_KEY,"Authorization":"Bearer "+SB_KEY,"Content-Type":"application/json","Prefer":"return=representation"};
      var newStage = outcome==="Not a Fit" ? "Lost — Not a Fit" : "Fit Call Completed";
      var newStatus = outcome==="Not a Fit" ? "Not a Fit" : "Prospect";
      await fetch(SB_URL+"/rest/v1/contacts?id=eq."+contact.id, {
        method:"PATCH", headers:h,
        body:JSON.stringify({pipeline_stage:newStage,member_status:newStatus,fit_call_outcome:outcome,primary_challenge:challenge,pressure_categories:pressure,high_fit_cues:cues,red_flags:flags,fit_call_notes:notes,commitment_confirmed:commit,annual_revenue:revenue,employee_count:employees,ownership_type:ownership,reports_to:reportsTo})
      });
      await fetch(SB_URL+"/rest/v1/communications", {
        method:"POST", headers:h,
        body:JSON.stringify({contact_id:contact.id,occurred_at:new Date().toISOString(),channel:"Phone",direction:"IN",step_label:"Fit Call Completed",body:"Fit call completed. Outcome: "+outcome+". Challenge: "+challenge+". Notes: "+notes,source:"PeerChair",logged_by:"Dalen Lawrence"})
      });
      setSaved(true);
      if (onEnd) onEnd(outcome);
    } catch(e) { console.error("Save error:",e); }
    setSaving(false);
  }

  var sc = SCRIPT[step];
  var prompt = sc.prompt.replace("{name}", name);

  return (
    <div style={{display:"flex",height:"100%",overflow:"hidden",fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,serif",background:BG,color:T.text}}>

      {/* LEFT — Script */}
      <div style={{width:420,borderRight:"1px solid "+T.border,display:"flex",flexDirection:"column",overflow:"hidden",flexShrink:0}}>

        {/* Header */}
        <div style={{padding:"14px 18px",borderBottom:"1px solid "+T.border,background:BG3,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              <div style={{fontSize:16,fontWeight:600,color:T.text}}>{name}</div>
              <div style={{fontSize:12,color:T.muted}}>{title}{company?" · "+company:""}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:24,fontWeight:700,color:live?T.red:T.muted,fontVariantNumeric:"tabular-nums"}}>{fmt(secs)}</div>
              <button onClick={function(){setLive(function(v){return !v;});}} style={{fontSize:10,padding:"3px 12px",borderRadius:10,cursor:"pointer",fontWeight:600,background:live?"rgba(231,76,60,0.15)":"rgba(46,204,113,0.15)",border:"1px solid "+(live?T.red:T.green),color:live?T.red:T.green}}>
                {live?"PAUSE":"START"}
              </button>
            </div>
          </div>
        </div>

        {/* Step pills */}
        <div style={{display:"flex",gap:4,padding:"10px 14px",borderBottom:"1px solid "+T.border,flexWrap:"wrap",flexShrink:0}}>
          {SCRIPT.map(function(s, i) {
            var active = i === step;
            var done = i < step;
            return (
              <div key={s.id} onClick={function(){setStep(i);}} style={{
                padding:"3px 8px",borderRadius:10,cursor:"pointer",fontSize:10,fontWeight:active?700:400,
                background:active?G+"20":done?"rgba(255,255,255,0.04)":"transparent",
                border:"1px solid "+(active?G+"60":done?"rgba(255,255,255,0.1)":"transparent"),
                color:active?G:done?T.muted:T.dim
              }}>{s.label}</div>
            );
          })}
        </div>

        {/* Script content */}
        <div style={{flex:1,overflowY:"auto",padding:"18px"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
            <span style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:G+"18",border:"1px solid "+G+"40",color:G,fontWeight:600}}>{sc.tag}</span>
            <span style={{fontSize:13,fontWeight:600,color:T.text}}>{sc.label}</span>
          </div>

          <div style={{background:"rgba(240,200,74,0.04)",border:"1px solid rgba(240,200,74,0.15)",borderRadius:8,padding:"14px 16px",fontSize:14,color:T.text,lineHeight:1.85,marginBottom:sc.fallback?16:0}}>
            "{prompt}"
          </div>

          {sc.fallback ? (
            <div>
              <div style={{fontSize:10,color:T.dim,letterSpacing:2,textTransform:"uppercase",marginBottom:6,marginTop:4}}>If no response / go deeper:</div>
              <div style={{background:"rgba(74,154,186,0.05)",border:"1px solid rgba(74,154,186,0.15)",borderRadius:8,padding:"12px 14px",fontSize:13,color:"#a8c8e0",lineHeight:1.8,fontStyle:"italic"}}>
                "{sc.fallback}"
              </div>
            </div>
          ) : null}
        </div>

        {/* Nav buttons */}
        <div style={{padding:"12px 18px",borderTop:"1px solid "+T.border,display:"flex",gap:10,flexShrink:0}}>
          <button onClick={function(){setStep(function(s){return Math.max(0,s-1);});}} disabled={step===0}
            style={{flex:1,padding:"8px",background:"rgba(255,255,255,0.03)",border:"1px solid "+T.border,color:step===0?T.dim:T.muted,borderRadius:6,cursor:step===0?"default":"pointer",fontSize:12}}>
            Prev
          </button>
          <button onClick={function(){setStep(function(s){return Math.min(SCRIPT.length-1,s+1);});}} disabled={step===SCRIPT.length-1}
            style={{flex:1,padding:"8px",background:step===SCRIPT.length-1?"rgba(255,255,255,0.03)":G+"18",border:"1px solid "+(step===SCRIPT.length-1?T.border:G+"50"),color:step===SCRIPT.length-1?T.dim:G,borderRadius:6,cursor:step===SCRIPT.length-1?"default":"pointer",fontSize:12,fontWeight:600}}>
            Next
          </button>
        </div>
      </div>

      {/* RIGHT — Capture */}
      <div style={{flex:1,overflowY:"auto",padding:"20px 24px",display:"flex",flexDirection:"column",gap:18}}>

        <div style={{fontSize:11,color:G,letterSpacing:3,textTransform:"uppercase",fontWeight:600}}>Capture</div>

        {/* Firmographic */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Field label="Revenue Range" val={revenue} setter={setRevenue} opts={REV_OPTS}/>
          <Field label="Employee Count" val={employees} setter={setEmployees} opts={EMP_OPTS}/>
          <Field label="Ownership" val={ownership} setter={setOwnership} opts={OWN_OPTS}/>
          <Field label="Reports To" val={reportsTo} setter={setReportsTo} opts={RPT_OPTS}/>
        </div>

        {/* Challenge */}
        <div>
          <div style={{fontSize:10,color:G,letterSpacing:3,textTransform:"uppercase",marginBottom:6,fontWeight:600}}>Primary Challenge — Their Words</div>
          <textarea value={challenge} onChange={function(e){setChallenge(e.target.value);}} placeholder={"What challenge did "+name+" describe?"} rows={3}
            style={{width:"100%",background:BG2,border:"1px solid rgba(255,255,255,0.1)",color:T.text,padding:"8px 10px",borderRadius:6,fontSize:13,lineHeight:1.7,resize:"none",outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
        </div>

        {/* Pressure */}
        <div>
          <div style={{fontSize:10,color:T.blue,letterSpacing:3,textTransform:"uppercase",marginBottom:6,fontWeight:600}}>Pressure Categories</div>
          <Multi opts={PRESSURE_OPTS} selected={pressure} onToggle={function(v){toggle(pressure,setPressure,v);}} color={T.blue}/>
        </div>

        {/* Fit Cues */}
        <div>
          <div style={{fontSize:10,color:T.green,letterSpacing:3,textTransform:"uppercase",marginBottom:6,fontWeight:600}}>High Fit Cues</div>
          <Multi opts={FIT_CUES} selected={cues} onToggle={function(v){toggle(cues,setCues,v);}} color={T.green}/>
        </div>

        {/* Red Flags */}
        <div>
          <div style={{fontSize:10,color:T.red,letterSpacing:3,textTransform:"uppercase",marginBottom:6,fontWeight:600}}>Red Flags</div>
          <Multi opts={RED_FLAGS} selected={flags} onToggle={function(v){toggle(flags,setFlags,v);}} color={T.red}/>
        </div>

        {/* Commitment */}
        <div>
          <div style={{fontSize:10,color:G,letterSpacing:3,textTransform:"uppercase",marginBottom:6,fontWeight:600}}>Monthly Commitment Confirmed</div>
          <div style={{display:"flex",gap:8}}>
            {["Yes","No","Uncertain"].map(function(v) {
              var on = commit === v;
              return <div key={v} onClick={function(){setCommit(v);}} style={{padding:"6px 16px",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:on?700:400,background:on?G+"18":"rgba(255,255,255,0.03)",border:"1px solid "+(on?G+"50":"rgba(255,255,255,0.08)"),color:on?G:T.muted}}>{v}</div>;
            })}
          </div>
        </div>

        {/* Outcome */}
        <div>
          <div style={{fontSize:10,color:G,letterSpacing:3,textTransform:"uppercase",marginBottom:8,fontWeight:600}}>Fit Call Outcome</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {OUTCOMES.map(function(o) {
              var on = outcome === o.v;
              return <div key={o.v} onClick={function(){setOutcome(o.v);}} style={{padding:"8px 18px",borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:on?700:400,background:on?o.c+"18":"rgba(255,255,255,0.03)",border:"2px solid "+(on?o.c:"rgba(255,255,255,0.08)"),color:on?o.c:T.muted}}>{o.v}</div>;
            })}
          </div>
        </div>

        {/* Notes */}
        <div>
          <div style={{fontSize:10,color:G,letterSpacing:3,textTransform:"uppercase",marginBottom:6,fontWeight:600}}>Call Notes</div>
          <textarea value={notes} onChange={function(e){setNotes(e.target.value);}} placeholder="Additional context, observations, next steps..." rows={4}
            style={{width:"100%",background:BG2,border:"1px solid rgba(255,255,255,0.1)",color:T.text,padding:"8px 10px",borderRadius:6,fontSize:13,lineHeight:1.7,resize:"vertical",outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
        </div>

        {/* Save */}
        <div style={{display:"flex",gap:10,paddingBottom:20}}>
          {onBack ? <button onClick={onBack} style={{padding:"10px 20px",background:"transparent",border:"1px solid "+T.border,color:T.muted,borderRadius:6,cursor:"pointer",fontSize:13}}>Back</button> : null}
          <button onClick={handleSave} disabled={!outcome||saving} style={{flex:1,padding:"12px",borderRadius:6,cursor:outcome&&!saving?"pointer":"default",fontSize:14,fontWeight:700,background:outcome?G+"18":"rgba(255,255,255,0.03)",border:"1px solid "+(outcome?G+"60":"rgba(255,255,255,0.08)"),color:outcome?G:T.dim}}>
            {saving?"Saving...":saved?"Saved to PeerChair":"End Call & Save to PeerChair"}
          </button>
        </div>
      </div>
    </div>
  );
}
