import { toast } from "sonner";
import {
    ChevronLeft,
    ChevronRight,
    ClipboardCopy,
    LayoutGrid,
    AlertTriangle,
    Activity,
    Clock3,
    CheckCircle2,
    LifeBuoy,
    type LucideIcon,
} from "lucide-react";
import { useT } from "../../i18n/i18n";
import { useEventLog } from "../../operational/eventLog";
import { StateChip, STATE_META } from "./shared";
import { StatusIllustration } from "./StatusIllustration";
import type { ClinicStatus, Service } from "../../clinicStatus/model";

// Level 2 — the detailed system view. Still calm, still translated, but now
// exhaustive: every service, grouped by weight (Core Operations carry the
// clinic; Supporting Services merely help), with current issues and recent
// events beside them. Information architecture over table: Core reads as a
// grid of substantial cards, Supporting as a light list — the hierarchy is
// visible before a single word is read.

export function ClinicStatusDetailed({
    status,
    now,
    onBack,
    onOpenService,
}: {
    status: ClinicStatus;
    now: Date;
    onBack: () => void;
    onOpenService: (s: Service) => void;
}) {
    const t = useT();
    const lastCheck = now.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
    const lastCheckDate = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

    const copyAll = async () => {
        const blob = [
            "AREN Clinic Status — diagnostics",
            `generated: ${new Date().toISOString()}`,
            `overall: ${status.overall}`,
            "",
            ...status.services.map((s) => `[${s.state}] ${s.id} — ${s.diagnostics}`),
        ].join("\n");
        try {
            await navigator.clipboard.writeText(blob);
            toast.success(t("csDiagnosticsCopied"));
        } catch {
            /* clipboard blocked — non-fatal */
        }
    };

    return (
        <div className="aren-rise flex flex-col gap-[16px]">
            {/* Breadcrumb + heading + copy diagnostics */}
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <button
                        type="button"
                        onClick={onBack}
                        className="mb-[7px] flex items-center gap-[5px] text-[12.5px] font-semibold text-[#8a91a0] transition-colors hover:text-[#5a6472]"
                    >
                        <ChevronLeft size={15} />
                        {t("csTitle")}
                        <ChevronRight size={13} className="text-[#c4c9d3]" />
                        <span className="text-[#5a6472]">{t("csDetailedCrumb")}</span>
                    </button>
                    <h1 className="m-0 font-[Manrope,sans-serif] text-[23px] font-extrabold leading-[1.14] tracking-[-0.015em] text-[#161d29]">
                        {t("csTitle")} — {t("csDetailedCrumb")}
                    </h1>
                    <p className="m-0 mt-[3px] text-[13px] font-medium text-[#8a91a0]">{t("csDetailedSub")}</p>
                </div>
                <button
                    type="button"
                    onClick={copyAll}
                    className="flex h-[38px] items-center gap-[7px] rounded-[10px] border border-[#e7e4f2] bg-white px-[14px] text-[13px] font-semibold text-[#5a6472] shadow-[0_1px_3px_rgba(18,20,45,0.04)] transition-colors hover:bg-[#f7f6fc] hover:text-[#3b4453]"
                >
                    <ClipboardCopy size={15} /> {t("csCopyDiagnostics")}
                </button>
            </div>

            {/* Summary tiles */}
            <div className="grid grid-cols-4 gap-[12px] max-[900px]:grid-cols-2">
                <Tile
                    icon={LayoutGrid}
                    tint="#7c5cf0"
                    label={t("csTileCore")}
                    value={t("csOfCount", { n: String(status.coreOperational), m: String(status.coreTotal) })}
                    sub={t("csOperationalWord")}
                    subColor={status.coreOperational === status.coreTotal ? "#1c7a45" : "#b06f14"}
                />
                <Tile
                    icon={AlertTriangle}
                    tint={status.attentionCount ? "#c0771a" : "#27a35f"}
                    label={t("csTileAttention")}
                    value={String(status.attentionCount)}
                    sub={status.attentionCount ? t("csStateAttention") : t("csNoneWord")}
                    subColor={status.attentionCount ? "#b06f14" : "#1c7a45"}
                />
                <Tile
                    icon={Activity}
                    tint="#2f6bed"
                    label={t("csTileOnline")}
                    value={t("csOfCount", { n: String(status.servicesOnline), m: String(status.servicesTotal) })}
                    sub={t("csOnlinePct", { n: String(status.onlinePct) })}
                    subColor="#1d51c9"
                />
                <Tile
                    icon={Clock3}
                    tint="#8a91a0"
                    label={t("csTileLastCheck")}
                    value={lastCheck}
                    sub={lastCheckDate}
                    subColor="#8a91a0"
                />
            </div>

            {/* Main split: services (weighted) · issues + events + support */}
            <div className="grid grid-cols-[minmax(0,1fr)_356px] items-start gap-[16px] max-[1080px]:grid-cols-1">
                <div className="flex flex-col gap-[18px]">
                    {/* Core Operations — the heavy group */}
                    <Group
                        title={t("csCoreOps")}
                        sub={t("csCoreOpsSub")}
                        weight="core"
                        aside={
                            <span
                                className="inline-flex items-center gap-[6px] whitespace-nowrap rounded-full px-[11px] py-[5px] text-[11.5px] font-bold"
                                style={
                                    status.coreOperational === status.coreTotal
                                        ? { background: "rgba(39,163,95,0.10)", color: "#1c7a45", border: "1px solid rgba(39,163,95,0.24)" }
                                        : { background: "rgba(201,121,26,0.11)", color: "#b06f14", border: "1px solid rgba(201,121,26,0.26)" }
                                }
                            >
                                {t("csOfCount", { n: String(status.coreOperational), m: String(status.coreTotal) })}{" "}
                                {t("csOperationalWord").toLowerCase()}
                            </span>
                        }
                    >
                        <div className="grid grid-cols-2 gap-[12px] max-[560px]:grid-cols-1">
                            {status.core.map((s) => (
                                <CoreCard key={s.id} service={s} onOpen={() => onOpenService(s)} />
                            ))}
                        </div>
                    </Group>

                    {/* Supporting Services — the light group */}
                    <Group title={t("csSupporting")} sub={t("csSupportingSub")} weight="support">
                        <div className="grid grid-cols-2 gap-x-[22px] max-[620px]:grid-cols-1">
                            {status.supporting.map((s, i) => (
                                <SupportRow
                                    key={s.id}
                                    service={s}
                                    last={i >= status.supporting.length - 2}
                                    onOpen={() => onOpenService(s)}
                                />
                            ))}
                        </div>
                    </Group>
                </div>

                {/* Right rail */}
                <div className="flex flex-col gap-[16px]">
                    <IssuesPanel status={status} onOpenService={onOpenService} />
                    <EventsPanel now={now} />
                    <div className="flex items-start gap-[10px] rounded-[16px] border border-[#e9ecf4] bg-[#f7f8fb] px-[15px] py-[13px]">
                        <LifeBuoy size={16} className="mt-[2px] shrink-0 text-[#8b84c0]" />
                        <div>
                            <p className="m-0 text-[12.5px] leading-[1.5] text-[#6b7280]">{t("csSupportLine")}</p>
                            <button
                                type="button"
                                className="mt-[9px] flex h-[32px] items-center gap-[6px] rounded-[9px] border border-[#e0e3ec] bg-white px-[12px] text-[12.5px] font-semibold text-[#3b4453] transition-colors hover:bg-[#f5f6f9]"
                            >
                                <LifeBuoy size={13} /> {t("csContactSupport")}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Summary tile ────────────────────────────────────────────────────────────
function Tile({
    icon: Icon,
    tint,
    label,
    value,
    sub,
    subColor,
}: {
    icon: LucideIcon;
    tint: string;
    label: string;
    value: string;
    sub: string;
    subColor: string;
}) {
    return (
        <div className="rounded-[15px] border border-[#ecebf3] bg-white px-[16px] py-[14px] shadow-[0_2px_12px_rgba(18,20,45,0.04)]">
            <div className="flex items-center gap-[9px]">
                <span
                    className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px]"
                    style={{ background: `${tint}1a` }}
                >
                    <Icon size={16} style={{ color: tint }} />
                </span>
                <span className="text-[11.5px] font-semibold leading-[1.2] text-[#8a91a0]">{label}</span>
            </div>
            <div className="mt-[10px] font-[Manrope,sans-serif] text-[22px] font-extrabold leading-[1.05] tracking-[-0.02em] text-[#161d29]">
                {value}
            </div>
            <div className="mt-[3px] text-[12px] font-semibold" style={{ color: subColor }}>
                {sub}
            </div>
        </div>
    );
}

// ── Group wrapper — the visible weight difference lives here ─────────────────
// Core is a substantial, softly-lit panel with a real Manrope title and a
// gradient spine; Supporting is a quiet, near-flat region under a small
// uppercase label. The hierarchy is legible before a single service is read.
function Group({
    title,
    sub,
    weight,
    aside,
    children,
}: {
    title: string;
    sub: string;
    weight: "core" | "support";
    aside?: React.ReactNode;
    children: React.ReactNode;
}) {
    const heavy = weight === "core";
    return (
        <section
            className={
                heavy
                    ? "rounded-[20px] border border-[#e6e3f4] bg-[linear-gradient(180deg,#fcfbff_0%,#ffffff_60%)] p-[20px] shadow-[0_4px_24px_rgba(18,20,45,0.06)]"
                    : "rounded-[18px] border border-[#eef0f5] bg-[#fbfbfd] px-[18px] pb-[6px] pt-[15px]"
            }
        >
            <div className={`flex items-center justify-between gap-3 ${heavy ? "mb-[16px]" : "mb-[6px]"}`}>
                <div className="flex items-center gap-[12px]">
                    {heavy && <span className="h-[30px] w-[4px] rounded-full bg-[linear-gradient(180deg,#a855f7,#6366f1)]" />}
                    <div>
                        {heavy ? (
                            <div className="font-[Manrope,sans-serif] text-[16.5px] font-extrabold leading-[1.14] tracking-[-0.015em] text-[#161d29]">
                                {title}
                            </div>
                        ) : (
                            <div className="text-[11.5px] font-extrabold uppercase tracking-[0.1em] text-[#9aa0ad]">
                                {title}
                            </div>
                        )}
                        <div className={`mt-[2px] font-medium text-[#a3aab8] ${heavy ? "text-[12.5px]" : "text-[11.5px]"}`}>
                            {sub}
                        </div>
                    </div>
                </div>
                {aside}
            </div>
            {children}
        </section>
    );
}

// ── Core service card (prominent) ───────────────────────────────────────────
// Weight comes from elevation, a filled status tile, a thick status spine and
// a bold name — not from size.
function CoreCard({ service, onOpen }: { service: Service; onOpen: () => void }) {
    const t = useT();
    const meta = STATE_META[service.state];
    const Icon = service.icon;
    return (
        <button
            type="button"
            onClick={onOpen}
            className="group relative flex flex-col overflow-hidden rounded-[15px] border border-[#eceef4] bg-white p-[15px] pl-[17px] text-left shadow-[0_2px_10px_rgba(18,20,45,0.05)] transition-all hover:-translate-y-[2px] hover:border-[#e0dcf3] hover:shadow-[0_10px_26px_rgba(18,20,45,0.10)]"
        >
            <span className="absolute inset-y-0 left-0 w-[4px]" style={{ background: meta.dot }} />
            <div className="flex items-start justify-between gap-2">
                <span
                    className="flex h-[38px] w-[38px] items-center justify-center rounded-[12px]"
                    style={{ background: meta.softBg, boxShadow: `inset 0 0 0 1px ${meta.border}` }}
                >
                    <Icon size={19} style={{ color: meta.dot }} />
                </span>
                <StateChip state={service.state} />
            </div>
            <div className="mt-[12px] text-[14.5px] font-extrabold leading-[1.2] tracking-[-0.01em] text-[#161d29]">
                {t(service.nameKey)}
            </div>
            <div className="mt-[2px] text-[12px] font-medium text-[#8a91a0]">{t(service.descKey)}</div>
            <div className="mt-[12px] flex items-center justify-between border-t border-[#f0f1f5] pt-[10px]">
                <span className="text-[12px] font-bold" style={{ color: meta.text }}>
                    {metricText(t, service)}
                </span>
                <ChevronRight
                    size={15}
                    className="text-[#c4c9d3] transition-transform group-hover:translate-x-[3px] group-hover:text-[#8b84c0]"
                />
            </div>
        </button>
    );
}

// ── Supporting service row (light) ──────────────────────────────────────────
// Deliberately flat and quiet: no card, no elevation, a plain muted icon, a
// hairline divider. Reads as clearly secondary next to the Core panel.
function SupportRow({ service, last, onOpen }: { service: Service; last: boolean; onOpen: () => void }) {
    const t = useT();
    const meta = STATE_META[service.state];
    const Icon = service.icon;
    return (
        <button
            type="button"
            onClick={onOpen}
            className={`group flex items-center gap-[12px] py-[13px] text-left transition-colors hover:bg-white ${
                last ? "" : "border-b border-[#eef0f5]"
            }`}
        >
            <span
                className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-white"
                style={{ boxShadow: "inset 0 0 0 1px #ecedf3" }}
            >
                <Icon size={15} style={{ color: meta.dot }} />
            </span>
            <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold leading-[1.2] text-[#3b4453]">{t(service.nameKey)}</div>
                <div className="truncate text-[11.5px] font-medium text-[#a8aeba]">{t(service.descKey)}</div>
            </div>
            <StateChip state={service.state} />
            <ChevronRight
                size={14}
                className="shrink-0 text-[#cdd2dc] transition-transform group-hover:translate-x-[2px] group-hover:text-[#8b84c0]"
            />
        </button>
    );
}

// ── Current issues (right rail) ─────────────────────────────────────────────
function IssuesPanel({
    status,
    onOpenService,
}: {
    status: ClinicStatus;
    onOpenService: (s: Service) => void;
}) {
    const t = useT();
    if (status.issues.length === 0) {
        return (
            <section className="overflow-hidden rounded-[16px] border border-[rgba(39,163,95,0.24)] bg-[linear-gradient(180deg,rgba(39,163,95,0.06),rgba(39,163,95,0.02))] p-[16px]">
                <div className="flex items-center gap-[10px]">
                    <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[rgba(39,163,95,0.12)]">
                        <CheckCircle2 size={19} className="text-[#27a35f]" />
                    </span>
                    <div>
                        <div className="text-[13.5px] font-bold text-[#1c7a45]">{t("csIssuesNone")}</div>
                        <div className="text-[12px] font-medium text-[#5a8a6c]">{t("csIssuesNoneBody")}</div>
                    </div>
                </div>
                {/* Fills the rail with the operational language rather than empty
                    white — the same integrity motif, at rest. */}
                <div className="pointer-events-none flex justify-center pb-1 pt-2">
                    <StatusIllustration state="healthy" className="h-auto w-full max-w-[248px]" />
                </div>
            </section>
        );
    }
    return (
        <section className="rounded-[16px] border border-[#ecebf3] bg-white p-[16px] shadow-[0_2px_12px_rgba(18,20,45,0.04)]">
            <div className="mb-[12px] flex items-center gap-[8px]">
                <div className="text-[10.5px] font-extrabold uppercase tracking-[0.09em] text-[#b06f14]">
                    {t("csIssuesTitle")}
                </div>
                <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[rgba(201,121,26,0.14)] px-[5px] text-[11px] font-bold text-[#b06f14]">
                    {status.issues.length}
                </span>
            </div>
            <div className="flex flex-col gap-[12px]">
                {status.issues.map((s) => {
                    const meta = STATE_META[s.state];
                    const Icon = s.icon;
                    return (
                        <div
                            key={s.id}
                            className="rounded-[13px] border p-[13px]"
                            style={{ borderColor: meta.border, background: meta.softBg }}
                        >
                            <div className="flex items-center gap-[9px]">
                                <span
                                    className="flex h-[28px] w-[28px] items-center justify-center rounded-[9px]"
                                    style={{ background: "#fff" }}
                                >
                                    <Icon size={15} style={{ color: meta.dot }} />
                                </span>
                                <div className="min-w-0 flex-1 text-[13px] font-bold text-[#2b3242]">{t(s.nameKey)}</div>
                                <StateChip state={s.state} />
                            </div>
                            <p className="m-0 mt-[9px] text-[12.5px] leading-[1.5] text-[#5a6472]">{t(s.impactKey)}</p>
                            {s.recoveryKeys.length > 0 && (
                                <div className="mt-[10px]">
                                    <div className="mb-[5px] text-[10px] font-extrabold uppercase tracking-[0.07em] text-[#a3aab8]">
                                        {t("csWhatToDo")}
                                    </div>
                                    <ul className="m-0 flex list-none flex-col gap-[4px] p-0">
                                        {s.recoveryKeys.map((k) => (
                                            <li key={k} className="flex items-start gap-[7px] text-[12px] text-[#5a6472]">
                                                <span
                                                    className="mt-[6px] h-[4px] w-[4px] shrink-0 rounded-full"
                                                    style={{ background: meta.dot }}
                                                />
                                                {t(k)}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={() => onOpenService(s)}
                                className="mt-[11px] flex h-[32px] w-full items-center justify-center gap-[6px] rounded-[9px] bg-white text-[12.5px] font-bold text-[#5a4bd0] shadow-[0_1px_3px_rgba(18,20,45,0.06)] transition-colors hover:bg-[#faf9ff]"
                                style={{ border: `1px solid ${meta.border}` }}
                            >
                                {t("csDetailEyebrow")}
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

// ── Recent system events (right rail) ───────────────────────────────────────
// Reads the REAL local event log (what actually happened on this computer),
// not decorative placeholders. Empty until something worth noting occurs.
function EventsPanel({ now }: { now: Date }) {
    const t = useT();
    const events = useEventLog();
    const shown = events.slice(0, 8);

    return (
        <section className="rounded-[16px] border border-[#ecebf3] bg-white p-[16px] shadow-[0_2px_12px_rgba(18,20,45,0.04)]">
            <div className="mb-[12px] text-[10.5px] font-extrabold uppercase tracking-[0.09em] text-[#8b5cf6]">
                {t("csTimelineTitle")}
            </div>
            {shown.length === 0 ? (
                <p className="m-0 py-[6px] text-[12.5px] font-medium text-[#a8aeba]">{t("csTimelineEmpty")}</p>
            ) : (
                <div className="relative flex flex-col">
                    {shown.map((ev, i) => {
                        const at = new Date(ev.at);
                        const sameDay = at.toDateString() === now.toDateString();
                        const time = at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
                        const stamp = sameDay
                            ? time
                            : `${at.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} · ${time}`;
                        const dotColor = ev.tone === "warn" ? "#d38a2c" : "#27a35f";
                        const last = i === shown.length - 1;
                        return (
                            <div key={ev.id} className="flex gap-[11px]">
                                <div className="flex flex-col items-center">
                                    <span
                                        className="mt-[3px] h-[9px] w-[9px] shrink-0 rounded-full ring-2 ring-white"
                                        style={{ background: dotColor }}
                                    />
                                    {!last && <span className="w-[2px] flex-1 bg-[#eef0f5]" />}
                                </div>
                                <div className={`min-w-0 flex-1 ${last ? "pb-0" : "pb-[13px]"}`}>
                                    <div className="text-[12.5px] font-semibold leading-[1.3] text-[#3b4453]">
                                        {t(ev.key)}
                                    </div>
                                    <div className="mt-[1px] text-[11px] font-medium tabular-nums text-[#a3aab8]">{stamp}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}

// Resolve a service's metric line ("Response 120 ms" / "Uptime 100%" / "Printer
// offline"), interpolating the value into its «v» slot where one exists.
function metricText(t: ReturnType<typeof useT>, s: Service): string {
    return s.metricValue ? t(s.metricKey, { v: s.metricValue }) : t(s.metricKey);
}
