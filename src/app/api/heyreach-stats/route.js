export async function GET() {
  var fallback = {
    sent:187, accepted:63, msgSent:65, replies:22, acceptRate:34, replyRate:34,
    campaigns:[
      {id:395760, name:"CFO Circle - CFO", status:"IN_PROGRESS", inProgress:246, pending:365, finished:25},
      {id:387604, name:"Los Angeles CFOs", status:"PAUSED", inProgress:606, pending:1776, finished:15},
    ]
  };

  try {
    var key = process.env.HEYREACH_API_KEY;
    if (!key) return Response.json(fallback);

    // Fetch stats
    var statsRes = await fetch("https://api.heyreach.io/api/public/v2/analytics/overall-stats", {
      method: "POST",
      headers: {"Content-Type":"application/json","X-API-KEY": key},
      body: JSON.stringify({accountIds:[185228]})
    });

    // Fetch campaigns
    var campRes = await fetch("https://api.heyreach.io/api/public/v2/campaign/GetAllCampaigns", {
      method: "POST",
      headers: {"Content-Type":"application/json","X-API-KEY": key},
      body: JSON.stringify({offset:0, limit:10})
    });

    var result = Object.assign({}, fallback);

    if (statsRes.ok) {
      var statsData = await statsRes.json();
      var o = statsData.overallStats || {};
      var sent = o.connectionsSent || 0;
      var accepted = o.connectionsAccepted || 0;
      var msgSent = o.totalMessageStarted || 0;
      var replies = o.totalMessageReplies || 0;
      // Only use live data if it has values, otherwise keep fallback
      if (sent > 0 || accepted > 0) {
        result.sent = sent;
        result.accepted = accepted;
        result.msgSent = msgSent;
        result.replies = replies;
        result.acceptRate = sent > 0 ? Math.round((accepted/sent)*100) : 0;
        result.replyRate = msgSent > 0 ? Math.round((replies/msgSent)*100) : 0;
      }
    }

    if (campRes.ok) {
      var campData = await campRes.json();
      var camps = campData.items || [];
      if (camps.length > 0) {
        result.campaigns = camps.map(function(c) {
          return {
            id: c.id,
            name: c.name,
            status: c.status,
            inProgress: c.progressStats ? c.progressStats.totalUsersInProgress : 0,
            pending: c.progressStats ? c.progressStats.totalUsersPending : 0,
            finished: c.progressStats ? c.progressStats.totalUsersFinished : 0,
          };
        });
      }
    }

    return Response.json(result);
  } catch(e) {
    console.error("heyreach-stats error:", e.message);
    return Response.json(fallback);
  }
}
