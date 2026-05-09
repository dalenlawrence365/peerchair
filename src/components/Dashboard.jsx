"use client"
import { useState, useEffect } from "react"
import { sbFetch, G, BG, BG2, BG3, T, stageColor, PIPELINE, Pill, Avatar, Section, FL, FV, Grid2 } from "@/lib/appShared"

function SponsorMetrics(props) {
  var counts = props.stageCounts || {};
  var onStartDiscovery = props.onStartDiscovery;
  var [openStage, setOpenStage] = useState(null);
  var [stageDeals, setStageDeals] = useState([]);
  var [loadingDeals, setLoadingDeals] = useState(false);

  function loadStageDeals(stage) {
    if (openStage === stage) { setOpenStage(null); setStageDeals([]); return; }
    setOpenStage(stage);
    setLoadingDeals(true);
    var SBU = process.env.NEXT_PUBLIC_SUPABASE_URL;
    var SBK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    var h = {"apikey":SBK,"Authorization":"Bearer "+SBK};
    fetch(SBU+"/rest/v1/sponsor_deals?stage=eq."+encodeURIComponent(stage)+"&select=id,group_name,stage,category_seat,company_id&limit=50", {headers:h})
      .then(function(r){return r.json();})
      .then(function(deals){
        if (!Array.isArray(deals)) { setLoadingDeals(false); return; }
        var ids = deals.map(function(d){return d.company_id;}).filter(Boolean);
        if (ids.length === 0) { setStageDeals([]); setLoadingDeals(false); return; }
        fetch(SBU+"/rest/v1/sponsor_companies?id=in.("+ids.join(",")+")"+"&select=id,name,category,host_viable,host_tier&limit=50", {headers:h})
          .then(function(r){return r.json();})
          .then(function(companies){
            fetch(SBU+"/rest/v1/sponsor_contacts?company_id=in.("+ids.join(",")+")"+"&select=id,full_name,title,email,company_id&order=created_at.asc&limit=100", {headers:h})
              .then(function(r){return r.json();})
              .then(function(contacts){
                var enriched = deals.map(function(deal){
                  var co = (Array.isArray(companies)?companies:[]).find(function(c){return c.id===deal.company_id;}) || {};
                  var primaryContact = (Array.isArray(contacts)?contacts:[]).find(function(ct){return ct.company_id===deal.company_id;}) || null;
                  return Object.assign({},deal,{company:co,primaryContact:primaryContact});
                });
                setStageDeals(enriched);
                setLoadingDeals(false);
              });
          });
      })
      .catch(function(e){console.error(e);setLoadingDeals(false);});
  }

  var items = [
    {label:"Discovery Sched.",stage:"Discovery Scheduled",val:(counts["Discovery Scheduled"]||0),color:"#9b59b6",clickable:true},
    {label:"Discovery Done",stage:"_discoveryDone",val:(counts["_discoveryDone"]||0),color:"#7b2fbe",clickable:false},
    {label:"Proposal Sent",stage:"Proposal Sent",val:(counts["Proposal Sent"]||0),color:"#4a9eba",clickable:false},
    {label:"Committed",stage:"Verbal Commitment",val:(counts["Verbal Commitment"]||0),color:"#f0c84a",clickable:false},
    {label:"Active Sponsors",stage:"Active",val:(counts["Active"]||0),color:"#2ecc71",clickable:false},
  ];

  return (
    <div style={{marginBottom:16}}>
      <div style={{display:"flex",gap:10}}>
        {items.map(function(item){
          var isOpen = openStage === item.stage;
          return (
            <div key={item.label} onClick={function(){if(item.clickable)loadStageDeals(item.stage);}}
              style={{flex:1,background:isOpen?item.color+"14":BG3,border:"1px solid "+(isOpen?item.color+"50":item.color+"25"),borderTop:"2px solid "+item.color+(isOpen?"":"70"),borderRadius:7,padding:"10px 12px",cursor:item.clickable?"pointer":"default",transition:"all 0.15s"}}>
              <div style={{fontSize:10,color:item.color,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>{item.label}</div>
              <div style={{fontSize:24,fontWeight:700,color:item.color}}>{item.val}</div>
              {item.clickable&&<div style={{fontSize:9,color:T.dim,marginTop:2}}>click for list</div>}
            </div>
          );
        })}
      </div>

      {openStage&&<div style={{background:BG3,border:"1px solid "+T.border,borderRadius:7,padding:"14px 18px",marginTop:10}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div style={{fontSize:12,fontWeight:600,color:"#9b59b6"}}>{openStage} — {stageDeals.length} {stageDeals.length===1?"company":"companies"}</div>
          <div onClick={function(){setOpenStage(null);setStageDeals([]);}} style={{cursor:"pointer",color:T.dim,fontSize:16}}>x</div>
        </div>
        {loadingDeals&&<div style={{fontSize:12,color:T.dim}}>Loading...</div>}
        {!loadingDeals&&stageDeals.length===0&&<div style={{fontSize:12,color:T.dim}}>No companies in this stage.</div>}
        {stageDeals.map(function(deal){
          var co = deal.company || {};
          var ct = deal.primaryContact;
          return (
            <div key={deal.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",background:"rgba(255,255,255,0.02)",border:"1px solid "+T.border,borderRadius:6,marginBottom:8}}>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:T.text}}>{co.name||"Unknown"}</div>
                <div style={{fontSize:11,color:T.muted}}>{co.category||""} · {deal.group_name}</div>
                {ct&&<div style={{fontSize:11,color:T.dim,marginTop:2}}>{ct.full_name} — {ct.title}</div>}
              </div>
              {openStage==="Discovery Scheduled"&&<button
                onClick={function(){
                  if(onStartDiscovery){
                    var contact = ct ? Object.assign({},ct,{company:co.name,company_id:co.id,category:co.category}) : {company:co.name,company_id:co.id,category:co.category};
                    onStartDiscovery(co, contact, deal);
                  }
                }}
                style={{padding:"6px 14px",background:"rgba(155,89,182,0.15)",border:"1px solid rgba(155,89,182,0.4)",color:"#9b59b6",borderRadius:5,cursor:"pointer",fontSize:12,fontWeight:600,flexShrink:0}}>
                Start Call
              </button>}
            </div>
          );
        })}
      </div>}
    </div>
  );
}

function Dashboard({onNavigate,totalContacts,stageCounts,sponsorStageCounts,pipelineTotal,fitCallContacts,onStartFitCall,onNavigateToBucket,onStartDiscovery}) {
  var [openBucket,setOpenBucket] = useState(null);
  var [bucketContacts,setBucketContacts] = useState([]);
  var [bucketLoading,setBucketLoading] = useState(false);
  var [snapshots,setSnapshots] = useState([]);
  var [hrStats,setHrStats] = useState({sent:187,accepted:63,msgSent:65,replies:22,acceptRate:34,replyRate:34,campaigns:[]});
  var [meetingStats,setMeetingStats] = useState(null);

  useEffect(function(){ loadSnapshots(); loadHeyReach(); loadMeetingStats(); },[]);

  async function loadMeetingStats(){
    try{
      var res=await fetch("/api/meeting-stats");
      if(res.ok){var d=await res.json();setMeetingStats(d);}
    }catch(e){ console.warn("meeting stats error",e.message); }
  }

  async function loadHeyReach(){
    try{
      var res=await fetch("/api/heyreach-stats");
      if(res.ok){var d=await res.json();setHrStats(d);}
    }catch(e){
      // Fall back to cached values
      setHrStats({sent:187,accepted:63,msgSent:65,replies:22,acceptRate:34,replyRate:34});
    }
  }

  async function loadSnapshots(){
    try{
      var SBU=process.env.NEXT_PUBLIC_SUPABASE_URL;
      var SBK=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      var h={"apikey":SBK,"Authorization":"Bearer "+SBK};
      var res=await fetch(SBU+"/rest/v1/pipeline_snapshots?order=snapshot_date.asc&limit=12",{headers:h});
      var data=await res.json();
      setSnapshots(Array.isArray(data)?data:[]);
    }catch(e){console.error(e);}
  }

  async function loadBucket(stages,label){
    if(openBucket===label){setOpenBucket(null);setBucketContacts([]);return;}
    setOpenBucket(label);setBucketLoading(true);
    try{
      var SBU=process.env.NEXT_PUBLIC_SUPABASE_URL;
      var SBK=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      var h={"apikey":SBK,"Authorization":"Bearer "+SBK};
      var stageList=stages.map(function(s){return encodeURIComponent(s);}).join(",");
      var res=await fetch(SBU+"/rest/v1/contacts?pipeline_stage=in.("+stageList+")&select=id,first_name,last_name,title,company_name,pipeline_stage&order=last_name.asc&limit=100",{headers:h});
      var data=await res.json();
      setBucketContacts(Array.isArray(data)?data:[]);
    }catch(e){console.error(e);}
    setBucketLoading(false);
  }
  var [showFitCallList,setShowFitCallList] = useState(false);
  var today=new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"});

  var pStages=[{label:"Target",color:T.dim},{label:"Connected",color:T.blue},{label:"Fit Scheduled",color:T.gold},{label:"Fit Completed",color:T.gold},{label:"Strong Fit",color:T.green},{label:"Event Invited",color:T.purple},{label:"Active Member",color:T.green},{label:"Reserve Pool",color:T.dim}];
  function getCount(label){if(label==="Fit Scheduled")return stageCounts["Fit Call Scheduled"]||0;if(label==="Fit Completed")return stageCounts["Fit Call Completed"]||0;return stageCounts[label]||0;}
  return (
    <div style={{padding:"28px 32px",overflowY:"auto",flex:1}}>
      <div style={{marginBottom:24}}>
        <div style={{fontSize:11,color:T.muted,letterSpacing:3,textTransform:"uppercase",marginBottom:6}}>{today}</div>
        <h1 style={{fontSize:26,fontWeight:600,color:T.text,margin:0}}>{(function(){var h=new Date().getHours();return h<12?"Good morning":h<17?"Good afternoon":"Good evening";})()}, Dalen.</h1>
        <div style={{fontSize:14,color:T.muted,marginTop:4}}>Here's where things stand with your Los Angeles chapter.</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:14,marginBottom:16}}>
        {[{label:"Days to Next Event",val:"—",sub:"no event scheduled",color:T.purple,icon:"✦",action:null},{label:"Active Members",val:String(getCount("Active Member")||0),sub:"in chapter",color:T.green,icon:"★",action:function(){navigate("pipeline");}}].map(function(k){
          return <div key={k.label} onClick={k.action||undefined} style={{background:BG3,border:"1px solid "+T.border,borderTop:"2px solid "+k.color+"40",borderRadius:8,padding:"18px 20px",cursor:k.action?"pointer":"default",transition:"all 0.15s"}}
            onMouseOver={function(e){if(k.action)e.currentTarget.style.borderColor=k.color+"40";}}
            onMouseOut={function(e){if(k.action)e.currentTarget.style.borderColor=T.border;}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
              <div style={{fontSize:11,color:T.muted,letterSpacing:1.5,textTransform:"uppercase"}}>{k.label}</div>
              <span style={{fontSize:16,color:k.color+"60"}}>{k.icon}</span>
            </div>
            <div style={{fontSize:32,fontWeight:700,color:k.color,lineHeight:1,marginBottom:5}}>{k.val}</div>
            <div style={{fontSize:11,color:T.dim}}>{k.sub}</div>
          </div>;
        })}
      </div>

        {/* SPONSOR DISCOVERY METRICS */}
        <SponsorMetrics stageCounts={sponsorStageCounts} onStartDiscovery={onStartDiscovery}/>

        {/* HEYREACH OUTREACH FUNNEL */}
        <div style={{background:BG3,border:"1px solid "+T.border,borderRadius:8,padding:"14px 18px",marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <div style={{fontSize:11,color:G,letterSpacing:2,textTransform:"uppercase",fontWeight:600}}>LinkedIn Outreach Funnel</div>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              {hrStats.campaigns && hrStats.campaigns.map(function(camp){
                var isActive = camp.status === "IN_PROGRESS";
                var isPaused = camp.status === "PAUSED";
                var color = isActive ? T.green : isPaused ? T.orange : T.dim;
                var statusLabel = isActive ? "Active" : isPaused ? "Paused" : camp.status;
                var shortName = camp.name.replace("CFO Circle - ","").replace("Los Angeles ","LA ");
                return (
                  <div key={camp.id} style={{display:"flex",alignItems:"center",gap:4}}>
                    <div style={{width:6,height:6,borderRadius:"50%",background:color,boxShadow:isActive?"0 0 4px "+color:"none"}}/>
                    <span style={{fontSize:10,color:color}}>{shortName} — {statusLabel}</span>
                    <span style={{fontSize:9,color:T.dim}}>({camp.inProgress} active)</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10}}>
            {[
              {label:"Requests Sent",val:hrStats.sent,color:T.muted,sub:null},
              {label:"Connected",val:hrStats.accepted,color:T.blue,sub:hrStats.sent>0?Math.round((hrStats.accepted/hrStats.sent)*100)+"%":"-"},
              {label:"Messages Sent",val:hrStats.msgSent,color:T.purple,sub:"Step 2"},
              {label:"Replies",val:hrStats.replies,color:G,sub:hrStats.msgSent>0?Math.round((hrStats.replies/hrStats.msgSent)*100)+"%":"-"},
              {label:"Fit Calls",val:fitCallContacts.length,color:T.green,sub:"scheduled"},
            ].map(function(item){
              return (
                <div key={item.label} style={{textAlign:"center",padding:"10px 6px",background:"rgba(255,255,255,0.02)",border:"1px solid "+T.border,borderRadius:6}}>
                  <div style={{fontSize:24,fontWeight:700,color:item.color,lineHeight:1,marginBottom:4}}>{item.val}</div>
                  {item.sub&&<div style={{fontSize:11,color:item.color,marginBottom:4,fontWeight:600}}>{item.sub}</div>}
                  <div style={{fontSize:9,color:T.dim,letterSpacing:1,textTransform:"uppercase"}}>{item.label}</div>
                </div>
              );
            })}
          </div>
          <div style={{display:"flex",gap:8,marginTop:10,alignItems:"center"}}>
            <div style={{height:4,flex:hrStats.sent,background:T.muted+"60",borderRadius:2}}/>
            <div style={{height:4,flex:hrStats.accepted,background:T.blue+"80",borderRadius:2}}/>
            <div style={{height:4,flex:hrStats.msgSent,background:T.purple+"80",borderRadius:2}}/>
            <div style={{height:4,flex:hrStats.replies,background:G+"80",borderRadius:2}}/>
            <div style={{height:4,flex:Math.max(fitCallContacts.length,1),background:T.green+"80",borderRadius:2}}/>
          </div>
        </div>

        {/* PIPELINE HEALTH ROW */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr 1fr",gap:10,marginBottom:16}}>
          {/* Active Pipeline — hero metric */}
          <div style={{background:BG3,border:"1px solid "+G+"30",borderTop:"2px solid "+G,borderRadius:7,padding:"12px 14px",gridColumn:"span 1"}}>
            <div style={{fontSize:10,color:G,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4,fontWeight:600}}>Active Pipeline</div>
            <div style={{fontSize:32,fontWeight:700,color:G,lineHeight:1,marginBottom:4}}>{pipelineTotal}</div>
            {snapshots.length>=2&&<div style={{fontSize:10,color:snapshots[snapshots.length-1].active_pipeline_count>snapshots[snapshots.length-2].active_pipeline_count?T.green:T.red}}>{snapshots[snapshots.length-1].active_pipeline_count>snapshots[snapshots.length-2].active_pipeline_count?"▲":"▼"} {Math.abs(snapshots[snapshots.length-1].active_pipeline_count-(snapshots[snapshots.length-2]?snapshots[snapshots.length-2].active_pipeline_count:0))} vs last snapshot</div>}
          </div>
          {/* Pipeline Trend — sparkline with context */}
          <div style={{background:BG3,border:"1px solid "+T.border,borderRadius:7,padding:"12px 14px",display:"flex",flexDirection:"column",gap:6}}>
            <div style={{fontSize:10,color:T.muted,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600}}>Pipeline Trend</div>
            {(function(){
              if(snapshots.length===0) return <div style={{fontSize:11,color:T.dim,marginTop:4}}>First snapshot taken today</div>;
              var first=snapshots[0]; var last=snapshots[snapshots.length-1];
              var delta=last.active_pipeline_count-(first.active_pipeline_count||0);
              var days=Math.round((new Date(last.snapshot_date)-new Date(first.snapshot_date))/86400000)||1;
              var perWeek=Math.round((delta/days)*7);
              var maxVal=Math.max.apply(null,snapshots.map(function(s){return s.active_pipeline_count;}));
              return <>
                <div style={{display:"flex",alignItems:"baseline",gap:8}}>
                  <span style={{fontSize:11,color:delta>=0?T.green:T.red,fontWeight:700}}>{delta>=0?"+":""}{delta}</span>
                  <span style={{fontSize:10,color:T.dim}}>since {first.snapshot_date}</span>
                  {snapshots.length>=3&&<span style={{fontSize:10,color:delta>=0?T.green:T.red}}>{perWeek>=0?"+":""}{perWeek}/wk</span>}
                </div>
                <div style={{display:"flex",alignItems:"flex-end",gap:2,height:36,marginTop:2}}>
                  {snapshots.map(function(snap,i){
                    var h=maxVal>0?Math.max(3,Math.round((snap.active_pipeline_count/maxVal)*36)):3;
                    var isLast=i===snapshots.length-1;
                    return <div key={snap.snapshot_date} title={snap.snapshot_date+": "+snap.active_pipeline_count+" active"} style={{flex:1,height:h,background:isLast?G:G+"45",borderRadius:"2px 2px 0 0",cursor:"default"}}/>;
                  })}
                </div>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:8,color:T.dim}}>{first.snapshot_date}</span>
                  <span style={{fontSize:8,color:T.dim}}>today</span>
                </div>
              </>;
            })()}
          </div>
          {/* Off-pipeline buckets */}
          {[
            {label:"Opted Out",stages:["Opted Out"],color:T.red},
            {label:"Not a Fit",stages:["Not a Fit","Lost — Not a Fit"],color:T.orange},
            {label:"No Reply / Reserve",stages:["Reserve Pool","No Reply/Reserve","No Reply / Reserve"],color:T.muted},
            {label:"Stalled",stages:["Stalled"],color:T.orange},
            {label:"Total Contacts",stages:null,color:T.blue},
          ].map(function(bucket){
            var count=bucket.stages?bucket.stages.reduce(function(sum,s){return sum+(stageCounts[s]||0);},0):totalContacts;
            var isOpen=openBucket===bucket.label;
            return (
              <div key={bucket.label} onClick={function(){if(bucket.stages)loadBucket(bucket.stages,bucket.label);}}
                style={{background:isOpen?bucket.color+"12":BG3,border:"1px solid "+(isOpen?bucket.color+"50":bucket.color+"25"),borderTop:"2px solid "+bucket.color+(isOpen?"":"80"),borderRadius:7,padding:"12px 14px",cursor:bucket.stages?"pointer":"default",transition:"all 0.15s"}}>
                <div style={{fontSize:10,color:bucket.color,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4,fontWeight:600}}>{bucket.label}</div>
                <div style={{fontSize:28,fontWeight:700,color:bucket.color,lineHeight:1}}>{count}</div>
                {bucket.stages&&<div style={{fontSize:9,color:T.dim,marginTop:4}}>{isOpen?"click to close":"click for list"}</div>}
              </div>
            );
          })}
        </div>

        {/* Bucket drill-down list */}
        {openBucket&&<div style={{background:BG3,border:"1px solid "+T.border,borderRadius:7,padding:"14px 18px",marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <div style={{fontSize:12,fontWeight:600,color:T.text}}>{openBucket}</div>
            <div onClick={function(){setOpenBucket(null);setBucketContacts([]);}} style={{cursor:"pointer",color:T.dim,fontSize:16}}>✕</div>
          </div>
          {bucketLoading&&<div style={{fontSize:12,color:T.dim}}>Loading...</div>}
          {!bucketLoading&&bucketContacts.length===0&&<div style={{fontSize:12,color:T.dim}}>No contacts in this bucket.</div>}
          {!bucketLoading&&bucketContacts.map(function(ct){
            return (
              <div key={ct.id} onClick={function(){onNavigate("profile",ct);}} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 10px",borderBottom:"1px solid "+T.border,cursor:"pointer"}}
                onMouseOver={function(e){e.currentTarget.style.background="rgba(255,255,255,0.03)";}}
                onMouseOut={function(e){e.currentTarget.style.background="transparent";}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600,color:G}}>{ct.first_name} {ct.last_name}</div>
                  <div style={{fontSize:11,color:T.muted}}>{ct.title}{ct.company_name?" · "+ct.company_name:""}</div>
                </div>
                <div style={{fontSize:10,color:T.dim}}>{ct.pipeline_stage}</div>
                <div style={{fontSize:11,color:T.dim}}>→</div>
              </div>
            );
          })}
        </div>}

        {showFitCallList&&<div style={{background:BG3,border:"1px solid "+T.gold+"40",borderRadius:8,padding:"16px 20px",marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <div style={{fontSize:12,color:T.gold,letterSpacing:2,textTransform:"uppercase",fontWeight:600}}>Fit Calls Scheduled</div>
            <div onClick={function(){setShowFitCallList(false);}} style={{cursor:"pointer",color:T.muted,fontSize:18,lineHeight:1}}>x</div>
          </div>
          {fitCallContacts.length===0&&<div style={{fontSize:13,color:T.dim,padding:"8px 0"}}>No fit calls currently scheduled.</div>}
          {fitCallContacts.map(function(ct){
            var timeStr=ct.fit_call_date?new Date(ct.fit_call_date).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",timeZone:"America/Los_Angeles"}):"Time TBD";
            var dateStr=ct.fit_call_date?new Date(ct.fit_call_date).toLocaleDateString("en-US",{month:"short",day:"numeric"}):"";
            return (
              <div key={ct.id} style={{display:"flex",alignItems:"center",gap:14,padding:"10px 14px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:6,marginBottom:8}}>
                <div style={{flex:1,cursor:"pointer"}} onClick={function(){if(onNavigate){onNavigate("profile",ct);}setShowFitCallList(false);}}>
                  <div style={{fontSize:14,fontWeight:600,color:T.gold}}>{ct.first_name} {ct.last_name}</div>
                  <div style={{fontSize:12,color:T.muted}}>{ct.company_name||""}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:14,fontWeight:700,color:T.gold}}>{timeStr}</div>
                  <div style={{fontSize:11,color:T.dim}}>{dateStr}</div>
                </div>
                <button onClick={function(){if(onStartFitCall)onStartFitCall(ct);setShowFitCallList(false);}} style={{padding:"6px 14px",background:"rgba(240,200,74,0.12)",border:"1px solid rgba(240,200,74,0.3)",borderRadius:5,fontSize:12,color:T.gold,fontWeight:600,cursor:"pointer",flexShrink:0}}>Start Call</button>
              </div>
            );
          })}
        </div>}
      {/* MEETINGS TRACKER */}
      {meetingStats&&<div style={{background:BG3,border:"1px solid "+T.border,borderRadius:8,padding:"14px 18px",marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <div style={{fontSize:11,color:G,letterSpacing:2,textTransform:"uppercase",fontWeight:600}}>Meeting Activity</div>
          <button onClick={function(){onNavigate("meetings");}} style={{fontSize:11,color:G,background:"transparent",border:"1px solid rgba(240,200,74,0.25)",borderRadius:4,padding:"3px 10px",cursor:"pointer"}}>View All →</button>
        </div>
        {/* This week summary */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
          {[
            {label:"Fit Calls",scheduled:(meetingStats.scheduled&&meetingStats.scheduled.fit_call)||0,completed:(meetingStats.completed&&meetingStats.completed.fit_call)||0,color:G,icon:"☎"},
            {label:"Sponsor Discovery",scheduled:(meetingStats.scheduled&&meetingStats.scheduled.sponsor_discovery)||0,completed:(meetingStats.completed&&meetingStats.completed.sponsor_discovery)||0,color:"#9b59b6",icon:"💼"},
            {label:"Other Meetings",scheduled:(meetingStats.scheduled&&meetingStats.scheduled.other)||0,completed:(meetingStats.completed&&meetingStats.completed.other)||0,color:"#4a9eba",icon:"📋"},
          ].map(function(k){
            return <div key={k.label} style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderTop:"2px solid "+k.color+"40",borderRadius:6,padding:"12px 14px",textAlign:"center"}}>
              <div style={{fontSize:9,color:T.dim,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8}}>{k.icon} {k.label}</div>
              <div style={{display:"flex",justifyContent:"center",gap:16,marginBottom:4}}>
                <div>
                  <div style={{fontSize:26,fontWeight:700,color:k.color,lineHeight:1}}>{k.scheduled}</div>
                  <div style={{fontSize:9,color:T.dim,marginTop:2,letterSpacing:1}}>SCHEDULED</div>
                </div>
                <div style={{width:1,background:"rgba(255,255,255,0.06)"}}/>
                <div>
                  <div style={{fontSize:26,fontWeight:700,color:k.completed>0?T.green:T.dim,lineHeight:1}}>{k.completed}</div>
                  <div style={{fontSize:9,color:T.dim,marginTop:2,letterSpacing:1}}>COMPLETED</div>
                </div>
              </div>
            </div>;
          })}
        </div>
        {/* 8-week bar chart */}
        {meetingStats.weeks&&meetingStats.weeks.length>0&&(function(){
          var weeks=meetingStats.weeks.slice(-8);
          var maxVal=Math.max(1,...weeks.map(function(w){return (w.fit_call||0)+(w.sponsor_discovery||0)+(w.other||0);}));
          var chartH=60;
          return <div>
            <div style={{fontSize:9,color:T.dim,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>8-Week Trend</div>
            <div style={{display:"flex",alignItems:"flex-end",gap:4,height:chartH+24}}>
              {weeks.map(function(w,i){
                var total=(w.fit_call||0)+(w.sponsor_discovery||0)+(w.other||0);
                var h=total>0?Math.max(4,Math.round((total/maxVal)*chartH)):2;
                var fcH=total>0?Math.round(((w.fit_call||0)/total)*h):0;
                var sdH=total>0?Math.round(((w.sponsor_discovery||0)/total)*h):0;
                var otH=Math.max(0,h-fcH-sdH);
                var isThisWeek=w.week===(function(){var d=new Date();var day=d.getDay();var mon=new Date(d);mon.setDate(d.getDate()-((day+6)%7));return mon.toISOString().slice(0,10);})();
                return <div key={w.week} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:0}}>
                  <div style={{fontSize:9,color:total>0?T.muted:T.dim,marginBottom:2,fontWeight:isThisWeek?700:400}}>{total>0?total:""}</div>
                  <div style={{width:"100%",display:"flex",flexDirection:"column",justifyContent:"flex-end",height:chartH}}>
                    {otH>0&&<div style={{height:otH,background:"#4a9eba"+(isThisWeek?"":"80"),borderRadius:total===otH?"2px 2px 2px 2px":"0 0 0 0",marginBottom:0}}/>}
                    {sdH>0&&<div style={{height:sdH,background:"#9b59b6"+(isThisWeek?"":"80"),borderRadius:0}}/>}
                    {fcH>0&&<div style={{height:fcH,background:G+(isThisWeek?"":"80"),borderRadius:"2px 2px 0 0"}}/>}
                    {total===0&&<div style={{height:2,background:"rgba(255,255,255,0.05)",borderRadius:1}}/>}
                  </div>
                  <div style={{fontSize:8,color:isThisWeek?G:T.dim,marginTop:4,whiteSpace:"nowrap",fontWeight:isThisWeek?700:400}}>{w.label}</div>
                </div>;
              })}
            </div>
            <div style={{display:"flex",gap:14,marginTop:8,justifyContent:"flex-end"}}>
              {[{color:G,label:"Fit Call"},{color:"#9b59b6",label:"Sponsor Discovery"},{color:"#4a9eba",label:"Other"}].map(function(l){
                return <div key={l.label} style={{display:"flex",alignItems:"center",gap:4}}>
                  <div style={{width:8,height:8,background:l.color,borderRadius:2}}/>
                  <span style={{fontSize:9,color:T.dim}}>{l.label}</span>
                </div>;
              })}
            </div>
          </div>;
        })()}
      </div>}

      <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:20}}>
        <div style={{display:"flex",flexDirection:"column",gap:20}}>

          <div style={{background:BG3,border:"1px solid "+T.border,borderRadius:8,overflow:"hidden"}}>
            <div style={{padding:"14px 18px",borderBottom:"1px solid "+T.border,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontSize:11,color:G,letterSpacing:3,textTransform:"uppercase",fontWeight:600}}>Ask Claude</div>
              <span style={{fontSize:10,color:T.dim}}>Natural language · live data</span>
            </div>
            <div style={{padding:"14px 16px"}}>
              {["How many new people connected to me this week?","Who in my pipeline is closest to booking a fit call?","Which CFOs haven't heard from me in 14+ days?"].map(function(q){
                return <button key={q} onClick={function(){onNavigate("claude",null,q);}} style={{display:"block",width:"100%",marginBottom:6,padding:"8px 12px",background:"rgba(255,255,255,0.02)",border:"1px solid "+T.border,color:T.muted,borderRadius:5,cursor:"pointer",fontSize:12,textAlign:"left"}}>{q}</button>;
              })}
              <div style={{display:"flex",gap:6,marginTop:4}}>
                <input placeholder="Ask anything about your pipeline…" style={{flex:1,background:BG2,border:"1px solid "+T.border,color:T.text,padding:"8px 11px",borderRadius:5,fontSize:12,outline:"none",fontFamily:"inherit"}}/>
                <button style={{padding:"8px 12px",background:T.goldDim,border:"1px solid "+G+"40",color:G,borderRadius:5,cursor:"pointer",fontSize:13,fontWeight:700}}>→</button>
              </div>
            </div>
          </div>
        </div>
        <div style={{background:BG3,border:"1px solid "+T.border,borderRadius:8,overflow:"hidden",alignSelf:"flex-start"}}>
          <div style={{padding:"14px 18px",borderBottom:"1px solid "+T.border}}>
            <div style={{fontSize:11,color:G,letterSpacing:3,textTransform:"uppercase",fontWeight:600}}>Pipeline Health</div>
            <div style={{fontSize:11,color:T.dim,marginTop:3}}>{totalContacts} contacts · live</div>
          </div>
          <div style={{padding:"14px 16px",display:"flex",flexDirection:"column",gap:9}}>
            {pStages.map(function(s){
              var n=getCount(s.label);var pct=totalContacts>0?Math.max(n>0?5:0,(n/totalContacts)*100):0;
              return <div key={s.label}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:11,color:n>0?T.muted:T.dim}}>{s.label}</span><span style={{fontSize:11,color:n>0?s.color:T.dim,fontWeight:600}}>{n}</span></div>
                <div style={{height:4,background:"rgba(255,255,255,0.04)",borderRadius:2,overflow:"hidden"}}>{n>0?<div style={{width:pct+"%",height:"100%",background:s.color,borderRadius:2}}/>:null}</div>
              </div>;
            })}
          </div>
          <div style={{padding:"10px 16px 14px"}}><button onClick={function(){onNavigate("pipeline");}} style={{width:"100%",padding:"8px",background:T.goldDim,border:"1px solid "+G+"40",color:G,borderRadius:5,cursor:"pointer",fontSize:12,fontWeight:600}}>Open Full Pipeline →</button></div>
        </div>
      </div>

    </div>
  );
}

// ─── PIPELINE ─────────────────────────────────────────────────────────────────

export default Dashboard
