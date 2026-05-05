// AI Reply Suggest — uses Haiku with full thread context
// Fast, cheap, context-aware

export async function POST(request) {
  try {
    var body = await request.json()
    var { firstName, lastName, title, company, lastMessage, thread, category } = body

    var key = process.env.ANTHROPIC_API_KEY
    if (!key) return Response.json({ reply: "" })

    // Don't suggest for opt-outs
    if (category === "not_interested" || /not interested|no thanks|opt.?out/i.test(lastMessage||"")) {
      return Response.json({ reply: "" })
    }

    var calendly = "https://calendly.com/cfocirclela/cfo-circle-fit-chat"

    // Build thread summary for context
    var threadContext = ""
    if (thread && thread.length > 0) {
      var recentMsgs = thread.slice(-6) // last 6 messages for context
      threadContext = recentMsgs.map(function(m) {
        var sender = m.direction === "OUT" ? "Dalen" : firstName
        var body = (m.body || "").slice(0, 200)
        return sender + ": " + body
      }).join("\n")
    }

    // Detect intent from last message
    var isBadTiming   = /busy|swamped|Europe|vacation|travel|not a good time|bad time|later|June|July|next month/i.test(lastMessage||"")
    var isQuestion    = /\?/.test(lastMessage||"")
    var isWarm        = /interested|happy to|sounds (great|fun|good)|love to|open to|definitely|would like/i.test(lastMessage||"")
    var wantsJune     = /June/i.test(lastMessage||"")

    var systemPrompt = `You are Dalen Lawrence, Chapter Director of CFO Circle Los Angeles.
CFO Circle is a curated monthly peer group for 10-14 CFOs of privately held companies ($20M-$500M revenue).
You write warm, direct, peer-level LinkedIn messages. No em dashes. No bullet points. No corporate speak.
Short — 2-3 sentences max. Sign as: Dalen
Calendly link: ${calendly}`

    var userPrompt = threadContext
      ? `Full conversation with ${firstName} ${lastName||""} (${title||""} at ${company||""}):\n\n${threadContext}\n\nWrite the ideal next reply from Dalen based on this conversation.`
      : isBadTiming && wantsJune
        ? `${firstName} (${title} at ${company}) said: "${lastMessage}"\nWrite a warm brief reply acknowledging they're busy, confirm June works, and say you'll reach out then. Don't send the Calendly link yet.`
        : isBadTiming
          ? `${firstName} (${title} at ${company}) said: "${lastMessage}"\nWrite a warm brief reply acknowledging the timing, keep the door open warmly.`
          : isWarm
            ? `${firstName} (${title} at ${company}) replied warmly: "${lastMessage}"\nWrite a brief reply and invite them to grab 15 minutes: ${calendly}`
            : `${firstName} (${title} at ${company}) replied: "${lastMessage}"\nWrite a brief friendly reply and invite them to grab 15 minutes: ${calendly}`

    var res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": key },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }]
      })
    })

    if (!res.ok) throw new Error("AI error " + res.status)
    var d = await res.json()
    var reply = (d.content && d.content[0] && d.content[0].text) || ""
    return Response.json({ reply: reply.trim() })
  } catch(e) {
    console.error("ai-reply-suggest error:", e)
    return Response.json({ reply: "" })
  }
}
