import { useMemo, useRef, useState } from "react";
import { ChevronRight, Search, SearchX, UsersRound, X } from "lucide-react";
import type { DBDoctor, PatientDirectoryEntry } from "@/lib/db";
import { formatArchiveDate, initials } from "../../utils";
import { useT } from "../../i18n/i18n";
import { DawnArcs } from "../DawnArcs";

type SortMode = "recent" | "name";

type Props = {
    entries: PatientDirectoryEntry[];
    loading: boolean;
    failed: boolean;
    onRetry: () => void;
    doctors: DBDoctor[];
    selectedId: string | null;
    onSelect: (patient: PatientDirectoryEntry) => void;
};

// The Patient Browser (left workspace): find the right patient in seconds.
// Search over name / phone / IDs, two honest filters, one sort toggle, and a
// list that scrolls inside the panel — the page itself never grows. No
// pagination: continuous searching, not browsing.
export function PatientBrowser({ entries, loading, failed, onRetry, doctors, selectedId, onSelect }: Props) {
    const t = useT();
    const [query, setQuery] = useState("");
    const [gender, setGender] = useState("");
    const [doctorId, setDoctorId] = useState("");
    const [sort, setSort] = useState<SortMode>("recent");
    const listRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        const rows = entries.filter((p) => {
            if (gender && p.gender !== gender) return false;
            if (doctorId && p.primary_doctor_id !== doctorId) return false;
            if (!q) return true;
            // UHID-style lookups stay possible (abha / row id) without ever
            // showing those identifiers in the UI.
            return (
                p.name.toLowerCase().includes(q) ||
                p.phone.includes(q) ||
                (p.abha_id ?? "").toLowerCase().includes(q) ||
                p.id.toLowerCase().startsWith(q)
            );
        });
        const byRecent = (a: PatientDirectoryEntry, b: PatientDirectoryEntry) => {
            const av = a.last_visit_at ? new Date(a.last_visit_at).getTime() : 0;
            const bv = b.last_visit_at ? new Date(b.last_visit_at).getTime() : 0;
            return bv - av || a.name.localeCompare(b.name);
        };
        return rows.sort(sort === "recent" ? byRecent : (a, b) => a.name.localeCompare(b.name));
    }, [entries, query, gender, doctorId, sort]);

    // Keyboard path: ↓ from the search box drops into the list; ↑/↓ walk it;
    // Enter (native button) opens. One continuous hand-off, no mouse needed.
    const focusRow = (index: number) => {
        const rows = listRef.current?.querySelectorAll<HTMLButtonElement>("[data-patient-row]");
        rows?.[Math.max(0, Math.min(index, (rows?.length ?? 1) - 1))]?.focus();
    };

    const onListKeyDown = (e: React.KeyboardEvent) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        const rows = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("[data-patient-row]") ?? [])];
        const idx = rows.findIndex((r) => r === document.activeElement);
        if (idx === -1) return;
        e.preventDefault();
        if (e.key === "ArrowUp" && idx === 0) { searchRef.current?.focus(); return; }
        focusRow(idx + (e.key === "ArrowDown" ? 1 : -1));
    };

    const noneAtAll = !loading && !failed && entries.length === 0;
    const noMatch = !loading && !failed && entries.length > 0 && filtered.length === 0;

    return (
        <section
            aria-label={t("patientsTitle")}
            className="flex min-h-0 flex-col overflow-hidden rounded-[16px] border border-[#e7e9f0] bg-white shadow-[0_1px_2px_rgba(20,30,50,0.05)] max-[1040px]:max-h-[420px]"
        >
            {/* Search — present but calm (she already knows why she's here). */}
            <div className="px-4 pb-3 pt-4">
                <div className="flex h-11 items-center gap-[9px] rounded-[11px] border-[1.5px] border-[#e9e7f4] bg-[#f8f8fd] px-3 transition-[border-color,box-shadow,background-color] duration-150 focus-within:border-[#7c5cf0] focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(99,102,241,0.22)]">
                    <Search size={15.5} className="shrink-0 text-[#8a91a0]" />
                    <input
                        ref={searchRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); focusRow(0); } }}
                        placeholder={t("patientsSearchPh")}
                        className="fd-bare"
                        aria-label={t("patientsSearchPh")}
                    />
                    {query && (
                        <button
                            type="button"
                            onClick={() => { setQuery(""); searchRef.current?.focus(); }}
                            aria-label={t("cancel")}
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-[#a8aeba] transition-colors hover:bg-[#eef0f5] hover:text-[#5a6472]"
                        >
                            <X size={13} />
                        </button>
                    )}
                </div>

                {/* Lightweight filters — realistic reception workflows only. */}
                <div className="mt-[10px] flex items-center gap-2">
                    <select value={gender} onChange={(e) => setGender(e.target.value)} className="fd-field-sm" aria-label={t("filterAllGenders")} style={{ width: "auto", flex: "1 1 0" }}>
                        <option value="">{t("filterAllGenders")}</option>
                        <option value="Male">{t("male")}</option>
                        <option value="Female">{t("female")}</option>
                        <option value="Other">{t("other")}</option>
                    </select>
                    <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="fd-field-sm" aria-label={t("filterAllDoctors")} style={{ width: "auto", flex: "1 1 0" }}>
                        <option value="">{t("filterAllDoctors")}</option>
                        {doctors.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                    <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)} className="fd-field-sm" aria-label={t("sortRecent")} style={{ width: "auto", flex: "1 1 0" }}>
                        <option value="recent">{t("sortRecent")}</option>
                        <option value="name">{t("sortName")}</option>
                    </select>
                </div>
            </div>

            {/* Count strip */}
            <div className="flex items-center justify-between border-b border-t border-[#eef0f5] bg-[#fbfbfd] px-4 py-[7px]">
                <span className="text-[11.5px] font-bold text-[#5a6472] tabular-nums">
                    {t("patientsCount", { n: loading ? "…" : filtered.length })}
                </span>
                <span className="text-[11px] font-medium text-[#a8aeba]">
                    {sort === "recent" ? t("sortedByRecent") : t("sortedByName")}
                </span>
            </div>

            {/* The list scrolls inside the panel. */}
            <div
                ref={listRef}
                role="listbox"
                aria-label={t("patientsTitle")}
                onKeyDown={onListKeyDown}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            >
                {loading && <SkeletonRows />}

                {failed && (
                    <div className="aren-rise flex flex-col items-center gap-[10px] px-5 py-14 text-center">
                        <SearchX size={20} className="text-[#cbd2df]" strokeWidth={1.8} />
                        <p className="m-0 text-[13.5px] font-medium text-[#5a6472]">{t("dirLoadFailed")}</p>
                        <button
                            type="button"
                            onClick={onRetry}
                            className="h-9 rounded-[9px] border-[1.5px] border-[#e6e3f1] bg-white px-4 text-[12.5px] font-bold text-[#5a6472] transition-colors hover:border-[#d5cfec] hover:bg-[#f8f7fd]"
                        >
                            {t("retry")}
                        </button>
                    </div>
                )}

                {noneAtAll && (
                    <div className="aren-rise flex flex-col items-center gap-[10px] px-5 py-14 text-center">
                        <DawnArcs variant="morning" />
                        <h3 className="m-0 font-[Manrope,sans-serif] text-[16px] font-bold text-[#161d29]">{t("dirEmptyTitle")}</h3>
                        <p className="m-0 max-w-[240px] text-[12.5px] leading-[1.5] text-[#8a91a0]">{t("dirEmptyBody")}</p>
                    </div>
                )}

                {noMatch && (
                    <div className="flex flex-col items-center gap-[10px] px-5 py-12 text-center">
                        <UsersRound size={20} className="text-[#cbd2df]" strokeWidth={1.8} />
                        <h3 className="m-0 text-[13.5px] font-bold text-[#5a6472]">{t("noPatientsTitle")}</h3>
                        <p className="m-0 max-w-[240px] text-[12.5px] leading-[1.5] text-[#a8aeba]">{t("noPatientsBody")}</p>
                    </div>
                )}

                {!loading && !failed &&
                    filtered.map((p) => (
                        <PatientRow key={p.id} patient={p} selected={p.id === selectedId} onSelect={onSelect} />
                    ))}
            </div>
        </section>
    );
}

// Identity tints for the avatar chips: a fixed pastel set hashed off the
// name so a patient keeps their color between sessions. Recognition aid,
// not data color — statuses never appear in this list.
const AVATAR_TINTS = [
    { bg: "#efeafd", text: "#6d28d9" },
    { bg: "#e9f0fe", text: "#1d51c9" },
    { bg: "#fdeef5", text: "#be3d81" },
    { bg: "#fdf1de", text: "#b06a12" },
    { bg: "#e4f5eb", text: "#1c8a4d" },
    { bg: "#e6f4f6", text: "#0e7490" },
] as const;

export function avatarTint(name: string) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
    return AVATAR_TINTS[Math.abs(h) % AVATAR_TINTS.length];
}

function PatientRow({
    patient,
    selected,
    onSelect,
}: {
    patient: PatientDirectoryEntry;
    selected: boolean;
    onSelect: (patient: PatientDirectoryEntry) => void;
}) {
    const t = useT();
    const tint = avatarTint(patient.name);

    return (
        <button
            type="button"
            data-patient-row
            role="option"
            aria-selected={selected}
            onClick={() => onSelect(patient)}
            className={`group grid w-full grid-cols-[38px_minmax(0,1fr)_auto_14px] items-center gap-3 border-t border-l-[3px] border-t-[#f2f3f7] px-4 py-[11px] text-left transition-colors duration-100 focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_rgba(99,102,241,0.28)] ${
                selected
                    ? "border-l-[#7c5cf0] bg-[rgba(124,92,240,0.06)]"
                    : "border-l-transparent hover:bg-[#f8f8fd]"
            }`}
        >
            <span
                className="flex h-[38px] w-[38px] items-center justify-center rounded-[11px] text-[12.5px] font-bold"
                style={{ background: tint.bg, color: tint.text }}
                aria-hidden
            >
                {initials(patient.name)}
            </span>

            <span className="min-w-0">
                <span className={`block truncate text-[14px] leading-[1.3] ${selected ? "font-bold text-[#2f2670]" : "font-semibold text-[#161d29]"}`}>
                    {patient.name}
                </span>
                {/* Full phone number — recognition beats privacy theatre here
                    (the receptionist reads numbers back to patients all day). */}
                <span className="mt-[1px] block truncate text-[12px] text-[#8a91a0] tabular-nums">
                    {patient.phone || "—"}
                    {patient.gender && <span> · {patient.gender}</span>}
                    {patient.age > 0 && <span> · {patient.age} {t("yrs")}</span>}
                </span>
            </span>

            <span className="text-right">
                <span className="block text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[#b3b9c6]">{t("lastVisit")}</span>
                <span className="mt-[1px] block text-[12px] font-semibold text-[#5a6472] tabular-nums">
                    {formatArchiveDate(patient.last_visit_at)}
                </span>
            </span>

            <ChevronRight
                size={14}
                className={`transition-opacity duration-100 ${selected ? "text-[#7c5cf0] opacity-100" : "text-[#c4c9d3] opacity-0 group-hover:opacity-100"}`}
            />
        </button>
    );
}

// Skeleton rows (frozen rule: skeletons, never spinners).
function SkeletonRows() {
    return (
        <div aria-hidden className="animate-pulse motion-reduce:animate-none">
            {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="grid grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-3 border-t border-[#f2f3f7] px-4 py-[11px]">
                    <div className="h-[38px] w-[38px] rounded-[11px] bg-[#eef0f5]" />
                    <div>
                        <div className="h-[13px] w-[55%] rounded bg-[#eef0f5]" />
                        <div className="mt-[7px] h-[10px] w-[75%] rounded bg-[#f2f3f7]" />
                    </div>
                    <div className="h-[10px] w-[52px] rounded bg-[#f2f3f7]" />
                </div>
            ))}
        </div>
    );
}
