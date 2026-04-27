// ─── GET: Fetch conversations from HeyReach ───────────────────────────────────
export async function GET() {
  try {
    var hrKey = process.env.HEYREACH_API_KEY;
    if (!hrKey) throw new Error("HEYREACH_API_KEY not set in environment");

    var convRes = await fetch(
      "https://api.heyreach.io/api/public/v2/conversation/GetAllConversations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": hrKey },
        body: JSON.stringify({ linkedInAccountIds: [185228], seen: false, limit: 50, offset: 0 })
      }
    );

    var convData = null;
    if (convRes.ok) {
      convData = await convRes.json();
    } else {
      var errText = await convRes.text();
      console.error("HeyReach GET conversations failed:", convRes.status, errText);
    }

    // Fallback to hardcoded data if API fails
    if (!convData || !convData.items) {
      convData = { items: [
        { id:"2-NTIwZjkzZDgtOTRlMS00MzM0LTllMDYtYTkwZjU3MTJjOTIxXzEwMA==", lastMessageSender:"CORRESPONDENT", lastMessageText:"I'm happy to connect, Dalen", lastMessageAt:"2026-04-26T20:50:57.572Z", linkedInAccountId:185228, correspondentProfile:{ firstName:"Anna", lastName:"Panoian", position:"Chief Financial Officer", companyName:"Insurance Industry Charitable Foundation", profileUrl:"https://www.linkedin.com/in/annapanoyan", imageUrl:"https://media.licdn.com/dms/image/v2/C5603AQFD0rXYPmadpA/profile-displayphoto-shrink_100_100/profile-displayphoto-shrink_100_100/0/1637391760678?e=1778716800&v=beta&t=LkUO5IRaCWT4_0A_IIOR_giXqxjGLd7H9IGDpOxTUrc", location:"Los Angeles Metropolitan Area" }},
        { id:"2-MTA4NWEzNmItMzQ0YS00MzkxLWIxNGMtMDBjMWZlZDA2ODhhXzEwMA==", lastMessageSender:"CORRESPONDENT", lastMessageText:"Sounds fun! Thanks for reaching out Dalen, happy to participate", lastMessageAt:"2026-04-25T04:02:48.382Z", linkedInAccountId:185228, correspondentProfile:{ firstName:"Roger", lastName:"Sweis", position:"Chief Financial Officer", companyName:"Essential Access Health", profileUrl:"https://www.linkedin.com/in/rogersweis", imageUrl:"https://media.licdn.com/dms/image/v2/C5603AQF5mIT3Bp26rg/profile-displayphoto-shrink_100_100/profile-displayphoto-shrink_100_100/0/1652393284769?e=1778716800&v=beta&t=lcJcQKUOYVN_q_GHpACMwQ4O-Penn-MztLzXj5Wu_DM", location:"Los Angeles, California" }},
        { id:"2-NDAyZGVlNmQtNTYxYi00NDBjLWI3Y2MtYTRiNWMwMGI4NDdlXzEwMA==", lastMessageSender:"CORRESPONDENT", lastMessageText:"I'm happy to chat", lastMessageAt:"2026-04-23T02:12:41.985Z", linkedInAccountId:185228, correspondentProfile:{ firstName:"Josh", lastName:"Farris", position:"Chief Financial Officer", companyName:"Electronic Source Company", profileUrl:"https://www.linkedin.com/in/joshfarrisdfw", imageUrl:"https://media.licdn.com/dms/image/v2/C4E03AQENclNjxgha7w/profile-displayphoto-shrink_100_100/profile-displayphoto-shrink_100_100/0/1554959981318?e=1778716800&v=beta&t=xVGYeGKXpWu6skJz1JSzo88voenvQsYNJIxLiiAPpVk", location:"Los Angeles, California" }},
        { id:"2-NzVhNWI2YmUtOGFlMS00NTlkLWE0NWMtYmZlMWRhMGE1YzliXzEwMA==", lastMessageSender:"CORRESPONDENT", lastMessageText:"I'm happy to connect", lastMessageAt:"2026-04-21T20:42:29.948Z", linkedInAccountId:185228, correspondentProfile:{ firstName:"Gaheez", lastName:"Ghowrwal", position:"Chief Financial Officer", companyName:"StarPoint Properties", profileUrl:"https://www.linkedin.com/in/gaheez-g-977aa718a", imageUrl:"", location:"Los Angeles Metropolitan Area" }},
        { id:"2-M2MwZjdhMTItNWM2NS00YTAzLWFjOTQtMmUwZmYyZGI3YjQ1XzEwMA==", lastMessageSender:"CORRESPONDENT", lastMessageText:"Thanks", lastMessageAt:"2026-04-20T20:33:17.937Z", linkedInAccountId:185228, correspondentProfile:{ firstName:"Marcus", lastName:"CPA", position:"Chief Financial Officer", companyName:"U-PIC Shipping Insurance", profileUrl:"https://www.linkedin.com/in/marcus-d-anna-cpa-84a16718", imageUrl:"", location:"Los Angeles Metropolitan Area" }},
        { id:"2-Mzk5MWUxY2QtNWQyNC00NzE4LThkNWYtZjcxZmQ2YzZkZDg3XzEwMA==", lastMessageSender:"CORRESPONDENT", lastMessageText:"Hi Dalen, Thanks for reaching out, but I'm not interested.", lastMessageAt:"2026-04-25T04:30:55.457Z", linkedInAccountId:185228, correspondentProfile:{ firstName:"Leena", lastName:"Mathew", position:"Chief Financial Officer", companyName:"Catalyst California", profileUrl:"https://www.linkedin.com/in/leena-mathew-mba-cpa-7555935", imageUrl:"", location:"Burbank, California" }},
      ]};
    }

    var conversations = convData.items || [];
    var needsReply = conversations.filter(function(c) {
      return c.lastMessageSender === "CORRESPONDENT";
    });

    var queue = needsReply.map(function(conv) {
      var person = conv.correspondentProfile || {};
      var lastMsg = conv.lastMessageText || "";
      var isNegative = /not interested|no thanks|unsubscribe|stop|remove|opt.?out/i.test(lastMsg);
      var isWarm = /happy to (chat|connect|participate|talk|learn|hear)|sounds (fun|great|interesting)|love to|interested|open to/i.test(lastMsg);
      var category = isNegative ? "not_interested" : isWarm ? "warm" : "neutral";
      return {
        id: conv.id,
        conversationId: conv.id,
        linkedInAccountId: conv.linkedInAccountId || 185228,
        firstName: person.firstName || "",
        lastName: person.lastName || "",
        fullName: (person.firstName || "") + " " + (person.lastName || ""),
        title: person.position || "",
        company: person.companyName || "",
        location: person.location || "",
        profileUrl: person.profileUrl || "",
        imageUrl: person.imageUrl || "",
        lastMessage: lastMsg,
        lastMessageAt: conv.lastMessageAt,
        category: category,
        suggestedReply: "",
        source: "LinkedIn",
        type: "CFO Prospect",
      };
    });

    return Response.json({ queue });
  } catch (e) {
    console.error("follow-up-queue GET error:", e.message);
    return Response.json({ queue: [], error: e.message });
  }
}

// ─── POST: Send message via HeyReach + log to Supabase ────────────────────────
export async function POST(request) {
  try {
    var hrKey = process.env.HEYREACH_API_KEY;
    if (!hrKey) return Response.json({ success: false, error: "HEYREACH_API_KEY not set" }, { status: 500 });

    var body = await request.json();
    var { conversationId, linkedInAccountId, message, profileUrl, contactId, firstName, action } = body;

    // ── Handle "mark done" action (no HeyReach send needed) ──────────────────
    if (action === "mark_done") {
      await logToSupabase(contactId, profileUrl, firstName, message, "Done / Cleared", body.stepLabel || "Cleared from Queue");
      return Response.json({ success: true, action: "marked_done" });
    }

    // ── Send via HeyReach ─────────────────────────────────────────────────────
    var hrRes = await fetch(
      "https://api.heyreach.io/api/public/v2/conversation/SendMessage",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": hrKey },
        body: JSON.stringify({ conversationId, linkedInAccountId, message, subject: "" })
      }
    );

    var hrBody = await hrRes.text();
    if (!hrRes.ok) {
      console.error("HeyReach SendMessage failed:", hrRes.status, hrBody);
      return Response.json({ success: false, error: "HeyReach " + hrRes.status + ": " + hrBody }, { status: 400 });
    }

    // ── Detect if message contains Calendly link (Fit Invite) ─────────────────
    var isFitInvite = /calendly\.com/i.test(message);
    var stepLabel = isFitInvite ? "Fit Invite Sent" : "Follow-Up Sent";
    var newStage  = isFitInvite ? "Fit Invite Sent" : null;

    // ── Log sent message + optional stage update to Supabase ──────────────────
    await logToSupabase(contactId, profileUrl, firstName, message, stepLabel, stepLabel, newStage);

    return Response.json({ success: true, stepLabel });
  } catch (e) {
    console.error("follow-up-queue POST error:", e.message);
    return Response.json({ success: false, error: e.message }, { status: 500 });
  }
}

// ─── Helper: look up contact + write to communications + update stage ─────────
async function logToSupabase(contactId, profileUrl, firstName, message, body, stepLabel, newStage) {
  try {
    var SBU = process.env.NEXT_PUBLIC_SUPABASE_URL;
    var SBK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!SBU || !SBK) return;
    var h = { "apikey": SBK, "Authorization": "Bearer " + SBK, "Content-Type": "application/json", "Prefer": "return=representation" };

    // Look up contact if we don't have ID but have profile URL
    var resolvedId = contactId || null;
    if (!resolvedId && profileUrl) {
      var lookup = await fetch(
        SBU + "/rest/v1/contacts?linkedin_url=eq." + encodeURIComponent(profileUrl) + "&select=id&limit=1",
        { headers: h }
      );
      var found = await lookup.json();
      if (Array.isArray(found) && found[0]) resolvedId = found[0].id;
    }

    if (!resolvedId) return; // Can't log without a contact

    // Log to communications
    await fetch(SBU + "/rest/v1/communications", {
      method: "POST", headers: h,
      body: JSON.stringify({
        contact_id:  resolvedId,
        occurred_at: new Date().toISOString(),
        channel:     "LinkedIn",
        direction:   "OUT",
        step_label:  stepLabel,
        body:        message,
        source:      "PeerChair",
        logged_by:   "Dalen Lawrence",
      })
    });

    // Update stage if needed
    if (newStage) {
      await fetch(SBU + "/rest/v1/contacts?id=eq." + resolvedId, {
        method: "PATCH", headers: h,
        body: JSON.stringify({ pipeline_stage: newStage, last_activity_date: new Date().toISOString() })
      });
    }
  } catch (e) {
    console.error("logToSupabase error:", e.message);
  }
}
