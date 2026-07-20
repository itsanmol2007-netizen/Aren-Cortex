import { useState } from "react";
import { LogOut, Loader2 } from "lucide-react";
import { ModalShell } from "../ModalShell";
import { useT } from "../../i18n/i18n";
import { useLogout } from "../../../auth/useLogout";

// Ending a session is deliberate and reversible only by signing back in, so it
// always passes through this confirmation — never a one-click exit. Lives here
// (inside Clinic Status) rather than in the nav rail, so logging out is a
// considered act, not a stray click.

export function LogoutConfirmModal({ onClose }: { onClose: () => void }) {
    const t = useT();
    const logout = useLogout();
    const [busy, setBusy] = useState(false);

    const confirm = async () => {
        if (busy) return;
        setBusy(true);
        try {
            await logout();
        } catch {
            setBusy(false); // stay on the page if sign-out failed; guards still hold
        }
    };

    return (
        <ModalShell
            eyebrow={t("csLogoutEyebrow")}
            title={t("csLogoutTitle")}
            icon={<LogOut size={19} />}
            onClose={busy ? () => {} : onClose}
            maxWidth={460}
            footer={
                <>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        className="h-[38px] rounded-[10px] border border-[#e7e4f2] bg-white px-[15px] text-[13px] font-semibold text-[#5a6472] transition-colors hover:bg-[#f7f6fc] hover:text-[#3b4453] disabled:opacity-60"
                    >
                        {t("csLogoutCancel")}
                    </button>
                    <button
                        type="button"
                        onClick={confirm}
                        disabled={busy}
                        className="flex h-[38px] items-center gap-[7px] rounded-[10px] bg-[#d23b34] px-[16px] text-[13px] font-bold text-white shadow-[0_3px_12px_rgba(210,59,52,0.28)] transition-transform hover:scale-[1.015] disabled:opacity-70"
                    >
                        {busy && <Loader2 size={15} className="animate-spin" />}
                        {t("csLogoutConfirm")}
                    </button>
                </>
            }
        >
            <p className="m-0 text-[13.5px] leading-[1.6] text-[#3b4453]">{t("csLogoutBody")}</p>
        </ModalShell>
    );
}
