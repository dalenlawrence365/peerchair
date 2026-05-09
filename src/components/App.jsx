"use client"
import { useState, useEffect } from "react"
import ContactProfile  from "@/components/ContactProfile"
import Dashboard       from "@/components/Dashboard"
import Pipeline        from "@/components/Pipeline"
import AskClaude       from "@/components/AskClaude"
import Sponsors        from "@/components/Sponsors"
import FollowUp        from "@/components/FollowUp"
import LinkedInMessages from "@/components/LinkedInMessages"
import EmailMessages   from "@/components/EmailMessages"
import Templates       from "@/components/Templates"
import Meetings        from "@/components/Meetings"
import Files           from "@/components/Files"
import SponsorCompanion from "@/components/SponsorCompanion"
import LiveCallCompanion from "@/components/LiveCallCompanion"
import { NavItem, G, T, BG, BG2, BG3, sbFetch } from "@/lib/appShared"

export default function CFOCircleApp() {
  var [screen,setScreen]             = useState("dashboard");
  var [fitCallContact,setFitCallContact] = useState(null);
  var [fitCallContacts,setFitCallContacts] = useState([]);
  var [followUpCount,setFollowUpCount] = useState(0);
  var [sponsorCompanyCount,setSponsorCompanyCount] = useState(0);
  var [sponsorContact,setSponsorContact] = useState(null);
  var [sponsorDeal,setSponsorDeal] = useState(null);

  var [selectedContact,setContact]   = useState(null);
  var [prevScreen,setPrevScreen]      = useState("pipeline");
  var [claudeQ,setClaudeQ]           = useState("");
  var [totalContacts,setTotal]       = useState(0);
  var [stageCounts,setStageCounts]   = useState({});
  var [pipelineTotal,setPipelineTotal] = useState(0);
  var [statsLoading,setStatsLoading] = useState(true);

  useEffect(function(){loadStats();loadFitCalls();loadFollowUpCount();},[]);

  async function loadFollowUpCount(){
    try{
      var res=await fetch("/api/follow-up-queue");
      var data=await res.json();
      setFollowUpCount((data.queue||[]).filter(function(i){return i.category!=="not_interested";}).length);
    }catch(e){}
  }

  async function loadFitCalls(){
    try{
      var SBU=process.env.NEXT_PUBLIC_SUPABASE_URL;
      var SBK=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      var h={"apikey":SBK,"Authorization":"Bearer "+SBK};
      var res=await fetch(SBU+"/rest/v1/contacts?pipeline_stage=eq.Fit%20Call%20Scheduled&select=id,first_name,last_name,title,company_name,email,linkedin_url,fit_call_date,pipeline_stage",{headers:h});
      var data=await res.json();
      setFitCallContacts(Array.isArray(data)?data:[]);
    }catch(e){console.error("loadFitCalls error:",e);}
  }



  var [sponsorStageCounts,setSponsorStageCounts] = useState({});

  async function loadStats(){
    setStatsLoading(true);
    try{
      // Load sponsor deal counts
      var sDeals = await sbFetch("/sponsor_deals?select=stage,discovery_date&limit=500");
      var sCounts = {};
      (Array.isArray(sDeals)?sDeals:[]).forEach(function(d){
        var s = d.stage||"Unknown";
        sCounts[s] = (sCounts[s]||0) + 1;
      });
      sCounts["_discoveryDone"] = (Array.isArray(sDeals)?sDeals:[]).filter(function(d){return d.discovery_date;}).length;
      setSponsorStageCounts(sCounts);

      var rows=await sbFetch("/contacts?select=pipeline_stage");
      var counts={};var tot=0;var activePipelineStages=["Connected","Engaged","Fit Invite Sent","Fit Call Scheduled","Fit Call Completed","Event Waitlist","Event Invited","Event Confirmed","Event Attended","Membership Conversation Scheduled","Membership Conversation Completed","Verbal Commitment","Active Member"];var pipelineTot=0;
      (Array.isArray(rows)?rows:[]).forEach(function(r){var s=r.pipeline_stage||"Unknown";counts[s]=(counts[s]||0)+1;tot++;if(activePipelineStages.indexOf(s)>-1)pipelineTot++;});
      setStageCounts(counts);setTotal(tot);setPipelineTotal(pipelineTot);

      // Load sponsor company count
      var sCompanies = await sbFetch("/sponsor_companies?select=id&limit=500");
      setSponsorCompanyCount(Array.isArray(sCompanies)?sCompanies.length:0);
    }catch(e){console.error("Stats error:",e);}
    setStatsLoading(false);
  }

  function navigate(s,contact,q){setScreen(s);if(contact)setContact(contact);if(q)setClaudeQ(q);}

  var NAV=[{id:"dashboard",icon:"⌂",label:"Dashboard"},{id:"followup",icon:"✉",label:"Follow-Up",badge:String(followUpCount)},{id:"linkedin_msgs",icon:"◈",label:"LinkedIn",badge:""},{id:"email_msgs",icon:"✦",label:"Email",badge:""},{id:"pipeline",icon:"◎",label:"CFO Pipeline",badge:statsLoading?"…":String(pipelineTotal)},{id:"sponsors",icon:"$",label:"Sponsors",badge:sponsorCompanyCount>0?String(sponsorCompanyCount):""},{id:"events",icon:"✦",label:"Events",badge:"0"},{id:"meetings",icon:"📅",label:"Meetings",badge:""},{id:"templates",icon:"✉",label:"Templates"},{id:"files",icon:"📎",label:"Files"},{id:"claude",icon:"★",label:"Ask Claude"}];

  var screenLabel={dashboard:"Dashboard",pipeline:"Pipeline",events:"Events",templates:"Templates",claude:"Ask Claude",profile:selectedContact?((selectedContact.first_name||"")+" "+(selectedContact.last_name||"")):"Contact",sponsors:"Sponsors",followup:"Follow-Up Queue",meetings:"Meetings",stalliant:"Sponsors"}[screen]||screen;

  return (
    <div style={{display:"flex",height:"100vh",width:"100%",overflow:"hidden",background:BG,fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,serif",color:T.text}}>

      {/* LEFT RAIL */}
      <div style={{width:220,background:T.rail,flexShrink:0,borderRight:"1px solid "+T.border,display:"flex",flexDirection:"column",padding:"0 10px"}}>
        <div style={{padding:"20px 6px 16px",borderBottom:"1px solid "+T.border,marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:32,height:32,borderRadius:"50%",border:"1.5px solid "+G+"60",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <div style={{width:18,height:18,borderRadius:"50%",border:"1.5px solid "+G+"60",position:"relative"}}>
                <div style={{position:"absolute",bottom:-4,right:-7,width:10,height:10,borderRadius:"50%",border:"1.5px solid "+G+"60",background:T.rail}}/>
              </div>
            </div>
            <div><div style={{fontSize:13,fontWeight:700,color:G,letterSpacing:2,textTransform:"uppercase",lineHeight:1}}>CFO Circle</div><div style={{fontSize:9,color:T.dim,letterSpacing:1.5,textTransform:"uppercase",marginTop:2}}>Los Angeles</div></div>
          </div>
        </div>
        <div style={{flex:1,display:"flex",flexDirection:"column",gap:2,overflowY:"auto"}}>
          {NAV.map(function(n){return <NavItem key={n.id} icon={n.icon} label={n.label} badge={n.badge} active={screen===n.id} onClick={function(){navigate(n.id);}}/>;  })}

        </div>
        <div style={{borderTop:"1px solid "+T.border,padding:"14px 6px",display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:30,height:30,borderRadius:"50%",background:"linear-gradient(135deg,#1a3a5c,#0f2235)",border:"1px solid "+G+"30",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:600,color:G,flexShrink:0}}>DL</div>
          <div style={{minWidth:0}}><div style={{fontSize:12,color:T.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>Dalen Lawrence</div><div style={{fontSize:10,color:T.dim}}>Chapter Director</div></div>
          <button style={{background:"transparent",border:"none",color:T.dim,cursor:"pointer",fontSize:14,padding:"2px",flexShrink:0}}>⚙</button>
        </div>
      </div>

      {/* CONTENT */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:BG2}}>
        <div style={{height:48,borderBottom:"1px solid "+T.border,display:"flex",alignItems:"center",padding:"0 24px",flexShrink:0,background:BG,gap:10}}>
          {screen==="profile"&&<button onClick={function(){navigate("pipeline");}} style={{background:"transparent",border:"none",color:T.blue,cursor:"pointer",fontSize:13,padding:0,marginRight:8}}>← Pipeline</button>}
          <div style={{fontSize:13,color:T.muted,flex:1}}>{screenLabel}</div>
          <div style={{display:"flex",gap:7,alignItems:"center"}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:T.green,boxShadow:"0 0 6px "+T.green}}/>
            <span style={{fontSize:10,color:T.dim,letterSpacing:1,textTransform:"uppercase"}}>Live · Supabase</span>
            <span style={{color:"#3a5a74",fontSize:10,margin:"0 4px"}}>·</span>
            <button id="sync-btn" onClick={async function(){
              var btn=document.getElementById("sync-btn");
              if(btn){btn.textContent="Syncing...";btn.style.color="#f0c84a";}
              try{
                var h={"Authorization":"Bearer peerchair2026"};
                var [ar,cr]=await Promise.all([fetch("/api/audit",{headers:h}),fetch("/api/sync-conversations",{headers:h})]);
                var d=await ar.json().catch(function(){return {};});
                var cd=await cr.json().catch(function(){return {};});
                var added=(d.contacts_created||0)+(cd.contacts_created||0);
                var convos=cd.conversations_synced||0;
                var parts=[];
                if(added>0) parts.push(added+" contacts");
                if(convos>0) parts.push(convos+" convos synced");
                if(parts.length===0) parts.push("Up to date");
                if(btn){btn.textContent=parts.join(" · ");btn.style.color="#2ecc71";}
              }catch(e){if(btn){btn.textContent="Sync failed";btn.style.color="#e74c3c";}}
              setTimeout(function(){if(btn){btn.textContent="↻ Sync";btn.style.color="#3a5a74";}},6000);
            }} style={{background:"transparent",border:"none",color:"#3a5a74",fontSize:10,cursor:"pointer",letterSpacing:1,textTransform:"uppercase",padding:0}}>↻ Sync</button>
          </div>
        </div>
        <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
          {screen==="dashboard" && <Dashboard onNavigate={navigate} totalContacts={totalContacts} stageCounts={stageCounts} sponsorStageCounts={sponsorStageCounts} pipelineTotal={pipelineTotal} fitCallContacts={fitCallContacts} onStartFitCall={function(ct){setFitCallContact({id:ct.id,firstName:ct.first_name,lastName:ct.last_name,title:ct.title,company:ct.company_name,email:ct.email,linkedinUrl:ct.linkedin_url,fit_call_date:ct.fit_call_date});setScreen("fitcall");}} onNavigateToBucket={function(stage){navigate("pipeline");}} onStartDiscovery={function(co,contact,deal){setSponsorContact(Object.assign({},contact||{},{company:co.name||"",company_id:co.id,category:co.category}));setSponsorDeal(deal);setScreen("sponsor_call");}}/>}
          {screen==="pipeline"  && <Pipeline  onNavigate={navigate}/>}
          {screen==="profile"   && selectedContact && <ContactProfile contactId={selectedContact?selectedContact.id:null} contactData={selectedContact} onBack={function(){navigate(prevScreen||"pipeline");}} onStartFitCall={function(d){ setFitCallContact(d); setScreen("fitcall"); }}/>}
          {screen==="events"    && <Placeholder icon="✦" title="Events" description="Manage your Experience Events — attendee lists, confirmations, and post-event follow-up."/>}
          {screen==="meetings"  && <Meetings onNavigate={navigate}/>}
          {screen==="templates" && <Templates/>}
          {screen==="claude"    && <AskClaude initialQ={claudeQ} onQuestionConsumed={function(){setClaudeQ("");}}/>}
          {screen==="sponsors"  && <Sponsors onNavigate={function(sc,d){ if(sc==="profile"){ setContact(d); setPrevScreen("sponsors"); setScreen("profile"); } else navigate(sc,d); }} onStartDiscovery={function(co,contact,deal){setSponsorContact(Object.assign({},contact||{},{company:co.name,company_id:co.id,category:co.category}));setSponsorDeal(deal);setScreen("sponsor_call");}}/>}
          {screen==="followup"      && <FollowUp onNavigate={navigate}/>}
          {screen==="linkedin_msgs" && <LinkedInMessages onNavigate={navigate}/>}
          {screen==="email_msgs"    && <EmailMessages onNavigate={navigate}/>}
          {screen==="files"         && <Files/>}
          {screen==="sponsor_call" && <SponsorCompanion contact={sponsorContact||{}} deal={sponsorDeal} onBack={function(){navigate("sponsors");}} onEnd={function(){navigate("sponsors");}}/>}
          {screen==="fitcall" && fitCallContact && <LiveCallCompanion contact={fitCallContact} onEnd={function(){ setScreen("profile"); }} onBack={function(){ setScreen("profile"); }}/>}
        </div>
      </div>

    </div>

  );
}
