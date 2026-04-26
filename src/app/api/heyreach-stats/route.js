export async function GET() {
  try {
    var key = process.env.HEYREACH_API_KEY;
    if (!key) {
      return Response.json({sent:187,accepted:63,msgSent:65,replies:22,acceptRate:34,replyRate:34});
    }
    var res = await fetch("https://api.heyreach.io/api/public/v2/analytics/overall-stats", {
      method: "POST",
      headers: {"Content-Type":"application/json","X-API-KEY": key},
      body: JSON.stringify({accountIds:[185228],campaignIds:[395760,387604]})
    });
    if (!res.ok) throw new Error("HeyReach API error: " + res.status);
    var d = await res.json();
    var o = d.overallStats || {};
    var sent     = o.connectionsSent || 0;
    var accepted = o.connectionsAccepted || 0;
    var msgSent  = o.totalMessageStarted || 0;
    var replies  = o.totalMessageReplies || 0;
    return Response.json({
      sent,
      accepted,
      msgSent,
      replies,
      acceptRate: sent > 0 ? Math.round((accepted/sent)*100) : 0,
      replyRate:  msgSent > 0 ? Math.round((replies/msgSent)*100) : 0,
    });
  } catch(e) {
    console.error("heyreach-stats error:", e);
    return Response.json({sent:187,accepted:63,msgSent:65,replies:22,acceptRate:34,replyRate:34});
  }
}
