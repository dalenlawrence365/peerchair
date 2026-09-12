f = "/tmp/pc/src/app/provisors/page.jsx"
s = open(f).read()

old = '''          <Link href="/provisors/review" style={{
            position: "relative", fontSize: 12, padding: "6px 12px", borderRadius: 6,
            background: "white", color: pending > 0 ? "#15803d" : T.textSecondary,
            border: "1px solid " + (pending > 0 ? "#15803d" : T.border), cursor: "pointer",
            fontWeight: 500, textDecoration: "none",
          }}>
            Review queue
            {pending > 0 && (
              <span style={{
                marginLeft: 6, display: "inline-block", minWidth: 16, padding: "0 5px",
                borderRadius: 999, background: "#15803d", color: "white", fontSize: 10,
                fontWeight: 700, textAlign: "center", lineHeight: "16px",
              }}>{pending}</span>
            )}
          </Link>
          <button onClick={() => setSearchOpen(v => !v)}'''

new = '''          <Link href="/provisors/review" style={{
            position: "relative", fontSize: 12, padding: "6px 12px", borderRadius: 6,
            background: "white", color: pending > 0 ? "#15803d" : T.textSecondary,
            border: "1px solid " + (pending > 0 ? "#15803d" : T.border), cursor: "pointer",
            fontWeight: 500, textDecoration: "none",
          }}>
            Review queue
            {pending > 0 && (
              <span style={{
                marginLeft: 6, display: "inline-block", minWidth: 16, padding: "0 5px",
                borderRadius: 999, background: "#15803d", color: "white", fontSize: 10,
                fontWeight: 700, textAlign: "center", lineHeight: "16px",
              }}>{pending}</span>
            )}
          </Link>
          <Link href="/provisors/potential-troika" style={{
            fontSize: 12, padding: "6px 12px", borderRadius: 6, background: "white",
            color: T.textSecondary, border: "1px solid " + T.border, cursor: "pointer",
            fontWeight: 500, textDecoration: "none",
          }}>
            Potential Troika
          </Link>
          <button onClick={() => setSearchOpen(v => !v)}'''

assert s.count(old) == 1, "tab insertion point not found"
s = s.replace(old, new)
open(f, "w").write(s)
print("tab added ok")
