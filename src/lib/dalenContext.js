// Single source of truth for facts Dalen wants every AI-assisted drafting
// tool to get right automatically, instead of guessing or leaving a blank —
// starting with "go to my website" always meaning the same URL. Used by both
// the ChatGPT-based GPT Action (contact-context/route.js, an external
// consumer) and the in-app Draft Email tab (draft-email/route.js), so a fact
// only ever needs to be added here once to reach every drafting surface in
// (and around) PeerChair.
//
// Add more canonical facts here as they come up — a phone number, a
// brochure link, an assessment link, etc. Each new fact only needs to be
// wired into one place: this file.
export const SENDER_CONTEXT = {
  name: "Dalen Lawrence",
  title: "Chapter Director, CFO Circle Los Angeles",
  email: "dalen.lawrence@cfo-circle.com",
  website: process.env.NEXT_PUBLIC_EVENT_SITE_URL || "https://www.la-cfo.com",
  calendly_links: {
    fit_chat: {
      url: "https://calendly.com/cfo-circle/cfo-circle-fit-chat",
      duration_min: 15,
      changes_journey: true,
      use_for: "FIRST conversation with a CFO prospect ONLY. Sending this link advances them to the 'Fit Call Scheduled' stage. Never send to someone who has already had their fit chat — use the_15_min link instead."
    },
    sponsor_discovery: {
      url: "https://calendly.com/cfo-circle/cfo-circle-sponsor-discovery-call",
      duration_min: 30,
      changes_journey: true,
      use_for: "FIRST conversation with a sponsor prospect ONLY. Sending this link advances them to the 'Discovery Sched.' stage. Never send to a sponsor who has already had their discovery call — use the_30_min link instead."
    },
    the_15_min: {
      url: "https://calendly.com/cfo-circle/cfo-circle-15-minute-chat",
      duration_min: 15,
      changes_journey: false,
      use_for: "Generic 15-minute slot for ANYONE — referral partners, ProVisors contacts, repeat conversations with CFO prospects who already had a fit chat, sponsors who already had discovery, members, or any second/third touchpoint. Does NOT change pipeline stage."
    },
    the_30_min: {
      url: "https://calendly.com/cfo-circle/cfo-circle-30_minute",
      duration_min: 30,
      changes_journey: false,
      use_for: "Generic 30-minute slot for ANYONE needing a longer conversation. Same rules as the_15_min — use for any second touchpoint, referral partners, member check-ins, or non-pitch sponsor conversations. Does NOT change pipeline stage."
    }
  }
}
