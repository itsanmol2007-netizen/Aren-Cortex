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
                        Installs as <b className="font-bold text-[#3b4453]">AREN Front Desk</b>, with
                        its own icon — opens full screen, straight onto the queue, and keeps
                        working through a dropped connection.
                    </div>

                    {installable ? (
                        <button
                            type="button"
                            onClick={handleInstall}
                            disabled={busy}
                            className="flex items-center justify-center gap-[8px] rounded-[12px] border border-[rgba(124,92,240,0.28)] bg-[linear-gradient(160deg,#7c5cf0,#2f6bed)] px-[14px] py-[11px] text-[13px] font-extrabold text-white shadow-[0_8px_22px_rgba(70,60,180,0.22)] transition-transform hover:-translate-y-[1px] disabled:opacity-60"
                        >
                            <Download size={15} />
                            {busy ? "Installing…" : "Install Front Desk"}
                        </button>
                    ) : (
                        /* The browser has not offered us a prompt — it fires
                           `beforeinstallprompt` once, early, and only when IT
                           decides the page is eligible. Hiding the card in
                           that case is what made this look missing
                           altogether ("there isn't any PWA installation
                           option on Frontdesk", Anmol, 2026-09-13). The
                           manual route always exists, so say it plainly
                           instead of showing nothing.
                           
                           Deliberately NOT icon-led, bold-header, bordered-
                           box styling — that combination is this app's own
                           visual shorthand for "a control", and the address-
                           bar icon it describes lives in the BROWSER, not on
                           this card. "that install icon is not clickable"
                           (Anmol, 2026-09-13) was this box reading as a
                           button when it is a plain instruction. Quiet
                           paragraph text only, no icon, no border mimicking
                           an actionable row. */
                        <p className="m-0 text-[12.5px] leading-[1.6] text-[#5a6472]">
                            Your browser hasn&rsquo;t offered an install prompt yet. Look for an
                            install icon at the right of the address bar, or open the browser menu
                            (⋮) and choose <b className="font-semibold text-[#3b4453]">Install page as app</b> (Chrome or Edge).
                            Already installed AREN as Cortex here? Installing again from this page
                            still gets Front Desk its own separate app and icon.
                        </p>
                    )}

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
