export async function POST(request) {
  try {
    var body = await request.json();
    var {firstName, title, company, lastMessage} = body;

    var anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) return Response.json({reply:""});

    var isNegative = /not interested|no thanks/i.test(lastMessage);
    if (isNegative) return Response.json({reply:""});

    var isWarm = /happy to (chat|participate)|sounds fun/i.test(lastMessage);

    var prompt = isWarm
      ? "You are Dalen Lawrence, Chapter Director of CFO Circle Los Angeles. " + firstName + " (" + title + " at " + company + ") replied enthusiastically: \"" + lastMessage + "\". Write a warm 2-sentence LinkedIn reply. Acknowledge their enthusiasm, then offer your Calendly link to schedule 15 minutes: https://calendly.com/dalen-lawrence/cfo-circle-fit-chat. Sign as Dalen. No em dashes, no bullet points."
      : "You are Dalen Lawrence, Chapter Director of CFO Circle Los Angeles. " + firstName + " (" + title + " at " + company + ") replied: \"" + lastMessage + "\". Write a brief 2-sentence LinkedIn follow-up. Thank them for connecting, then share one sentence about CFO Circle (curated peer group for CFOs of privately held companies in LA) and invite a 15-minute call: https://calendly.com/dalen-lawrence/cfo-circle-fit-chat. Sign as Dalen. No em dashes, no bullet points.";

    var aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {"Content-Type":"application/json","anthropic-version":"2023-06-01","x-api-key": anthropicKey},
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 180,
        messages: [{role:"user", content: prompt}]
      })
    });

    if (!aiRes.ok) throw new Error("AI error " + aiRes.status);
    var data = await aiRes.json();
    var reply = (data.content && data.content[0] && data.content[0].text) || "";
    return Response.json({reply});
  } catch(e) {
    console.error("generate-reply error:", e);
    return Response.json({reply:""});
  }
}
