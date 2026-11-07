import { useEffect, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import { AlertCircle, Printer, QrCode } from "lucide-react";
import { supabase } from "../../supabase";
import { escapeHtml } from "../../lib/escapeHtml";

// Student Management -> View student: printable pickup pass for guardians who have no phone or
// can't use the Parent Portal. The pass carries the guardian's real, current QR code (the same
// one their portal shows). The code is fetched only when "Print pass" is pressed; that is
// audit-logged and the guardian is notified. A lost pass is cancelled with
// Guardian Security -> New QR code.

interface PassLink {
    link_id: string;
    guardian_name: string;
    relationship: string | null;
    is_primary: boolean;
    printable: boolean;
    reason: string | null;
}

const ERRORS: Record<string, string> = {
    not_found: "This guardian is no longer linked to the student.",
    not_allowed: "This guardian can't pick up (not allowed or suspended).",
    no_code: "No QR code exists for this guardian yet. Ask them to open their Parent Portal once, or contact support.",
};

function passHtml(p: { guardian_name: string; relationship: string | null; student_name: string }, qrSvg: string): string {
    const issued = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    return `<!doctype html><html><head><meta charset="utf-8"><title>Pickup Pass</title>
<style>
  body { font-family: Arial, sans-serif; margin: 0; padding: 24px; color: #1a2b4a; }
  .pass { width: 320px; margin: 0 auto; border: 2px solid #c9a961; border-radius: 16px; padding: 20px; text-align: center; }
  h1 { font-size: 16px; margin: 0 0 4px; } h2 { font-size: 13px; font-weight: normal; margin: 0 0 14px; color: #6b6456; }
  .qr { display: inline-block; padding: 8px; background: #fff; }
  .name { font-size: 16px; font-weight: bold; margin-top: 12px; } .muted { font-size: 12px; color: #6b6456; }
  .note { font-size: 11px; color: #6b6456; margin-top: 12px; border-top: 1px dashed #c9a961; padding-top: 10px; }
</style></head><body>
<div class="pass">
  <h1>Student Pickup Pass</h1><h2>Show this at the school gate</h2>
  <div class="qr">${qrSvg}</div>
  <div class="name">${escapeHtml(p.guardian_name)}</div>
  <div class="muted">${escapeHtml(p.relationship ?? "Guardian")} of ${escapeHtml(p.student_name)}</div>
  <div class="note">Issued ${escapeHtml(issued)}. The guard also checks your face and, if needed, a valid ID.<br>
  If this pass is lost, tell the school office right away so the code can be replaced.</div>
</div>
<script>window.onload = function () { window.print(); };</script>
</body></html>`;
}

export function PickupPassCard({ studentId }: { studentId: string }) {
    const [links, setLinks] = useState<PassLink[] | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        supabase.rpc("office_pickup_pass_links", { p_student_id: studentId }).then(({ data }) => {
            if (!cancelled) setLinks((data ?? []) as PassLink[]);
        });
        return () => { cancelled = true; };
    }, [studentId]);

    const print = async (link: PassLink) => {
        setError("");
        // Opened right away (inside the click) so the browser doesn't block it as a pop-up.
        const win = window.open("", "_blank", "width=420,height=640");
        if (!win) { setError("The print window was blocked. Allow pop-ups for this site and try again."); return; }
        win.document.write("<p style=\"font-family:Arial;padding:24px\">Preparing pass…</p>");
        setBusyId(link.link_id);
        const { data, error: rpcError } = await supabase.rpc("issue_pickup_pass", { p_link_id: link.link_id });
        setBusyId(null);
        if (rpcError || data?.error || !data?.secret) {
            win.close();
            setError(ERRORS[data?.error] ?? "Couldn't prepare the pass. Please try again.");
            return;
        }
        const qrSvg = renderToStaticMarkup(
            <QRCodeSVG value={JSON.stringify({ v: 2, s: data.secret })} size={200} level="M" includeMargin={false} />,
        );
        win.document.open();
        win.document.write(passHtml(data, qrSvg));
        win.document.close();
    };

    return (
        <div className="border-2 border-[#c9a961]/40 rounded-xl p-5 bg-[#fdf9f0]">
            <div className="flex items-center gap-2 mb-1">
                <QrCode className="w-5 h-5 text-[#c9a961]" />
                <h3 className="text-sm font-semibold text-[#1a2b4a]">Printed Pickup Pass</h3>
            </div>
            <p className="text-xs text-[#6b6456] mb-3">
                For guardians without a phone. The pass has the same QR code as their Parent Portal; the guardian is
                notified and the print is logged. If a pass is lost, use Guardian Security → New QR code.
            </p>
            {links === null && <p className="text-sm text-[#8b8476]">Loading guardians…</p>}
            {links?.length === 0 && (
                <p className="text-sm text-[#8b8476]">No guardian is linked to this student yet, so no pass can be printed.</p>
            )}
            <div className="space-y-2">
                {links?.map((l) => (
                    <div key={l.link_id} className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white rounded-lg border border-gray-200">
                        <div>
                            <p className="text-sm font-medium text-[#2c2c2c]">{l.guardian_name}{l.is_primary ? " ★" : ""}</p>
                            <p className="text-xs text-[#8b8476]">{l.relationship ?? "Guardian"}{l.reason ? ` · ${l.reason}` : ""}</p>
                        </div>
                        <button
                            onClick={() => print(l)}
                            disabled={!l.printable || busyId !== null}
                            className="flex items-center gap-1.5 px-3 py-1.5 border-2 border-[#c9a961] text-[#1a2b4a] rounded-lg text-xs font-semibold hover:bg-[#c9a961]/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <Printer className="w-3.5 h-3.5" /> {busyId === l.link_id ? "Preparing…" : "Print pass"}
                        </button>
                    </div>
                ))}
            </div>
            {error && (
                <div className="flex items-start gap-2 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}
        </div>
    );
}
