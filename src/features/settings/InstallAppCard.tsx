// ---------------------------------------------------------------------------
// Settings' "Install App" card — sits right beside AppLockCard, same
// SettingsCard treatment (description strip, gradient CTA, status row) so
// the two read as one family of "make this device yours" settings rather
// than one being a real setting and the other a banner bolted on.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { CheckCircle2, Download, Share } from "lucide-react";
import { SettingsCard } from "./SettingsPage";
import { useInstallPrompt } from "../../hooks/useInstallPrompt";

export function InstallAppCard() {
    const { installable, installed, isIOSSafari, promptInstall } = useInstallPrompt();
    const [busy, setBusy] = useState(false);
    const [declined, setDeclined] = useState(false);

    const handleInstall = async () => {
        setBusy(true);
        try {
            const outcome = await promptInstall();
            if (outcome === "dismissed") setDeclined(true);
        } finally {
            setBusy(false);
        }
    };

    return (
        <SettingsCard
            id="set-card-install-app"
            icon={<Download size={17} />}
            tint="bg-[rgba(18,104,232,0.10)] text-[var(--cs-blue)]"
            title="Install App"
        >
            {installed ? (
                <div className="flex items-center gap-[8px] rounded-[10px] border border-[var(--cs-line)] px-[12px] py-[10px] text-[12.5px] font-semibold text-[var(--cs-ink)]">
                    <CheckCircle2 size={15} className="text-[#16a34a]" /> Already installed on this device
                </div>
            ) : isIOSSafari ? (
                <div className="flex flex-col gap-[10px]">
                    <p className="m-0 rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[12px] py-[9px] text-[12px] leading-[1.5] text-[var(--cs-muted)]">
                        iPhone and iPad don't let an app offer its own install
                        button — add Cortex to your Home Screen instead, and
                        it opens full-screen from there like any other app.
                    </p>
                    <ol className="m-0 flex flex-col gap-[5px] pl-[18px] text-[12px] leading-[1.5] text-[var(--cs-faint)]">
                        <li>
                            Tap <Share size={12} className="inline -translate-y-[1px]" />{" "}
                            <span className="font-semibold text-[var(--cs-ink)]">Share</span> in Safari's toolbar
                        </li>
                        <li>
                            Choose <span className="font-semibold text-[var(--cs-ink)]">Add to Home Screen</span>
                        </li>
                        <li>
                            Tap <span className="font-semibold text-[var(--cs-ink)]">Add</span>
                        </li>
                    </ol>
                </div>
            ) : installable ? (
                <div className="flex flex-col gap-[10px]">
                    <p className="m-0 rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[12px] py-[9px] text-[12px] leading-[1.5] text-[var(--cs-muted)]">
                        Install Cortex on this device — opens full-screen from
                        your home screen or taskbar, and keeps working with
                        whatever's already been saved for offline use.
                    </p>
                    {declined && (
                        <span className="text-[11.5px] font-semibold text-[var(--cs-faint)]">
                            Not installed — you can try again any time.
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={() => void handleInstall()}
                        disabled={busy}
                        className="flex h-[38px] w-fit cursor-pointer items-center gap-[8px] rounded-[10px] border-0 bg-gradient-to-br from-[#60a5fa] to-[#2563eb] px-[16px] text-[12.5px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                        <Download size={14} /> Install app
                    </button>
                </div>
            ) : (
                <p className="m-0 rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[12px] py-[9px] text-[12px] leading-[1.5] text-[var(--cs-muted)]">
                    Not offered by this browser yet — look for an install icon
                    in the address bar, or open Cortex here a few more times
                    first.
                </p>
            )}
        </SettingsCard>
    );
}
