"use client"
import { useState, useRef, useEffect } from "react";

var G = "#f0c84a";
var BG = "#080f1a";
var BG2 = "#0c1520";
var BG3 = "#0f1e2e";
var T = {
  text:"#e8f2ff", muted:"#7a9bb8", dim:"#3a5a74",
  border:"rgba(255,255,255,0.06)", gold:G,
  green:"#2ecc71", red:"#e74c3c", orange:"#e67e22",
  blue:"#4a9eba", purple:"#9b59b6"
};

var SCRIPT = [
  {id:"open", label:"Opening", tag:"INTRO", contextual:false,
    prompt:"Thanks for making time, {name}. My goal today is simple — learn about {company} and what you are trying to accomplish, share what CFO Circle is building in LA, and figure out together if there is a fit worth exploring. Sound good?",
    fallback:null},
  {id:"goals", label:"Their Goals", tag:"QUALIFY", contextual:false,
    prompt:"Tell me a bit about how {company} works with CFOs and finance leaders. What does a great client relationship look like for you in that space?",
    fallback:"Are you more focused on the accounting and advisory side, or do you also work on transactions and capital events?"},
  {id:"pitch", label:"CFO Circle Overview", tag:"PITCH", contextual:false,
    prompt:"CFO Circle is a curated monthly peer group for CFOs of privately held companies in the $20M to $500M range. Ten to fourteen members. Confidential, issue-based discussion. No vendors in the room during meetings. Sponsors access the group through educational presentations, hosting, and relationship exposure — not sales time.",
    fallback:"The members are exactly your target market. They are making decisions about systems, advisors, banks, and service partners right now."},
  {id:"fit", label:"Category Fit", tag:"QUALIFY", contextual:false,
    prompt:"We structure sponsorships by category — one firm per category per group. Given what you do, I would put {company} in the {category} seat. Does that feel right?",
    fallback:"Are there other areas where you work with CFOs that I should know about?"},
  {id:"host", label:"Host Venue", tag:"HOST", contextual:true,
    prompt:"One of the most visible sponsor roles is hosting — providing the space for our monthly meeting. A boardroom or conference suite that fits 15 to 18 people. Does {company} have something like that in Los Angeles or the Valley?",
    fallback:"If hosting is not the right fit, a presenting sponsor slot gives you one educational session per year — 20 minutes, topic approved in advance."},
  {id:"investment", label:"Investment", tag:"PRICING", contextual:true,
    prompt:"Sponsorship is $5,000 per year per group. We are launching two groups — Los Angeles and San Fernando Valley. Some sponsors take both. The commitment is annual and renews each January.",
    fallback:"Most sponsors treat this as a business development investment — the relationships compound over time, not the first meeting."},
  {id:"close", label:"Close", tag:"CLOSE", contextual:false,
    prompt:"Based on what you have shared, I think there is a real fit here. The next step would be for you to visit a meeting as a guest before we finalize anything — I want you to see the room before you commit. Can we get that on the calendar?",
    fallback:"If you need to loop in someone else before deciding, I am happy to do a second call. Who else would be involved?"},
];

var CATEGORIES = ["Accounting/Advisory","Commercial Banking","Law Firm","Executive Search","HR/Payroll","Insurance","Technology","Commercial Real Estate","Advisory/M&A","Other"];
var OUTCOMES = [
  {v:"proposal",      l:"Send Proposal",    c:"#2ecc71"},
  {v:"discovery_complete", l:"Discovery Complete", c:"#9b59b6"},
  {v:"needs_time",    l:"Needs Time",       c:"#f39c12"},
  {v:"not_a_fit",     l:"Not a Fit",        c:"#e74c3c"},
  {v:"no_show",       l:"No Show",          c:"#7f8c8d"},
];

function fmt(s) {
  return ("0"+Math.floor(s/60)).slice(-2)+":"+("0"+(s%60)).slice(-2);
}

function STitle(props) {
  var label = props.label; var color = props.color || G;
  return <div style={{fontSize:11,letterSpacing:3,color:color,textTransform:"uppercase",marginBottom:8,display:"flex",alignItems:"center",gap:7,fontWeight:600}}>{label}<div style={{flex:1,height:1,background:color+"18"}}/></div>;
}

function renderMiddle(step, data, setData) {
  var id = SCRIPT[step].id;

  if (id === "open") return (
    <div style={{display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",height:"100%",gap:14}}>
      <div style={{fontSize:36,color:G,opacity:0.2}}>$</div>
      <div style={{fontSize:13,color:T.dim,letterSpacing:2,textTransform:"uppercase"}}>Ready to start</div>
      <div style={{fontSize:13,color:T.dim,textAlign:"center",maxWidth:240,lineHeight:1.85}}>Press Start when the call begins. Work through the script on the left.</div>
    </div>
  );

  if (id === "goals") return (
    <div style={{height:"100%",display:"flex",flexDirection:"column",gap:10}}>
      <STitle label="What They Said — Their Words"/>
      <textarea value={data.goals||""} onChange={function(e){setData(function(p){var n=Object.assign({},p);n.goals=e.target.value;return n;});}}
        placeholder="Capture their exact words about their goals and what a great client looks like..."
        style={{flex:1,background:BG2,border:"1px solid rgba(74,158,186,0.22)",color:T.text,padding:"9px 11px",borderRadius:6,fontSize:14,lineHeight:1.75,resize:"none",outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
    </div>
  );

  if (id === "pitch") return (
    <div style={{height:"100%",display:"flex",flexDirection:"column",gap:10}}>
      <STitle label="CFO Circle — Key Points to Hit" color={T.blue}/>
      {[
        {point:"Curated — 10 to 14 CFOs only", sub:"No consultants, no vendors in the room during meetings"},
        {point:"Privately held companies, $20M–$500M", sub:"Not public, not micro — your target market"},
        {point:"Monthly meeting, 3 hours", sub:"Issue-based, confidential, peer-driven"},
        {point:"Sponsor access model", sub:"Hosting, educational slot, relationship exposure — not sales time"},
        {point:"One seat per category", sub:"Exclusivity protects your investment"},
      ].map(function(item){
        return (
          <div key={item.point} style={{padding:"9px 12px",background:"rgba(255,255,255,0.02)",border:"1px solid "+T.border,borderRadius:5,display:"flex",gap:10,alignItems:"flex-start"}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:T.blue,flexShrink:0,marginTop:5}}/>
            <div>
              <div style={{fontSize:13,color:T.text,fontWeight:600,marginBottom:2}}>{item.point}</div>
              <div style={{fontSize:12,color:T.muted}}>{item.sub}</div>
            </div>
          </div>
        );
      })}
    </div>
  );

  if (id === "fit") return (
    <div style={{height:"100%",display:"flex",flexDirection:"column",gap:12}}>
      <STitle label="Category Assignment"/>
      <div>
        <div style={{fontSize:11,color:T.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Sponsor Category Seat</div>
        <select value={data.category||""} onChange={function(e){setData(function(p){var n=Object.assign({},p);n.category=e.target.value;return n;});}}
          style={{width:"100%",background:BG2,border:"1px solid "+G+"45",color:data.category?T.text:T.muted,padding:"8px 10px",borderRadius:5,fontSize:14,outline:"none",cursor:"pointer"}}>
          <option value="">— Select category seat —</option>
          {CATEGORIES.map(function(c){return <option key={c}>{c}</option>;})}
        </select>
      </div>
      <div style={{display:"flex",gap:10}}>
        <div onClick={function(){setData(function(p){var n=Object.assign({},p);n.groupLA=!p.groupLA;return n;});}}
          style={{flex:1,padding:"12px",background:data.groupLA?"rgba(240,200,74,0.1)":"rgba(255,255,255,0.02)",border:"1px solid "+(data.groupLA?G+"50":T.border),borderRadius:6,cursor:"pointer",textAlign:"center"}}>
          <div style={{fontSize:14,fontWeight:600,color:data.groupLA?G:T.muted}}>Los Angeles</div>
          <div style={{fontSize:11,color:T.dim}}>$5,000/year</div>
        </div>
        <div onClick={function(){setData(function(p){var n=Object.assign({},p);n.groupSFV=!p.groupSFV;return n;});}}
          style={{flex:1,padding:"12px",background:data.groupSFV?"rgba(74,158,186,0.1)":"rgba(255,255,255,0.02)",border:"1px solid "+(data.groupSFV?T.blue+"50":T.border),borderRadius:6,cursor:"pointer",textAlign:"center"}}>
          <div style={{fontSize:14,fontWeight:600,color:data.groupSFV?T.blue:T.muted}}>San Fernando Valley</div>
          <div style={{fontSize:11,color:T.dim}}>$5,000/year</div>
        </div>
      </div>
      {data.groupLA&&data.groupSFV&&<div style={{padding:"8px 12px",background:"rgba(46,204,113,0.06)",border:"1px solid rgba(46,204,113,0.2)",borderRadius:5,fontSize:13,color:T.green}}>Both groups — $10,000/year total</div>}
      <div>
        <div style={{fontSize:11,color:T.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Their Reaction</div>
        <textarea value={data.categoryNotes||""} onChange={function(e){setData(function(p){var n=Object.assign({},p);n.categoryNotes=e.target.value;return n;});}}
          placeholder="How did they react to the category fit conversation?"
          style={{width:"100%",background:BG2,border:"1px solid "+T.border,color:T.text,padding:"8px 10px",borderRadius:5,fontSize:13,lineHeight:1.65,resize:"none",outline:"none",fontFamily:"inherit",boxSizing:"border-box",minHeight:80}}/>
      </div>
    </div>
  );

  if (id === "host") return (
    <div style={{height:"100%",display:"flex",flexDirection:"column",gap:12}}>
      <STitle label="Host Venue Assessment" color={T.green}/>
      <div style={{display:"flex",gap:8}}>
        {["Yes — viable host","Possible — need to verify","No — not a host","Presentation only"].map(function(opt){
          var isActive = data.hostViable === opt;
          var color = opt.startsWith("Yes")?T.green:opt.startsWith("Possible")?G:opt.startsWith("No")?T.red:T.muted;
          return (
            <div key={opt} onClick={function(){setData(function(p){var n=Object.assign({},p);n.hostViable=opt;return n;});}}
              style={{flex:1,padding:"10px 6px",background:isActive?color+"12":"rgba(255,255,255,0.02)",border:"1px solid "+(isActive?color+"50":T.border),borderRadius:6,cursor:"pointer",textAlign:"center",fontSize:11,color:isActive?color:T.dim,lineHeight:1.4}}>
              {opt}
            </div>
          );
        })}
      </div>
      <div>
        <div style={{fontSize:11,color:T.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Venue Notes</div>
        <textarea value={data.venueNotes||""} onChange={function(e){setData(function(p){var n=Object.assign({},p);n.venueNotes=e.target.value;return n;});}}
          placeholder="Floor, suite, capacity, parking situation, vibe..."
          style={{width:"100%",background:BG2,border:"1px solid "+T.border,color:T.text,padding:"8px 10px",borderRadius:5,fontSize:13,lineHeight:1.65,resize:"none",outline:"none",fontFamily:"inherit",boxSizing:"border-box",minHeight:100}}/>
      </div>
    </div>
  );

  if (id === "investment") return (
    <div style={{height:"100%",display:"flex",flexDirection:"column",gap:12}}>
      <STitle label="Investment Discussion"/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
        {[{g:"One Group",f:"$5,000",s:"/year"},{g:"Both Groups",f:"$10,000",s:"/year · recommended"},{g:"Host Sponsor",f:"$5,000",s:"/year + venue"}].map(function(tier){
          return (
            <div key={tier.g} style={{padding:"12px 10px",background:"rgba(255,255,255,0.02)",border:"1px solid "+T.border,borderRadius:6,textAlign:"center"}}>
              <div style={{fontSize:11,color:T.muted,textTransform:"uppercase",marginBottom:6}}>{tier.g}</div>
              <div style={{fontSize:20,fontWeight:700,color:G,lineHeight:1}}>{tier.f}</div>
              <div style={{fontSize:11,color:T.dim,marginTop:3}}>{tier.s}</div>
            </div>
          );
        })}
      </div>
      <div style={{padding:"10px 12px",background:"rgba(240,200,74,0.04)",border:"1px solid "+G+"20",borderRadius:5,fontSize:13,color:T.muted,lineHeight:1.7,fontStyle:"italic"}}>
        "Most sponsors treat this as a business development investment — the relationships compound over time."
      </div>
      <div>
        <div style={{fontSize:11,color:T.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Their Reaction to Investment</div>
        <textarea value={data.investmentNotes||""} onChange={function(e){setData(function(p){var n=Object.assign({},p);n.investmentNotes=e.target.value;return n;});}}
          placeholder="How did they respond to the $5K discussion?"
          style={{width:"100%",background:BG2,border:"1px solid "+T.border,color:T.text,padding:"8px 10px",borderRadius:5,fontSize:13,lineHeight:1.65,resize:"none",outline:"none",fontFamily:"inherit",boxSizing:"border-box",minHeight:80}}/>
      </div>
    </div>
  );

  if (id === "close") return (
    <div style={{height:"100%",display:"flex",flexDirection:"column",gap:10}}>
      <STitle label="Call Outcome"/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        {OUTCOMES.map(function(o){
          return (
            <button key={o.v} onClick={function(){setData(function(p){var n=Object.assign({},p);n.outcome=o.v;return n;});}}
              style={{padding:"13px 10px",borderRadius:6,cursor:"pointer",border:"1px solid "+(data.outcome===o.v?o.c:"rgba(255,255,255,0.08)"),background:data.outcome===o.v?o.c+"14":"rgba(255,255,255,0.02)",color:data.outcome===o.v?o.c:"#8ab4cc",fontSize:13}}>
              {o.l}
            </button>
          );
        })}
      </div>
      {data.outcome&&<div style={{padding:"9px 12px",borderRadius:5,fontSize:13,color:T.muted,background:"rgba(255,255,255,0.02)",border:"1px solid "+T.border,lineHeight:1.7}}>
        {data.outcome==="proposal"&&"Send the Sponsorship Opportunities deck within 24 hours. Move deal to Proposal Sent."}
        {data.outcome==="discovery_complete"&&"Call complete. Awaiting next step. Move deal to Discovery Complete."}
        {data.outcome==="needs_time"&&"Follow up in 5-7 days. Move deal to Engaged."}
        {data.outcome==="not_a_fit"&&"Gracious close. Move deal to Lost."}
        {data.outcome==="no_show"&&"Send reschedule message. Move deal to Engaged with no-show note."}
      </div>}
      <STitle label="Call Notes" color={T.blue}/>
      <textarea value={data.notes||""} onChange={function(e){setData(function(p){var n=Object.assign({},p);n.notes=e.target.value;return n;});}}
        placeholder="Anything else worth capturing..."
        style={{flex:1,background:BG2,border:"1px solid "+T.border,color:T.text,padding:"8px 10px",borderRadius:5,fontSize:13,lineHeight:1.65,resize:"none",outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
    </div>
  );

  return null;
}

export default function SponsorCompanion(props) {
  var contact = props.contact;
  var deal = props.deal;
  var onBack = props.onBack;
  var onEnd = props.onEnd;

  var name = contact ? (contact.first_name||contact.full_name||"Contact") : "Contact";
  var company = contact ? (contact.company||contact.company_name||"") : (deal ? deal.category_seat||"" : "");

  var [step, setStep] = useState(0);
  var [live, setLive] = useState(false);
  var [secs, setSecs] = useState(0);
  var [saving, setSaving] = useState(false);
  var [saved, setSaved] = useState(false);
  var [data, setData] = useState({
    goals:"", category:"", groupLA:true, groupSFV:false,
    categoryNotes:"", hostViable:"", venueNotes:"",
    investmentNotes:"", outcome:"", notes:"",
    source:"Discovery Call"
  });

  var timer = useRef(null);

  useEffect(function() {
    if (live) {
      timer.current = setInterval(function(){setSecs(function(s){return s+1;});}, 1000);
    } else {
      clearInterval(timer.current);
    }
    return function(){clearInterval(timer.current);};
  }, [live]);

  var tc = secs>1800?"#e74c3c":secs>1200?"#f39c12":"#2ecc71";

  function getPrompt(sc) {
    return sc.prompt.replace("{name}", name).replace("{company}", company).replace("{category}", data.category||"[category]");
  }

  async function handleSave() {
    if (!data.outcome || saving) return;
    setSaving(true);
    try {
      var SBU = process.env.NEXT_PUBLIC_SUPABASE_URL;
      var SBK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      var h = {"apikey":SBK,"Authorization":"Bearer "+SBK,"Content-Type":"application/json","Prefer":"return=representation"};

      var stageMap = {
        proposal:"Proposal Sent",
        discovery_complete:"Discovery Complete",
        needs_time:"Engaged",
        not_a_fit:"Lost",
        no_show:"Engaged"
      };
      var newStage = stageMap[data.outcome] || "Discovery Complete";
      var hostViable = data.hostViable.startsWith("Yes") ? "Yes" : data.hostViable.startsWith("Possible") ? "Adjacent" : "No";
      var hostTier = data.hostViable.startsWith("Yes") ? "Meeting Host" : data.hostViable === "Presentation only" ? "Presentation" : "N/A";

      // Update company host viability if assessed
      if (contact && contact.company_id && data.hostViable) {
        await fetch(SBU+"/rest/v1/sponsor_companies?id=eq."+contact.company_id, {
          method:"PATCH", headers:h,
          body:JSON.stringify({
            host_viable: hostViable,
            host_tier: hostTier,
            notes: data.venueNotes ? "Venue: "+data.venueNotes : undefined,
            category: data.category || undefined
          })
        });
      }

      // Update deal stage
      if (deal && deal.id) {
        await fetch(SBU+"/rest/v1/sponsor_deals?id=eq."+deal.id, {
          method:"PATCH", headers:h,
          body:JSON.stringify({stage:newStage, notes:data.notes, category_seat:data.category||deal.category_seat})
        });
      }

      // Log communication
      var companyId = contact ? contact.company_id : null;
      if (companyId) {
        await fetch(SBU+"/rest/v1/communications", {
          method:"POST", headers:h,
          body:JSON.stringify({
            occurred_at:new Date().toISOString(), channel:"Phone", direction:"IN",
            step_label:"Sponsor Discovery Call",
            body:"Discovery call completed with "+name+" ("+company+"). Outcome: "+data.outcome+". Category: "+data.category+". Host: "+data.hostViable+". Notes: "+data.notes,
            source:"PeerChair", logged_by:"Dalen Lawrence"
          })
        });
      }

      if (onEnd) onEnd(data.outcome, newStage);
      setSaved(true);
      setTimeout(function(){setSaved(false);}, 3000);
    } catch(e){console.error("Save error:",e);}
    setSaving(false);
  }

  var sc = SCRIPT[step];

  return (
    <div style={{fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,serif",background:BG2,flex:1,minHeight:0,color:"#eaf2fc",display:"flex",flexDirection:"column",overflow:"hidden"}}>

      {/* HEADER */}
      <div style={{background:"linear-gradient(90deg,#0f1e30,#132840)",borderBottom:"1px solid rgba(201,168,76,0.2)",padding:"9px 20px",display:"flex",alignItems:"center",gap:14,flexShrink:0}}>
        <div style={{flex:1}}>
          <div style={{fontSize:15,fontWeight:600,color:"#fff"}}>{name}</div>
          <div style={{fontSize:12,color:"#8ab4cc"}}>{company} — Sponsor Discovery</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:live?"#2ecc71":"#6a9aba",boxShadow:live?"0 0 6px #2ecc71":"none"}}/>
          <span style={{fontSize:12,color:"#6a9aba",letterSpacing:1,textTransform:"uppercase"}}>{live?"Live":"Ready"}</span>
        </div>
        <div style={{fontFamily:"'Courier New',monospace",fontSize:22,fontWeight:"bold",color:tc,letterSpacing:2}}>{fmt(secs)}</div>
        <button onClick={function(){setLive(function(v){return !v;});}} style={{background:live?"rgba(231,76,60,0.15)":"rgba(46,204,113,0.15)",border:"1px solid "+(live?"#e74c3c":"#2ecc71"),color:live?"#e74c3c":"#2ecc71",padding:"5px 13px",borderRadius:4,cursor:"pointer",fontSize:13,letterSpacing:1,textTransform:"uppercase"}}>{live?"End":"Start"}</button>
      </div>

      {/* BODY */}
      <div style={{display:"grid",gridTemplateColumns:"255px 1fr 240px",flex:1,overflow:"hidden",minHeight:0}}>

        {/* LEFT — Script */}
        <div style={{background:BG3,borderRight:"1px solid rgba(255,255,255,0.06)",padding:"12px 11px",overflowY:"auto",display:"flex",flexDirection:"column"}}>
          <div style={{fontSize:11,letterSpacing:3,color:G,textTransform:"uppercase",marginBottom:9,flexShrink:0,fontWeight:600}}>Discovery Guide</div>
          <div style={{flex:1,display:"flex",flexDirection:"column",gap:3}}>
            {SCRIPT.map(function(s, i) {
              var isActive = i === step;
              var isDone = i < step;
              return (
                <div key={s.id} onClick={function(){setStep(i);}} style={{borderRadius:5,border:"1px solid "+(isActive?s.contextual?"rgba(230,126,34,0.35)":"rgba(201,168,76,0.32)":"rgba(255,255,255,0.04)"),background:isActive?s.contextual?"rgba(230,126,34,0.04)":"rgba(201,168,76,0.04)":"transparent",cursor:"pointer",marginBottom:2}}>
                  <div style={{padding:"6px 9px",display:"flex",alignItems:"center",gap:7}}>
                    <div style={{width:16,height:16,borderRadius:"50%",flexShrink:0,background:isActive?(s.contextual?"#e67e22":G):isDone?"rgba(201,168,76,0.22)":"rgba(255,255,255,0.06)",color:isActive?"#0c1520":isDone?"#f0c84a":"#8ab4cc",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:"bold"}}>
                      {isDone?"v":s.contextual?"?":i+1}
                    </div>
                    <div>
                      <div style={{fontSize:11,color:isActive?(s.contextual?"#e67e22":G):isDone?"rgba(201,168,76,0.5)":"#8ab4cc",letterSpacing:"0.5px",textTransform:"uppercase"}}>{s.label}</div>
                      <div style={{fontSize:10,color:s.contextual?"rgba(230,126,34,0.35)":"#5a8aaa",letterSpacing:1}}>{s.tag}</div>
                    </div>
                  </div>
                  {isActive&&<div style={{padding:"0 9px 9px 32px"}}>
                    <div style={{fontSize:13,color:"#f0f6ff",lineHeight:1.85,fontStyle:"italic",marginBottom:s.fallback?8:0,padding:"7px 10px",background:"rgba(255,255,255,0.04)",borderRadius:5,borderLeft:"2px solid rgba(255,255,255,0.2)"}}>"{getPrompt(s)}"</div>
                    {s.fallback&&<div>
                      <div style={{fontSize:10,color:"#5a8aaa",letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>If no response:</div>
                      <div style={{fontSize:12,color:"#e8f2ff",lineHeight:1.75,fontStyle:"italic",padding:"7px 10px",background:"rgba(240,200,74,0.05)",borderRadius:5,borderLeft:"2px solid #f0c84a"}}>"{s.fallback}"</div>
                    </div>}
                  </div>}
                </div>
              );
            })}
          </div>
          <div style={{display:"flex",gap:5,paddingTop:9,borderTop:"1px solid rgba(255,255,255,0.04)",flexShrink:0,marginTop:7}}>
            <button onClick={function(){setStep(function(s){return Math.max(0,s-1);});}} style={{flex:1,padding:"5px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",color:"#8ab4cc",borderRadius:4,cursor:"pointer",fontSize:12,textTransform:"uppercase"}}>Prev</button>
            <button onClick={function(){setStep(function(s){return Math.min(SCRIPT.length-1,s+1);});}} style={{flex:1,padding:"5px",background:"rgba(201,168,76,0.05)",border:"1px solid rgba(201,168,76,0.18)",color:G,borderRadius:4,cursor:"pointer",fontSize:12,textTransform:"uppercase"}}>Next</button>
          </div>
        </div>

        {/* CENTER */}
        <div style={{padding:"14px 16px",overflow:"auto",display:"flex",flexDirection:"column"}}>
          {renderMiddle(step, data, setData)}
        </div>

        {/* RIGHT — Contact + Summary */}
        <div style={{background:"#0a1825",borderLeft:"1px solid rgba(255,255,255,0.06)",padding:"12px",overflow:"auto",display:"flex",flexDirection:"column",gap:8}}>

          {/* Contact */}
          <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:6,padding:"9px 10px",flexShrink:0}}>
            <div style={{fontSize:13,fontWeight:600,color:"#fff",marginBottom:1}}>{name}</div>
            <div style={{fontSize:12,color:T.muted}}>{contact && contact.title ? contact.title : "Sponsor Prospect"}</div>
            <div style={{fontSize:12,color:T.muted}}>{company}</div>
          </div>

          {/* Live summary */}
          <div style={{flexShrink:0}}>
            <div style={{fontSize:9,color:T.dim,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Call Summary</div>
            {data.category&&<div style={{fontSize:11,color:T.muted,marginBottom:3}}>Category: <span style={{color:G}}>{data.category}</span></div>}
            {(data.groupLA||data.groupSFV)&&<div style={{fontSize:11,color:T.muted,marginBottom:3}}>Groups: <span style={{color:T.blue}}>{[data.groupLA?"LA":null,data.groupSFV?"SFV":null].filter(Boolean).join(" + ")}</span></div>}
            {data.hostViable&&<div style={{fontSize:11,color:T.muted,marginBottom:3}}>Host: <span style={{color:data.hostViable.startsWith("Yes")?T.green:T.orange}}>{data.hostViable.split(" — ")[0]}</span></div>}
            {data.outcome&&<div style={{fontSize:11,color:T.muted}}>Outcome: <span style={{color:OUTCOMES.find(function(o){return o.v===data.outcome;})?OUTCOMES.find(function(o){return o.v===data.outcome;}).c:T.muted}}>{OUTCOMES.find(function(o){return o.v===data.outcome;})?OUTCOMES.find(function(o){return o.v===data.outcome;}).l:"—"}</span></div>}
          </div>

          {/* Notes */}
          <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:80}}>
            <div style={{fontSize:9,color:T.dim,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>Quick Notes</div>
            <textarea value={data.notes} onChange={function(e){setData(function(p){var n=Object.assign({},p);n.notes=e.target.value;return n;});}}
              placeholder="Anything else..." style={{flex:1,width:"100%",background:BG3,border:"1px solid rgba(255,255,255,0.05)",color:T.text,padding:"5px 7px",borderRadius:4,fontSize:12,lineHeight:1.65,resize:"none",outline:"none",fontFamily:"inherit",boxSizing:"border-box",minHeight:80}}/>
          </div>
        </div>
      </div>

      {/* BOTTOM BAR */}
      <div style={{background:"#0a1522",borderTop:"1px solid rgba(255,255,255,0.05)",padding:"7px 20px",display:"flex",alignItems:"center",gap:9,flexShrink:0,flexWrap:"wrap"}}>
        <div style={{fontSize:11,color:T.dim,letterSpacing:2,textTransform:"uppercase",flexShrink:0}}>Outcome:</div>
        <div style={{display:"flex",gap:5,flex:1,flexWrap:"wrap"}}>
          {OUTCOMES.map(function(o){
            return (
              <button key={o.v} onClick={function(){setData(function(p){var n=Object.assign({},p);n.outcome=o.v;return n;});}}
                style={{padding:"4px 9px",borderRadius:4,cursor:"pointer",border:"1px solid "+(data.outcome===o.v?o.c:"rgba(255,255,255,0.07)"),background:data.outcome===o.v?o.c+"12":"rgba(255,255,255,0.02)",color:data.outcome===o.v?o.c:"#7aaac8",fontSize:12}}>
                {o.l}
              </button>
            );
          })}
        </div>
        {onBack&&<button onClick={onBack} style={{padding:"6px 14px",background:"transparent",border:"1px solid rgba(255,255,255,0.1)",color:T.muted,borderRadius:4,cursor:"pointer",fontSize:12,flexShrink:0}}>Back</button>}
        <button onClick={handleSave} disabled={!data.outcome||saving}
          style={{padding:"7px 20px",background:saved?"rgba(46,204,113,0.16)":"rgba(201,168,76,0.18)",border:"1px solid "+(saved?"#2ecc71":"rgba(201,168,76,0.35)"),color:saved?"#2ecc71":G,borderRadius:5,cursor:data.outcome?"pointer":"default",fontSize:12,letterSpacing:"1px",textTransform:"uppercase",flexShrink:0}}>
          {saving?"Saving...":saved?"Saved":"Save & Close"}
        </button>
      </div>
    </div>
  );
}
