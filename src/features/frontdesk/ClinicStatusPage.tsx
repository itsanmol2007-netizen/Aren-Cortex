import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { HOSPITAL_ID } from "@/lib/db";
import { WorkspaceShell } from "./components/WorkspaceShell";
import { ClinicStatusSummary } from "./components/clinicstatus/ClinicStatusSummary";
import { ClinicStatusDetailed } from "./components/clinicstatus/ClinicStatusDetailed";
import { ServiceDetailModal } from "./components/clinicstatus/ServiceDetailModal";
import { LogoutConfirmModal } from "./components/clinicstatus/LogoutConfirmModal";
import { buildClinicStatus, readDemoState, type Service } from "./clinicStatus/model";
import { useQueue } from "./hooks/useQueue";
import { useOnline } from "./operational/useOnline";
import { useAuth } from "../auth/AuthProvider";
import { I18nProvider, useT } from "./i18n/i18n";

// Clinic Status — the operational assistant (formerly "Settings" in the rail).
// Three progressively deeper layers live here: Level 1 (the calm summary),
// Level 2 (the detailed system view), and Level 3 (per-service detail, a
// modal). The receptionist should almost never need to leave Level 1.

export function ClinicStatusPage() {
    return (
        <I18nProvider>
            <ClinicStatusInner />
        </I18nProvider>
    );
}

type View = "summary" | "detailed";

function ClinicStatusInner() {
    const t = useT();
    const location = useLocation();
    const auth = useAuth();

    const demo = useMemo(() => readDemoState(location.search), [location.search]);
    const online = useOnline();
    // The Health Registry snapshot — real connectivity drives it; ?demo only
    // simulates the signals we have no live probe for yet (the printer).
    const status = useMemo(() => buildClinicStatus({ demo, online }), [demo, online]);

    // A slow tick keeps "last checked" and the event clock honest without
    // touching the queue's own 25s poll.
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 30_000);
        return () => clearInterval(id);
    }, []);

    // Today's registered-patient count — the one real number on Level 1.
    const { visits } = useQueue(HOSPITAL_ID);
    const registeredToday = useMemo(() => visits.filter((v) => v.status !== "discarded").length, [visits]);

    const identity = auth.status === "authed" ? auth.identity : null;
    const operatorName = identity?.user.full_name?.trim() || t("navUser");
    const clinicName = identity?.hospital.name?.trim() || t("csClinicLabel");

    const [view, setView] = useState<View>("summary");
    const [openService, setOpenService] = useState<Service | null>(null);
    const [logoutOpen, setLogoutOpen] = useState(false);

    return (
        <WorkspaceShell>
            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto w-full max-w-[1240px] px-6 pb-9 pt-5">
                    {view === "summary" ? (
                        <>
                            <div className="mb-4">
                                <h1 className="m-0 font-[Manrope,sans-serif] text-[22px] font-extrabold leading-[1.15] tracking-[-0.01em] text-[#161d29]">
                                    {t("csTitle")}
                                </h1>
                                <p className="m-0 mt-[3px] text-[13px] font-medium text-[#8a91a0]">{t("csSub")}</p>
                            </div>
                            <ClinicStatusSummary
                                status={status}
                                operatorName={operatorName}
                                clinicName={clinicName}
                                registeredToday={registeredToday}
                                onOpenDetails={() => setView("detailed")}
                                onLogout={() => setLogoutOpen(true)}
                            />
                        </>
                    ) : (
                        <ClinicStatusDetailed
                            status={status}
                            now={now}
                            onBack={() => setView("summary")}
                            onOpenService={(s) => setOpenService(s)}
                        />
                    )}
                </div>
            </div>

            {openService && <ServiceDetailModal service={openService} onClose={() => setOpenService(null)} />}
            {logoutOpen && <LogoutConfirmModal onClose={() => setLogoutOpen(false)} />}
        </WorkspaceShell>
    );
}
