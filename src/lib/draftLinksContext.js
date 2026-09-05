// Shared by draft-email and draft-dm: pulls the active rows from the
// named_links self-service library (see /links page + named_links table
// comment) and formats them as a block for the drafting prompt, so Dalen's
// own labels ("CFO Circle Los Angeles", "Sept 16 Workshop RSVP") are
// available alongside the hardcoded SENDER_CONTEXT calendly links without
// needing a code change every time he wants to add or rename one.
//
// use_for is the field that actually does the matching work — the label is
// just the display text a reader sees, which usually has no relation to how
// Dalen describes the link out loud ("the web page," "the signup link"), so
// every row must carry a use_for description of when to reach for it. Same
// role as SENDER_CONTEXT.calendly_links.*.use_for in dalenContext.js.
export async function getNamedLinksLines(sb) {
  const { data } = await sb.from("named_links")
    .select("label, url, use_for")
    .eq("active", true)
    .order("label", { ascending: true })
  return (data || []).map(function (l) {
    return "- " + l.label + ": " + l.url + " — use when: " + l.use_for
  }).join("\n")
}
