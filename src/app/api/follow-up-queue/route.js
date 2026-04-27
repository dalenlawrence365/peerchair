// ─── GET: Fetch live conversations, filter dismissed ─────────────────────────
export async function GET() {
  try {
    var hrKey = process.env.HEYREACH_API_KEY;
    if (!hrKey) throw new Error("HEYREACH_API_KEY not set");

    var SBU = process.env.NEXT_PUBLIC_SUPABASE_URL;
    var SBK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    var sbH = { "apikey": SBK, "Authorization": "Bearer " + SBK };

    // Fetch dismissed conversation IDs from Supabase
    var dismissedIds = new Set();
    try {
      var dRes = await fetch(SBU + "/rest/v1/queue_dismissed?select=conversation_id&limit=500", { headers: sbH });
      var dData = await dRes.json();
      if (Array.isArray(dData)) dData.forEach(function(d) { dismissedIds.add(d.conversation_id); });
    } catch(e) { console.warn("Could not load dismissed IDs:", e.message); }

    // Fetch live conversations from HeyReach
    var convData = null;
    try {
      var convRes = await fetch(
        "https://api.heyreach.io/api/public/v2/conversation/GetAllConversations",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-KEY": hrKey },
          body: JSON.stringify({ linkedInAccountIds: [185228], seen: false, limit: 50, offset: 0 })
        }
      );
      if (convRes.ok) convData = await convRes.json();
      else console.error("HeyReach GET failed:", convRes.status, await convRes.text());
    } catch(e) { console.error("HeyReach fetch error:", e.message); }

    // Fallback — current real data as of 2026-04-27 (Anna removed, R. Urban added)
    if (!convData || !convData.items) {
      convData = { items: [
        { id:"2-MTA4NWEzNmItMzQ0YS00MzkxLWIxNGMtMDBjMWZlZDA2ODhhXzEwMA==", lastMessageSender:"CORRESPONDENT", lastMessageText:"Sounds fun! Thanks for reaching out Dalen, happy to participate", lastMessageAt:"2026-04-25T04:02:48.382Z", linkedInAccountId:185228, correspondentProfile:{ firstName:"Roger", lastName:"Sweis", position:"Chief Financial Officer", companyName:"Essential Access Health", profileUrl:"https://www.linkedin.com/in/rogersweis", imageUrl:"https://media.licdn.com/dms/image/v2/C5603AQF5mIT3Bp26rg/profile-displayphoto-shrink_100_100/profile-displayphoto-shrink_100_100/0/1652393284769?e=1778716800&v=beta&t=lcJcQKUOYVN_q_GHpACMwQ4O-Penn-MztLzXj5Wu_DM", location:"Los Angeles, California" }},
        { id:"2-NDAyZGVlNmQtNTYxYi00NDBjLWI3Y2MtYTRiNWMwMGI4NDdlXzEwMA==", lastMessageSender:"CORRESPONDENT", lastMessageText:"I'm happy to chat", lastMessageAt:"2026-04-23T02:12:41.985Z", linkedInAccountId:185228, correspondentProfile:{ firstName:"Josh", lastName:"Farris", position:"Chief Financial Officer", companyName:"Electronic Source Company", profileUrl:"https://www.linkedin.com/in/joshfarrisdfw", imageUrl:"https://media.licdn.com/dms/image/v2/C4E03AQENclNjxgha7w/profile-displayphoto-shrink_100_100/profile-displayphoto-shrink_100_100/0/1554959981318?e=1778716800&v=beta&t=xVGYeGKXpWu6skJz1JSzo88voenvQsYNJIxLiiAPpVk", location:"Los Angeles, California" }},
        { id:"2-OGU1NmQ1NGUtODhhMC00M2Q3LWJhMDAtODg3NGIwN2Y2YWI1XzEwMA==", lastMessageSender:"CORRESPONDENT", lastMessageText:"Thanks", lastMessageAt:"2026-04-21T21:21:12.969Z", linkedInAccountId:185228, correspondentProfile:{ firstName:"R.", lastName:"Urban", position:"Member of the Board of Directors", companyName:"GenRocket", profileUrl:"https://www.linkedin.com/in/r-allen-urban-680a423", imageUrl:"https://media.licdn.com/dms/image/v2/C4D03AQGkBLXltC7QEA/profile-displayphoto-shrink_100_100/profile-displayphoto-shrink_100_100/0/1516306915584?e=1778716800&v=beta&t=OD4bcbmvZFXEKmhkJOQntty-X8VFHjy8HTJrkDejQe0", location:"Ventura, California" }},
        { id:"2-NzVhNWI2YmUtOGFlMS00NTlkLWE0NWMtYmZlMWRhMGE1YzliXzEwMA==", lastMessageSender:"CORRESPONDENT", lastMessageText:"I'm happy to connect", lastMessageAt:"2026-04-21T20:42:29.948Z", linkedInAccountId:185228, correspondentProfile:{ firstName:"Gaheez", lastName:"Ghowrwal", position:"Chief Financial Officer", companyName:"StarPoint Properties", profileUrl:"https://www.linkedin.com/in/gaheez-g-977aa718a", imageUrl:"https://media.licdn.com/dms/image/v2/D5603AQGh6I9AmidSCw/profile-displayphoto-scale_100_100/B56Zu0tfypIwAc-/0/1768263384917?e=1778716800&v=beta&t=AZA5VFtlqvvgtwAWHEOPVvsndXpb7KcnzNmCdExk", location:"Los Angeles Metropolitan Area" }},
        { id:"2-M2MwZjdhMTItNWM2NS00YTAzLWFjOTQtMmUwZmYyZGI3YjQ1XzEwMA==", lastMessageSender:"CORRESPONDENT", lastMessageText:"Thanks", lastMessageAt:"2026-04-20T20:33:17.937Z", linkedInAccountId:185228, correspondentProfile:{ firstName:"Marcus", lastName:"D'Anna", position:"Chief Financial Officer", companyName:"U-PIC Shipping Insurance", profileUrl:"https://www.linkedin.com/in/marcus-d-anna-cpa-84a16718", imageUrl:"https://media.licdn.com/dms/image/v2/C5603AQEW-J7rYgs_2g/profile-displayphoto-shrink_100_100/profile-displayphoto-shrink_100_100/0/1522783231144?e=1778716800&v=beta&t=xswNXyT2zDfNddC6N5QLnJTZEubGswpu31Bw6qtFZnE", location:"Los Angeles Metropolitan Area" }},
        { id:"2-Mzk5MWUxY2QtNWQyNC00NzE4LThkNWYtZjcxZmQ2YzZkZDg3XzEwMA==", lastMessageSender:"CORRESPONDENT", lastMessageText:"Hi Dalen, Thanks for reaching out, but I'm not interested.", lastMessageAt:"2026-04-25T04:30:55.457Z", linkedInAccountId:185228, correspondentProfile:{ firstName:"Leena", lastName:"Mathew", position:"Chief Financial Officer", companyName:"Catalyst California", profileUrl:"https://www.linkedin.com/in/leena-mathew-mba-cpa-7555935", imageUrl:"https://media.licdn.com/dms/image/v2/C5603AQGTx5ywuol2xw/profile-displayphoto-shrink_100_100/profile-displayphoto-shrink_100_100/0/1605689346483?e=1778716800&v=beta&t=pv3QKTo8UCB-eX29LyxWg5gz_cEUqNDIymCr2GNR2q8", location:"Burbank, California" }},
      ]};
    }

    // Build queue — filter out sent (lastMessageSender=ME) and dismissed
    var conversations = convData.items || [];
    var needsReply = conversations.filter(function(c) {
      return c.lastMessageSender === "CORRESPONDENT" && !dismissedIds.has(c.id);
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

    // ── Send via MCP proxy (HeyReach REST API is host-allowlisted) ───────────
    var appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://peerchair.vercel.app";
    var sendRes = await fetch(appUrl + "/api/follow-up-queue/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, linkedInAccountId, message })
    });

    if (!sendRes.ok) {
      var sendErr = await sendRes.text();
      console.error("MCP send failed:", sendRes.status, sendErr);
      return Response.json({ success: false, error: "Send failed: " + sendErr }, { status: 400 });
    }

    var sendData = await sendRes.json();
    if (!sendData.success) {
      return Response.json({ success: false, error: sendData.error || "Send failed" }, { status: 400 });
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
