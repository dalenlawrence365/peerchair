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

var STAGES = ["All","Prospect","Discovery Scheduled","Proposal Sent","Verbal Commitment","Active","Renewal"];
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
    headers: {"apikey": SBK, "Authorization": "Bearer " + SBK, "Content-Type": "application/json", "Prefer": "return=representation"},
    body: JSON.stringify(data)
  }).then(function(r){ return r.json(); });
}

function Badge(props) {
  var label = props.label; var color = props.color || T.muted; var small = props.small;
  return (
    <span style={{
      display:"inline-block", padding:small?"1px 6px":"2px 9px",
      borderRadius:20, border:"1px solid "+color+"50",
      background:color+"14", color:color,
      fontSize:small?9:10, fontWeight:600, letterSpacing:0.3,
      whiteSpace:"nowrap"
    }}>{label}</span>
  );
}

function HostBadge(props) {
  var tier = props.tier; var viable = props.viable;
  if (viable === "Yes" && tier === "Meeting Host") return <Badge label="HOST VIABLE" color={T.green}/>;
  if (viable === "Yes" && tier === "Either") return <Badge label="HOST POSSIBLE" color={T.gold}/>;
  if (viable === "Adjacent") return <Badge label="ADJACENT" color={T.orange}/>;
  if (viable === "No" || tier === "Presentation") return <Badge label="PRESENT ONLY" color={T.muted}/>;
  return null;
}

function StageColor(stage) {
  if (stage === "Active") return T.green;
  if (stage === "Verbal Commitment") return T.gold;
  if (stage === "Proposal Sent") return T.blue;
  if (stage === "Discovery Scheduled") return T.purple;
  if (stage === "Renewal") return T.orange;
  return T.dim;
}

function CategoryColor(cat) {
  if (!cat) return T.muted;
  if (cat.includes("Account")) return "#4a9eba";
  if (cat.includes("Banking")) return "#2ecc71";
  if (cat.includes("Law")) return "#9b59b6";
  if (cat.includes("Search")) return "#e67e22";
  if (cat.includes("HR")) return "#1abc9c";
  if (cat.includes("Insurance")) return "#e74c3c";
  if (cat.includes("Tech")) return "#3498db";
  if (cat.includes("Real")) return "#f39c12";
  return T.muted;
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
    <div onClick={onClick} style={{
      padding:"11px 14px", borderRadius:6, cursor:"pointer",
      background:selected?"rgba(240,200,74,0.06)":"rgba(255,255,255,0.02)",
      border:"1px solid "+(selected?G+"40":T.border),
      marginBottom:6, transition:"all 0.15s"
    }}>
      <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:5}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:600,color:selected?G:T.text,marginBottom:2}}>{co.name}</div>
          <div style={{fontSize:11,color:CategoryColor(co.category)}}>{co.category}</div>
        </div>
        <HostBadge tier={co.host_tier} viable={co.host_viable}/>
      </div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
        {laStage && (groupFilter === "All" || groupFilter === "Los Angeles") && (
          <span style={{fontSize:10,color:StageColor(laStage),background:StageColor(laStage)+"14",border:"1px solid "+StageColor(laStage)+"30",padding:"1px 6px",borderRadius:10}}>LA: {laStage}</span>
        )}
        {sfvStage && (groupFilter === "All" || groupFilter === "San Fernando Valley") && (
          <span style={{fontSize:10,color:StageColor(sfvStage),background:StageColor(sfvStage)+"14",border:"1px solid "+StageColor(sfvStage)+"30",padding:"1px 6px",borderRadius:10}}>SFV: {sfvStage}</span>
        )}
        <span style={{fontSize:10,color:T.dim,marginLeft:"auto"}}>{contacts.length} contact{contacts.length !== 1?"s":""}</span>
      </div>
    </div>
  );
}

function CompanyDetail(props) {
  var co = props.company;
  var deals = props.deals || [];
  var contacts = props.contacts || [];
  var onUpdate = props.onUpdate;

  var [editingDeal, setEditingDeal] = useState(null);
  var [savingDeal, setSavingDeal] = useState(false);

  if (!co) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",flex:1,color:T.dim,fontSize:13,flexDirection:"column",gap:8}}>
      <div style={{fontSize:24,opacity:0.3}}>◎</div>
      <div>Select a company to view details</div>
    </div>
  );

  async function saveStage(dealId, newStage) {
    setSavingDeal(true);
    await SBpatch("sponsor_deals", dealId, {stage: newStage});
    if (onUpdate) onUpdate();
    setSavingDeal(false);
  }

  var laDeals = deals.filter(function(d){ return d.group_name === "Los Angeles"; });
  var sfvDeals = deals.filter(function(d){ return d.group_name === "San Fernando Valley"; });

  return (
    <div style={{flex:1,overflowY:"auto",padding:"20px 24px",display:"flex",flexDirection:"column",gap:18}}>

      {/* Header */}
      <div style={{borderBottom:"1px solid "+T.border,paddingBottom:16}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:10}}>
          <div style={{flex:1}}>
            <div style={{fontSize:20,fontWeight:700,color:T.text,marginBottom:4}}>{co.name}</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
              <Badge label={co.category||"Uncategorized"} color={CategoryColor(co.category)}/>
              <HostBadge tier={co.host_tier} viable={co.host_viable}/>
            </div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {co.address_la && (
            <div>
              <div style={{fontSize:9,color:T.dim,letterSpacing:2,textTransform:"uppercase",marginBottom:3}}>LA Address</div>
              <div style={{fontSize:12,color:T.muted,lineHeight:1.5}}>{co.address_la}</div>
              {co.viability_la && <div style={{fontSize:10,color:co.viability_la==="Viable"?T.green:T.orange,marginTop:2}}>{co.viability_la}</div>}
            </div>
          )}
          {co.address_sfv && (
            <div>
              <div style={{fontSize:9,color:T.dim,letterSpacing:2,textTransform:"uppercase",marginBottom:3}}>SFV Address</div>
              <div style={{fontSize:12,color:T.muted,lineHeight:1.5}}>{co.address_sfv}</div>
              {co.viability_sfv && <div style={{fontSize:10,color:co.viability_sfv==="Viable"?T.green:co.viability_sfv==="Adjacent"?T.orange:T.dim,marginTop:2}}>{co.viability_sfv}</div>}
            </div>
          )}
        </div>
        {co.notes && <div style={{marginTop:10,fontSize:12,color:T.muted,lineHeight:1.6,padding:"8px 12px",background:"rgba(255,255,255,0.02)",borderRadius:5,borderLeft:"2px solid "+T.gold+"40"}}>{co.notes}</div>}
      </div>

      {/* Deals by Group */}
      <div>
        <div style={{fontSize:10,color:G,letterSpacing:3,textTransform:"uppercase",marginBottom:10,fontWeight:600}}>Pipeline — By Group</div>
        {[{label:"Los Angeles",deals:laDeals},{label:"San Fernando Valley",deals:sfvDeals}].map(function(group){
          if (group.deals.length === 0) return null;
          return (
            <div key={group.label} style={{marginBottom:12,padding:"12px 14px",background:"rgba(255,255,255,0.02)",border:"1px solid "+T.border,borderRadius:6}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <div style={{fontSize:12,fontWeight:600,color:T.text}}>{group.label}</div>
                {group.deals[0] && group.deals[0].host_assignment && <Badge label="HOST" color={T.green} small={true}/>}
              </div>
              {group.deals.map(function(deal){
                return (
                  <div key={deal.id}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                      <div style={{fontSize:11,color:T.muted}}>Stage:</div>
                      <select value={deal.stage} onChange={function(e){ saveStage(deal.id, e.target.value); }} disabled={savingDeal}
                        style={{background:BG2,border:"1px solid "+StageColor(deal.stage)+"50",color:StageColor(deal.stage),padding:"3px 8px",borderRadius:4,fontSize:12,outline:"none",cursor:"pointer"}}>
                        {["Prospect","Discovery Scheduled","Proposal Sent","Verbal Commitment","Active","Renewal"].map(function(s){
                          return <option key={s}>{s}</option>;
                        })}
                      </select>
                      <div style={{fontSize:11,color:T.dim}}>${(deal.annual_fee||5000).toLocaleString()}/yr</div>
                    </div>
                    {deal.notes && <div style={{fontSize:11,color:T.muted,lineHeight:1.5}}>{deal.notes}</div>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Contacts */}
      <div>
        <div style={{fontSize:10,color:G,letterSpacing:3,textTransform:"uppercase",marginBottom:10,fontWeight:600}}>Contacts — {contacts.length}</div>
        {contacts.length === 0 && <div style={{fontSize:12,color:T.dim,padding:"12px 0"}}>No contacts loaded yet.</div>}
        {contacts.map(function(c){
          return (
            <div key={c.id} style={{padding:"10px 12px",background:"rgba(255,255,255,0.02)",border:"1px solid "+T.border,borderRadius:5,marginBottom:6}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:3}}>
                <div style={{fontSize:13,fontWeight:600,color:T.text}}>{c.full_name}</div>
                {c.warmth === "Met in person" && <Badge label="Met in person" color={T.green} small={true}/>}
                {c.warmth === "Warm" && <Badge label="Warm" color={T.gold} small={true}/>}
              </div>
              <div style={{fontSize:12,color:T.muted,marginBottom:c.email?4:0}}>{c.title}</div>
              {c.email && <div style={{fontSize:11,color:T.dim}}>{c.email}</div>}
              {c.city && <div style={{fontSize:11,color:T.dim}}>{c.city}{c.state?", "+c.state:""}</div>}
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

  useEffect(function(){ load(); }, []);

  async function load() {
    setLoading(true);
    try {
      var cos = await SBfetch("sponsor_companies?order=name.asc&limit=200");
      var ds = await SBfetch("sponsor_deals?order=created_at.asc&limit=500");
      var cs = await SBfetch("sponsor_contacts?order=last_name.asc&limit=500");
      setCompanies(Array.isArray(cos)?cos:[]);
      setDeals(Array.isArray(ds)?ds:[]);
      setContacts(Array.isArray(cs)?cs:[]);
    } catch(e){ console.error(e); }
    setLoading(false);
  }

  function getDeals(companyId) {
    return deals.filter(function(d){ return d.company_id === companyId; });
  }

  function getContacts(companyId) {
    return contacts.filter(function(c){ return c.company_id === companyId; });
  }

  function matchesFilters(co) {
    if (search && !co.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (categoryFilter !== "All" && co.category !== categoryFilter) return false;
    if (hostOnly && co.host_viable !== "Yes") return false;
    if (stageFilter !== "All") {
      var coDeals = getDeals(co.id);
      var relevantDeals = groupFilter === "All" ? coDeals : coDeals.filter(function(d){ return d.group_name === groupFilter; });
      if (!relevantDeals.some(function(d){ return d.stage === stageFilter; })) return false;
    }
    if (groupFilter !== "All") {
      var coDeals2 = getDeals(co.id);
      if (!coDeals2.some(function(d){ return d.group_name === groupFilter; })) return false;
    }
    return true;
  }

  var filtered = companies.filter(matchesFilters);

  // Stats
  var activeCount = deals.filter(function(d){ return d.stage === "Active"; }).length;
  var hostViableCount = companies.filter(function(c){ return c.host_viable === "Yes"; }).length;
  var laCount = deals.filter(function(d){ return d.group_name === "Los Angeles"; }).length;
  var sfvCount = deals.filter(function(d){ return d.group_name === "San Fernando Valley"; }).length;
  var totalARR = deals.filter(function(d){ return d.stage === "Active"; }).reduce(function(sum, d){ return sum + (d.annual_fee||5000); }, 0);

  var selectedCo = selected ? companies.find(function(c){ return c.id === selected; }) : null;

  return (
    <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden",fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,serif"}}>

      {/* Header */}
      <div style={{padding:"16px 24px 12px",borderBottom:"1px solid "+T.border,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
          <div style={{flex:1}}>
            <h2 style={{fontSize:18,fontWeight:700,color:T.text,margin:"0 0 2px"}}>Sponsor Pipeline</h2>
            <div style={{fontSize:12,color:T.muted}}>Los Angeles · San Fernando Valley</div>
          </div>
        </div>

        {/* KPI row */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:14}}>
          {[
            ["Companies", companies.length, T.blue],
            ["Host Viable", hostViableCount, T.green],
            ["LA Deals", laCount, T.gold],
            ["SFV Deals", sfvCount, T.purple],
            ["Active ARR", "$"+totalARR.toLocaleString(), T.green],
          ].map(function(item){
            return (
              <div key={item[0]} style={{background:BG3,border:"1px solid "+T.border,borderTop:"2px solid "+item[2]+"40",borderRadius:6,padding:"8px 12px"}}>
                <div style={{fontSize:11,color:T.muted,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>{item[0]}</div>
                <div style={{fontSize:20,fontWeight:700,color:item[2]}}>{item[1]}</div>
              </div>
            );
          })}
        </div>

        {/* Filters */}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <input value={search} onChange={function(e){setSearch(e.target.value);}} placeholder="Search companies..." style={{background:BG2,border:"1px solid "+T.border,color:T.text,padding:"5px 10px",borderRadius:5,fontSize:12,outline:"none",width:160}}/>
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
          <div style={{marginLeft:"auto",fontSize:11,color:T.dim}}>{filtered.length} companies</div>
        </div>
      </div>

      {/* Body */}
      <div style={{display:"grid",gridTemplateColumns:"320px 1fr",flex:1,overflow:"hidden",minHeight:0}}>

        {/* Company list */}
        <div style={{borderRight:"1px solid "+T.border,overflowY:"auto",padding:"12px"}}>
          {loading && <div style={{textAlign:"center",color:T.dim,padding:40,fontSize:13}}>Loading...</div>}
          {!loading && filtered.length === 0 && <div style={{textAlign:"center",color:T.dim,padding:40,fontSize:13}}>No companies match your filters.</div>}
          {filtered.map(function(co){
            return (
              <CompanyCard
                key={co.id}
                company={co}
                deals={getDeals(co.id)}
                contacts={getContacts(co.id)}
                selected={selected === co.id}
                groupFilter={groupFilter}
                onClick={function(){ setSelected(co.id); }}
              />
            );
          })}
        </div>

        {/* Detail panel */}
        <CompanyDetail
          company={selectedCo}
          deals={selectedCo ? getDeals(selectedCo.id) : []}
          contacts={selectedCo ? getContacts(selectedCo.id) : []}
          onUpdate={load}
        />
      </div>
    </div>
  );
}
