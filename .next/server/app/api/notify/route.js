"use strict";(()=>{var e={};e.id=565,e.ids=[565],e.modules={399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},7476:(e,t,r)=>{r.r(t),r.d(t,{originalPathname:()=>f,patchFetch:()=>x,requestAsyncStorage:()=>d,routeModule:()=>c,serverHooks:()=>h,staticGenerationAsyncStorage:()=>u});var n={};r.r(n),r.d(n,{GET:()=>p,POST:()=>l});var i=r(9303),o=r(8716),a=r(670),s=r(4122);async function p(){let e=await (0,s.sendAlert)("✅ PeerChair Notifications Active","PeerChair email notifications are working correctly.",`<div style="font-family:sans-serif;max-width:480px;padding:20px">
      <h2 style="color:#f0c84a;margin:0 0 8px">✅ PeerChair is Live</h2>
      <p style="font-size:16px;margin:0 0 16px">Email notifications are working. You will receive alerts for:</p>
      <ul style="margin:0 0 16px;padding-left:20px">
        <li>New LinkedIn connections</li>
        <li>LinkedIn replies</li>
        <li>Fit calls booked or canceled</li>
        <li>14-day engagement window expiring</li>
        <li>HeyReach campaign stopped</li>
      </ul>
      <a href="https://www.peerchair.com" style="background:#f0c84a;color:#000;padding:10px 20px;border-radius:5px;text-decoration:none;font-weight:bold">Open PeerChair →</a>
    </div>`);return Response.json({sent:e,to:process.env.ALERT_EMAIL})}async function l(e){try{let{subject:t,message:n,html:i}=await e.json(),{sendAlert:o}=await Promise.resolve().then(r.bind(r,4122)),a=await o(t,n,i);return Response.json({sent:a})}catch(e){return Response.json({error:e.message},{status:500})}}let c=new i.AppRouteRouteModule({definition:{kind:o.x.APP_ROUTE,page:"/api/notify/route",pathname:"/api/notify",filename:"route",bundlePath:"app/api/notify/route"},resolvedPagePath:"/home/claude/peerchair/src/app/api/notify/route.js",nextConfigOutput:"",userland:n}),{requestAsyncStorage:d,staticGenerationAsyncStorage:u,serverHooks:h}=c,f="/api/notify/route";function x(){return(0,a.patchFetch)({serverHooks:h,staticGenerationAsyncStorage:u})}},9303:(e,t,r)=>{e.exports=r(517)},4122:(e,t,r)=>{async function n(e,t,r){let n=process.env.RESEND_API_KEY,i=process.env.ALERT_EMAIL;if(!n||!i)return console.error("Resend not configured"),!1;try{let o=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+n,"Content-Type":"application/json"},body:JSON.stringify({from:"PeerChair <onboarding@resend.dev>",to:[i],subject:e,html:r||"<p>"+t+"</p>",text:t})}),a=await o.json();if(a.id)return console.log("Email sent:",a.id),!0;return console.error("Email failed:",a),!1}catch(e){return console.error("Email error:",e),!1}}async function i(e,t,r){let i=e+" "+t;return n("\uD83D\uDD17 New Connection — "+i,"New LinkedIn connection: "+i+(r?" at "+r:"")+". Check PeerChair pipeline.",`<div style="font-family:sans-serif;max-width:480px;padding:20px">
      <h2 style="color:#f0c84a;margin:0 0 8px">🔗 New Connection</h2>
      <p style="font-size:16px;margin:0 0 16px"><strong>${i}</strong>${r?" \xb7 "+r:""}</p>
      <a href="https://www.peerchair.com" style="background:#f0c84a;color:#000;padding:10px 20px;border-radius:5px;text-decoration:none;font-weight:bold">Open PeerChair →</a>
    </div>`)}async function o(e,t){return n("\uD83D\uDCC5 Fit Call Booked — "+e,"Fit call booked with "+e+(t?" for "+t:"")+".",`<div style="font-family:sans-serif;max-width:480px;padding:20px">
      <h2 style="color:#2ecc71;margin:0 0 8px">📅 Fit Call Booked</h2>
      <p style="font-size:16px;margin:0 0 8px"><strong>${e}</strong>${t?" \xb7 "+t:""}</p>
      <a href="https://www.peerchair.com" style="background:#f0c84a;color:#000;padding:10px 20px;border-radius:5px;text-decoration:none;font-weight:bold">Open PeerChair →</a>
    </div>`)}async function a(e){return n("⚠️ Fit Call Canceled — "+e,e+" canceled their fit call. Reschedule needed.",`<div style="font-family:sans-serif;max-width:480px;padding:20px">
      <h2 style="color:#e74c3c;margin:0 0 8px">⚠️ Fit Call Canceled</h2>
      <p style="font-size:16px;margin:0 0 16px"><strong>${e}</strong> canceled their fit call. Reschedule needed.</p>
      <a href="https://www.peerchair.com" style="background:#f0c84a;color:#000;padding:10px 20px;border-radius:5px;text-decoration:none;font-weight:bold">Open PeerChair →</a>
    </div>`)}r.d(t,{Hg:()=>i,kq:()=>o,sendAlert:()=>n,vA:()=>a})}};var t=require("../../../webpack-runtime.js");t.C(e);var r=e=>t(t.s=e),n=t.X(0,[948],()=>r(7476));module.exports=n})();