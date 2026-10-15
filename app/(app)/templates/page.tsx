import { requireOwner } from "@/lib/owner";
import { TEMPLATES } from "@/lib/templates";

/** Email templates (read-only for now — see note). */
export default async function TemplatesPage() {
  await requireOwner();
  return (
    <>
      <div className="chapter">
        <div className="top"><div>
          <div className="eyebrow">Onboarding</div>
          <h1>Email templates</h1>
          <div className="desc">
            What goes out to students and inquiries. Send from a student&apos;s record or an inquiry — it opens in your own email app,
            just like before. Editing wording here needs a place in the database to store it; until then these are the studio&apos;s current texts.
          </div>
        </div></div>
      </div>
      {TEMPLATES.map((t) => (
        <details key={t.key} className="ledger" style={{ marginBottom: 12 }}>
          <summary className="rec" style={{ gridTemplateColumns: "1fr", listStyle: "none" }}>
            <div><div className="nm" style={{ fontWeight: 600 }}>{t.title}</div><div className="ct">{t.desc} · Subject: {t.subject}</div></div>
          </summary>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, lineHeight: 1.55, padding: "4px 18px 18px", margin: 0, color: "var(--ink-2)" }}>{t.body}</pre>
        </details>
      ))}
    </>
  );
}
