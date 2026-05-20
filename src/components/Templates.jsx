"use client"
import { useState, useEffect } from "react";

var G = "#f0c84a";
var BG = "#080f1a";
var BG2 = "#0c1520";
var BG3 = "#0f1e2e";
var T = {
  text:"#e8f2ff", muted:"#7a9bb8", dim:"#3a5a74",
  border:"rgba(255,255,255,0.06)",
  green:"#2ecc71", red:"#e74c3c", orange:"#e67e22",
  blue:"#4a9eba", purple:"#9b59b6"
};

var TYPE_COLORS = {
  call_script: T.purple,
  linkedin: T.blue,
  email: G,
};
var TYPE_LABELS = {call_script:"Call Script", linkedin:"LinkedIn", email:"Email"};
var CAT_LABELS = {
  cfo_fit_call:"CFO Fit Call", sponsor_discovery:"Sponsor Discovery",
  cfo_outreach:"CFO Outreach", sponsor_outreach:"Sponsor Outreach",
  fit_call:"Fit Call", event:"Event", nurture_prelease:"Pre-Launch Nurture",
  nurture_waitlist:"Waitlist Nurture", sponsor:"Sponsor", general:"General"
};

function SBfetch(path) {
  var SBU = process.env.NEXT_PUBLIC_SUPABASE_URL;
  var SBK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return fetch(SBU+"/rest/v1/"+path, {
    headers:{"apikey":SBK,"Authorization":"Bearer "+SBK}
  }).then(function(r){return r.json();});
}

function SBpost(table, data) {
  var SBU = process.env.NEXT_PUBLIC_SUPABASE_URL;
  var SBK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return fetch(SBU+"/rest/v1/"+table, {
    method:"POST",
    headers:{"apikey":SBK,"Authorization":"Bearer "+SBK,"Content-Type":"application/json","Prefer":"return=representation"},
    body:JSON.stringify(data)
  }).then(function(r){return r.json();});
}

function SBpatch(table, id, data) {
  if (!id) return Promise.resolve(null);
  var SBU = process.env.NEXT_PUBLIC_SUPABASE_URL;
  var SBK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return fetch(SBU+"/rest/v1/"+table+"?id=eq."+id, {
    method:"PATCH",
    headers:{"apikey":SBK,"Authorization":"Bearer "+SBK,"Content-Type":"application/json","Prefer":"return=representation"},
    body:JSON.stringify(data)
  }).then(function(r){return r.json();});
}

function Badge(props) {
  var label=props.label; var color=props.color||T.muted;
  return <span style={{display:"inline-block",padding:"1px 8px",borderRadius:10,border:"1px solid "+color+"40",background:color+"12",color:color,fontSize:10,fontWeight:600,whiteSpace:"nowrap"}}>{label}</span>;
}

function VariantTab(props) {
  var variant=props.variant; var active=props.active; var hasContent=props.hasContent; var onClick=props.onClick;
  return (
    <div onClick={onClick} style={{padding:"5px 14px",borderRadius:"4px 4px 0 0",cursor:"pointer",background:active?BG3:"transparent",border:"1px solid "+(active?T.border:"transparent"),borderBottom:active?"1px solid "+BG3:"none",fontSize:12,color:active?G:hasContent?T.muted:T.dim,fontWeight:active?600:400,position:"relative",top:1}}>
      {variant}
      {hasContent&&!active&&<span style={{marginLeft:4,width:4,height:4,borderRadius:"50%",background:T.green,display:"inline-block",verticalAlign:"middle"}}/>}
    </div>
  );
}

function TemplateEditor(props) {
  var group = props.group;
  var variants = props.variants;
  var onSave = props.onSave;
  var onPushToHeyreach = props.onPushToHeyreach;

  var [activeVariant, setActiveVariant] = useState(group.active_variant || "A");
  var [editing, setEditing] = useState({});
  var [saving, setSaving] = useState(false);
  var [saved, setSaved] = useState(false);
  var [pushing, setPushing] = useState(false);

  var current = variants.find(function(v){return v.variant===activeVariant;}) || null;

  useEffect(function(){
    if (current) {
      setEditing({
        name: current.name||"",
        subject: current.subject||"",
        body: current.body||"",
        performance_notes: current.performance_notes||"",
        sequence_key: current.sequence_key||"",
        webhook_phrase: current.webhook_phrase||""
      });
    } else {
      setEditing({name:"", subject:"", body:"", performance_notes:"", sequence_key:"", webhook_phrase:""});
    }
  }, [activeVariant, group.id]);

  async function save() {
    setSaving(true);
    if (current) {
      await SBpatch("template_variants", current.id, {
        name: editing.name,
        subject: editing.subject,
        body: editing.body,
        performance_notes: editing.performance_notes,
        sequence_key: editing.sequence_key || null,
        webhook_phrase: editing.webhook_phrase || null,
        updated_at: new Date().toISOString()
      });
    }
    if (onSave) onSave();
    setSaved(true);
    setTimeout(function(){setSaved(false);}, 2000);
    setSaving(false);
  }

  async function pushToHeyReach() {
    if (!current || !current.heyreach_campaign_id) return;
    setPushing(true);
    try {
      var res = await fetch("/api/heyreach-stats", {  // TODO: replace with push endpoint
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          campaignId: current.heyreach_campaign_id,
          stepId: current.heyreach_step_id,
          message: editing.body,
          variant: activeVariant
        })
      });
      var data = await res.json();
      if (data.success) alert("Pushed to HeyReach successfully");
      else alert("Push failed: " + (data.error||"unknown error"));
    } catch(e) {
      alert("Push failed: " + e.message);
    }
    setPushing(false);
  }

  var isScript = group.type === "call_script";
  var isLinkedIn = group.type === "linkedin";
  var isEmail = group.type === "email";
  var typeColor = TYPE_COLORS[group.type] || T.muted;

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:BG}}>

      {/* Header */}
      <div style={{padding:"16px 24px 12px",borderBottom:"1px solid "+T.border,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:8}}>
          <div style={{flex:1}}>
            <div style={{fontSize:16,fontWeight:700,color:T.text,marginBottom:4}}>{group.name}</div>
            <div style={{display:"flex",gap:8}}>
              <Badge label={TYPE_LABELS[group.type]||group.type} color={typeColor}/>
              <Badge label={CAT_LABELS[group.category]||group.category} color={T.muted}/>
              {group.active_variant && <Badge label={"Live: "+group.active_variant} color={T.green}/>}
            </div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {isLinkedIn && current && current.heyreach_campaign_id && (
              <button onClick={pushToHeyReach} disabled={pushing} style={{padding:"6px 14px",background:"rgba(74,158,186,0.1)",border:"1px solid "+T.blue+"40",color:T.blue,borderRadius:5,cursor:"pointer",fontSize:11,fontWeight:600}}>
                {pushing?"Pushing...":"Push to HeyReach"}
              </button>
            )}
            <button onClick={save} disabled={saving} style={{padding:"6px 14px",background:saved?"rgba(46,204,113,0.1)":"rgba(240,200,74,0.1)",border:"1px solid "+(saved?T.green+"40":G+"40"),color:saved?T.green:G,borderRadius:5,cursor:"pointer",fontSize:11,fontWeight:600}}>
              {saving?"Saving...":saved?"Saved":"Save"}
            </button>
          </div>
        </div>

        {/* Variant tabs */}
        <div style={{display:"flex",gap:2,borderBottom:"1px solid "+T.border}}>
          {["A","B","C"].map(function(v){
            var hasV = variants.some(function(vr){return vr.variant===v && (vr.body||vr.steps);});
            return <VariantTab key={v} variant={v} active={activeVariant===v} hasContent={hasV} onClick={function(){setActiveVariant(v);}}/>;
          })}
          <div style={{flex:1,borderBottom:"1px solid "+T.border}}/>
        </div>
      </div>

      {/* Editor body */}
      <div style={{flex:1,overflowY:"auto",padding:"16px 24px"}}>

        {isScript && current && current.steps && (
          <div>
            <div style={{fontSize:10,color:G,letterSpacing:2,textTransform:"uppercase",fontWeight:600,marginBottom:12}}>Script Steps</div>
            {(function(){try{return Array.isArray(current.steps)?current.steps:JSON.parse(current.steps||"[]");}catch(e){return [];}})().map(function(step, i){
              return (
                <div key={step.id} style={{padding:"12px 14px",background:BG3,border:"1px solid "+T.border,borderLeft:"3px solid "+(step.contextual?T.orange:T.purple),borderRadius:5,marginBottom:10}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                    <span style={{fontSize:10,color:step.contextual?T.orange:T.purple,letterSpacing:2,textTransform:"uppercase",fontWeight:600}}>{step.label}</span>
                    <Badge label={step.tag} color={step.contextual?T.orange:T.dim}/>
                    {step.contextual&&<Badge label="Contextual" color={T.orange}/>}
                  </div>
                  <div style={{fontSize:13,color:T.text,lineHeight:1.75,fontStyle:"italic",marginBottom:step.fallback?10:0}}>"{step.prompt}"</div>
                  {step.fallback&&(
                    <div>
                      <div style={{fontSize:10,color:T.dim,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Fallback:</div>
                      <div style={{fontSize:12,color:T.muted,lineHeight:1.7,fontStyle:"italic",padding:"7px 10px",background:"rgba(240,200,74,0.04)",borderRadius:4,borderLeft:"2px solid "+G+"40"}}>"{step.fallback}"</div>
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{padding:"12px 14px",background:"rgba(255,255,255,0.02)",border:"1px solid "+T.border,borderRadius:5,fontSize:12,color:T.dim,marginTop:8}}>
              Script editing coming soon — edit steps directly in this view.
            </div>
          </div>
        )}

        {!(isScript && current && current.steps) && (
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div>
              <div style={{fontSize:10,color:T.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:5}}>Variant Name</div>
              <input value={editing.name||""} onChange={function(e){setEditing(function(p){var n=Object.assign({},p);n.name=e.target.value;return n;});}} placeholder="e.g. Direct opener" style={{width:"100%",background:BG2,border:"1px solid "+T.border,color:T.text,padding:"7px 11px",borderRadius:5,fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
            </div>

            {isEmail&&(
              <div>
                <div style={{fontSize:10,color:T.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:5}}>Subject Line</div>
                <input value={editing.subject||""} onChange={function(e){setEditing(function(p){var n=Object.assign({},p);n.subject=e.target.value;return n;});}} placeholder="Email subject..." style={{width:"100%",background:BG2,border:"1px solid "+T.border,color:T.text,padding:"7px 11px",borderRadius:5,fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
              </div>
            )}

            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                <div style={{fontSize:10,color:T.muted,letterSpacing:2,textTransform:"uppercase"}}>{isLinkedIn?"Message Body":isScript?"Script Body":"Email Body"}</div>
                {current&&current.variables&&(
                  <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                    {(Array.isArray(current.variables)?current.variables:JSON.parse(current.variables||"[]")).map(function(v){
                      return <span key={v} style={{fontSize:9,color:T.dim,background:"rgba(255,255,255,0.04)",padding:"1px 6px",borderRadius:3,fontFamily:"monospace"}}>{"{{"+v+"}}"}</span>;
                    })}
                  </div>
                )}
              </div>
              <textarea value={editing.body||""} onChange={function(e){setEditing(function(p){var n=Object.assign({},p);n.body=e.target.value;return n;});}} placeholder="Message content..." style={{width:"100%",background:BG2,border:"1px solid "+T.border,color:T.text,padding:"9px 11px",borderRadius:5,fontSize:13,lineHeight:1.75,resize:"vertical",outline:"none",fontFamily:"inherit",boxSizing:"border-box",minHeight:isEmail?260:140}}/>
            </div>

            <div>
              <div style={{fontSize:10,color:T.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:5}}>Performance Notes</div>
              <textarea value={editing.performance_notes||""} onChange={function(e){setEditing(function(p){var n=Object.assign({},p);n.performance_notes=e.target.value;return n;});}} placeholder="Notes on how this variant is performing..." style={{width:"100%",background:BG2,border:"1px solid "+T.border,color:T.muted,padding:"7px 11px",borderRadius:5,fontSize:12,lineHeight:1.65,resize:"vertical",outline:"none",fontFamily:"inherit",boxSizing:"border-box",minHeight:60}}/>
              {/* Sequence Key + Webhook Phrase */}
              <div style={{display:"flex",gap:8,marginTop:10}}>
                <div style={{flex:"0 0 140px"}}>
                  <div style={{fontSize:11,letterSpacing:2,color:"#4a9eba",textTransform:"uppercase",marginBottom:4}}>Sequence Key</div>
                  <input value={editing.sequence_key||""} onChange={function(e){setEditing(function(p){var n=Object.assign({},p);n.sequence_key=e.target.value;return n;});}} placeholder="e.g. LI-ENG-2" style={{width:"100%",background:BG2,border:"1px solid rgba(74,158,186,0.3)",color:"#4a9eba",padding:"5px 9px",borderRadius:5,fontSize:12,outline:"none",fontFamily:"'Courier New',monospace",boxSizing:"border-box"}}/>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,letterSpacing:2,color:"#4a9eba",textTransform:"uppercase",marginBottom:4}}>Webhook Phrase</div>
                  <input value={editing.webhook_phrase||""} onChange={function(e){setEditing(function(p){var n=Object.assign({},p);n.webhook_phrase=e.target.value;return n;});}} placeholder="Distinctive phrase for auto-detection..." style={{width:"100%",background:BG2,border:"1px solid rgba(74,158,186,0.3)",color:T.muted,padding:"5px 9px",borderRadius:5,fontSize:12,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
                </div>
              </div>
            </div>

            {!current&&(
              <div style={{padding:"12px 14px",background:"rgba(255,255,255,0.02)",border:"1px solid "+T.border,borderRadius:5,fontSize:12,color:T.dim,textAlign:"center"}}>
                Variant {activeVariant} is empty — fill in the body above and save to create it.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SequenceList(props) {
  var sequences = props.sequences;
  if (!sequences || sequences.length === 0) return <div style={{padding:40,textAlign:"center",color:T.dim,fontSize:13}}>No sequences yet.</div>;
  return (
    <div style={{padding:"12px"}}>
      {sequences.map(function(seq){
        return (
          <div key={seq.id} style={{padding:"12px 14px",background:BG3,border:"1px solid "+T.border,borderRadius:6,marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
              <div style={{fontSize:13,fontWeight:600,color:T.text}}>{seq.name}</div>
              <Badge label={seq.cadence} color={T.blue}/>
              <Badge label={seq.status} color={seq.status==="active"?T.green:T.dim}/>
            </div>
            <div style={{fontSize:12,color:T.muted,marginBottom:4}}>{seq.description}</div>
            <div style={{fontSize:11,color:T.dim}}>Trigger: {seq.trigger_event}</div>
          </div>
        );
      })}
    </div>
  );
}


function AddTemplateModal(props) {
  var onClose = props.onClose;
  var onCreated = props.onCreated;
  var [form, setForm] = useState({type:"email", category:"general", name:"", description:""});
  var [saving, setSaving] = useState(false);

  function set(key, val) {
    setForm(function(p){ var n=Object.assign({},p); n[key]=val; return n; });
  }

  async function create() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      var groups = await SBpost("template_groups", {
        type: form.type,
        category: form.category,
        name: form.name.trim(),
        description: form.description.trim(),
        active_variant: "A",
        status: "active",
        sort_order: 999
      });
      var group = Array.isArray(groups) ? groups[0] : groups;
      if (group && group.id) {
        // Create empty Variant A
        await SBpost("template_variants", {
          group_id: group.id,
          variant: "A",
          name: "Version A",
          body: "",
          subject: "",
          variables: "[]",
          status: "active"
        });
        if (onCreated) onCreated(group.id);
      }
    } catch(e) { console.error(e); }
    setSaving(false);
    onClose();
  }

  var categories = {
    call_script: ["cfo_fit_call","sponsor_discovery"],
    linkedin: ["cfo_outreach","sponsor_outreach"],
    email: ["fit_call","event","nurture_prelease","nurture_waitlist","sponsor","general"],
    calendly: ["calendly"]
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}}>
      <div style={{background:BG3,border:"1px solid "+T.border,borderRadius:8,padding:"24px",width:400,maxWidth:"90vw"}}>
        <div style={{fontSize:15,fontWeight:700,color:T.text,marginBottom:16}}>Add Template</div>

        <div style={{marginBottom:12}}>
          <div style={{fontSize:10,color:T.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:5}}>Type</div>
          <div style={{display:"flex",gap:6}}>
            {[{k:"email",l:"Email",c:G},{k:"linkedin",l:"LinkedIn",c:T.blue},{k:"call_script",l:"Call Script",c:T.purple},{k:"calendly",l:"Calendly",c:"#006BFF"}].map(function(t){
              var isActive = form.type===t.k;
              return <button key={t.k} onClick={function(){set("type",t.k); set("category",categories[t.k][0]);}} style={{flex:1,padding:"7px 6px",background:isActive?t.c+"14":"rgba(255,255,255,0.02)",border:"1px solid "+(isActive?t.c+"50":T.border),color:isActive?t.c:T.muted,borderRadius:5,cursor:"pointer",fontSize:12,fontWeight:isActive?600:400}}>{t.l}</button>;
            })}
          </div>
        </div>

        <div style={{marginBottom:12}}>
          <div style={{fontSize:10,color:T.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:5}}>Category</div>
          <select value={form.category} onChange={function(e){set("category",e.target.value);}} style={{width:"100%",background:BG2,border:"1px solid "+T.border,color:T.text,padding:"7px 10px",borderRadius:5,fontSize:13,outline:"none",cursor:"pointer"}}>
            {(categories[form.type]||[]).map(function(cat){
              return <option key={cat} value={cat}>{CAT_LABELS[cat]||cat}</option>;
            })}
          </select>
        </div>

        <div style={{marginBottom:12}}>
          <div style={{fontSize:10,color:T.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:5}}>Template Name</div>
          <input value={form.name} onChange={function(e){set("name",e.target.value);}} placeholder="e.g. Post Fit Call - No Show" style={{width:"100%",background:BG2,border:"1px solid "+T.border,color:T.text,padding:"7px 10px",borderRadius:5,fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
        </div>

        <div style={{marginBottom:20}}>
          <div style={{fontSize:10,color:T.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:5}}>Description (optional)</div>
          <input value={form.description} onChange={function(e){set("description",e.target.value);}} placeholder="When is this used?" style={{width:"100%",background:BG2,border:"1px solid "+T.border,color:T.muted,padding:"7px 10px",borderRadius:5,fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
        </div>

        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{padding:"7px 16px",background:"transparent",border:"1px solid "+T.border,color:T.muted,borderRadius:5,cursor:"pointer",fontSize:13}}>Cancel</button>
          <button onClick={create} disabled={saving||!form.name.trim()} style={{padding:"7px 20px",background:"rgba(240,200,74,0.12)",border:"1px solid "+G+"40",color:G,borderRadius:5,cursor:form.name.trim()?"pointer":"default",fontSize:13,fontWeight:600,opacity:form.name.trim()?1:0.5}}>{saving?"Creating...":"Create Template"}</button>
        </div>
      </div>
    </div>
  );
}

export default function Templates() {
  var [groups, setGroups] = useState([]);
  var [variants, setVariants] = useState([]);
  var [sequences, setSequences] = useState([]);
  var [loading, setLoading] = useState(true);
  var [selected, setSelected] = useState(null);
  var [tab, setTab] = useState("templates");
  var [typeFilter, setTypeFilter] = useState("all");
  var [search, setSearch] = useState("");
  var [showModal, setShowModal] = useState(false);

  useEffect(function(){ load(); }, []);

  function load() {
    setLoading(true);
    return Promise.all([
      SBfetch("template_groups?order=sort_order.asc&limit=100"),
      SBfetch("template_variants?order=variant.asc&limit=300"),
      SBfetch("template_sequences?order=created_at.asc&limit=50")
    ]).then(function(results){
      var gs = results[0]; var vs = results[1]; var ss = results[2];
      setGroups(Array.isArray(gs)?gs:[]);
      setVariants(Array.isArray(vs)?vs:[]);
      setSequences(Array.isArray(ss)?ss:[]);
      setLoading(false);
      if (!selected && gs && gs.length > 0) setSelected(gs[0].id);
      return gs;
    }).catch(function(e){
      console.error("Templates load error:",e);
      setLoading(false);
      return [];
    });
  }

  function getVariants(groupId) {
    return variants.filter(function(v){return v.group_id===groupId;});
  }

  var filtered = groups.filter(function(g){
    if (typeFilter !== "all" && g.type !== typeFilter) return false;
    if (search && !g.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  var selectedGroup = selected ? groups.find(function(g){return g.id===selected;}) : null;

  // Count by type
  var counts = {all:groups.length, call_script:0, linkedin:0, email:0};
  groups.forEach(function(g){ if(counts[g.type]!==undefined) counts[g.type]++; });

  return (
    <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden",background:BG,fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,serif"}}>

      {/* Header */}
      <div style={{padding:"14px 20px 0",borderBottom:"1px solid "+T.border,flexShrink:0,background:BG}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
          <h2 style={{fontSize:18,fontWeight:700,color:T.text,margin:0}}>Templates</h2>
          <button onClick={function(){setShowModal(true);}} style={{padding:"5px 14px",background:"rgba(240,200,74,0.1)",border:"1px solid "+G+"40",color:G,borderRadius:5,cursor:"pointer",fontSize:12,fontWeight:600}}>+ Add Template</button>
          <div style={{display:"flex",gap:2,marginLeft:"auto"}}>
            {[{key:"templates",label:"Templates"},{key:"sequences",label:"Sequences"}].map(function(t){
              var isActive = tab===t.key;
              return <button key={t.key} onClick={function(){setTab(t.key);}} style={{padding:"5px 16px",background:isActive?BG3:"transparent",border:"1px solid "+(isActive?T.border:"transparent"),borderBottom:"none",color:isActive?G:T.muted,borderRadius:"4px 4px 0 0",cursor:"pointer",fontSize:12,fontWeight:isActive?600:400}}>{t.label}</button>;
            })}
          </div>
        </div>
      </div>

      {showModal && <AddTemplateModal onClose={function(){setShowModal(false);}} onCreated={function(id){load().then(function(){setSelected(id);});}}/>}
      {tab === "sequences" ? (
        <div style={{flex:1,overflowY:"auto"}}>
          <SequenceList sequences={sequences}/>
        </div>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"280px 1fr",flex:1,overflow:"hidden",minHeight:0}}>

          {/* Left — template list */}
          <div style={{borderRight:"1px solid "+T.border,display:"flex",flexDirection:"column",overflow:"hidden",background:BG}}>
            <div style={{padding:"10px",flexShrink:0,borderBottom:"1px solid "+T.border}}>
              <input value={search} onChange={function(e){setSearch(e.target.value);}} placeholder="Search templates..." style={{width:"100%",background:BG2,border:"1px solid "+T.border,color:T.text,padding:"6px 10px",borderRadius:5,fontSize:12,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
              <div style={{display:"flex",gap:4,marginTop:8,flexWrap:"wrap"}}>
                {[{k:"all",l:"All",c:T.muted},{k:"call_script",l:"Scripts",c:T.purple},{k:"linkedin",l:"LinkedIn",c:T.blue},{k:"email",l:"Email",c:G},{k:"calendly",l:"Calendly",c:"#006BFF"}].map(function(f){
                  var isActive = typeFilter===f.k;
                  return <button key={f.k} onClick={function(){setTypeFilter(f.k);}} style={{padding:"3px 10px",background:isActive?f.c+"14":"transparent",border:"1px solid "+(isActive?f.c+"50":T.border),color:isActive?f.c:T.dim,borderRadius:10,cursor:"pointer",fontSize:10,fontWeight:isActive?600:400}}>{f.l} ({counts[f.k]||0})</button>;
                })}
              </div>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"8px"}}>
              {loading && <div style={{textAlign:"center",padding:30,color:T.dim,fontSize:12}}>Loading...</div>}
              {filtered.map(function(g){
                var isSelected = selected===g.id;
                var gVariants = getVariants(g.id);
                var activeV = gVariants.find(function(v){return v.variant===g.active_variant;});
                var typeColor = TYPE_COLORS[g.type]||T.muted;
                return (
                  <div key={g.id} onClick={function(){setSelected(g.id);}}
                    style={{padding:"10px 12px",borderRadius:5,cursor:"pointer",background:isSelected?"rgba(240,200,74,0.06)":"transparent",border:"1px solid "+(isSelected?G+"40":T.border),marginBottom:4,transition:"all 0.12s"}}>
                    <div style={{fontSize:12,fontWeight:600,color:isSelected?G:T.text,marginBottom:3}}>{g.name}</div>
                    <div style={{display:"flex",gap:5,alignItems:"center"}}>
                      <span style={{fontSize:9,color:typeColor,background:typeColor+"12",padding:"1px 6px",borderRadius:8,border:"1px solid "+typeColor+"25"}}>{TYPE_LABELS[g.type]||g.type}</span>
                      <span style={{fontSize:9,color:T.dim}}>{CAT_LABELS[g.category]||g.category}</span>
                      <span style={{marginLeft:"auto",fontSize:9,color:T.dim}}>{gVariants.length} variant{gVariants.length!==1?"s":""}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right — editor */}
          {selectedGroup ? (
            <TemplateEditor
              key={selectedGroup.id}
              group={selectedGroup}
              variants={getVariants(selectedGroup.id)}
              onSave={load}
            />
          ) : (
            <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:T.dim,fontSize:13}}>Select a template</div>
          )}
        </div>
      )}
    </div>
  );
}
