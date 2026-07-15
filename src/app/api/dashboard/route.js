export const dynamic = "force-dynamic"
import { createClient } from "@supabase/supabase-js"
import { serverClient } from "@/lib/supabaseServer"

// GET /api/dashboard — one-shot data fetch for the new dashboard.
// Returns:
//   counts.cfo / counts.sponsor / counts.referral — distributions by state
//   counts.totals — top-line numbers
//   queues — counts for review_queue, follow_up (reply_received), needs_role_review
//   fit_calls — upcoming fit_call_scheduled action tags + person info
//   sponsor_discoveries — upcoming sponsor_discovery_scheduled action tags
//   activity — most recent 15 communications across all people
//   unread_linkedin — count of people with linkedin_has_unread

export async function GET() {
  const sb = serverClient()

  // Distributions via COUNT queries per stage — NOT row-fetch-then-tally.
  // Supabase .select() silently caps at 1000 rows, which made fetch-then-count
  // report a hard ceiling of 1000 and a wrong stage split. head:true count
  // queries transfer no rows and have no cap.
  const CFO_STAGES = ["pool", "audience", "prospect", "qualified", "member"]
  const SPONSOR_STAGES = ["pool", "audience", "discovery", "proposal", "active"]
  const REFERRAL_STAGES = ["pool", "audience", "active"]

  async function distribution(field, stages) {
    const out = {}
    await Promise.all(stages.map(async function(stage){
      const { count } = await sb.from("people").select("id", { count: "exact", head: true }).eq(field, stage)
      out[stage] = count || 0
    }))
    return out
  }

  // CFO funnel — NESTED/DERIVED to match the pipeline page: pool = universe (all cfo-roled),
  // audience = first-degree connected (derived from linkedin_connected, not a stored stage),
  // engagement stages cumulative. Stages overlap, so they are NOT summed for the total.
  async function cfoDistribution() {
    const base = function(){ return sb.from("people").select("id", { count: "exact", head: true }).contains("roles", ["cfo"]) }
    const [pool, audience, prospect, qualified, member] = await Promise.all([
      base(),
      base().eq("linkedin_connected", true),
      base().in("cfo_state", ["prospect","qualified","member"]),
      base().in("cfo_state", ["qualified","member"]),
      base().eq("cfo_state", "member"),
    ])
    return { pool: pool.count||0, audience: audience.count||0, prospect: prospect.count||0, qualified: qualified.count||0, member: member.count||0 }
  }
  const cfoCounts      = await cfoDistribution()
  const sponsorCounts  = await distribution("sponsor_state", SPONSOR_STAGES)
  const referralCounts = await distribution("referral_state", REFERRAL_STAGES)

  // Totals + sponsor companies
  const { count: sponsorCompanies } = await sb.from("companies").select("id", { count: "exact", head: true }).eq("is_sponsor", true)

  // Queues — active tags only
  const { count: needsRoleReview } = await sb.from("person_status_tags")
    .select("person_id", { count: "exact", head: true })
    .eq("tag", "needs_role_review").is("removed_at", null)

  // Reply received — open replies (action_tag, no removed_at column on action_tags per earlier finding)
  const { count: replyReceived } = await sb.from("person_action_tags")
    .select("person_id", { count: "exact", head: true })
    .eq("action_type", "reply_received")

  // Unread LinkedIn
  const { count: unreadLinkedin } = await sb.from("people")
    .select("id", { count: "exact", head: true })
    .eq("linkedin_has_unread", true)

  // Upcoming fit calls — pull the fit_call_scheduled action tags, then load the people
  const { data: fitCallTags } = await sb.from("person_action_tags")
    .select("person_id, set_at, notes, as_of_date")
    .eq("action_type", "fit_call_scheduled")
    .order("set_at", { ascending: false })
    .limit(20)

  const fitPersonIds = (fitCallTags || []).map(t => t.person_id)
  const { data: fitPeople } = fitPersonIds.length > 0
    ? await sb.from("people").select("id, full_name, title, company, cfo_state, avatar_url").in("id", fitPersonIds)
    : { data: [] }
  const fitPersonById = {}
  ;(fitPeople || []).forEach(function(p){ fitPersonById[p.id] = p })

  const fitCalls = (fitCallTags || [])
    .map(function(t){ const p = fitPersonById[t.person_id]; return p ? Object.assign({}, p, { tag_set_at: t.set_at, tag_notes: t.notes }) : null })
    .filter(Boolean)

  // Upcoming sponsor discoveries
  const { data: sdTags } = await sb.from("person_action_tags")
    .select("person_id, set_at, notes")
    .eq("action_type", "sponsor_discovery_scheduled")
    .order("set_at", { ascending: false })
    .limit(20)
  const sdIds = (sdTags || []).map(t => t.person_id)
  const { data: sdPeople } = sdIds.length > 0
    ? await sb.from("people").select("id, full_name, title, company, sponsor_state, avatar_url").in("id", sdIds)
    : { data: [] }
  const sdById = {}
  ;(sdPeople || []).forEach(function(p){ sdById[p.id] = p })
  const sponsorDiscoveries = (sdTags || [])
    .map(function(t){ const p = sdById[t.person_id]; return p ? Object.assign({}, p, { tag_set_at: t.set_at, tag_notes: t.notes }) : null })
    .filter(Boolean)

  // Weekly KPIs — action_tags set in the current ISO week (Monday-current)
  const weekStart = new Date()
  const day = weekStart.getUTCDay()
  const diffToMon = day === 0 ? -6 : 1 - day  // Sunday → -6, Monday → 0, Tuesday → -1...
  weekStart.setUTCDate(weekStart.getUTCDate() + diffToMon)
  weekStart.setUTCHours(0, 0, 0, 0)
  const weekStartIso = weekStart.toISOString()

  async function tagCountSince(action_type, since) {
    const { count } = await sb.from("person_action_tags")
      .select("person_id", { count: "exact", head: true })
      .eq("action_type", action_type)
      .gte("set_at", since)
    return count || 0
  }
  const weekly = {
    fit_scheduled:       await tagCountSince("fit_call_scheduled", weekStartIso),
    fit_completed:       await tagCountSince("fit_call_completed", weekStartIso),
    discovery_scheduled: await tagCountSince("sponsor_discovery_scheduled", weekStartIso),
    discovery_completed: await tagCountSince("sponsor_discovery_completed", weekStartIso),
  }

  // Connection volume — counts cover manual + automated together. The manual
  // "connection sent/accepted" clicks and the LinkedHelper webhook both land here:
  // event=sent writes the connection_sent tag directly; event=connected sets the
  // contact stage to "Connected", which the sync trigger turns into connection_accepted.
  // (Rows == distinct people — no duplicate tags per person.)
  async function tagCountAll(action_type) {
    const { count } = await sb.from("person_action_tags")
      .select("person_id", { count: "exact", head: true })
      .eq("action_type", action_type)
    return count || 0
  }
  const connections = {
    requests_total: await tagCountAll("connection_sent"),
    requests_week:  await tagCountSince("connection_sent", weekStartIso),
    accepted_total: await tagCountAll("connection_accepted"),
    accepted_week:  await tagCountSince("connection_accepted", weekStartIso),
  }

  // Recent activity — last 15 communications across all people
  const { data: activityRaw } = await sb.from("communications")
    .select("id, person_id, occurred_at, direction, channel, step_label, body")
    .order("occurred_at", { ascending: false })
    .limit(15)

  const actPersonIds = [...new Set((activityRaw || []).map(c => c.person_id).filter(Boolean))]
  const { data: actPeople } = actPersonIds.length > 0
    ? await sb.from("people").select("id, full_name, avatar_url").in("id", actPersonIds)
    : { data: [] }
  const actById = {}
  ;(actPeople || []).forEach(function(p){ actById[p.id] = p })
  const activity = (activityRaw || []).map(function(c){
    const id = c.person_id
    const p = actById[id]
    return {
      id: c.id, occurred_at: c.occurred_at, channel: c.channel,
      direction: c.direction, step_label: c.step_label,
      body: c.body ? (c.body.length > 140 ? c.body.slice(0, 140) + "…" : c.body) : null,
      person_id: id, person_name: p ? p.full_name : "(unknown)", avatar_url: p ? p.avatar_url : null,
    }
  })

  const { data: segmentCounts } = await sb.rpc("connection_segment_counts")

  // Audience row — reachable = every first-degree connection; relevant = reachable
  // minus legacy (pre-2024); ProVisor/CFO/Sponsor are connected role cohorts that
  // overlap each other and are never summed into the total.
  const audience = await (async () => {
    const base = function(){ return sb.from("people").select("id", { count: "exact", head: true }).eq("linkedin_connected", true) }
    const [reach, prov, cfo, spon] = await Promise.all([
      base(),
      base().eq("provisors_member", true),
      base().contains("roles", ["cfo"]),
      base().contains("roles", ["sponsor_contact"]),
    ])
    const { count: legacy } = await sb.from("person_status_tags")
      .select("person_id", { count: "exact", head: true }).eq("tag", "legacy").is("removed_at", null)
    const reachable = reach.count || 0
    // Weekly additions by effective_date — the generated coalesce(as_of_date,
    // set_at::date). Neither input works alone: as_of_date is the true date on
    // the 4,086 CSV-backfilled rows but NULL on every live one, while set_at is
    // right on live rows and stamped at import time on the backfill. This
    // filtered on as_of_date, and NULL silently fails a >= comparison, so every
    // acceptance that happened in real time was invisible — 21 CFOs accepted in
    // a week and the tile read "+1".
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const { data: recent } = await sb.from("person_action_tags")
      .select("person_id").eq("action_type", "connection_accepted").gte("effective_date", since)
    const recentIds = [...new Set((recent || []).map(function(r){ return r.person_id }))]
    let wkProvisor = 0, wkCfo = 0, wkSponsor = 0
    if (recentIds.length) {
      const [pw, cw, sw] = await Promise.all([
        sb.from("people").select("id", { count: "exact", head: true }).in("id", recentIds).eq("provisors_member", true),
        sb.from("people").select("id", { count: "exact", head: true }).in("id", recentIds).contains("roles", ["cfo"]),
        sb.from("people").select("id", { count: "exact", head: true }).in("id", recentIds).contains("roles", ["sponsor_contact"]),
      ])
      wkProvisor = pw.count || 0; wkCfo = cw.count || 0; wkSponsor = sw.count || 0
    }
    const wkReachable = recentIds.length
    return {
      reachable, relevant: reachable - (legacy || 0), provisor: prov.count || 0, cfo: cfo.count || 0, sponsor: spon.count || 0,
      wk: { reachable: wkReachable, relevant: wkReachable, provisor: wkProvisor, cfo: wkCfo, sponsor: wkSponsor },
    }
  })()

  return Response.json({
    audience,
    counts: {
      cfo: cfoCounts,
      sponsor: sponsorCounts,
      referral: referralCounts,
      cfo_total: cfoCounts.pool,
      sponsor_total: Object.values(sponsorCounts).reduce((a, b) => a + b, 0),
      referral_total: Object.values(referralCounts).reduce((a, b) => a + b, 0),
      sponsor_companies: sponsorCompanies || 0,
      upcoming_meetings: await (async () => {
        const now = new Date().toISOString()
        const next7 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        const { count } = await sb.from("meetings")
          .select("*", { count: "exact", head: true })
          .gte("starts_at", now)
          .lte("starts_at", next7)
          .not("status", "in", "(canceled,completed)")
        return count || 0
      })(),
      linkedin_connections: await (async () => {
        // First-degree = the attribute on people, not the frozen snapshot table.
        const { count } = await sb.from("people")
          .select("id", { count: "exact", head: true })
          .eq("linkedin_connected", true)
        return count || 0
      })(),
      linkedin_connections_unrated: await (async () => {
        // First-degree connections not yet classified into any role (the raw network).
        const { count } = await sb.from("people")
          .select("id", { count: "exact", head: true })
          .eq("linkedin_connected", true)
          .eq("provisors_member", false)
          .eq("cfo_circle_member", false)
          .or("roles.is.null,roles.eq.{}")
        return count || 0
      })(),
      cfo_circle_total: await (async () => {
        // CFO Circle label — boolean across ALL people, orthogonal to roles and
        // independent of LinkedIn connection (includes non-connections, e.g. Paul Wirth).
        const { count } = await sb.from("people")
          .select("id", { count: "exact", head: true })
          .eq("cfo_circle_member", true)
        return count || 0
      })(),
    },
    segments: segmentCounts || {},
    queues: {
      needs_role_review: needsRoleReview || 0,
      reply_received: replyReceived || 0,
      unread_linkedin: unreadLinkedin || 0,
    },
    fit_calls: fitCalls.slice(0, 10),
    sponsor_discoveries: sponsorDiscoveries.slice(0, 10),
    weekly,
    connections,
    activity,
  })
}
