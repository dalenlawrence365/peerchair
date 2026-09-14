f = "/tmp/pc/src/app/provisors/potential-troika/page.jsx"
s = open(f).read()

old = '''function fmtLine(slot) {
  const start = new Date(slot.starts_at)
  const end = slot.ends_at ? new Date(slot.ends_at) : null
  const day = start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
  const startTime = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  const endTime = end ? end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : null
  const timeRange = endTime ? `${startTime}–${endTime}` : startTime
  return `${slot.title} — ${day}, ${timeRange}`
}'''

new = '''// Dalen doesn't want the raw event title in the offer text (it's an
// internal calendar label, not something to send someone) -- instead
// derive a plain meal label from the start time. He gave the lunch window
// explicitly (11:30am-2pm); before that is breakfast, after that is dinner.
function mealLabel(start) {
  const hrs = start.getHours() + start.getMinutes() / 60
  if (hrs >= 11.5 && hrs <= 14) return "Troika Lunch"
  if (hrs < 11.5) return "Troika Breakfast"
  return "Troika Dinner"
}

function fmtLine(slot) {
  const start = new Date(slot.starts_at)
  const end = slot.ends_at ? new Date(slot.ends_at) : null
  const day = start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
  const startTime = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  const endTime = end ? end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : null
  const timeRange = endTime ? `${startTime}–${endTime}` : startTime
  return `${mealLabel(start)} — ${day}, ${timeRange}`
}'''

assert s.count(old) == 1, "fmtLine block not found"
s = s.replace(old, new)
open(f, "w").write(s)
print("patched ok")
