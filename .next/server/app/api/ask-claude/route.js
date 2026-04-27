"use strict";(()=>{var e={};e.id=764,e.ids=[764],e.modules={399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},1397:(e,t,a)=>{a.r(t),a.d(t,{originalPathname:()=>m,patchFetch:()=>h,requestAsyncStorage:()=>d,routeModule:()=>c,serverHooks:()=>u,staticGenerationAsyncStorage:()=>p});var n={};a.r(n),a.d(n,{POST:()=>l});var o=a(9303),i=a(8716),r=a(670);let s=(0,a(8336).eI)(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);async function l(e){try{let{question:t}=await e.json();if(!t)return Response.json({error:"No question provided"},{status:400});let{data:a}=await s.from("contacts").select("id, first_name, last_name, company_name, title, pipeline_stage, member_status, fit_call_date, fit_call_outcome, primary_challenge, pressure_categories, high_fit_cues, red_flags, email, lead_source, industry, annual_revenue, linkedin_location, linkedin_connected_date, last_activity_date, created_at").order("created_at",{ascending:!1}),{data:n}=await s.from("communications").select("contact_id, occurred_at, channel, direction, step_label, body").order("occurred_at",{ascending:!1}).limit(500),o={};(a||[]).forEach(e=>{let t=e.pipeline_stage||"Unknown";o[t]=(o[t]||0)+1});let i=Object.entries(o).map(([e,t])=>e+": "+t).join(", "),r=(a||[]).map(e=>{let t=e.first_name+" "+e.last_name,a=(n||[]).filter(t=>t.contact_id===e.id)[0],o=e.linkedin_connected_date?new Date(e.linkedin_connected_date).toLocaleDateString("en-US",{month:"short",day:"numeric"}):null,i=e.last_activity_date?new Date(e.last_activity_date).toLocaleDateString("en-US",{month:"short",day:"numeric"}):a?new Date(a.occurred_at).toLocaleDateString("en-US",{month:"short",day:"numeric"}):null,r=new Date(e.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"});return[t+" | "+(e.company_name||"Unknown Company")+" | "+(e.title||""),"Stage: "+e.pipeline_stage,o?"Connected: "+o:"",e.fit_call_outcome?"Fit Outcome: "+e.fit_call_outcome:"",e.primary_challenge?"Challenge: "+e.primary_challenge:"","Last Activity: "+(i||o||"Added "+r),e.email?"Email: "+e.email:""].filter(Boolean).join(" | ")}).join("\n"),l=`You are Dalen Lawrence's personal operating assistant for CFO Circle Los Angeles. You know his full pipeline, his process, and his goals. Give direct, specific, actionable answers using real names from his data.

PIPELINE OVERVIEW (${(a||[]).length} total contacts):
${i}

FULL CONTACT LIST:
${r}

TODAY: ${new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"})}

WHO DALEN IS:
- Chapter Director, CFO Circle Los Angeles (West LA + Valley)
- Also a financial advisor at Stalliant — do not mention this unless he asks
- Building the first LA chapter — a curated monthly peer group for CFOs of privately held companies $20M-$500M revenue
- Target: 12-16 active CFO members. He is in launch mode — every week counts.

THE PIPELINE JOURNEY (in order):
Connected → Engaged → Fit Invite Sent → Fit Call Scheduled → Fit Call Completed → Strong Fit / Possible Fit → Event Invited → Event Confirmed → Event Attended → Membership Conversation → Verbal Commitment → Active Member

THE OUTREACH PROCESS:
- LinkedIn outreach runs through HeyReach (campaign: CFO Circle - CFO)
- Accepted connections auto-create in pipeline at Connected via webhook
- Dalen personally follows up via the PeerChair Follow-Up Queue
- Follow-up message introduces CFO Circle and shares Calendly link
- Calendly: https://calendly.com/dalen-lawrence/cfo-circle-fit-chat
- Touch 2 auto-sends 5 business days after first reply if no booking

THE FIT CALL (15 min):
- Assess fit, find primary challenge, invite to Experience Event
- Strong Fit → invite to Event same day
- Possible Fit → one more touch
- Bad Timing → warm close, nurture
- Not a Fit → gracious close

THE EXPERIENCE EVENT:
- Live sample CFO Circle meeting — primary conversion tool
- Target 12-20 CFO guests. Has not happened yet — Dalen is building toward it.

SPONSORS:
- 6 seats per group, one per category, $5,000/year
- Separate pipeline from CFO members

DATA NOTES:
- Ignore any "John Doe" contacts — test data from webhook setup
- Connected stage = accepted LinkedIn, not yet replied
- Fit Invite Sent = Calendly link was shared, awaiting booking

HOW TO ANSWER:
- Use real names from the pipeline — never generic
- Give ranked lists when asked who to contact, with one sentence why each
- Draft actual messages when asked — not template descriptions
- Give the number first, then the names, for any count question
- Say exactly what to do — not "consider reaching out"
- Flag if data seems incomplete rather than guessing
- NEVER offer to prioritize who to message after a connection — HeyReach handles follow-up automatically via the outreach sequence. All new connections get the follow-up message automatically. Dalen only needs to act when someone REPLIES (which appears in his Follow-Up Queue).
- NEVER offer to draft a follow-up for Connected-stage contacts — that is automated. Only draft messages for people who have already replied or are in a later stage.`,c=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":process.env.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-opus-4-5",max_tokens:1e3,system:l,messages:[{role:"user",content:t}]})}),d=await c.json(),p=d.content?.[0]?.text||"No response generated";return Response.json({answer:p,contactCount:(a||[]).length})}catch(e){return console.error("Ask Claude error:",e),Response.json({error:e.message},{status:500})}}let c=new o.AppRouteRouteModule({definition:{kind:i.x.APP_ROUTE,page:"/api/ask-claude/route",pathname:"/api/ask-claude",filename:"route",bundlePath:"app/api/ask-claude/route"},resolvedPagePath:"/home/claude/peerchair/src/app/api/ask-claude/route.js",nextConfigOutput:"",userland:n}),{requestAsyncStorage:d,staticGenerationAsyncStorage:p,serverHooks:u}=c,m="/api/ask-claude/route";function h(){return(0,r.patchFetch)({serverHooks:u,staticGenerationAsyncStorage:p})}}};var t=require("../../../webpack-runtime.js");t.C(e);var a=e=>t(t.s=e),n=t.X(0,[948,150],()=>a(1397));module.exports=n})();