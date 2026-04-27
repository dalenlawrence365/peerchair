export async function GET() {
  try {
    var SBU = process.env.NEXT_PUBLIC_SUPABASE_URL;
    var SBK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    var h = {"apikey":SBK,"Authorization":"Bearer "+SBK,"Content-Type":"application/json"};
    var now = new Date().toISOString();

    // Find expired active sequences
    var expRes = await fetch(
      SBU+"/rest/v1/no_show_sequences?status=eq.active&expires_at=lt."+now+"&select=id,contact_id",
      { headers: h }
    );
    var expired = await expRes.json();
    var processed = 0;

    for (var seq of (Array.isArray(expired) ? expired : [])) {
      await fetch(SBU+"/rest/v1/contacts?id=eq."+seq.contact_id, {
        method:"PATCH", headers:h,
        body:JSON.stringify({pipeline_stage:"No Reply / Reserve",last_activity_date:now})
      });
      await fetch(SBU+"/rest/v1/communications", {
        method:"POST", headers:h,
        body:JSON.stringify({contact_id:seq.contact_id,occurred_at:now,channel:"System",direction:"INTERNAL",step_label:"No Show Sequence Expired → No Reply / Reserve",body:"No-show re-engagement sequence expired with no reply. Moved to No Reply / Reserve.",source:"PeerChair",logged_by:"system"})
      });
      await fetch(SBU+"/rest/v1/no_show_sequences?id=eq."+seq.id, {
        method:"PATCH", headers:h,
        body:JSON.stringify({status:"expired"})
      });
      processed++;
    }

    return Response.json({checked:(expired||[]).length, expired:processed});
  } catch(e) {
    return Response.json({error:e.message},{status:500});
  }
}
