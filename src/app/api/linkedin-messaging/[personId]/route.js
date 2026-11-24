export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
import { serverClient } from "@/lib/supabaseServer"
import { loadLinkedInMessages } from "@/lib/linkedinMessages"

// GET /api/linkedin-messaging/[personId]
// Every captured LinkedIn message to and from one person, oldest first.

export async function GET(_req, { params }) {
  try {
    const sb = serverClient()
    const personId = params.personId
    const { messages } = await loadLinkedInMessages(sb, { personId })

    const { data: person, error } = await sb.from("people")
      .select("id, full_name, first_name, last_name, title, company, linkedin_url, roles")
      .eq("id", personId).maybeSingle()
    if (error) throw new Error(error.message)

    return Response.json({
      person: person ? {
        id: person.id,
        name: person.full_name || ((person.first_name || "") + " " + (person.last_name || "")).trim(),
        title: person.title || null, company: person.company || null,
        roles: person.roles || [], linkedin_url: person.linkedin_url || null,
      } : null,
      count: messages.length,
      messages,
    })
  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 })
  }
}
