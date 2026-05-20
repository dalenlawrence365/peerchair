"use client"
import { useState, useEffect } from "react"
import { G, T, BG, BG2, BG3, sbFetch } from "@/lib/appShared"

export default function ContactPicker({ kind, onSelect, onClose }) {
  // kind: "fitcall" | "discovery"
  var isFitCall = kind === "fitcall";
  var title = isFitCall ? "Start Fit Call" : "Start Discovery Call";
  var subtitle = isFitCall
    ? "Choose the CFO prospect you're meeting with"
    : "Choose the sponsor contact you're meeting with";
  var contactTypeFilter = isFitCall ? "CFO_PROSPECT" : "SPONSOR_CONTACT";

  var [contacts, setContacts] = useState([]);
  var [loading, setLoading] = useState(true);
  var [q, setQ] = useState("");

  useEffect(function () {
    async function load() {
      try {
        var rows = await sbFetch(
          "/contacts?contact_type=eq." + contactTypeFilter +
          "&select=id,first_name,last_name,title,company_name,company_id,email,linkedin_url,fit_call_date,pipeline_stage,member_status" +
          "&order=last_name.asc&limit=1000"
        );
        setContacts(Array.isArray(rows) ? rows : []);
      } catch (e) {
        console.error("ContactPicker load error:", e);
      }
      setLoading(false);
    }
    load();
  }, [contactTypeFilter]);

  var ql = q.trim().toLowerCase();
  var filtered = !ql
    ? contacts
    : contacts.filter(function (c) {
        var hay = (
          (c.first_name || "") + " " +
          (c.last_name || "") + " " +
          (c.company_name || "") + " " +
          (c.title || "")
        ).toLowerCase();
        return hay.indexOf(ql) > -1;
      });

  function handlePick(c) {
    if (isFitCall) {
      onSelect({
        id: c.id,
        firstName: c.first_name,
        lastName: c.last_name,
        title: c.title,
        company: c.company_name,
        email: c.email,
        linkedinUrl: c.linkedin_url,
        fit_call_date: c.fit_call_date
      });
    } else {
      // Discovery: build the company + contact + deal triple expected by SponsorCompanion
      var company = {
        id: c.company_id || null,
        name: c.company_name || "",
        category: null
      };
      var contact = {
        id: c.id,
        first_name: c.first_name,
        last_name: c.last_name,
        title: c.title,
        email: c.email,
        linkedin_url: c.linkedin_url
      };
      onSelect(company, contact, null);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000
      }}
    >
      <div
        onClick={function (e) { e.stopPropagation(); }}
        style={{
          width: 540, maxHeight: "78vh", background: BG, border: "1px solid " + T.border,
          borderRadius: 8, display: "flex", flexDirection: "column",
          fontFamily: "'Palatino Linotype','Book Antiqua',Palatino,serif",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)"
        }}
      >
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid " + T.border }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: G, letterSpacing: 1 }}>{title}</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>{subtitle}</div>
            </div>
            <button
              onClick={onClose}
              style={{ background: "transparent", border: "none", color: T.muted, cursor: "pointer", fontSize: 18, padding: 4 }}
            >×</button>
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid " + T.border }}>
          <input
            autoFocus
            value={q}
            onChange={function (e) { setQ(e.target.value); }}
            placeholder={isFitCall ? "Search CFO prospects by name, company, title..." : "Search sponsor contacts by name, company..."}
            style={{
              width: "100%", background: BG2, border: "1px solid " + T.border, color: T.text,
              padding: "8px 12px", borderRadius: 5, fontSize: 13, outline: "none",
              fontFamily: "inherit", boxSizing: "border-box"
            }}
          />
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
          {loading && (
            <div style={{ padding: 40, textAlign: "center", color: T.dim, fontSize: 12 }}>Loading contacts…</div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: T.dim, fontSize: 12 }}>
              {ql ? "No matches." : (isFitCall ? "No CFO prospects found." : "No sponsor contacts found.")}
            </div>
          )}
          {!loading && filtered.map(function (c) {
            var name = (c.first_name || "") + " " + (c.last_name || "");
            return (
              <div
                key={c.id}
                onClick={function () { handlePick(c); }}
                style={{
                  padding: "10px 12px", borderRadius: 5, cursor: "pointer",
                  marginBottom: 4, background: "transparent", transition: "background 80ms"
                }}
                onMouseEnter={function (e) { e.currentTarget.style.background = BG3; }}
                onMouseLeave={function (e) { e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{name.trim() || "(no name)"}</div>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                  {c.title || "—"}{c.company_name ? " · " + c.company_name : ""}
                </div>
                {isFitCall && c.pipeline_stage && (
                  <div style={{ fontSize: 10, color: T.dim, marginTop: 3, letterSpacing: 1, textTransform: "uppercase" }}>
                    {c.pipeline_stage}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer count */}
        <div style={{ padding: "8px 20px", borderTop: "1px solid " + T.border, fontSize: 11, color: T.dim, textAlign: "right" }}>
          {loading ? "" : filtered.length + " of " + contacts.length}
        </div>
      </div>
    </div>
  );
}
