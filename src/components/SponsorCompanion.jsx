"use client"
import { useState, useRef, useEffect } from "react";

var G   = "#f0c84a";
var BG  = "#080f1a";
var BG2 = "#0c1520";
var BG3 = "#0f1e2e";
var PUR = "#9b59b6";
var T = {
  text:"#e8f2ff", muted:"#7a9bb8", dim:"#3a5a74",
  border:"rgba(255,255,255,0.06)",
  green:"#2ecc71", red:"#e74c3c", orange:"#e67e22", blue:"#4a9eba"
};

var SCRIPT = [
  { id:"open", label:"Opening", tag:"INTRO", contextual:false,
    prompt:"Thanks for making time, {first_name}. My goal today is simple — learn about {company} and what you are trying to accomplish, share what CFO Circle is building in Los Angeles, and figure out together if there is a fit worth exploring. Sound good?",
    fallback:null },
  { id:"their_goals", label:"Their Goals", tag:"QUALIFY", contextual:false,
    prompt:"Tell me a bit about how {company} works with CFOs and finance leaders. What does a great client relationship look like for you in that space?",
    fallback:"Are you more focused on the accounting and advisory side, or do you also work on transactions and capital events?" },
  { id:"pitch", label:"CFO Circle Overview", tag:"PITCH", contextual:false,
    prompt:"CFO Circle is a curated monthly peer group for CFOs of privately held companies in the $20M to $500M range. Ten to fourteen members. Confidential, issue-based discussion. No vendors in the room during meetings. Sponsors access the group through educational presentations, hosting, and relationship exposure — not sales time.",
    fallback:"The members are exactly your target market. They are making decisions about systems, advisors, banks, and service partners right now." },
  { id:"fit", label:"Category Fit", tag:"QUALIFY", contextual:false,
    prompt:"We structure sponsorships by category — one firm per category per group. Given what you do, I would put {company} in the {category} seat. Does that feel right?",
    fallback:"Are there other areas where you work with CFOs that I should know about?" },
  { id:"host", label:"Host Venue", tag:"HOST", contextual:true,
    prompt:"One of the most visible sponsor roles is hosting — providing the space for our monthly meeting. A boardroom or conference suite that fits 15 to 18 people. Does {company} have something like that in Los Angeles or the Valley?",
    fallback:"If not, no problem — we have other options. Hosting is optional but sponsors who host tend to build relationships fastest." },
  { id:"investment", label:"Investment", tag:"CONTEXTUAL", contextual:true,
    prompt:"Sponsorship is $5,000 per year — one seat per category, per group. That covers hosting opportunities when applicable, an educational presentation slot once per year, and ongoing relationship access to CFO members at every meeting.",
    fallback:"We keep it at six sponsors total — and we protect exclusivity. Once the accounting seat is filled, it is closed for the year." },
  { id:"close", label:"Close", tag:"CLOSE", contextual:false,
    prompt:"Based on what you have shared, I think {company} is a strong fit for the {category} seat. The next step is for me to send you the sponsorship overview and proposed meeting dates. From there we can talk specifics. Does that work?",
    fallback:"If you want to see it in person first, I can also invite you to sit in on a meeting as a guest before committing." },
];

var OUTCOMES = [
  {v:"committed",     l:"Committed",           c:"#2ecc71"},
  {v:"proposal_sent", l:"Proposal Sent",        c:"#f0c84a"},
  {v:"not_now",       l:"Not Now / Bad Timing", c:"#e67e22"},
  {v:"not_a_fit",     l:"Not a Fit",            c:"#e74c3c"},
  {v:"follow_up",     l:"Schedule Follow-Up",   c:"#4a9eba"},
  {v:"no_show",       l:"No Show",              c:"#7f8c8d"},
];

var HOST_OPTS     = ["Unknown","Yes — has space","Adjacent / partner space","No"];
var WARMTH_OPTS   = ["Cold","Warm","Met in person","Referred","Existing relationship"];
var CATEGORY_OPTS = ["Accounting/Advisory","Commercial Banking","Law Firm","Executive Search","HR/Payroll","Insurance","Technology","Commercial Real Estate","Advisory/M&A","Other"];

function fmtTime(s) {
  var m = Math.floor(s/60); var sc = s%60;
  return (m<10?"0":"")+m+":"+(sc<10?"0":"")+sc;
}

function Chip(props) {
  var on=props.on; var label=props.label; var color=props.color||PUR; var onClick=props.onClick;
  return (
    <div onClick={onClick} style={{display:"flex",alignItems:"flex-start",gap:5,padding:"5px 7px",borderRadius:4,cursor:"pointer",background:on?color+"12":"rgba(255,255,255,0.02)",border:"1px solid "+(on?color+"40":"rgba(255,255,255,0.05)"),fontSize:12,color:on?"#dce8f5":"#9ac4dc",lineHeight:1.3}}>
      <div style={{width:10,height:10,borderRadius:2,flexShrink:0,marginTop:1,border:"1px solid "+(on?color:"rgba(255,255,255,0.12)"),background:on?color:"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#0c1520",fontWeight:"bold"}}>{on?"v":""}</div>
      {label}
    </div>
  );
}

function Sel(props) {
  var label=props.label; var val=props.val; var set=props.set; var opts=props.opts;
  return (
    <div>
      <div style={{fontSize:11,letterSpacing:2,color:T.muted,textTransform:"uppercase",marginBottom:3}}>{label}</div>
      <select value={val} onChange={function(e){set(e.target.value);}} style={{width:"100%",background:BG2,border:"1px solid "+(val?PUR+"45":"rgba(255,255,255,0.08)"),color:val?"#e0ecf8":"#7aaac8",padding:"6px 8px",borderRadius:4,fontSize:13,outline:"none",cursor:"pointer",boxSizing:"border-box"}}>
        <option value="">—</option>
        {opts.map(function(o){return <option key={o}>{o}</option>;})}
      </select>
    </div>
  );
}

function STitle(props) {
  var label=props.label; var color=props.color||PUR;
  return <div style={{fontSize:11,letterSpacing:3,color:color,textTransform:"uppercase",marginBottom:8,display:"flex",alignItems:"center",gap:7}}>{label}<div style={{flex:1,height:1,background:color+"18"}}/></div>;
}

export default function SponsorCompanion(props) {
  var contact = props.contact || {};
  var deal    = props.deal    || {};
  var onBack  = props.onBack;
  var onEnd   = props.onEnd;

  var firstName = contact.first_name || contact.firstName || "";
  var lastName  = contact.last_name  || contact.lastName  || "";
  var company   = contact.company    || "";
  var category  = contact.category   || deal.category_seat || "";
  var dealId    = deal.id            || null;
  var companyId = contact.company_id || null;

  function fillScript(text) {
    return (text||"")
      .replace(/{first_name}/g, firstName||"them")
      .replace(/{company}/g,    company||"your firm")
      .replace(/{category}/g,   catOverride||category||"your category");
  }

  var [step,setStep]           = useState(0);
  var [fb,setFb]               = useState({});
  var [hostViable,setHostViable] = useState("");
  var [warmth,setWarmth]       = useState("");
  var [catOverride,setCatOverride] = useState(category);
  var [notes,setNotes]         = useState("");
  var [outcome,setOutcome]     = useState("");
  var [live,setLive]           = useState(false);
  var [secs,setSecs]           = useState(0);
  var [saved,setSaved]         = useState(false);
  var [saving,setSaving]       = useState(false);
  var timer = useRef(null);

  useEffect(function() {
    if (live) { timer.current = setInterval(function(){setSecs(function(s){return s+1;});},1000); }
    else { clearInterval(timer.current); }
    return function(){clearInterval(timer.current);};
  }, [live]);

  var nonCtx = SCRIPT.filter(function(s){return !s.contextual;});
  var ncIdx  = nonCtx.indexOf(SCRIPT[step]);
  var progress = ncIdx>=0 ? Math.round((ncIdx/(nonCtx.length-1))*100) : 100;
  var cur = SCRIPT[step];

  async function saveOutcome() {
    if (!outcome) return;
    setSaving(true);
    try {
      var SBU=process.env.NEXT_PUBLIC_SUPABASE_URL;
      var SBK=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      var h={"apikey":SBK,"Authorization":"Bearer "+SBK,"Content-Type":"application/json","Prefer":"return=representation"};
      var stageMap={committed:"Verbal Commitment",proposal_sent:"Proposal Sent",not_now:"Not Now",not_a_fit:"Declined",follow_up:"Discovery Scheduled",no_show:"Prospect"};
      if (dealId) {
        await fetch(SBU+"/rest/v1/sponsor_deals?id=eq."+dealId,{method:"PATCH",headers:h,
          body:JSON.stringify({stage:stageMap[outcome]||"Prospect",last_activity_date:new Date().toISOString(),discovery_call_notes:notes,discovery_call_outcome:outcome})});
      }
      if (companyId && hostViable) {
        await fetch(SBU+"/rest/v1/sponsor_companies?id=eq."+companyId,{method:"PATCH",headers:h,body:JSON.stringify({host_viable:hostViable})});
      }
      await fetch(SBU+"/rest/v1/sponsor_activities",{method:"POST",headers:h,
        body:JSON.stringify({company_id:companyId,deal_id:dealId,activity_type:"Discovery Call",outcome:outcome,notes:notes,duration_secs:secs,occurred_at:new Date().toISOString(),logged_by:"Dalen Lawrence"})});
      setSaved(true);
      setTimeout(function(){if(onEnd)onEnd();},1200);
    } catch(e){console.error("saveOutcome:",e);}
    setSaving(false);
  }

  return (
    <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden",background:BG,fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,serif",color:T.text}}>

      {/* HEADER */}
      <div style={{background:"linear-gradient(135deg,#0f1e30,#1a1030,#0f1e30)",borderBottom:"1px solid "+PUR+"30",padding:"14px 22px",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <button onClick={onBack} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:13,padding:0}}>← Back</button>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:2}}>
              <div style={{fontSize:11,color:PUR,letterSpacing:3,textTransform:"uppercase",fontWeight:600}}>Sponsor Discovery Call</div>
              {live&&<div style={{display:"flex",alignItems:"center",gap:5}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:T.green,boxShadow:"0 0 6px "+T.green}}/>
                <span style={{fontSize:11,color:T.green,fontWeight:600,letterSpacing:1}}>{fmtTime(secs)}</span>
              </div>}
            </div>
            <div style={{fontSize:15,fontWeight:600,color:"#fff"}}>{firstName} {lastName}</div>
            <div style={{fontSize:12,color:T.muted}}>{company}{category?" · "+category+" seat":""}</div>
          </div>
          {!live
            ?<button onClick={function(){setLive(true);}} style={{padding:"8px 20px",background:"rgba(155,89,182,0.15)",border:"1px solid "+PUR+"50",color:PUR,borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:700}}>▶ Start Call</button>
            :<button onClick={function(){setLive(false);}} style={{padding:"8px 20px",background:"rgba(231,76,60,0.1)",border:"1px solid rgba(231,76,60,0.35)",color:T.red,borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:700}}>■ End Call</button>}
        </div>
        <div style={{marginTop:12,height:3,background:"rgba(255,255,255,0.05)",borderRadius:2,overflow:"hidden"}}>
          <div style={{height:"100%",width:progress+"%",background:"linear-gradient(90deg,"+PUR+","+PUR+"80)",borderRadius:2,transition:"width 0.4s"}}/>
        </div>
        <div style={{display:"flex",gap:4,marginTop:6}}>
          {SCRIPT.filter(function(s){return !s.contextual;}).map(function(s){
            var idx=SCRIPT.indexOf(s); var isCur=idx===step; var isPast=idx<step;
            return <div key={s.id} onClick={function(){setStep(idx);}} style={{flex:1,height:20,borderRadius:3,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",background:isCur?PUR:isPast?PUR+"30":"rgba(255,255,255,0.04)",border:"1px solid "+(isCur?PUR+"80":isPast?PUR+"20":"rgba(255,255,255,0.06)"),fontSize:8,color:isCur?"#fff":isPast?PUR+"aa":T.dim,fontWeight:isCur?700:400,letterSpacing:0.5,textTransform:"uppercase",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",padding:"0 4px"}}>{s.label}</div>;
          })}
        </div>
      </div>

      {/* BODY */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 300px",flex:1,overflow:"hidden",minHeight:0}}>

        {/* LEFT — SCRIPT */}
        <div style={{overflowY:"auto",padding:"20px 24px",display:"flex",flexDirection:"column",gap:16}}>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {SCRIPT.map(function(s,i){
              var isCur=i===step; var isPast=i<step; var color=s.contextual?T.blue:PUR;
              return <div key={s.id} onClick={function(){setStep(i);}} style={{padding:"4px 10px",borderRadius:4,cursor:"pointer",fontSize:11,fontWeight:isCur?700:400,background:isCur?color+"18":"rgba(255,255,255,0.02)",border:"1px solid "+(isCur?color+"50":isPast?color+"20":"rgba(255,255,255,0.06)"),color:isCur?color:isPast?color+"80":T.dim,letterSpacing:0.5}}>{s.contextual?"◈ ":""}{s.label}</div>;
            })}
          </div>

          <div style={{background:"linear-gradient(135deg,rgba(155,89,182,0.06),rgba(155,89,182,0.02))",border:"1px solid "+PUR+"25",borderLeft:"3px solid "+PUR,borderRadius:8,padding:"18px 20px"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
              <span style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:PUR+"18",border:"1px solid "+PUR+"35",color:PUR,fontWeight:700,letterSpacing:1}}>{cur.tag}</span>
              <span style={{fontSize:13,fontWeight:600,color:T.text}}>{cur.label}</span>
              {cur.contextual&&<span style={{fontSize:10,color:T.blue,marginLeft:"auto"}}>◈ Use if relevant</span>}
            </div>
            <div style={{fontSize:15,color:"#ddeeff",lineHeight:1.9}}>{fillScript(cur.prompt)}</div>
          </div>

          {cur.fallback&&(
            <div>
              <div style={{fontSize:10,color:T.dim,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>If they go quiet — fallback</div>
              <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:6,padding:"12px 16px",fontSize:13,color:T.muted,lineHeight:1.8,fontStyle:"italic"}}>{fillScript(cur.fallback)}</div>
            </div>
          )}

          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <div style={{flex:1,height:1,background:"rgba(255,255,255,0.04)"}}/>
            <Chip label={"Used fallback"} on={!!fb[cur.id]} color={T.orange} onClick={function(){setFb(function(p){var n=Object.assign({},p);n[cur.id]=!p[cur.id];return n;});}}/>
          </div>

          <div style={{display:"flex",gap:10,marginTop:4}}>
            {step>0&&<button onClick={function(){setStep(function(s){return s-1;});}} style={{flex:1,padding:"10px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",color:T.muted,borderRadius:6,cursor:"pointer",fontSize:13}}>← Back</button>}
            {step<SCRIPT.length-1&&<button onClick={function(){setStep(function(s){return s+1;});}} style={{flex:2,padding:"10px",background:PUR+"18",border:"1px solid "+PUR+"40",color:PUR,borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:700}}>Next → {SCRIPT[step+1]?SCRIPT[step+1].label:""}</button>}
          </div>

          {step===SCRIPT.length-1&&(
            <div style={{background:"rgba(155,89,182,0.05)",border:"1px solid "+PUR+"25",borderRadius:8,padding:"16px 18px",marginTop:4}}>
              <STitle label="Call Outcome"/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:14}}>
                {OUTCOMES.map(function(o){
                  var on=outcome===o.v;
                  return <div key={o.v} onClick={function(){setOutcome(o.v);}} style={{padding:"9px 12px",borderRadius:5,cursor:"pointer",textAlign:"center",fontSize:12,fontWeight:on?700:400,background:on?o.c+"18":"rgba(255,255,255,0.02)",border:"1px solid "+(on?o.c+"50":"rgba(255,255,255,0.07)"),color:on?o.c:T.dim}}>{o.l}</div>;
                })}
              </div>
              <div style={{marginBottom:12}}>
                <div style={{fontSize:10,color:T.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:5}}>Call Notes</div>
                <textarea value={notes} onChange={function(e){setNotes(e.target.value);}} placeholder="What stood out. How they described their CFO relationships. Host potential. Objections. Next step." style={{width:"100%",background:BG2,border:"1px solid rgba(255,255,255,0.08)",color:T.text,padding:"9px 11px",borderRadius:5,fontSize:13,lineHeight:1.7,resize:"vertical",outline:"none",fontFamily:"inherit",boxSizing:"border-box",minHeight:90}}/>
              </div>
              <button onClick={saveOutcome} disabled={!outcome||saving||saved} style={{width:"100%",padding:"11px",background:outcome?"rgba(155,89,182,0.2)":"rgba(255,255,255,0.03)",border:"1px solid "+(outcome?PUR+"60":"rgba(255,255,255,0.08)"),color:outcome?PUR:T.dim,borderRadius:6,cursor:outcome?"pointer":"default",fontSize:14,fontWeight:700,letterSpacing:1}}>
                {saved?"✓ Saved":saving?"Saving…":"Save & Close Call"}
              </button>
            </div>
          )}
        </div>

        {/* RIGHT — REFERENCE PANEL */}
        <div style={{borderLeft:"1px solid "+T.border,background:BG2,overflowY:"auto",padding:"16px"}}>
          <STitle label="Sponsor Details" color={PUR}/>
          <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
            <div><div style={{fontSize:9,letterSpacing:2,color:T.dim,textTransform:"uppercase",marginBottom:3}}>Company</div><div style={{fontSize:13,color:T.text,fontWeight:600}}>{company||"—"}</div></div>
            <div><div style={{fontSize:9,letterSpacing:2,color:T.dim,textTransform:"uppercase",marginBottom:3}}>Contact</div><div style={{fontSize:13,color:T.muted}}>{firstName} {lastName}</div></div>
            <div><div style={{fontSize:9,letterSpacing:2,color:T.dim,textTransform:"uppercase",marginBottom:3}}>Group</div><div style={{fontSize:12,color:T.muted}}>{deal.group_name||"Los Angeles"}</div></div>
            <Sel label="Category Seat" val={catOverride} set={setCatOverride} opts={CATEGORY_OPTS}/>
            <Sel label="Host Viable?" val={hostViable} set={setHostViable} opts={HOST_OPTS}/>
            <Sel label="Warmth" val={warmth} set={setWarmth} opts={WARMTH_OPTS}/>
          </div>

          <STitle label="What Sponsors GET" color={T.green}/>
          <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:20}}>
            {["Monthly meeting attendance (non-selling)","Educational presentation slot (1x/year)","Meeting hosting opportunity","3 CFO intro requests per quarter","Brand visibility in chapter comms","Category exclusivity — 1 per seat"].map(function(item){
              return <div key={item} style={{display:"flex",alignItems:"flex-start",gap:7,fontSize:12,color:T.muted,lineHeight:1.5}}><span style={{color:T.green,flexShrink:0,marginTop:1}}>✓</span>{item}</div>;
            })}
          </div>

          <STitle label="What Sponsors DON'T GET" color={T.red}/>
          <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:20}}>
            {["Sales time or pitching access","Guaranteed leads or referrals","Member contact lists","Access to confidential discussions","Influence over membership"].map(function(item){
              return <div key={item} style={{display:"flex",alignItems:"flex-start",gap:7,fontSize:12,color:T.muted,lineHeight:1.5}}><span style={{color:T.red,flexShrink:0,marginTop:1}}>✕</span>{item}</div>;
            })}
          </div>

          <STitle label="Objection Handles" color={T.orange}/>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {[
              {q:"How do we measure ROI?",a:"Relationship depth and CFO trust over time — not lead volume. Sponsors who expect pipeline churn. Sponsors who understand long-term trust stay for years."},
              {q:"Can we present our product?",a:"Educational content only, approved in advance. No product demos. Educate, don't sell."},
              {q:"What if we want to leave?",a:"Annual commitment. The scarcity model only works with committed sponsors."},
              {q:"Who else is a sponsor?",a:"Confidential until onboarded. I can tell you which category seats are still open."},
            ].map(function(obj){
              return <div key={obj.q} style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:5,padding:"9px 11px"}}>
                <div style={{fontSize:11,color:T.orange,fontWeight:600,marginBottom:4}}>{obj.q}</div>
                <div style={{fontSize:12,color:T.muted,lineHeight:1.6}}>{obj.a}</div>
              </div>;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
