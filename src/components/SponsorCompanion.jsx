"use client"
import { useState, useRef, useEffect } from "react";

var G   = "#f0c84a";
var PUR = "#9b59b6";
var BG  = "#080f1a";
var BG2 = "#0c1520";
var BG3 = "#0f1e2e";
var T = {text:"#e8f2ff",muted:"#7a9bb8",dim:"#3a5a74",border:"rgba(255,255,255,0.06)",green:"#2ecc71",red:"#e74c3c",orange:"#e67e22",blue:"#4a9eba"};
var C = PUR;

// Fallback hardcoded script — overridden by Supabase if templates exist
var DEFAULT_SCRIPT = [
  {id:"open",     label:"Opening",           tag:"INTRO",      contextual:false,
   prompt:"Thanks for making time, {first_name}. My goal today is simple — learn about {company} and what you are trying to accomplish, share what CFO Circle is building in Los Angeles, and figure out together if there is a fit worth exploring. Sound good?",
   fallback:null},
  {id:"goals",    label:"Their Goals",       tag:"QUALIFY",    contextual:false,
   prompt:"Tell me a bit about how {company} works with CFOs and finance leaders. What does a great client relationship look like for you in that space?",
   fallback:"Are you more focused on the accounting and advisory side, or do you also work on transactions and capital events?"},
  {id:"pitch",    label:"CFO Circle Pitch",  tag:"PITCH",      contextual:false,
   prompt:"CFO Circle is a curated monthly peer group for CFOs of privately held companies in the $20M to $500M range. Ten to fourteen members. Confidential, issue-based discussion. No vendors in the room during meetings. Sponsors access the group through educational presentations, hosting, and relationship exposure — not sales time.",
   fallback:"The members are exactly your target market. They are making decisions about systems, advisors, banks, and service partners right now."},
  {id:"fit",      label:"Category Fit",      tag:"QUALIFY",    contextual:false,
   prompt:"We structure sponsorships by category — one firm per category per group. Given what you do, I would put {company} in the {category} seat. Does that feel right?",
   fallback:"Are there other areas where you work with CFOs that I should know about?"},
  {id:"host",     label:"Host Venue",        tag:"HOST",       contextual:true,
   prompt:"One of the most visible sponsor roles is hosting — providing the space for our monthly meeting. A boardroom or conference suite that fits 15 to 18 people. Does {company} have something like that in Los Angeles or the Valley?",
   fallback:"If not, no problem — we have other options. Hosting is optional but sponsors who host tend to build relationships fastest."},
  {id:"invest",   label:"Investment",        tag:"PRICING",    contextual:true,
   prompt:"Sponsorship is $5,000 per year — one seat per category. It includes hosting opportunities, an educational presentation slot, and ongoing relationship access to CFO members over time.",
   fallback:"We keep it at six sponsors total. Once a category seat is filled, it is closed for the year — exclusivity is part of the value."},
  {id:"close",    label:"Close",             tag:"CLOSE",      contextual:false,
   prompt:"Based on what you have shared, I think {company} is a strong fit for the {category} seat. The next step is for me to send you the sponsorship overview and proposed meeting dates. From there we can talk specifics. Does that work?",
   fallback:"If you want to see it in person first, I can also invite you to sit in on a meeting as a guest before committing."},
];

var OUTCOMES = [
  {v:"committed",     l:"Committed",           c:"#2ecc71"},
  {v:"proposal_sent", l:"Proposal Sent",        c:"#f0c84a"},
  {v:"not_now",       l:"Not Now / Bad Timing", c:"#e67e22"},
  {v:"not_a_fit",     l:"Not a Fit",            c:"#e74c3c"},
  {v:"follow_up",     l:"Schedule Follow-Up",   c:"#4a9eba"},
  {v:"no_show",       l:"No Show",              c:"#7f8c8d"},
];
var INTEREST_SIGS = [
  {min:0, l:"Listening...",   c:"#7aaac8"},
  {min:1, l:"Some Interest",  c:"#e67e22"},
  {min:2, l:"Engaged",        c:"#f0c84a"},
  {min:3, l:"Strong Signal",  c:"#2ecc71"},
];
var HOST_OPTS     = ["Unknown","Yes — has space","Adjacent / partner space","No"];
var WARMTH_OPTS   = ["Cold","Warm","Met in person","Referred","Existing relationship"];
var CATEGORY_OPTS = ["Accounting/Advisory","Commercial Banking","Law Firm","Executive Search","HR/Payroll","Insurance","Technology","Commercial Real Estate","Advisory/M&A","Other"];
var INTEREST_CUES = ["Asks about ROI","Asks who else sponsors","Mentions existing CFO relationships","Asks about exclusivity","Asks about the members","Has hosted events before","Brings up budget proactively","Names specific CFOs they know"];
var RED_FLAGS     = ["Expects sales time","Wants member contact lists","No budget authority","Sees it as lead gen","Won't commit annually","Wants to pitch at meetings"];

function fmt(s) { return ("0"+Math.floor(s/60)).slice(-2)+":"+(("0"+(s%60)).slice(-2)); }

function SBfetch(path) {
  var SBU = process.env.NEXT_PUBLIC_SUPABASE_URL;
  var SBK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return fetch(SBU+"/rest/v1/"+path, {headers:{"apikey":SBK,"Authorization":"Bearer "+SBK}}).then(function(r){return r.json();});
}

function Chip(props) {
  var on=props.on; var label=props.label; var color=props.color||C; var onClick=props.onClick;
  return (
    <div onClick={onClick} style={{display:"flex",alignItems:"flex-start",gap:5,padding:"5px 7px",borderRadius:4,cursor:"pointer",background:on?color+"12":"rgba(255,255,255,0.02)",border:"1px solid "+(on?color+"40":"rgba(255,255,255,0.05)"),fontSize:13,color:on?"#dce8f5":"#9ac4dc",lineHeight:1.3}}>
      <div style={{width:11,height:11,borderRadius:2,flexShrink:0,marginTop:1,border:"1px solid "+(on?color:"rgba(255,255,255,0.12)"),background:on?color:"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:"#0c1520",fontWeight:"bold"}}>{on?"v":""}</div>
      {label}
    </div>
  );
}

function Sel(props) {
  var label=props.label; var val=props.val; var set=props.set; var opts=props.opts; var highlight=props.highlight;
  return (
    <div>
      <div style={{fontSize:13,letterSpacing:2,color:highlight?C:"#7aaac8",textTransform:"uppercase",marginBottom:3}}>{label}</div>
      <select value={val} onChange={function(e){set(e.target.value);}} style={{width:"100%",background:BG3,border:"1px solid "+(val&&highlight?C+"45":"rgba(255,255,255,0.08)"),color:val?"#e0ecf8":"#7aaac8",padding:"5px 7px",borderRadius:4,fontSize:14,outline:"none",cursor:"pointer",boxSizing:"border-box"}}>
        <option value="">—</option>
        {opts.map(function(o){return <option key={o}>{o}</option>;})}
      </select>
    </div>
  );
}

function STitle(props) {
  var label=props.label; var color=props.color||C;
  return <div style={{fontSize:13,letterSpacing:3,color:color,textTransform:"uppercase",marginBottom:8,display:"flex",alignItems:"center",gap:7}}>{label}<div style={{flex:1,height:1,background:color+"18"}}/></div>;
}

export default function SponsorCompanion(props) {
  var contact   = props.contact   || {};
  var deal      = props.deal      || {};
  var onBack    = props.onBack;
  var onEnd     = props.onEnd;

  var firstName  = contact.first_name  || contact.firstName  || "";
  var lastName   = contact.last_name   || contact.lastName   || "";
  var company    = contact.company     || contact.company_name || "";
  var dealId     = deal.id             || null;
  var companyId  = contact.company_id  || contact.id          || null;

  var [script,    setScript]    = useState(DEFAULT_SCRIPT);
  var [step,      setStep]      = useState(0);
  var [cues,      setCues]      = useState([]);
  var [flags,     setFlags]     = useState([]);
  var [hostViable,setHostViable]= useState("");
  var [warmth,    setWarmth]    = useState("");
  var [catSeat,   setCatSeat]   = useState(contact.category || deal.category_seat || "");
  var [notes,     setNotes]     = useState("");
  var [outcome,   setOutcome]   = useState("");
  var [live,      setLive]      = useState(false);
  var [secs,      setSecs]      = useState(0);
  var [saved,     setSaved]     = useState(false);
  var [saving,    setSaving]    = useState(false);
  var timer = useRef(null);

  // Load script from Supabase templates
  useEffect(function() {
    SBfetch("template_groups?category=eq.sponsor_discovery&type=eq.call_script&order=sort_order.asc&select=id,name,active_variant")
      .then(function(groups) {
        if (!Array.isArray(groups) || groups.length === 0) return;
        var ids = groups.map(function(g){return g.id;}).join(",");
        return SBfetch("template_variants?group_id=in.("+ids+")&select=group_id,variant,body,fallback")
          .then(function(variants) {
            if (!Array.isArray(variants)) return;
            var built = groups.map(function(g, i) {
              var av = g.active_variant || "A";
              var v  = variants.find(function(vv){return vv.group_id===g.id && vv.variant===av;});
              var def = DEFAULT_SCRIPT[i] || {};
              return {
                id:         def.id || "step"+i,
                label:      g.name.replace("Sponsor Discovery — ",""),
                tag:        def.tag || "SCRIPT",
                contextual: def.contextual || false,
                prompt:     v ? v.body    : def.prompt,
                fallback:   v ? v.fallback: def.fallback,
                groupId:    g.id,
              };
            });
            setScript(built);
          });
      })
      .catch(function(e){ console.warn("Script load error:", e); });
  }, []);

  useEffect(function() {
    if (live) { timer.current = setInterval(function(){setSecs(function(s){return s+1;});},1000); }
    else { clearInterval(timer.current); }
    return function(){clearInterval(timer.current);};
  }, [live]);

  function fill(text) {
    return (text||"")
      .replace(/{first_name}/g, firstName||"them")
      .replace(/{company}/g,    company||"your firm")
      .replace(/{category}/g,   catSeat||"your category");
  }

  function tog(arr, set, v) {
    set(function(p){ return p.includes(v) ? p.filter(function(x){return x!==v;}) : p.concat([v]); });
  }

  function getSig() {
    if (flags.length >= 2) return {l:"Caution",        c:T.red};
    if (cues.length >= 3)  return {l:"Strong Signal",  c:T.green};
    if (cues.length >= 1)  return {l:"Some Interest",  c:T.orange};
    return                        {l:"Listening...",   c:"#7aaac8"};
  }
  var sig = getSig();
  var tc = secs>1200?"#e74c3c":secs>900?"#f39c12":"#2ecc71";

  function renderCenter() {
    var sc = script[step];
    if (!sc) return null;
    var id = sc.id;

    if (id === "open") return (
      <div style={{height:"100%",display:"flex",flexDirection:"column",gap:14,justifyContent:"center"}}>
        <STitle label="Opening — Read When Call Begins"/>
        <div style={{padding:"20px 24px",background:"rgba(155,89,182,0.06)",border:"1px solid "+C+"25",borderLeft:"3px solid "+C,borderRadius:8,fontSize:16,color:"#ddeeff",lineHeight:2,fontStyle:"italic"}}>
          "{fill(sc.prompt)}"
        </div>
        <div style={{padding:"11px 14px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:6,fontSize:13,color:T.dim,lineHeight:1.7}}>
          Set the frame, confirm you have 15 minutes, and get their buy-in before moving forward.
        </div>
      </div>
    );

    if (id === "goals") return (
      <div style={{height:"100%",display:"flex",flexDirection:"column",gap:9}}>
        <STitle label="How They Work With CFOs"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
          <Sel label="Category Seat" val={catSeat} set={setCatSeat} opts={CATEGORY_OPTS} highlight={true}/>
          <Sel label="Relationship Warmth" val={warmth} set={setWarmth} opts={WARMTH_OPTS}/>
        </div>
        <STitle label="Interest Cues — Check As They Talk" color={T.green}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,flex:1,alignContent:"start"}}>
          {INTEREST_CUES.map(function(c){ return <Chip key={c} label={c} on={cues.includes(c)} color={T.green} onClick={function(){tog(cues,setCues,c);}}/>; })}
        </div>
      </div>
    );

    if (id === "pitch") return (
      <div style={{height:"100%",display:"flex",flexDirection:"column",gap:9}}>
        <STitle label="What Sponsors GET" color={T.green}/>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {["Monthly meeting attendance (relationship access, not selling)","Educational presentation slot — 1x per year, content approved by you","Meeting hosting opportunity — highest visibility role","3 CFO intro requests per quarter from the Chapter Director","Brand presence in chapter communications","Category exclusivity — one firm per seat per group"].map(function(item){
            return <div key={item} style={{display:"flex",gap:8,fontSize:13,color:T.muted,lineHeight:1.5}}><span style={{color:T.green,flexShrink:0}}>✓</span>{item}</div>;
          })}
        </div>
        <STitle label="What Sponsors DON'T GET" color={T.red}/>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {["Sales time or pitching access inside meetings","Member contact lists","Influence over membership","Access to confidential discussions"].map(function(item){
            return <div key={item} style={{display:"flex",gap:8,fontSize:13,color:T.muted,lineHeight:1.5}}><span style={{color:T.red,flexShrink:0}}>✕</span>{item}</div>;
          })}
        </div>
      </div>
    );

    if (id === "fit") return (
      <div style={{height:"100%",display:"flex",flexDirection:"column",gap:9}}>
        <STitle label="Category Seat — Confirm"/>
        <Sel label="Their Category" val={catSeat} set={setCatSeat} opts={CATEGORY_OPTS} highlight={true}/>
        {catSeat && <div style={{padding:"10px 13px",background:C+"0a",border:"1px solid "+C+"30",borderRadius:6,fontSize:14,color:T.text,lineHeight:1.7}}>
          "I would put {company||"your firm"} in the <strong style={{color:C}}>{catSeat}</strong> seat. That category is currently open in the Los Angeles group."
        </div>}
        <STitle label="Red Flags — Mark If Present" color={T.red}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
          {RED_FLAGS.map(function(f){ return <Chip key={f} label={f} on={flags.includes(f)} color={T.red} onClick={function(){tog(flags,setFlags,f);}}/>; })}
        </div>
      </div>
    );

    if (id === "host") return (
      <div style={{height:"100%",display:"flex",flexDirection:"column",gap:9}}>
        <STitle label="Host Venue — Explore"/>
        <Sel label="Host Viable?" val={hostViable} set={setHostViable} opts={HOST_OPTS} highlight={true}/>
        {hostViable === "Yes — has space" && <div style={{padding:"10px 13px",background:T.green+"0a",border:"1px solid "+T.green+"30",borderRadius:6,fontSize:13,color:T.text,lineHeight:1.7}}>
          Hosting sponsor — highest visibility. Gets name on the meeting, first to greet members, most natural relationship building. Flag for priority close.
        </div>}
        <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid "+T.border,borderRadius:6,padding:"11px 13px"}}>
          <div style={{fontSize:11,letterSpacing:2,color:T.dim,textTransform:"uppercase",marginBottom:6}}>Space requirements</div>
          {["Conference room / boardroom seating 15-18","Good A/V for occasional presentations","Accessible location — no more than 30 min from majority of members","Parking or walkable from transit"].map(function(req){
            return <div key={req} style={{display:"flex",gap:8,fontSize:13,color:T.muted,lineHeight:1.6}}><span style={{color:T.blue}}>→</span>{req}</div>;
          })}
        </div>
      </div>
    );

    if (id === "invest") return (
      <div style={{height:"100%",display:"flex",flexDirection:"column",gap:11}}>
        <STitle label="Sponsorship Investment"/>
        <div style={{padding:"14px 16px",borderRadius:7,textAlign:"center",background:C+"0a",border:"1px solid "+C+"30"}}>
          <div style={{fontSize:13,color:T.muted,textTransform:"uppercase",letterSpacing:2,marginBottom:6}}>Annual Sponsorship</div>
          <div style={{fontSize:32,fontWeight:"bold",color:C}}>$5,000</div>
          <div style={{fontSize:13,color:T.muted,marginTop:4}}>per year · per category seat · per group</div>
        </div>
        <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid "+T.border,borderRadius:6,padding:"11px 13px"}}>
          <div style={{fontSize:11,letterSpacing:2,color:T.dim,textTransform:"uppercase",marginBottom:6}}>Includes</div>
          {["12 monthly meeting appearances","1 educational presentation slot","Hosting opportunities (if viable)","Category exclusivity for the full year"].map(function(item){
            return <div key={item} style={{display:"flex",gap:8,fontSize:13,color:T.muted,lineHeight:1.6}}><span style={{color:T.green}}>✓</span>{item}</div>;
          })}
        </div>
        <div style={{padding:"9px 12px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:6,fontSize:14,color:"#ddeaf8",lineHeight:1.8,fontStyle:"italic"}}>"Sponsor success is measured through relationship depth and credibility — not lead volume."</div>
      </div>
    );

    if (id === "close") return (
      <div style={{height:"100%",display:"flex",flexDirection:"column",gap:9}}>
        <STitle label="Discovery Call Outcome"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
          {OUTCOMES.map(function(o){ return (
            <button key={o.v} onClick={function(){setOutcome(o.v);}} style={{padding:"13px 10px",borderRadius:6,cursor:"pointer",border:"1px solid "+(outcome===o.v?o.c:"rgba(255,255,255,0.08)"),background:outcome===o.v?o.c+"14":"rgba(255,255,255,0.02)",color:outcome===o.v?o.c:"#8ab4cc",fontSize:14}}>{o.l}</button>
          ); })}
        </div>
        {outcome && <div style={{padding:"9px 12px",borderRadius:5,fontSize:14,lineHeight:1.75,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",color:"#c0dcf0"}}>
          {outcome==="committed"     && "Send contract + onboarding doc within 24 hours. Confirm first meeting date."}
          {outcome==="proposal_sent" && "Send sponsorship overview today. Follow up in 48 hours."}
          {outcome==="not_now"       && "Warm close. Add to nurture. Re-engage when next group launches."}
          {outcome==="not_a_fit"     && "Gracious close. Category mismatch or wrong mindset — maintain goodwill."}
          {outcome==="follow_up"     && "Book a second call before ending this one. Don't leave without a date."}
          {outcome==="no_show"       && "Send reschedule within 1 hour. Offer 2 alternative times."}
        </div>}
        <STitle label="Notes" color={T.blue}/>
        <textarea value={notes} onChange={function(e){setNotes(e.target.value);}} placeholder="What stood out. Host potential. Budget signals. Objections. Next step." style={{flex:1,background:BG3,border:"1px solid rgba(255,255,255,0.05)",color:"#e0ecf8",padding:"7px 9px",borderRadius:4,fontSize:14,lineHeight:1.65,resize:"none",outline:"none",fontFamily:"inherit",boxSizing:"border-box",minHeight:80}}/>
      </div>
    );

    return null;
  }

  async function handleSave() {
    if (!outcome || saving) return;
    setSaving(true);
    try {
      var SBU = process.env.NEXT_PUBLIC_SUPABASE_URL;
      var SBK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      var h = {"apikey":SBK,"Authorization":"Bearer "+SBK,"Content-Type":"application/json","Prefer":"return=representation"};
      var stageMap = {committed:"Verbal Commitment",proposal_sent:"Proposal Sent",not_now:"Not Now",not_a_fit:"Declined",follow_up:"Discovery Scheduled",no_show:"Prospect"};
      var newStage = stageMap[outcome] || "Prospect";

      if (dealId) {
        await fetch(SBU+"/rest/v1/sponsor_deals?id=eq."+dealId, {
          method:"PATCH", headers:h,
          body:JSON.stringify({stage:newStage,last_activity_date:new Date().toISOString(),discovery_call_notes:notes,discovery_call_outcome:outcome,category_seat:catSeat})
        });
      }
      if (companyId) {
        await fetch(SBU+"/rest/v1/sponsor_companies?id=eq."+companyId, {
          method:"PATCH", headers:h,
          body:JSON.stringify({host_viable:hostViable||undefined,category:catSeat||undefined})
        });
      }
      await fetch(SBU+"/rest/v1/sponsor_activities", {
        method:"POST", headers:h,
        body:JSON.stringify({company_id:companyId,deal_id:dealId,activity_type:"Discovery Call",outcome:outcome,notes:notes,duration_secs:secs,occurred_at:new Date().toISOString(),logged_by:"Dalen Lawrence"})
      });

      setSaved(true);
      setTimeout(function(){ if(onEnd) onEnd(outcome); }, 1200);
    } catch(e){ console.error("Save error:",e); }
    setSaving(false);
  }

  var sc = script[step];

  return (
    <div style={{fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,serif",background:BG2,flex:1,minHeight:0,color:"#eaf2fc",display:"flex",flexDirection:"column",overflow:"hidden"}}>

      {/* HEADER */}
      <div style={{background:"linear-gradient(90deg,#0f1e30,#1a1030)",borderBottom:"1px solid "+C+"30",padding:"9px 20px",display:"flex",alignItems:"center",gap:14,flexShrink:0}}>
        <div style={{flex:1}}>
          <div style={{fontSize:15,fontWeight:600,color:"#fff"}}>{firstName} {lastName}</div>
          <div style={{fontSize:13,color:T.muted}}>{contact.title||""}{company?" — "+company:""}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:live?T.green:"#6a9aba",boxShadow:live?"0 0 6px "+T.green:"none"}}/>
          <span style={{fontSize:13,color:T.muted,letterSpacing:1,textTransform:"uppercase"}}>{live?"Live":"Ready"}</span>
        </div>
        <div style={{fontFamily:"'Courier New',monospace",fontSize:22,fontWeight:"bold",color:tc,letterSpacing:2}}>{fmt(secs)}</div>
        <button onClick={function(){setLive(function(v){return !v;});}} style={{background:live?"rgba(231,76,60,0.15)":"rgba(46,204,113,0.15)",border:"1px solid "+(live?"#e74c3c":"#2ecc71"),color:live?"#e74c3c":"#2ecc71",padding:"5px 13px",borderRadius:4,cursor:"pointer",fontSize:14,letterSpacing:1,textTransform:"uppercase"}}>{live?"End":"Start"}</button>
        {onBack&&<button onClick={onBack} style={{background:"transparent",border:"1px solid rgba(255,255,255,0.1)",color:T.muted,padding:"5px 12px",borderRadius:4,cursor:"pointer",fontSize:13}}>← Back</button>}
      </div>

      {/* BODY — 3 column */}
      <div style={{display:"grid",gridTemplateColumns:"255px 1fr 255px",flex:1,overflow:"hidden",minHeight:0}}>

        {/* LEFT — Script */}
        <div style={{background:BG3,borderRight:"1px solid rgba(255,255,255,0.06)",padding:"12px 11px",overflowY:"auto",display:"flex",flexDirection:"column"}}>
          <div style={{fontSize:13,letterSpacing:3,color:C,textTransform:"uppercase",marginBottom:9,flexShrink:0}}>Discovery Script</div>
          <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:3}}>
            {script.map(function(s, i) {
              var isActive = i===step;
              var isDone   = i<step;
              var stepColor = s.contextual ? T.orange : C;
              return (
                <div key={s.id} onClick={function(){setStep(i);}} style={{borderRadius:5,border:"1px solid "+(isActive?stepColor+"55":"rgba(255,255,255,0.04)"),background:isActive?stepColor+"06":"transparent",cursor:"pointer",marginBottom:2}}>
                  <div style={{padding:"6px 9px",display:"flex",alignItems:"center",gap:7}}>
                    <div style={{width:16,height:16,borderRadius:"50%",flexShrink:0,background:isActive?stepColor:isDone?"rgba(155,89,182,0.22)":"rgba(255,255,255,0.06)",color:isActive?"#0c1520":isDone?C:"#8ab4cc",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:"bold"}}>
                      {isDone?"v":s.contextual?"?":i+1}
                    </div>
                    <div>
                      <div style={{fontSize:12,color:isActive?stepColor:isDone?"rgba(155,89,182,0.5)":"#8ab4cc",letterSpacing:"0.5px",textTransform:"uppercase"}}>{s.label}</div>
                      <div style={{fontSize:11,color:s.contextual?T.orange+"55":"#5a8aaa",letterSpacing:1}}>{s.tag}</div>
                    </div>
                  </div>
                  {isActive&&<div style={{padding:"0 9px 9px 32px"}}>
                    <div style={{fontSize:14,color:"#f0f6ff",lineHeight:1.85,fontStyle:"italic",marginBottom:8,padding:"8px 12px",background:"rgba(255,255,255,0.04)",borderRadius:5,borderLeft:"2px solid rgba(255,255,255,0.15)"}}>"{fill(s.prompt)}"</div>
                    {s.fallback&&<div>
                      <div style={{fontSize:11,color:"#5a8aaa",letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>If they go quiet:</div>
                      <div style={{fontSize:13,color:"#e8f2ff",lineHeight:1.75,fontStyle:"italic",padding:"8px 12px",background:C+"05",borderRadius:5,borderLeft:"2px solid "+C}}> "{fill(s.fallback)}"</div>
                    </div>}
                  </div>}
                </div>
              );
            })}
          </div>
          <div style={{display:"flex",gap:5,paddingTop:9,borderTop:"1px solid rgba(255,255,255,0.04)",flexShrink:0,marginTop:"auto"}}>
            <button onClick={function(){setStep(function(s){return Math.max(0,s-1);});}} style={{flex:1,padding:"5px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",color:"#8ab4cc",borderRadius:4,cursor:"pointer",fontSize:13,textTransform:"uppercase"}}>Prev</button>
            <button onClick={function(){setStep(function(s){return Math.min(script.length-1,s+1);});}} style={{flex:1,padding:"5px",background:C+"0a",border:"1px solid "+C+"30",color:C,borderRadius:4,cursor:"pointer",fontSize:13,textTransform:"uppercase"}}>Next</button>
          </div>
        </div>

        {/* CENTER — Dynamic */}
        <div style={{padding:"14px 16px",overflow:"auto",display:"flex",flexDirection:"column"}}>
          {renderCenter()}
        </div>

        {/* RIGHT — Contact + Signal + Notes */}
        <div style={{background:"#0a1825",borderLeft:"1px solid rgba(255,255,255,0.06)",padding:"12px",overflow:"auto",display:"flex",flexDirection:"column",gap:7}}>

          {/* Contact card */}
          <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:6,padding:"9px 10px",flexShrink:0}}>
            <div style={{fontSize:13,fontWeight:600,color:"#fff",marginBottom:1}}>{firstName} {lastName}</div>
            <div style={{fontSize:13,color:T.muted}}>{contact.title||""}</div>
            <div style={{fontSize:13,color:T.muted,marginBottom:catSeat?4:0}}>{company}</div>
            {catSeat&&<div style={{fontSize:12,padding:"2px 8px",borderRadius:10,background:C+"14",border:"1px solid "+C+"30",color:C,display:"inline-block"}}>{catSeat} seat</div>}
          </div>

          {/* Signal */}
          <div style={{padding:"6px 9px",borderRadius:5,background:sig.c+"0e",border:"1px solid "+sig.c+"28",fontSize:13,color:sig.c,textAlign:"center",flexShrink:0}}>{sig.l}</div>

          {/* Counters */}
          <div style={{display:"flex",gap:4,flexShrink:0}}>
            {[["Cues",cues.length,T.green],["Flags",flags.length,T.red]].map(function(row){
              return (
                <div key={row[0]} style={{flex:1,background:"rgba(255,255,255,0.02)",border:"1px solid "+row[2]+"12",borderRadius:5,padding:"6px 3px",textAlign:"center"}}>
                  <div style={{fontSize:17,fontWeight:"bold",color:row[2],lineHeight:1}}>{row[1]}</div>
                  <div style={{fontSize:11,color:"#6a9aba",letterSpacing:1,textTransform:"uppercase",marginTop:2}}>{row[0]}</div>
                </div>
              );
            })}
          </div>

          {/* Objection handles */}
          <div style={{flex:1,overflowY:"auto"}}>
            <STitle label="Objection Handles" color={T.orange}/>
            {[
              {q:"How do we measure ROI?",     a:"Relationship depth and CFO trust over time. Sponsors who expect pipeline churn out. Sponsors who build trust stay for years."},
              {q:"Can we present our product?", a:"Educational content only, approved in advance. No demos. Educate, don't sell."},
              {q:"Can we leave anytime?",       a:"Annual commitment. The scarcity model only works with committed sponsors."},
              {q:"Who else sponsors?",          a:"Confidential until onboarded. I can tell you which category seats are still open."},
            ].map(function(obj){
              return (
                <div key={obj.q} style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:5,padding:"8px 10px",marginBottom:6}}>
                  <div style={{fontSize:11,color:T.orange,fontWeight:600,marginBottom:3}}>{obj.q}</div>
                  <div style={{fontSize:12,color:T.muted,lineHeight:1.6}}>{obj.a}</div>
                </div>
              );
            })}
          </div>

          {/* Notes */}
          <div style={{flexShrink:0}}>
            <div style={{fontSize:11,letterSpacing:2,color:T.dim,textTransform:"uppercase",marginBottom:3}}>Notes</div>
            <textarea value={notes} onChange={function(e){setNotes(e.target.value);}} placeholder="Anything else..." style={{width:"100%",background:BG3,border:"1px solid rgba(255,255,255,0.05)",color:"#e0ecf8",padding:"5px 7px",borderRadius:4,fontSize:13,lineHeight:1.65,resize:"vertical",outline:"none",fontFamily:"inherit",boxSizing:"border-box",minHeight:60}}/>
          </div>
        </div>
      </div>

      {/* BOTTOM BAR */}
      <div style={{background:"#0a1522",borderTop:"1px solid rgba(255,255,255,0.05)",padding:"7px 20px",display:"flex",alignItems:"center",gap:9,flexShrink:0,flexWrap:"wrap"}}>
        <div style={{fontSize:13,color:T.muted,letterSpacing:2,textTransform:"uppercase",flexShrink:0}}>Outcome:</div>
        <div style={{display:"flex",gap:5,flex:1,flexWrap:"wrap"}}>
          {OUTCOMES.map(function(o){ return (
            <button key={o.v} onClick={function(){setOutcome(o.v);}} style={{padding:"4px 9px",borderRadius:4,cursor:"pointer",border:"1px solid "+(outcome===o.v?o.c:"rgba(255,255,255,0.07)"),background:outcome===o.v?o.c+"12":"rgba(255,255,255,0.02)",color:outcome===o.v?o.c:"#7aaac8",fontSize:13}}>{o.l}</button>
          ); })}
        </div>
        <button onClick={handleSave} disabled={!outcome||saving} style={{padding:"7px 20px",background:saved?"rgba(46,204,113,0.16)":C+"18",border:"1px solid "+(saved?"#2ecc71":C+"35"),color:saved?"#2ecc71":C,borderRadius:5,cursor:outcome?"pointer":"default",fontSize:13,letterSpacing:"1px",textTransform:"uppercase",flexShrink:0}}>
          {saving?"Saving...":saved?"Saved":"Save & Close"}
        </button>
      </div>
    </div>
  );
}
