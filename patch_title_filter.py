f = "/tmp/pc/src/app/api/provisors/potential-troika/route.js"
s = open(f).read()

old = '''    const { value: events } = await evRes.json()

    const slots = (events || [])
      .filter(ev => !ev.isCancelled)
      .map(ev => ({'''

new = '''    const { value: events } = await evRes.json()

    const slots = (events || [])
      .filter(ev => !ev.isCancelled)
      // Only genuinely OPEN slots -- Dalen names them "Potential ___" on
      // purpose. A "Reserved for ___" block on this same calendar means
      // that time is already spoken for (held for a specific in-progress
      // plan), not something to offer to whoever's next -- so it's
      // deliberately excluded here, not just missed.
      .filter(ev => (ev.subject || "").trim().toLowerCase().startsWith("potential"))
      .map(ev => ({'''

assert s.count(old) == 1, "insertion point not found"
s = s.replace(old, new)
open(f, "w").write(s)
print("patched ok")
