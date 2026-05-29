export const dynamic = "force-dynamic"

// POST /api/people/add
//
// Body: {
//   first_name, last_name, full_name?, email?, phone?, linkedin_url?, title?, company?, location?,
//   roles: ['cfo' | 'sponsor_contact' | 'referral_partner', ...],
//   cfo_state?: 'pool' | 'audience' | 'prospect' | 'qualified' | 'member',
//   sponsor_state?: 'pool' | 'audience' | 'discovery' | 'proposal' | 'active',
//   not_on_linkedin?: boolean,
//   referrer_person_id?: string,
//   referral_type?: string,
//   source?: string,
//   first_note?: string
// }
//
// Returns: { id, full_name, redirect_url }
//
// Side effects:
//   1. Insert person into `people` with roles + state(s) + source
//   2. If not_on_linkedin: set status tag 'not_on_linkedin' via set_status_tag RPC
//   3. If referrer_person_id: insert row into `referrals` linking referrer → new person
//   4. If first_note: insert row into `communications` with direction=INTERNAL, channel=Note
//   5. Audit log entry

import { createClient } from "@supabase/supabase-js"
import { serverClient } from "@/lib/supabaseServer"

function normalizeUrl(u) {
  if (!u) return null
  const s = String(u).trim().toLowerCase()
    .replace(/^http:\/\//, "https://")
    .replace(/^https:\/\/linkedin\.com/, "https://www.linkedin.com")
    .replace(/\/$/, "")
    .replace(/\?.*$/, "")
    .replace(/#.*$/, "")
  return s || null
}

export async function POST(request) {
  const sb = serverClient()

  let body
  try { body = await request.json() } catch(e) {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const first_name = String(body.first_name || "").trim()
  const last_name = String(body.last_name || "").trim()
  const full_name = String(body.full_name || `${first_name} ${last_name}`).trim()

  if (!first_name && !full_name) {
    return Response.json({ error: "Name is required" }, { status: 400 })
  }

  const roles = Array.isArray(body.roles) && body.roles.length > 0 ? body.roles : ["cfo"]
  const cfo_state = body.cfo_state || (roles.includes("cfo") ? "pool" : null)
  const sponsor_state = body.sponsor_state || (roles.includes("sponsor_contact") ? "pool" : null)
  const linkedin_url = normalizeUrl(body.linkedin_url)
  const not_on_linkedin = !!body.not_on_linkedin

  // Default source: include referrer name if known
  const source = (body.source || "").trim() || `manual-add-${new Date().toISOString().slice(0,10)}`

  // 1. Insert person
  const insertRow = {
    first_name: first_name || null,
    last_name: last_name || null,
    full_name: full_name || null,
    email: String(body.email || "").trim().toLowerCase() || null,
    phone: String(body.phone || "").trim() || null,
    linkedin_url: linkedin_url,
    title: String(body.title || "").trim() || null,
    company: String(body.company || "").trim() || null,
    location: String(body.location || "").trim() || null,
    roles: roles,
    cfo_state: cfo_state,
    sponsor_state: sponsor_state,
    source: source,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
  const { data: inserted, error: iErr } = await sb.from("people").insert(insertRow).select("id, full_name").single()
  if (iErr) return Response.json({ error: "Insert failed: " + iErr.message }, { status: 500 })
  const personId = inserted.id

  const sideEffects = []

  // 2. Status tag: not_on_linkedin
  if (not_on_linkedin) {
    const { error: stErr } = await sb.rpc("set_status_tag", {
      p_person_id: personId,
      p_tag: "not_on_linkedin",
      p_set_by: "manual_add"
    })
    if (stErr) sideEffects.push(`status_tag failed: ${stErr.message}`)
    else sideEffects.push("status:not_on_linkedin set")
  }

  // 3. Referral row
  if (body.referrer_person_id) {
    const { error: rErr } = await sb.from("referrals").insert({
      referrer_person_id: body.referrer_person_id,
      referred_person_id: personId,
      direction: "inbound",
      referral_type: (body.referral_type || "Other").trim(),
      referred_at: new Date().toISOString(),
      notes: body.first_note ? body.first_note.slice(0, 500) : null
    })
    if (rErr) sideEffects.push(`referral insert failed: ${rErr.message}`)
    else sideEffects.push(`referral linked to ${body.referrer_person_id}`)
  }

  // 4. First note as a communication
  if (body.first_note && body.first_note.trim()) {
    const { error: cErr } = await sb.from("communications").insert({
      person_id: personId,
      contact_id: personId,            // dual-write so legacy queries also see it
      direction: "INTERNAL",
      channel: "Note",
      body: body.first_note.trim(),
      occurred_at: new Date().toISOString(),
      step_label: "Initial Note",
      source: "manual_add",
      logged_by: "manual_add"
    })
    if (cErr) sideEffects.push(`note insert failed: ${cErr.message}`)
    else sideEffects.push("first_note logged")
  }

  // 5. Audit
  try {
    await sb.from("audit_log").insert({
      run_at: new Date().toISOString(),
      audit_type: "manual_add_person",
      contacts_created: 1,
      summary: `manual_add · ${full_name} · roles: ${roles.join(",")} · cfo_state: ${cfo_state || "—"} · sponsor_state: ${sponsor_state || "—"}`,
      errors: sideEffects.filter(s => s.includes("failed"))
    })
  } catch(e) {}

  // Decide redirect URL: CFO if has cfo role, else sponsor pipeline
  let redirect = "/"
  if (roles.includes("cfo") && cfo_state) redirect = `/pipeline/cfo/${cfo_state}?person=${personId}`
  else if (roles.includes("sponsor_contact") && sponsor_state) redirect = `/pipeline/sponsor/${sponsor_state}?person=${personId}`

  return Response.json({
    id: personId,
    full_name: inserted.full_name,
    redirect_url: redirect,
    side_effects: sideEffects
  })
}
