export const dynamic = "force-dynamic"
import { verifyGptActionKey } from "@/lib/gpt-auth"
import { corsResponse, handleOptions } from "@/lib/cors"
import { createClient } from "@supabase/supabase-js"
import { serverClient } from "@/lib/supabaseServer"

export async function OPTIONS() { return handleOptions() }

export async function POST(request) {
  if (!verifyGptActionKey(request)) {
    return corsResponse({ error: "Unauthorized" }, { status: 401 })
  }

  let body
  try { body = await request.json() } catch(e) {
    return corsResponse({ error: "Invalid JSON" }, { status: 400 })
  }

  const { contact_id, note, source, note_type } = body

  if (!contact_id || !note) {
    return corsResponse({ error: "contact_id and note are required" }, { status: 400 })
  }

  const sb = serverClient()

  // Verify the person exists (unified people table — was contacts, which
  // missed anyone added via people-only paths like AddPersonModal / GPT add)
  const { data: contact } = await sb
    .from("people")
    .select("id, first_name, last_name")
    .eq("id", contact_id)
    .maybeSingle()

  if (!contact) {
    return corsResponse({ error: "Contact not found" }, { status: 404 })
  }

  // Write to communications table — dual-write person_id + contact_id so both
  // new (people-based) and legacy (contact-based) readers find the note
  const { data: comm, error } = await sb
    .from("communications")
    .insert({
      person_id: contact_id,
      direction: "INTERNAL",
      channel: "Note",
      body: note,
      occurred_at: new Date().toISOString(),
      step_label: note_type || "Internal Note",
      source: source || "GPT",
      logged_by: "ChatGPT"
    })
    .select("id")
    .single()

  if (error) {
    console.error("add-note insert error:", error.message)
    return corsResponse({ error: "Failed to save note: " + error.message }, { status: 500 })
  }

  return corsResponse({
    success: true,
    message: `Note saved to ${contact.first_name} ${contact.last_name}'s profile.`,
    contact_id,
    communication_id: comm.id
  })
}
