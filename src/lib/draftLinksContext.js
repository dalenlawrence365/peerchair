// Shared by draft-email and draft-dm: pulls the active rows from the
// named_links self-service library (see /links page + named_links table
// comment) and formats them as a block for the drafting prompt, so Dalen's
// own labels ("Sept 16 Workshop RSVP", "Q4 Assessment") are available
// alongside the hardcoded SENDER_CONTEXT calendly links without needing a
// code change every time he wants to add or rename one.
export async function getNamedLinksLines(sb) {
  const { data } = await sb.from("named_links")
    .select("label, url, notes")
    .eq("active", true)
    .order("label", { ascending: true })
  return (data || []).map(function (l) {
    return "- " + l.label + ": " + l.url + (l.notes ? " (" + l.notes + ")" : "")
  }).join("\n")
}
