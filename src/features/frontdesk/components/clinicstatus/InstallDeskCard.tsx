// ---------------------------------------------------------------------------
// "Install Front Desk" — the receptionist's own way onto the dock.
//
// Cortex has had this in Settings since the install prompt was built, but a
// receptionist never sees Settings: the only route in was to sign in as a
// doctor, install, then sign back out — "add option to install PWA into the
// clinic status page of front desk also, so from there we can do this
// thing" (Anmol, 2026-09-13).
//
// Installed from HERE, the install carries Front Desk's own identity: the
// page is already advertising `manifest-frontdesk.webmanifest` by the time
// a receptionist can see this card (see `lib/pwa/appIdentity.ts`), so the
// app that lands on the dock is named "AREN Front Desk", wears the light
// mark, and opens straight onto the queue.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { CheckCircle2, Download, Share } from "lucide-react";
import { useInstallPrompt } from "../../../../hooks/useInstallPrompt";

export function InstallDeskCard() {
    const { installable, installed, isIOSSafari, promptInstall } = useInstallPrompt();
    const [busy, setBusy] = useState(false);
    const [declined, setDeclined] = useState(false);

    // Nothing to offer and nothing to report: no browser support, already
    // dismissed at the OS level, or not a PWA-capable context at all. A card
    // that can only say "you can't" is worse than no card.
    if (!installed && !installable && !isIOSSafari) return null;

    const handleInstall = async () => {
        setBusy(true);
        try {
            if ((await promptInstall()) === "dismissed") setDeclined(true);
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="rounded-[18px] border border-[#ecebf3] bg-white p-[18px] shadow-[0_2px_14px_rgba(18,20,45,0.04)]">
            <div className="mb-[13px] text-[10.5px] font-extrabold uppercase tracking-[0.09em] text-[#8b5cf6]">
                This device
            </div>

            {installed ? (
                <div className="flex items-center gap-[8px] text-[12.5px] font-semibold text-[#161d29]">
                    <CheckCircle2 size={15} className="text-[#1c7a45]" />
                    Front Desk is installed on this device
                </div>
            ) : isIOSSafari ? (
                <div className="flex flex-col gap-[8px]">
                    <div className="text-[12.5px] leading-[1.55] text-[#5a6472]">
                        Add Front Desk to this device from Safari&rsquo;s share menu.
                    </div>
                    <div className="flex items-center gap-[7px] text-[12.5px] font-semibold text-[#3b4453]">
                        <Share size={14} /> Share → Add to Home Screen
                    </div>
                </div>
            ) : (
                <div className="flex flex-col gap-[11px]">
                    <div className="text-[12.5px] leading-[1.55] text-[#5a6472]">
                        Open Front Desk from the dock like any other app — full screen, and
                        it keeps working through a dropped connection.
                    </div>
                    <button
                        type="button"
                        onClick={handleInstall}
                        disabled={busy}
                        className="flex items-center justify-center gap-[8px] rounded-[12px] border border-[rgba(124,92,240,0.28)] bg-[linear-gradient(160deg,#7c5cf0,#2f6bed)] px-[14px] py-[11px] text-[13px] font-extrabold text-white shadow-[0_8px_22px_rgba(70,60,180,0.22)] transition-transform hover:-translate-y-[1px] disabled:opacity-60"
                    >
                        <Download size={15} />
                        {busy ? "Installing…" : "Install Front Desk"}
                    </button>
                    {declined && (
                        <div className="text-[11.5px] leading-[1.5] text-[#8a91a0]">
                            No problem — it stays here whenever you want it.
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
