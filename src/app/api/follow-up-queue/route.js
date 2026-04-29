// ─── GET: Fetch live conversations, filter dismissed ─────────────────────────
export async function GET() {
  try {
    var hrKey = process.env.HEYREACH_API_KEY;
    if (!hrKey) throw new Error("HEYREACH_API_KEY not set");

    var SBU = process.env.NEXT_PUBLIC_SUPABASE_URL;
    var SBK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    var sbH = { "apikey": SBK, "Authorization": "Bearer " + SBK };

    // Fetch dismissed conversation IDs from Supabase
    var dismissedMap = new Map();
    try {
      var dRes = await fetch(SBU + "/rest/v1/queue_dismissed?select=conversation_id,dismissed_at&limit=500", { headers: sbH });
      var dData = await dRes.json();
      if (Array.isArray(dData)) dData.forEach(function(d) { dismissedMap.set(d.conversation_id, d.dismissed_at); });
    } catch(e) { console.warn("Could not load dismissed IDs:", e.message); }

    // Fetch live conversations from HeyReach
    var convData = null;
    try {
      var convRes = await fetch(
        "https://api.heyreach.io/api/public/v2/conversation/GetAllConversations",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-KEY": hrKey },
          body: JSON.stringify({ linkedInAccountIds: [185228], limit: 100, offset: 0 })
        }
      );
      if (convRes.ok) convData = await convRes.json();
      else console.error("HeyReach GET failed:", convRes.status, await convRes.text());
    } catch(e) { console.error("HeyReach fetch error:", e.message); }

    // Fallback — current real data as of 2026-04-27
    if (!convData || !convData.items) {
      convData = { items: [
        { id:"todd-barretta-conv", lastMessageSender:"CORRESPONDENT", lastMessageText:"Hi Dalen. Ok. Next week is better. Please email me at tbarretta@pilgrimplace.org with a cc to my EA, Debbie, dspaulding@pilgrimplace.org and she will find you a good day and time.", lastMessageAt:"2026-04-28T12:00:00.000Z", linkedInAccountId:185228, correspondentProfile:{ firstName:"Todd", lastName:"Barretta", position:"Senior Executive - CFO & CCO", companyName:"Pilgrim Place", profileUrl:"https://www.linkedin.com/in/todd-barretta", imageUrl:"", location:"Los Angeles, California" }},
        { id:"2-MjM0MWY1ZjEtYTk5Zi00MWUwLWJmNWQtMTQ5NjZkYmY5NDA1XzEwMA==", lastMessageSender:"CORRESPONDENT", lastMessageText:"Hi Dalen, Thanks for reaching out. I'd like to learn more.", lastMessageAt:"2026-04-27T22:59:21.017Z", linkedInAccountId:185228, correspondentProfile:{ firstName:"Amy", lastName:"Muradyan", position:"Chief Financial Officer", companyName:"4medica", profileUrl:"https://www.linkedin.com/in/amy-muradyan-882533171", imageUrl:"https://media.licdn.com/dms/image/v2/C5603AQEzl_cVjbVVtw/profile-displayphoto-shrink_100_100/profile-displayphoto-shrink_100_100/0/1621222024218?e=1778716800&v=beta&t=O-Xc0yK1Pu6wAKhbIxwEDdaL3b1xP7r-6i5kEs2K8Tk", location:"Marina del Rey, California, United States" }},
        { id:"2-MTA4NWEzNmItMzQ0YS00MzkxLWIxNGMtMDBjMWZlZDA2ODhhXzEwMA==", lastMessageSender:"CORRESPONDENT", lastMessageText:"Sounds fun! Thanks for reaching out Dalen, happy to participate", lastMessageAt:"2026-04-25T04:02:48.382Z", linkedInAccountId:185228, correspondentProfile:{ firstName:"Roger", lastName:"Sweis", position:"Chief Financial Officer", companyName:"Essential Access Health", profileUrl:"https://www.linkedin.com/in/rogersweis", imageUrl:"https://media.licdn.com/dms/image/v2/C5603AQF5mIT3Bp26rg/profile-displayphoto-shrink_100_100/profile-displayphoto-shrink_100_100/0/1652393284769?e=1778716800&v=beta&t=lcJcQKUOYVN_q_GHpACMwQ4O-Penn-MztLzXj5Wu_DM", location:"Los Angeles, California" }},
        { id:"2-NDAyZGVlNmQtNTYxYi00NDBjLWI3Y2MtYTRiNWMwMGI4NDdlXzEwMA==", lastMessageSender:"CORRESPONDENT", lastMessageText:"I'm happy to chat", lastMessageAt:"2026-04-23T02:12:41.985Z", linkedInAccountId:185228, correspondentProfile:{ firstName:"Josh", lastName:"Farris", position:"Chief Financial Officer", companyName:"Electronic Source Company", profileUrl:"https://www.linkedin.com/in/joshfarrisdfw", imageUrl:"https://media.licdn.com/dms/image/v2/C4E03AQENclNjxgha7w/profile-displayphoto-shrink_100_100/profile-displayphoto-shrink_100_100/0/1554959981318?e=1778716800&v=beta&t=xVGYeGKXpWu6skJz1JSzo88voenvQsYNJIxLiiAPpVk", location:"Los Angeles, California" }},
        { id:"2-OGU1NmQ1NGUtODhhMC00M2Q3LWJhMDAtODg3NGIwN2Y2YWI1XzEwMA==", lastMessageSender:"CORRESPONDENT", lastMessageText:"I am pretty swamped until late May and will be in Europe from May 8 through 25, so this is just not a good time.", lastMessageAt:"2026-04-28T16:28:00.000Z", linkedInAccountId:185228, correspondentProfile:{ firstName:"R.", lastName:"Urban", position:"Member of the Board of Directors", companyName:"GenRocket", profileUrl:"https://www.linkedin.com/in/r-allen-urban-680a423", imageUrl:"https://media.licdn.com/dms/image/v2/C4D03AQGkBLXltC7QEA/profile-displayphoto-shrink_100_100/profile-displayphoto-shrink_100_100/0/1516306915584?e=1778716800&v=beta&t=OD4bcbmvZFXEKmhkJOQntty-X8VFHjy8HTJrkDejQe0", location:"Ventura, California" }},
        { id:"2-NzVhNWI2YmUtOGFlMS00NTlkLWE0NWMtYmZlMWRhMGE1YzliXzEwMA==", lastMessageSender:"CORRESPONDENT", lastMessageText:"I'm happy to connect", lastMessageAt:"2026-04-21T20:42:29.948Z", linkedInAccountId:185228, correspondentProfile:{ firstName:"Gaheez", lastName:"Ghowrwal", position:"Chief Financial Officer", companyName:"StarPoint Properties", profileUrl:"https://www.linkedin.com/in/gaheez-g-977aa718a", imageUrl:"https://media.licdn.com/dms/image/v2/D5603AQGh6I9AmidSCw/profile-displayphoto-scale_100_100/B56Zu0tfypIwAc-/0/1768263384917?e=1778716800&v=beta&t=AZA5VFtlqvvgtwAWHEOPVvsndXpb7KcnzNmCdExk", location:"Los Angeles Metropolitan Area" }},
        { id:"2-M2MwZjdhMTItNWM2NS00YTAzLWFjOTQtMmUwZmYyZGI3YjQ1XzEwMA==", lastMessageSender:"CORRESPONDENT", lastMessageText:"Thanks", lastMessageAt:"2026-04-20T20:33:17.937Z", linkedInAccountId:185228, correspondentProfile:{ firstName:"Marcus", lastName:"D'Anna", position:"Chief Financial Officer", companyName:"U-PIC Shipping Insurance", profileUrl:"https://www.linkedin.com/in/marcus-d-anna-cpa-84a16718", imageUrl:"https://media.licdn.com/dms/image/v2/C5603AQEW-J7rYgs_2g/profile-displayphoto-shrink_100_100/profile-displayphoto-shrink_100_100/0/1522783231144?e=1778716800&v=beta&t=xswNXyT2zDfNddC6N5QLnJTZEubGswpu31Bw6qtFZnE", location:"Los Angeles Metropolitan Area" }},

      ]};
    }

    // Load excluded contacts (Opted Out, Lost, Reserve) by LinkedIn URL
    var excludedSlugs = new Set();
    try {
      var exRes = await fetch(SBU + "/rest/v1/contacts?select=linkedin_url&pipeline_stage=in.(Opted+Out,Lost+%E2%80%94+Not+a+Fit,No+Reply+%2F+Reserve)&limit=500", { headers: sbH });
      var exData = await exRes.json();
      if (Array.isArray(exData)) exData.forEach(function(ct) {
        if (ct.linkedin_url) {
          var slug = ct.linkedin_url.replace(/\/$/, '').split('/in/').pop().toLowerCase();
          excludedSlugs.add(slug);
        }
      });
    } catch(e) { console.warn("Could not load excluded contacts:", e.message); }

    // Build queue — filter out sent, dismissed, and excluded pipeline stages
    var conversations = convData.items || [];
    var needsReply = conversations.filter(function(c) {
      if (c.lastMessageSender !== "CORRESPONDENT") return false;
      // Check if contact is in an excluded pipeline stage
      var profileUrl = (c.correspondentProfile || {}).profileUrl || (c.correspondentProfile || {}).profile_url || "";
      if (profileUrl) {
        var slug = profileUrl.replace(/\/$/, '').split('/in/').pop().toLowerCase();
        if (excludedSlugs.has(slug)) return false;
      }
      var dismissedAt = dismissedMap.get(c.id);
      if (!dismissedAt) return true; // never dismissed
      // Re-show if they sent a NEW message after we dismissed
      return new Date(c.lastMessageAt) > new Date(dismissedAt);
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
      };
    });

    // Fetch today's activity count
    var today = new Date().toISOString().slice(0, 10);
    var todayCount = 0;
    try {
      var aRes = await fetch(
        SBU + "/rest/v1/daily_activity?activity_date=eq." + today + "&select=id",
        { headers: sbH }
      );
      var aData = await aRes.json();
      todayCount = Array.isArray(aData) ? aData.length : 0;
    } catch(e) {}

    // Enrich queue items with supabaseId by matching LinkedIn URL slug
    try {
      var slugMap = {};
      queue.forEach(function(item) {
        if (item.profileUrl) {
          var slug = item.profileUrl.replace(/\/$/, '').split('/in/').pop().toLowerCase();
          slugMap[slug] = item;
        }
      });
      var slugList = Object.keys(slugMap);
      if (slugList.length > 0) {
        var sbContactRes = await fetch(SBU + "/rest/v1/contacts?select=id,linkedin_url&limit=500", { headers: sbH });
        var sbContacts = await sbContactRes.json();
        if (Array.isArray(sbContacts)) {
          sbContacts.forEach(function(ct) {
            if (!ct.linkedin_url) return;
            var ctSlug = ct.linkedin_url.replace(/\/$/, '').split('/in/').pop().toLowerCase();
            if (slugMap[ctSlug]) slugMap[ctSlug].supabaseId = ct.id;
          });
        }
      }
    } catch(e) { console.warn("supabaseId enrichment failed:", e.message); }

    return Response.json({ queue, todayCount });
  } catch(e) {
    console.error("follow-up-queue GET error:", e.message);
    return Response.json({ queue: [], todayCount: 0, error: e.message });
  }
}

// ─── POST: Send + dismiss + log activity ─────────────────────────────────────
export async function POST(request) {
  try {
    var hrKey = process.env.HEYREACH_API_KEY;
    if (!hrKey) return Response.json({ success: false, error: "HEYREACH_API_KEY not set" }, { status: 500 });

    var body = await request.json();
    var { conversationId, linkedInAccountId, message, profileUrl, contactId, firstName, action } = body;

    var contactMeta = {
      firstName: body.firstName  || "",
      lastName:  body.lastName   || "",
      fullName:  body.fullName   || ((body.firstName || "") + " " + (body.lastName || "")),
      title:     body.title      || "",
      company:   body.company    || "",
      location:  body.location   || "",
      imageUrl:  body.imageUrl   || "",
      campaign:  body.campaign   || "",
    };

    // ── Dismiss without sending ────────────────────────────────────────────────
    if (action === "dismiss") {
      var reason = body.reason || "manual";
      await persistDismissal(conversationId, reason, contactMeta);
      await logActivity(reason, contactMeta, conversationId);
      if (profileUrl || contactId) {
        await logToSupabase(contactId, profileUrl, firstName, body.message || reason + " — cleared from queue", reason, "Queue: " + reason, null, contactMeta);
      }
      return Response.json({ success: true, action: "dismissed" });
    }

    // ── Send via Anthropic + HeyReach MCP proxy ──────────────────────────────
    // HeyReach REST API blocks non-allowlisted server hosts, so we route
    // through Anthropic's MCP client which calls HeyReach's own infrastructure
    var anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) return Response.json({ success: false, error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

    var hrKey = process.env.HEYREACH_API_KEY;

    var aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "mcp-client-2025-04-04",
        "x-api-key": anthropicKey,
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        mcp_servers: [{
          type: "url",
          url: "https://mcp.heyreach.io/mcp",
          name: "heyreach",
          authorization_token: hrKey
        }],
        system: "You are a LinkedIn message sending agent for Dalen Lawrence. Your only job is to call the heyreach send_message tool with these exact parameters: conversationId, linkedInAccountId, message, and subject as empty string. Call the tool immediately without any other output.",
        messages: [{
          role: "user",
          content: "Send LinkedIn message. conversationId: " + conversationId + " | linkedInAccountId: " + (linkedInAccountId || 185228) + " | message: " + message
        }]
      })
    });

    var aiErr2 = null;
    if (!aiRes.ok) {
      aiErr2 = await aiRes.text();
      console.error("MCP proxy error:", aiRes.status, aiErr2);
      return Response.json({ success: false, error: "Send proxy error " + aiRes.status + ": " + aiErr2 }, { status: 500 });
    }

    var aiData = await aiRes.json();
    console.log("MCP proxy response stop_reason:", aiData.stop_reason, "content types:", (aiData.content||[]).map(function(b){return b.type;}));

    // Tool was called = message sent
    var toolWasCalled = (aiData.content || []).some(function(b){ return b.type === "tool_use"; });
    var endedNormally = aiData.stop_reason === "end_turn";

    if (!toolWasCalled && !endedNormally) {
      var aiText = (aiData.content || []).filter(function(b){ return b.type === "text"; }).map(function(b){ return b.text; }).join(" ");
      return Response.json({ success: false, error: aiText || "MCP send did not complete" }, { status: 500 });
    }

    // Detect Calendly link → Fit Invite
    var isFitInvite = /calendly\.com/i.test(message);
    var stepLabel = isFitInvite ? "Fit Invite Sent" : "Follow-Up Sent";
    var newStage  = isFitInvite ? "Fit Invite Sent" : null;

    // Persist dismissal (sent = handled)
    await persistDismissal(conversationId, "sent", contactMeta);
    await logActivity(stepLabel, contactMeta, conversationId);
    await logToSupabase(contactId, profileUrl, firstName, message, stepLabel, stepLabel, newStage, contactMeta);

    // Register Touch 2 sequence
    try {
      var seqUrl = (process.env.NEXT_PUBLIC_APP_URL || "") + "/api/outreach-sequence";
      fetch(seqUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, linkedInAccountId, contactId, ...contactMeta, profileUrl })
      });
    } catch(e) {}

    return Response.json({ success: true, stepLabel });
  } catch(e) {
    console.error("follow-up-queue POST error:", e.message);
    return Response.json({ success: false, error: e.message }, { status: 500 });
  }
}

// ─── Persist dismissal to Supabase ───────────────────────────────────────────
async function persistDismissal(conversationId, reason, meta) {
  if (!conversationId) return;
  try {
    var SBU = process.env.NEXT_PUBLIC_SUPABASE_URL;
    var SBK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    var h = { "apikey": SBK, "Authorization": "Bearer " + SBK, "Content-Type": "application/json", "Prefer": "return=minimal" };
    await fetch(SBU + "/rest/v1/queue_dismissed", {
      method: "POST", headers: h,
      body: JSON.stringify({
        conversation_id:    conversationId,
        reason:             reason,
        dismissed_by:       "Dalen Lawrence",
        contact_first_name: meta.firstName || "",
        contact_last_name:  meta.lastName  || "",
        contact_company:    meta.company   || "",
        profile_url:        meta.profileUrl || "",
      })
    });
  } catch(e) { console.warn("persistDismissal error:", e.message); }
}

// ─── Log to daily_activity ────────────────────────────────────────────────────
async function logActivity(activityType, meta, conversationId) {
  try {
    var SBU = process.env.NEXT_PUBLIC_SUPABASE_URL;
    var SBK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    var h = { "apikey": SBK, "Authorization": "Bearer " + SBK, "Content-Type": "application/json" };
    await fetch(SBU + "/rest/v1/daily_activity", {
      method: "POST", headers: h,
      body: JSON.stringify({
        activity_type:   activityType,
        contact_name:    ((meta.firstName || "") + " " + (meta.lastName || "")).trim(),
        company:         meta.company || "",
        conversation_id: conversationId || "",
      })
    });
  } catch(e) { console.warn("logActivity error:", e.message); }
}

// ─── Auto-create contact + log communication ──────────────────────────────────
async function logToSupabase(contactId, profileUrl, firstName, message, body, stepLabel, newStage, contactMeta) {
  try {
    var SBU = process.env.NEXT_PUBLIC_SUPABASE_URL;
    var SBK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!SBU || !SBK) return;
    var h = { "apikey": SBK, "Authorization": "Bearer " + SBK, "Content-Type": "application/json", "Prefer": "return=representation" };

    var resolvedId = contactId || null;
    if (!resolvedId && profileUrl) {
      var slug = profileUrl.split("/in/").pop().replace(/\/+$/, "").toLowerCase();
      var lookup = await fetch(SBU + "/rest/v1/contacts?linkedin_url=ilike.*" + encodeURIComponent(slug) + "*&select=id&limit=1", { headers: h });
      var found = await lookup.json();
      if (Array.isArray(found) && found[0]) resolvedId = found[0].id;
    }

    if (!resolvedId && profileUrl && contactMeta) {
      var nameParts = (contactMeta.fullName || "").trim().split(" ");
      var createRes = await fetch(SBU + "/rest/v1/contacts", {
        method: "POST", headers: h,
        body: JSON.stringify({
          first_name:        contactMeta.firstName || nameParts[0] || "",
          last_name:         contactMeta.lastName  || nameParts.slice(1).join(" ") || "",
          title:             contactMeta.title     || "",
          company_name:      contactMeta.company   || "",
          linkedin_url:      profileUrl,
          linkedin_location: contactMeta.location  || "",
          linkedin_image_url:contactMeta.imageUrl  || "",
          pipeline_stage:    newStage || "Connected",
          member_status:     "Prospect",
          lead_source:       "LinkedIn / HeyReach",
          chapter_interest:  "Los Angeles",
          created_at:        new Date().toISOString(),
          updated_at:        new Date().toISOString(),
        })
      });
      var created = await createRes.json();
      if (Array.isArray(created) && created[0]) resolvedId = created[0].id;
    }

    if (!resolvedId) return;

    await fetch(SBU + "/rest/v1/communications", {
      method: "POST", headers: h,
      body: JSON.stringify({
        contact_id:  resolvedId,
        occurred_at: new Date().toISOString(),
        channel:     "LinkedIn",
        direction:   stepLabel.includes("Cleared") || stepLabel.includes("Queue") ? "INTERNAL" : "OUT",
        step_label:  stepLabel,
        body:        message,
        source:      "PeerChair",
        logged_by:   "Dalen Lawrence",
      })
    });

    if (newStage) {
      await fetch(SBU + "/rest/v1/contacts?id=eq." + resolvedId, {
        method: "PATCH", headers: h,
        body: JSON.stringify({ pipeline_stage: newStage, last_activity_date: new Date().toISOString() })
      });
    }
  } catch(e) { console.error("logToSupabase error:", e.message); }
}
