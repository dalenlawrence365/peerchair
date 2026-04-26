export async function GET() {
  try {
    var hrKey = process.env.HEYREACH_API_KEY;
    var anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!hrKey) throw new Error("No HeyReach API key");

    // Fetch unseen conversations from HeyReach
    var convRes = await fetch("https://api.heyreach.io/api/public/v2/conversation/GetAllConversations", {
      method: "POST",
      headers: {"Content-Type":"application/json","X-API-KEY": hrKey},
      body: JSON.stringify({linkedInAccountIds:[185228], seen:false, limit:50, offset:0})
    });

    if (!convRes.ok) throw new Error("HeyReach conversations error: " + convRes.status);
    var convData = await convRes.json();
    var conversations = convData.items || [];

    // Filter to only conversations where last message is from correspondent
    var needsReply = conversations.filter(function(c) {
      return c.lastMessageSender === "CORRESPONDENT";
    });

    // Classify and generate suggested replies
    var queue = await Promise.all(needsReply.map(async function(conv) {
      var person = conv.correspondentProfile;
      var lastMsg = conv.lastMessageText || "";
      var firstName = person.firstName || "";
      var title = person.position || "";
      var company = person.companyName || "";
      var location = person.location || "";

      // Classify the message
      var isNegative = /not interested|no thanks|unsubscribe|stop|remove|opt.?out/i.test(lastMsg);
      var isWarm = /happy to (chat|connect|participate|talk|learn|hear)|sounds (fun|great|interesting)|love to|tell me more|interested|open to/i.test(lastMsg);
      var isNeutral = /thanks|thank you|ok|sure|great/i.test(lastMsg);

      var category = isNegative ? "not_interested" : isWarm ? "warm" : "neutral";

      // Generate suggested reply using Claude
      var suggestedReply = "";
      if (!isNegative && anthropicKey) {
        try {
          var prompt = "You are Dalen Lawrence, Chapter Director of CFO Circle Los Angeles, a curated peer group for CFOs of privately held companies ($20M-$500M revenue). Write a brief, warm, conversational LinkedIn reply to " + firstName + " (" + title + " at " + company + ") who replied: \"" + lastMsg + "\". Goal: schedule a 15-minute fit call. Keep it under 3 sentences, no bullet points, no fluff. Include this Calendly link naturally if scheduling: https://calendly.com/dalen-lawrence/cfo-circle-fit-chat. Sign off as Dalen. Do not use em dashes.";

          var aiRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {"Content-Type":"application/json","anthropic-version":"2023-06-01","x-api-key": anthropicKey},
            body: JSON.stringify({
              model: "claude-sonnet-4-20250514",
              max_tokens: 200,
              messages: [{role:"user", content: prompt}]
            })
          });
          if (aiRes.ok) {
            var aiData = await aiRes.json();
            suggestedReply = (aiData.content && aiData.content[0] && aiData.content[0].text) || "";
          }
        } catch(e) { console.error("AI reply error:", e); }
      }

      return {
        id: conv.id,
        conversationId: conv.id,
        linkedInAccountId: conv.linkedInAccountId,
        firstName: firstName,
        lastName: person.lastName || "",
        fullName: firstName + " " + (person.lastName || ""),
        title: title,
        company: company,
        location: location,
        profileUrl: person.profileUrl || "",
        imageUrl: person.imageUrl || "",
        lastMessage: lastMsg,
        lastMessageAt: conv.lastMessageAt,
        category: category,
        suggestedReply: suggestedReply,
        source: "LinkedIn",
        type: "CFO Prospect",
      };
    }));

    return Response.json({queue});
  } catch(e) {
    console.error("follow-up-queue error:", e);
    return Response.json({queue:[], error: e.message});
  }
}

export async function POST(request) {
  try {
    var hrKey = process.env.HEYREACH_API_KEY;
    var body = await request.json();
    var {conversationId, linkedInAccountId, message} = body;

    var res = await fetch("https://api.heyreach.io/api/public/v2/conversation/SendMessage", {
      method: "POST",
      headers: {"Content-Type":"application/json","X-API-KEY": hrKey},
      body: JSON.stringify({
        conversationId,
        linkedInAccountId,
        message,
        subject: ""
      })
    });

    if (!res.ok) {
      var err = await res.text();
      return Response.json({success:false, error: err}, {status:400});
    }

    return Response.json({success:true});
  } catch(e) {
    return Response.json({success:false, error: e.message}, {status:500});
  }
}
