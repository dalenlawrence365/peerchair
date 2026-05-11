"use client"
import { useState, useEffect } from "react";

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

var SPONSOR_JOURNEY = [
  {id:"prospect",   label:"Prospect",   short:"Prospect"},
  {id:"engaged",    label:"Engaged",    short:"Engaged"},
  {id:"discovery",  label:"Discovery",  short:"Discovery"},
  {id:"proposal",   label:"Proposal",   short:"Proposal"},
  {id:"commitment", label:"Committed",  short:"Committed"},
  {id:"active",     label:"Active",     short:"Active"},
  {id:"renewal",    label:"Renewal",    short:"Renewal"},
];

var STAGE_KEYS = ["Prospect","Engaged","Discovery Scheduled","Proposal Sent","Verbal Commitment","Active","Renewal"];

var STAGE_TO_IDX = {
  "Prospect":0,"Engaged":1,"Discovery Scheduled":2,
  "Proposal Sent":3,"Verbal Commitment":4,"Active":5,"Renewal":6
};

var STAGES = ["All","Prospect","Engaged","Discovery Scheduled","Discovery Complete","Proposal Sent","Verbal Commitment","Active","Renewal"];
var CATEGORIES = ["All","Accounting/Advisory","Commercial Banking","Law Firm","Executive Search","HR/Payroll","Insurance","Technology","Commercial Real Estate","Other"];
var GROUPS = ["All","Los Angeles","San Fernando Valley"];

function SBfetch(path) {
  var SBU = process.env.NEXT_PUBLIC_SUPABASE_URL;
  var SBK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return fetch(SBU + "/rest/v1/" + path, {
    headers: {"apikey": SBK, "Authorization": "Bearer " + SBK}
  }).then(function(r){ return r.json(); });
}

function SBpatch(table, id, data) {
  var SBU = process.env.NEXT_PUBLIC_SUPABASE_URL;
  var SBK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return fetch(SBU + "/rest/v1/" + table + "?id=eq." + id, {
    method: "PATCH",
    headers: {"apikey": SBK, "Authorization": "Bearer " + SBK, "Content-Type": "application/json"},
    body: JSON.stringify(data)
  });
}

function SBpost(table, data) {
  var SBU = process.env.NEXT_PUBLIC_SUPABASE_URL;
  var SBK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return fetch(SBU + "/rest/v1/" + table, {
    method: "POST",
    headers: {"apikey": SBK, "Authorization": "Bearer " + SBK, "Content-Type": "application/json", "Prefer": "return=representation"},
    body: JSON.stringify(data)
  });
}

function SBdelete(table, id) {
  var SBU = process.env.NEXT_PUBLIC_SUPABASE_URL;
  var SBK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return fetch(SBU + "/rest/v1/" + table + "?id=eq." + id, {
    method: "DELETE",
    headers: {"apikey": SBK, "Authorization": "Bearer " + SBK}
  });
}

function Badge(props) {
  var label = props.label; var color = props.color || T.muted; var small = props.small;
  return (
    <span style={{display:"inline-block",padding:small?"1px 6px":"2px 9px",borderRadius:20,border:"1px solid "+color+"50",background:color+"14",color:color,fontSize:small?9:10,fontWeight:600,letterSpacing:0.3,whiteSpace:"nowrap"}}>{label}</span>
  );
}

function HostBadge(props) {
  var tier = props.tier; var viable = props.viable;
  if (viable === "Yes" && tier === "Meeting Host") return <Badge label="HOST VIABLE" color={T.green}/>;
  if (viable === "Yes" && tier === "Either") return <Badge label="HOST POSSIBLE" color={G}/>;
  if (viable === "Adjacent") return <Badge label="ADJACENT" color={T.orange}/>;
  if (tier === "Presentation") return <Badge label="PRESENT ONLY" color={T.muted}/>;
  return null;
}

function StageColor(stage) {
  if (stage === "Active") return T.green;
  if (stage === "Verbal Commitment") return G;
  if (stage === "Proposal Sent") return T.blue;
  if (stage === "Discovery Complete") return "#9b59b6";
  if (stage === "Discovery Scheduled") return T.purple;
  if (stage === "Engaged") return T.orange;
  if (stage === "Renewal") return "#1abc9c";
  return T.dim;
}

function CategoryColor(cat) {
  if (!cat) return T.muted;
  if (cat.includes("Account")) return T.blue;
  if (cat.includes("Banking")) return T.green;
  if (cat.includes("Law")) return T.purple;
  if (cat.includes("Search")) return T.orange;
  if (cat.includes("HR")) return "#1abc9c";
  if (cat.includes("Insurance")) return T.red;
  if (cat.includes("Tech")) return "#3498db";
  if (cat.includes("Real")) return "#f39c12";
  return T.muted;
}

function SponsorJourneyTrack(props) {
  var deal = props.deal;
  var groupName = props.groupName;
  var onStageChange = props.onStageChange;
  if (!deal) return null;
  var currentIdx = STAGE_TO_IDX[deal.stage] || 0;
  var pct = (currentIdx / (SPONSOR_JOURNEY.length - 1)) * 100;
  var stageColor = StageColor(deal.stage);
  return (
    <div style={{flex:1,minWidth:0}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
        <div style={{fontSize:11,fontWeight:600,color:T.muted,letterSpacing:1,textTransform:"uppercase"}}>{groupName}</div>
        {deal.host_assignment && <Badge label="HOST" color={T.green} small={true}/>}
      </div>
      <div style={{position:"relative",paddingTop:4,paddingBottom:4}}>
        <div style={{position:"absolute",top:18,left:10,right:10,height:2,background:"rgba(255,255,255,0.06)",zIndex:0}}/>
        <div style={{position:"absolute",top:18,left:10,width:"calc("+pct+"% - 10px)",height:2,background:"linear-gradient(90deg,"+stageColor+","+stageColor+"80)",zIndex:1}}/>
        <div style={{display:"flex",position:"relative",zIndex:2}}>
          {SPONSOR_JOURNEY.map(function(step, idx) {
            var isDone = idx < currentIdx;
            var isCurrent = idx === currentIdx;
            var isNext = idx === currentIdx + 1;
            return (
              <div key={step.id} onClick={function(){ onStageChange(deal.id, STAGE_KEYS[idx]); }}
                title={"Move to: "+STAGE_KEYS[idx]}
                style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4,cursor:"pointer"}}>
                <div style={{
                  width:24,height:24,borderRadius:"50%",
                  background:isCurrent?stageColor:isDone?stageColor+"30":"rgba(255,255,255,0.04)",
                  border:"2px solid "+(isCurrent?stageColor:isDone?stageColor+"60":isNext?"rgba(255,255,255,0.15)":"rgba(255,255,255,0.08)"),
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:9,color:isCurrent?"#0c1520":isDone?stageColor:T.dim,fontWeight:"bold",
                  boxShadow:isCurrent?"0 0 8px "+stageColor+"60":"none",transition:"all 0.2s"
                }}>{isDone?"✓":idx+1}</div>
                <div style={{fontSize:8,color:isCurrent?stageColor:isDone?T.muted:T.dim,textAlign:"center",lineHeight:1.3,maxWidth:44}}>{step.short}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Stage bucket dashboard
function StageBuckets(props) {
  var deals = props.deals;
  var companies = props.companies;
  var groupFilter = props.groupFilter;
  var onSelectStage = props.onSelectStage;
  var selectedStage = props.selectedStage;

  function getCompanyName(companyId) {
    var co = companies.find(function(c){ return c.id === companyId; });
    return co ? co.name : "Unknown";
  }

  var stagesWithColor = [
    {stage:"Prospect", color:T.dim},
    {stage:"Engaged", color:T.orange},
    {stage:"Discovery Scheduled", color:T.purple},
    {stage:"Proposal Sent", color:T.blue},
    {stage:"Verbal Commitment", color:G},
    {stage:"Active", color:T.green},
    {stage:"Renewal", color:"#1abc9c"},
  ];

  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:8,padding:"0 0 4px"}}>
      {stagesWithColor.map(function(item) {
        var relevantDeals = deals.filter(function(d){
          var matchGroup = groupFilter === "All" || d.chapter === groupFilter;
          return d.stage === item.stage && matchGroup;
        });
        var count = relevantDeals.length;
        var isSelected = props.stageFilter === item.stage;
        return (
          <div key={item.stage} onClick={function(){ onSelectStage(isSelected ? null : item.stage); }}
            style={{
              background:isSelected?item.color+"18":BG3,
              border:"1px solid "+(isSelected?item.color+"60":item.color+"20"),
              borderTop:"2px solid "+item.color+(isSelected?"":"60"),
              borderRadius:6, padding:"10px 8px", cursor:"pointer",
              transition:"all 0.15s", textAlign:"center"
            }}>
            <div style={{fontSize:22,fontWeight:700,color:item.color,lineHeight:1,marginBottom:4}}>{count}</div>
            <div style={{fontSize:9,color:isSelected?item.color:"#8ab4cc",letterSpacing:1,textTransform:"uppercase",lineHeight:1.3}}>{item.stage}</div>
          </div>
        );
      })}
    </div>
  );
}


function CompanyCard(props) {
  var co = props.company;
  var deals = props.deals || [];
  var contacts = props.contacts || [];
  var selected = props.selected;
  var onClick = props.onClick;
  var groupFilter = props.groupFilter;
  var laDeals = deals.filter(function(d){ return d.chapter === "Los Angeles"; });
  var sfvDeals = deals.filter(function(d){ return d.chapter === "San Fernando Valley"; });
  var laStage = laDeals[0] ? laDeals[0].stage : null;
  var sfvStage = sfvDeals[0] ? sfvDeals[0].stage : null;
  return (
    <div onClick={onClick} style={{padding:"11px 14px",borderRadius:6,cursor:"pointer",background:selected?"rgba(240,200,74,0.06)":"rgba(255,255,255,0.02)",border:"1px solid "+(selected?G+"40":T.border),marginBottom:6,transition:"all 0.15s"}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:5}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:600,color:selected?G:T.text,marginBottom:2}}>{co.name}</div>
          <div style={{fontSize:11,color:CategoryColor(co.sponsor_type)}}>{co.sponsor_type}</div>
        </div>
        <HostBadge tier={co.hosting_type} viable={co.host_viable}/>
      </div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
        {laStage&&(groupFilter==="All"||groupFilter==="Los Angeles")&&<span style={{fontSize:10,color:StageColor(laStage),background:StageColor(laStage)+"14",border:"1px solid "+StageColor(laStage)+"30",padding:"1px 6px",borderRadius:10}}>LA: {laStage}</span>}
        {sfvStage&&(groupFilter==="All"||groupFilter==="San Fernando Valley")&&<span style={{fontSize:10,color:StageColor(sfvStage),background:StageColor(sfvStage)+"14",border:"1px solid "+StageColor(sfvStage)+"30",padding:"1px 6px",borderRadius:10}}>SFV: {sfvStage}</span>}
        <span style={{fontSize:10,color:T.dim,marginLeft:"auto"}}>{contacts.length} contact{contacts.length!==1?"s":""}</span>
      </div>
    </div>
  );
}

function CompanyDetail(props) {
  var co = props.company;
  var contacts = props.contacts || [];
  var deals = props.deals || [];
  var deals = props.deals || [];
  var contacts = props.contacts || [];
  var onUpdate = props.onUpdate;
  var onNavigate = props.onNavigate;
  var [saving, setSaving] = useState(false);
  var [journeyOpen, setJourneyOpen] = useState(true);

  if (!co) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",flex:1,color:T.dim,fontSize:13,flexDirection:"column",gap:8,background:BG}}>
      <div style={{fontSize:24,opacity:0.3}}>◎</div>
      <div>Select a company to view details</div>
    </div>
  );

  async function saveStage(dealId, newStage) {
    setSaving(true);
    await SBpatch("sponsor_deals", dealId, {stage: newStage});
    if (onUpdate) onUpdate();
    setSaving(false);
  }

  async function addGroup(groupName) {
    setSaving(true);
    await SBpost("sponsor_deals", {company_id:co.id,chapter:groupName,stage:"Prospect",category_seat:co.sponsor_type,annual_fee:5000,host_assignment:co.hosting_type==="Meeting Host"});
    if (onUpdate) onUpdate();
    setSaving(false);
  }

  async function removeGroup(dealId) {
    setSaving(true);
    await SBdelete("sponsor_deals", dealId);
    if (onUpdate) onUpdate();
    setSaving(false);
  }

  var laDeals = deals.filter(function(d){ return d.chapter === "Los Angeles"; });
  var sfvDeals = deals.filter(function(d){ return d.chapter === "San Fernando Valley"; });

  return (
    <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",background:BG}}>

      {/* Journey — collapsible, at top */}
      <div style={{borderBottom:"1px solid "+T.border,flexShrink:0}}>
        <div onClick={function(){setJourneyOpen(function(v){return !v;});}}
          style={{display:"flex",alignItems:"center",gap:8,padding:"10px 20px",cursor:"pointer",background:BG3}}>
          <span style={{fontSize:12,color:G,letterSpacing:2,textTransform:"uppercase",fontWeight:600,flex:1}}>Sponsor Journey</span>
          <span style={{fontSize:10,color:T.dim,transform:journeyOpen?"rotate(90deg)":"rotate(0deg)",display:"inline-block",transition:"transform 0.2s"}}>▶</span>
        </div>
        {journeyOpen && (
          <div style={{padding:"14px 20px 16px",background:BG2}}>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {/* Only show groups being pursued */}
              {laDeals.length > 0 && (
                <div style={{padding:"12px 14px",background:"rgba(255,255,255,0.02)",border:"1px solid "+T.border,borderRadius:6}}>
                  <SponsorJourneyTrack deal={laDeals[0]} groupName="Los Angeles" onStageChange={saveStage}/>
                  <div onClick={function(){ if(!saving) removeGroup(laDeals[0].id); }} style={{marginTop:4,fontSize:10,color:T.dim,cursor:"pointer",textAlign:"right"}}>Remove</div>
                </div>
              )}
              {sfvDeals.length > 0 && (
                <div style={{padding:"12px 14px",background:"rgba(255,255,255,0.02)",border:"1px solid "+T.border,borderRadius:6}}>
                  <SponsorJourneyTrack deal={sfvDeals[0]} groupName="San Fernando Valley" onStageChange={saveStage}/>
                  <div onClick={function(){ if(!saving) removeGroup(sfvDeals[0].id); }} style={{marginTop:4,fontSize:10,color:T.dim,cursor:"pointer",textAlign:"right"}}>Remove</div>
                </div>
              )}
              {/* Add group buttons - compact */}
              <div style={{display:"flex",gap:8}}>
                {laDeals.length === 0 && <button onClick={function(){ if(!saving) addGroup("Los Angeles"); }} style={{padding:"4px 12px",background:"rgba(240,200,74,0.08)",border:"1px solid "+G+"30",color:G+"80",borderRadius:4,cursor:"pointer",fontSize:11}}>+ Los Angeles</button>}
                {sfvDeals.length === 0 && <button onClick={function(){ if(!saving) addGroup("San Fernando Valley"); }} style={{padding:"4px 12px",background:"rgba(255,255,255,0.03)",border:"1px solid "+T.border,color:T.dim,borderRadius:4,cursor:"pointer",fontSize:11}}>+ San Fernando Valley</button>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Company info */}
      <div style={{padding:"16px 20px 0",flexShrink:0}}>
        <div style={{marginBottom:10}}>
          <div style={{flex:1}}>
            <div style={{fontSize:18,fontWeight:700,color:T.text,marginBottom:6}}>{co.name}</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <Badge label={co.sponsor_type||"Uncategorized"} color={CategoryColor(co.sponsor_type)}/>
              <HostBadge tier={co.hosting_type} viable={co.host_viable}/>
            </div>
          </div>

        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          {co.address_la&&<div><div style={{fontSize:9,color:T.dim,letterSpacing:2,textTransform:"uppercase",marginBottom:3}}>LA Address</div><div style={{fontSize:12,color:T.muted,lineHeight:1.5}}>{co.address_la}</div>{co.neighborhood_la&&<div style={{fontSize:10,color:T.dim,marginTop:2}}>{co.neighborhood_la}</div>}</div>}
          {co.address_sfv&&<div><div style={{fontSize:9,color:T.dim,letterSpacing:2,textTransform:"uppercase",marginBottom:3}}>SFV Address</div><div style={{fontSize:12,color:T.muted,lineHeight:1.5}}>{co.address_sfv}</div>{co.neighborhood_sfv&&<div style={{fontSize:10,color:T.dim,marginTop:2}}>{co.neighborhood_sfv}</div>}</div>}
        </div>
        {co.notes&&<div style={{marginBottom:10,fontSize:12,color:T.muted,lineHeight:1.6,padding:"8px 12px",background:"rgba(255,255,255,0.02)",borderRadius:5,borderLeft:"2px solid "+G+"40"}}>{co.notes}</div>}
      </div>

      {/* Contacts */}
      <div style={{padding:"0 20px 20px"}}>
        <div style={{fontSize:10,color:G,letterSpacing:3,textTransform:"uppercase",marginBottom:10,fontWeight:600,marginTop:4}}>Contacts — {contacts.length}</div>
        {contacts.length===0&&<div style={{fontSize:12,color:T.dim}}>No contacts loaded yet.</div>}
        {contacts.map(function(ct){
          return (
            <div key={ct.id} style={{padding:"10px 12px",background:"rgba(255,255,255,0.02)",border:"1px solid "+T.border,borderRadius:5,marginBottom:6}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:3}}>
                <div style={{fontSize:13,fontWeight:600,color:T.text}}>{ct.full_name}</div>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  {ct.relationship_strength==="Met in person"&&<Badge label="Met in person" color={T.green} small={true}/>}
                  {ct.relationship_strength==="Warm"&&<Badge label="Warm" color={G} small={true}/>}
                  {onNavigate && (
                    <button onClick={function(){
                      onNavigate("profile", {
                        id: ct.contact_id || null,
                        first_name: ct.first_name || (ct.full_name||"").split(" ")[0],
                        last_name:  ct.last_name  || (ct.full_name||"").split(" ").slice(1).join(" "),
                        company_name: co.name,
                        email: ct.email || null,
                        title: ct.title || null,
                        contact_type: "SPONSOR_CONTACT"
                      });
                    }} style={{padding:"3px 10px",background:"rgba(240,200,74,0.1)",border:"1px solid rgba(240,200,74,0.25)",color:"#f0c84a",borderRadius:4,cursor:"pointer",fontSize:10,fontWeight:600,whiteSpace:"nowrap"}}>
                      Open Profile
                    </button>
                  )}
                  <button onClick={function(){if(props.onStartDiscovery){var contactWithCo=Object.assign({},ct,{company:co.name,company_id:co.id,sponsor_type:co.sponsor_type});props.onStartDiscovery(co,contactWithCo,deals[0]||null);}}}
                    style={{padding:"3px 10px",background:"rgba(155,89,182,0.15)",border:"1px solid rgba(155,89,182,0.35)",color:"#9b59b6",borderRadius:4,cursor:"pointer",fontSize:10,fontWeight:600,whiteSpace:"nowrap"}}>
                    Start Call
                  </button>
                </div>
              </div>
              <div style={{fontSize:12,color:T.muted,marginBottom:ct.email?3:0}}>{ct.title}</div>
              {ct.email&&<div style={{fontSize:11,color:T.dim}}>{ct.email}</div>}
              {ct.city&&<div style={{fontSize:11,color:T.dim}}>{ct.city}{ct.state?", "+ct.state:""}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}


function AddCompanyModal(props) {
  var onClose = props.onClose;
  var onCreated = props.onCreated;
  var CATS = ["Accounting/Advisory","Commercial Banking","Law Firm","Executive Search","HR/Payroll","Insurance","Technology","Commercial Real Estate","Advisory/M&A","Other"];
  var [form, setForm] = useState({
    name:"", sponsor_type:"Accounting/Advisory", host_viable:"Unknown",
    address_la:"", neighborhood_la:"", notes:"",
    contact_name:"", contact_title:"", contact_email:"", contact_relationship_strength:"Cold",
    group_la:true, group_sfv:false
  });
  var [saving, setSaving] = useState(false);

  function set(key, val) { setForm(function(p){ var n=Object.assign({},p); n[key]=val; return n; }); }

  async function create() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      var companies = await SBpost("companies", {
        name: form.name.trim(),
        sponsor_type: form.sponsor_type,
        host_viable: form.host_viable,
        hosting_type: "TBD",
        address_la: form.address_la,
        neighborhood_la: form.neighborhood_la,
        host_viable: form.address_la ? "Viable" : "Unknown",
        notes: form.notes,
        source: "Manual"
      });
      var co = Array.isArray(companies) ? companies[0] : companies;
      if (!co || !co.id) throw new Error("Failed to create company");

      // Add contact if provided
      if (form.contact_name.trim()) {
        var parts = form.contact_name.trim().split(" ");
        await SBpost("contacts", {
          company_id: co.id,
          first_name: parts[0]||"",
          last_name: parts.slice(1).join(" ")||"",
          full_name: form.contact_name.trim(),
          title: form.contact_title,
          email: form.contact_email,
          relationship_strength: form.contact_relationship_strength,
          source: "Manual"
        });
      }

      // Create deals
      if (form.group_la) await SBpost("sponsor_deals", {company_id:co.id,chapter:"Los Angeles",stage:"Prospect",category_seat:form.sponsor_type,annual_fee:5000});
      if (form.group_sfv) await SBpost("sponsor_deals", {company_id:co.id,chapter:"San Fernando Valley",stage:"Prospect",category_seat:form.sponsor_type,annual_fee:5000});

      if (onCreated) onCreated(co.id);
    } catch(e) { console.error(e); }
    setSaving(false);
    onClose();
  }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}}>
      <div style={{background:BG3,border:"1px solid "+T.border,borderRadius:8,padding:"24px",width:480,maxWidth:"90vw",maxHeight:"85vh",overflowY:"auto"}}>
        <div style={{fontSize:15,fontWeight:700,color:T.text,marginBottom:16}}>Add Sponsor Company</div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
          <div style={{gridColumn:"span 2"}}>
            <div style={{fontSize:10,color:T.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>Company Name *</div>
            <input value={form.name} onChange={function(e){set("name",e.target.value);}} placeholder="e.g. Lockton Insurance" style={{width:"100%",background:BG2,border:"1px solid "+T.border,color:T.text,padding:"7px 10px",borderRadius:5,fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
          </div>
          <div>
            <div style={{fontSize:10,color:T.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>Category</div>
            <select value={form.sponsor_type} onChange={function(e){set("sponsor_type",e.target.value);}} style={{width:"100%",background:BG2,border:"1px solid "+T.border,color:T.text,padding:"7px 10px",borderRadius:5,fontSize:13,outline:"none",cursor:"pointer"}}>
              {CATS.map(function(c){return <option key={c}>{c}</option>;})}
            </select>
          </div>
          <div>
            <div style={{fontSize:10,color:T.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>Host Viable</div>
            <select value={form.host_viable} onChange={function(e){set("host_viable",e.target.value);}} style={{width:"100%",background:BG2,border:"1px solid "+T.border,color:T.text,padding:"7px 10px",borderRadius:5,fontSize:13,outline:"none",cursor:"pointer"}}>
              {["Unknown","Yes","No","Adjacent"].map(function(v){return <option key={v}>{v}</option>;})}
            </select>
          </div>
          <div style={{gridColumn:"span 2"}}>
            <div style={{fontSize:10,color:T.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>LA Address</div>
            <input value={form.address_la} onChange={function(e){set("address_la",e.target.value);}} placeholder="Street address, Suite, City, State ZIP" style={{width:"100%",background:BG2,border:"1px solid "+T.border,color:T.text,padding:"7px 10px",borderRadius:5,fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
          </div>
          <div style={{gridColumn:"span 2"}}>
            <div style={{fontSize:10,color:T.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>Notes</div>
            <input value={form.notes} onChange={function(e){set("notes",e.target.value);}} placeholder="How you know them, source, context..." style={{width:"100%",background:BG2,border:"1px solid "+T.border,color:T.muted,padding:"7px 10px",borderRadius:5,fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
          </div>
        </div>

        <div style={{fontSize:11,color:G,letterSpacing:2,textTransform:"uppercase",fontWeight:600,marginBottom:10,paddingTop:10,borderTop:"1px solid "+T.border}}>Primary Contact (optional)</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
          <div>
            <div style={{fontSize:10,color:T.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>Full Name</div>
            <input value={form.contact_name} onChange={function(e){set("contact_name",e.target.value);}} placeholder="First Last" style={{width:"100%",background:BG2,border:"1px solid "+T.border,color:T.text,padding:"7px 10px",borderRadius:5,fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
          </div>
          <div>
            <div style={{fontSize:10,color:T.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>Title</div>
            <input value={form.contact_title} onChange={function(e){set("contact_title",e.target.value);}} placeholder="VP, Partner, Director..." style={{width:"100%",background:BG2,border:"1px solid "+T.border,color:T.text,padding:"7px 10px",borderRadius:5,fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
          </div>
          <div>
            <div style={{fontSize:10,color:T.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>Email</div>
            <input value={form.contact_email} onChange={function(e){set("contact_email",e.target.value);}} placeholder="email@company.com" style={{width:"100%",background:BG2,border:"1px solid "+T.border,color:T.text,padding:"7px 10px",borderRadius:5,fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
          </div>
          <div>
            <div style={{fontSize:10,color:T.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>Warmth</div>
            <select value={form.contact_relationship_strength} onChange={function(e){set("contact_relationship_strength",e.target.value);}} style={{width:"100%",background:BG2,border:"1px solid "+T.border,color:T.text,padding:"7px 10px",borderRadius:5,fontSize:13,outline:"none",cursor:"pointer"}}>
              {["Cold","Warm","Met in person","Referred"].map(function(v){return <option key={v}>{v}</option>;})}
            </select>
          </div>
        </div>

        <div style={{fontSize:11,color:G,letterSpacing:2,textTransform:"uppercase",fontWeight:600,marginBottom:10,paddingTop:10,borderTop:"1px solid "+T.border}}>Add to Groups</div>
        <div style={{display:"flex",gap:10,marginBottom:20}}>
          <div onClick={function(){set("group_la",!form.group_la);}} style={{flex:1,padding:"9px 12px",background:form.group_la?"rgba(240,200,74,0.1)":"rgba(255,255,255,0.02)",border:"1px solid "+(form.group_la?G+"50":T.border),borderRadius:5,cursor:"pointer",textAlign:"center",fontSize:12,color:form.group_la?G:T.dim,fontWeight:form.group_la?600:400}}>Los Angeles</div>
          <div onClick={function(){set("group_sfv",!form.group_sfv);}} style={{flex:1,padding:"9px 12px",background:form.group_sfv?"rgba(74,158,186,0.1)":"rgba(255,255,255,0.02)",border:"1px solid "+(form.group_sfv?T.blue+"50":T.border),borderRadius:5,cursor:"pointer",textAlign:"center",fontSize:12,color:form.group_sfv?T.blue:T.dim,fontWeight:form.group_sfv?600:400}}>San Fernando Valley</div>
        </div>

        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{padding:"7px 16px",background:"transparent",border:"1px solid "+T.border,color:T.muted,borderRadius:5,cursor:"pointer",fontSize:13}}>Cancel</button>
          <button onClick={create} disabled={saving||!form.name.trim()} style={{padding:"7px 20px",background:"rgba(240,200,74,0.12)",border:"1px solid "+G+"40",color:G,borderRadius:5,cursor:form.name.trim()?"pointer":"default",fontSize:13,fontWeight:600,opacity:form.name.trim()?1:0.5}}>{saving?"Creating...":"Add Company"}</button>
        </div>
      </div>
    </div>
  );
}

export default function Sponsors(props) {
  var [companies, setCompanies] = useState([]);
  var [deals, setDeals] = useState([]);
  var [contacts, setContacts] = useState([]);
  var [loading, setLoading] = useState(true);
  var [selected, setSelected] = useState(null);
  var [stageFilter, setStageFilter] = useState("All");
  var [categoryFilter, setCategoryFilter] = useState("All");
  var [groupFilter, setGroupFilter] = useState("Los Angeles");
  var [hostOnly, setHostOnly] = useState(false);
  var [search, setSearch] = useState("");

  useEffect(function(){ load(); }, []);

  async function load() {
    setLoading(true);
    try {
      var cos = await SBfetch("companies?is_sponsor=eq.true&order=name.asc&limit=200");
      var ds  = await SBfetch("sponsor_deals?order=created_at.asc&limit=500");
      var cs  = await SBfetch("contacts?contact_type=eq.SPONSOR_CONTACT&order=last_name.asc&limit=500");
      setCompanies(Array.isArray(cos)?cos:[]);
      setDeals(Array.isArray(ds)?ds:[]);
      setContacts(Array.isArray(cs)?cs:[]);
    } catch(e){ console.error(e); }
    setLoading(false);
  }

  function getDeals(companyId) { return deals.filter(function(d){ return d.company_id===companyId; }); }
  function getContacts(companyId) { return contacts.filter(function(c){ return c.company_id===companyId; }); }

  function matchesFilters(co) {
    if (search) {
      var q = search.toLowerCase();
      var nameMatch = co.name.toLowerCase().includes(q);
      // Also search contacts linked to this company
      var contactMatch = getContacts(co.id).some(function(ct){
        var fullName = ((ct.full_name||"") || ((ct.first_name||"")+" "+(ct.last_name||""))).trim();
               return fullName.toLowerCase().includes(q) ||
               (ct.title||"").toLowerCase().includes(q) ||
               (ct.email||"").toLowerCase().includes(q);
      });
      if (!nameMatch && !contactMatch) return false;
    }
    if (categoryFilter !== "All" && co.sponsor_type !== categoryFilter) return false;
    if (hostOnly && co.host_viable !== "Yes") return false;
    if (stageFilter !== "All") {
      var coDeals = getDeals(co.id);
      var relevantDeals = groupFilter==="All" ? coDeals : coDeals.filter(function(d){ return d.chapter===groupFilter; });
      if (!relevantDeals.some(function(d){ return d.stage===stageFilter; })) return false;
    }
    if (groupFilter !== "All") {
      var coDealsAll = getDeals(co.id);
      // Companies with NO deals yet should always show (newly added prospects)
      if (coDealsAll.length > 0 && !coDealsAll.some(function(d){ return d.chapter===groupFilter; })) return false;
    }
    return true;
  }

  var filtered = companies.filter(matchesFilters);
  var selectedCo = selected ? companies.find(function(c){ return c.id===selected; }) : null;

  return (
    <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden",background:BG,fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,serif"}}>

      {/* Header */}
      <div style={{padding:"14px 20px 12px",borderBottom:"1px solid "+T.border,flexShrink:0,background:BG}}>
        <div style={{display:"flex",alignItems:"baseline",gap:12,marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
          <h2 style={{fontSize:18,fontWeight:700,color:T.text,margin:0}}>Sponsor Pipeline</h2>
          <button onClick={function(){setShowModal(true);}} style={{padding:"5px 14px",background:"rgba(240,200,74,0.1)",border:"1px solid "+G+"40",color:G,borderRadius:5,cursor:"pointer",fontSize:12,fontWeight:600}}>+ Add Company</button>
        </div>
          <span style={{fontSize:12,color:T.dim}}>Los Angeles · San Fernando Valley</span>
        </div>

        {/* Stage buckets */}
        <StageBuckets deals={deals} companies={companies} groupFilter={groupFilter} stageFilter={stageFilter} onSelectStage={function(s){ setStageFilter(function(prev){ return prev === s ? "All" : s; }); }}/>



        {/* Filters */}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginTop:10}}>
          <input value={search} onChange={function(e){setSearch(e.target.value);}} placeholder="Search..." style={{background:BG2,border:"1px solid "+T.border,color:T.text,padding:"5px 10px",borderRadius:5,fontSize:12,outline:"none",width:130}}/>
          <select value={groupFilter} onChange={function(e){setGroupFilter(e.target.value);}} style={{background:BG2,border:"1px solid "+T.border,color:T.muted,padding:"5px 8px",borderRadius:5,fontSize:12,outline:"none",cursor:"pointer"}}>
            {GROUPS.map(function(g){ return <option key={g}>{g}</option>; })}
          </select>
          <select value={categoryFilter} onChange={function(e){setCategoryFilter(e.target.value);}} style={{background:BG2,border:"1px solid "+T.border,color:T.muted,padding:"5px 8px",borderRadius:5,fontSize:12,outline:"none",cursor:"pointer"}}>
            {CATEGORIES.map(function(c){ return <option key={c}>{c}</option>; })}
          </select>
          <select value={stageFilter} onChange={function(e){setStageFilter(e.target.value);}} style={{background:BG2,border:"1px solid "+T.border,color:T.muted,padding:"5px 8px",borderRadius:5,fontSize:12,outline:"none",cursor:"pointer"}}>
            {STAGES.map(function(s){ return <option key={s}>{s}</option>; })}
          </select>
          <div onClick={function(){setHostOnly(function(v){return !v;});}} style={{padding:"5px 12px",background:hostOnly?T.green+"14":"rgba(255,255,255,0.02)",border:"1px solid "+(hostOnly?T.green+"50":T.border),color:hostOnly?T.green:T.muted,borderRadius:5,cursor:"pointer",fontSize:12,fontWeight:hostOnly?700:400}}>Host Only</div>
          <span style={{marginLeft:"auto",fontSize:11,color:T.dim}}>{filtered.length} companies</span>
        </div>
      </div>

      {/* Body */}
      <div style={{display:"grid",gridTemplateColumns:"300px 1fr",flex:1,overflow:"hidden",minHeight:0}}>
        <div style={{borderRight:"1px solid "+T.border,overflowY:"auto",padding:"10px",background:BG}}>
          {loading&&<div style={{textAlign:"center",color:T.dim,padding:40,fontSize:13}}>Loading...</div>}
          {!loading&&filtered.length===0&&<div style={{textAlign:"center",color:T.dim,padding:40,fontSize:13}}>No companies match filters.</div>}
          {filtered.map(function(co){
            return <CompanyCard key={co.id} company={co} deals={getDeals(co.id)} contacts={getContacts(co.id)} selected={selected===co.id} groupFilter={groupFilter} onClick={function(){ setSelected(co.id); }}/>;
          })}
        </div>
        <CompanyDetail company={selectedCo} deals={selectedCo?getDeals(selectedCo.id):[]} contacts={selectedCo?getContacts(selectedCo.id):[]} onUpdate={load} onStartDiscovery={props.onStartDiscovery} onNavigate={props.onNavigate}/>
      </div>
    </div>
  );
}
