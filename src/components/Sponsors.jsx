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

var STAGES = ["All","Prospect","Engaged","Discovery Scheduled","Proposal Sent","Verbal Commitment","Active","Renewal"];
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
          var matchGroup = groupFilter === "All" || d.group_name === groupFilter;
          return d.stage === item.stage && matchGroup;
        });
        var count = relevantDeals.length;
        var isSelected = selectedStage === item.stage;
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
            <div style={{fontSize:9,color:isSelected?item.color:T.dim,letterSpacing:1,textTransform:"uppercase",lineHeight:1.3}}>{item.stage}</div>
          </div>
        );
      })}
    </div>
  );
}

// Stage drill-down table
function StageDrillDown(props) {
  var stage = props.stage;
  var deals = props.deals;
  var companies = props.companies;
  var groupFilter = props.groupFilter;
  var onSelectCompany = props.onSelectCompany;

  if (!stage) return null;

  var relevantDeals = deals.filter(function(d){
    var matchGroup = groupFilter === "All" || d.group_name === groupFilter;
    return d.stage === stage && matchGroup;
  });

  return (
    <div style={{background:BG3,border:"1px solid "+T.border,borderRadius:6,overflow:"hidden",marginBottom:4}}>
      <div style={{padding:"10px 16px",borderBottom:"1px solid "+T.border,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{fontSize:12,fontWeight:600,color:StageColor(stage)}}>{stage} — {relevantDeals.length} companies</div>
        <div onClick={function(){props.onClose();}} style={{cursor:"pointer",color:T.dim,fontSize:16,lineHeight:1}}>✕</div>
      </div>
      {relevantDeals.length === 0 && <div style={{padding:"16px",fontSize:12,color:T.dim,textAlign:"center"}}>No companies in this stage.</div>}
      {relevantDeals.map(function(deal) {
        var co = companies.find(function(c){ return c.id === deal.company_id; });
        if (!co) return null;
        return (
          <div key={deal.id} onClick={function(){ onSelectCompany(co.id); props.onClose(); }}
            style={{display:"flex",alignItems:"center",gap:12,padding:"10px 16px",borderBottom:"1px solid "+T.border,cursor:"pointer",transition:"background 0.1s"}}
            onMouseOver={function(e){e.currentTarget.style.background="rgba(255,255,255,0.03)";}}
            onMouseOut={function(e){e.currentTarget.style.background="transparent";}}>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:600,color:G}}>{co.name}</div>
              <div style={{fontSize:11,color:CategoryColor(co.category)}}>{co.category}</div>
            </div>
            <div style={{fontSize:11,color:T.dim}}>{deal.group_name}</div>
            <HostBadge tier={co.host_tier} viable={co.host_viable}/>
            <div style={{fontSize:11,color:T.dim}}>→</div>
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
  var laDeals = deals.filter(function(d){ return d.group_name === "Los Angeles"; });
  var sfvDeals = deals.filter(function(d){ return d.group_name === "San Fernando Valley"; });
  var laStage = laDeals[0] ? laDeals[0].stage : null;
  var sfvStage = sfvDeals[0] ? sfvDeals[0].stage : null;
  return (
    <div onClick={onClick} style={{padding:"11px 14px",borderRadius:6,cursor:"pointer",background:selected?"rgba(240,200,74,0.06)":"rgba(255,255,255,0.02)",border:"1px solid "+(selected?G+"40":T.border),marginBottom:6,transition:"all 0.15s"}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:5}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:600,color:selected?G:T.text,marginBottom:2}}>{co.name}</div>
          <div style={{fontSize:11,color:CategoryColor(co.category)}}>{co.category}</div>
        </div>
        <HostBadge tier={co.host_tier} viable={co.host_viable}/>
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
  var deals = props.deals || [];
  var contacts = props.contacts || [];
  var onUpdate = props.onUpdate;
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
    await SBpost("sponsor_deals", {company_id:co.id,group_name:groupName,stage:"Prospect",category_seat:co.category,annual_fee:5000,host_assignment:co.host_tier==="Meeting Host"});
    if (onUpdate) onUpdate();
    setSaving(false);
  }

  async function removeGroup(dealId) {
    setSaving(true);
    await SBdelete("sponsor_deals", dealId);
    if (onUpdate) onUpdate();
    setSaving(false);
  }

  var laDeals = deals.filter(function(d){ return d.group_name === "Los Angeles"; });
  var sfvDeals = deals.filter(function(d){ return d.group_name === "San Fernando Valley"; });

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
            <div style={{display:"flex",gap:12}}>
              {/* LA */}
              <div style={{flex:1,padding:"12px 14px",background:"rgba(255,255,255,0.02)",border:"1px solid "+T.border,borderRadius:6}}>
                {laDeals.length > 0 ? (
                  <div>
                    <SponsorJourneyTrack deal={laDeals[0]} groupName="Los Angeles" onStageChange={saveStage}/>
                    <div onClick={function(){ if(!saving) removeGroup(laDeals[0].id); }} style={{marginTop:6,fontSize:10,color:T.dim,cursor:"pointer",textAlign:"right"}}>Remove LA</div>
                  </div>
                ) : (
                  <div style={{textAlign:"center",padding:"8px 0"}}>
                    <div style={{fontSize:11,color:T.dim,marginBottom:8}}>Not pursuing LA</div>
                    <button onClick={function(){ if(!saving) addGroup("Los Angeles"); }} style={{padding:"5px 14px",background:"rgba(240,200,74,0.1)",border:"1px solid "+G+"40",color:G,borderRadius:4,cursor:"pointer",fontSize:11}}>+ Add Los Angeles</button>
                  </div>
                )}
              </div>
              {/* SFV */}
              <div style={{flex:1,padding:"12px 14px",background:"rgba(255,255,255,0.02)",border:"1px solid "+T.border,borderRadius:6}}>
                {sfvDeals.length > 0 ? (
                  <div>
                    <SponsorJourneyTrack deal={sfvDeals[0]} groupName="San Fernando Valley" onStageChange={saveStage}/>
                    <div onClick={function(){ if(!saving) removeGroup(sfvDeals[0].id); }} style={{marginTop:6,fontSize:10,color:T.dim,cursor:"pointer",textAlign:"right"}}>Remove SFV</div>
                  </div>
                ) : (
                  <div style={{textAlign:"center",padding:"8px 0"}}>
                    <div style={{fontSize:11,color:T.dim,marginBottom:8}}>Not pursuing SFV</div>
                    <button onClick={function(){ if(!saving) addGroup("San Fernando Valley"); }} style={{padding:"5px 14px",background:"rgba(255,255,255,0.04)",border:"1px solid "+T.border,color:T.muted,borderRadius:4,cursor:"pointer",fontSize:11}}>+ Add SFV</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Company info */}
      <div style={{padding:"16px 20px 0",flexShrink:0}}>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:18,fontWeight:700,color:T.text,marginBottom:6}}>{co.name}</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <Badge label={co.category||"Uncategorized"} color={CategoryColor(co.category)}/>
            <HostBadge tier={co.host_tier} viable={co.host_viable}/>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          {co.address_la&&<div><div style={{fontSize:9,color:T.dim,letterSpacing:2,textTransform:"uppercase",marginBottom:3}}>LA Address</div><div style={{fontSize:12,color:T.muted,lineHeight:1.5}}>{co.address_la}</div>{co.area_la&&<div style={{fontSize:10,color:T.dim,marginTop:2}}>{co.area_la}</div>}</div>}
          {co.address_sfv&&<div><div style={{fontSize:9,color:T.dim,letterSpacing:2,textTransform:"uppercase",marginBottom:3}}>SFV Address</div><div style={{fontSize:12,color:T.muted,lineHeight:1.5}}>{co.address_sfv}</div>{co.area_sfv&&<div style={{fontSize:10,color:T.dim,marginTop:2}}>{co.area_sfv}</div>}</div>}
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
                {ct.warmth==="Met in person"&&<Badge label="Met in person" color={T.green} small={true}/>}
                {ct.warmth==="Warm"&&<Badge label="Warm" color={G} small={true}/>}
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

export default function Sponsors() {
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
  var [selectedStage, setSelectedStage] = useState(null);

  useEffect(function(){ load(); }, []);

  async function load() {
    setLoading(true);
    try {
      var cos = await SBfetch("sponsor_companies?order=name.asc&limit=200");
      var ds  = await SBfetch("sponsor_deals?order=created_at.asc&limit=500");
      var cs  = await SBfetch("sponsor_contacts?order=last_name.asc&limit=500");
      setCompanies(Array.isArray(cos)?cos:[]);
      setDeals(Array.isArray(ds)?ds:[]);
      setContacts(Array.isArray(cs)?cs:[]);
    } catch(e){ console.error(e); }
    setLoading(false);
  }

  function getDeals(companyId) { return deals.filter(function(d){ return d.company_id===companyId; }); }
  function getContacts(companyId) { return contacts.filter(function(c){ return c.company_id===companyId; }); }

  function matchesFilters(co) {
    if (search && !co.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (categoryFilter !== "All" && co.category !== categoryFilter) return false;
    if (hostOnly && co.host_viable !== "Yes") return false;
    if (stageFilter !== "All") {
      var coDeals = getDeals(co.id);
      var relevantDeals = groupFilter==="All" ? coDeals : coDeals.filter(function(d){ return d.group_name===groupFilter; });
      if (!relevantDeals.some(function(d){ return d.stage===stageFilter; })) return false;
    }
    if (groupFilter !== "All") {
      if (!getDeals(co.id).some(function(d){ return d.group_name===groupFilter; })) return false;
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
          <h2 style={{fontSize:18,fontWeight:700,color:T.text,margin:0}}>Sponsor Pipeline</h2>
          <span style={{fontSize:12,color:T.dim}}>Los Angeles · San Fernando Valley</span>
        </div>

        {/* Stage buckets */}
        <StageBuckets deals={deals} companies={companies} groupFilter={groupFilter} selectedStage={selectedStage} onSelectStage={function(s){ setSelectedStage(s); }}/>

        {/* Drill-down table */}
        {selectedStage && (
          <div style={{marginTop:10}}>
            <StageDrillDown stage={selectedStage} deals={deals} companies={companies} groupFilter={groupFilter}
              onSelectCompany={function(id){ setSelected(id); setSelectedStage(null); }}
              onClose={function(){ setSelectedStage(null); }}/>
          </div>
        )}

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
        <CompanyDetail company={selectedCo} deals={selectedCo?getDeals(selectedCo.id):[]} contacts={selectedCo?getContacts(selectedCo.id):[]} onUpdate={load}/>
      </div>
    </div>
  );
}
