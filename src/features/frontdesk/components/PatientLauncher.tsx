import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, Plus } from "lucide-react";
import { searchPatients, type DBPatient } from "@/lib/db";
import { initials } from "../utils";
import { useT } from "../i18n/i18n";

type Props = {
    onSelectExisting: (patient: DBPatient) => void;
    onCreateNew: (prefillName: string) => void;
};

export function PatientLauncher({ onSelectExisting, onCreateNew }: Props) {
    const t = useT();
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const [focused, setFocused] = useState(false);
    const [matches, setMatches] = useState<DBPatient[]>([]);
    const [rect, setRect] = useState<DOMRect | null>(null);
    // Keyboard cursor over the dropdown. -1 = nothing highlighted (Enter then
    // means "register the typed name"); 0..matches.length-1 = a patient row;
    // matches.length = the "Register new patient" row.
    const [active, setActive] = useState(-1);
    const barRef = useRef<HTMLDivElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // The launcher is the front door — land the receptionist's cursor here on
    // load so she can just start typing a name.
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    useEffect(() => {
        if (!query.trim() || query.trim().length < 2) {
            setMatches([]);
            return;
        }
        let cancelled = false;
        const timer = setTimeout(() => {
            searchPatients(query)
                .then((r) => { if (!cancelled) setMatches(r); })
                .catch((err) => console.warn("searchPatients failed (non-fatal):", err));
        }, 220);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [query]);

    // Any change to the result set or the query resets the cursor to "nothing
    // highlighted" — Enter must never fire a stale selection.
    useEffect(() => { setActive(-1); }, [matches, query]);

    useEffect(() => {
        const onDocClick = (e: MouseEvent) => {
            const portal = document.getElementById("launcher-dropdown-portal");
            if (
                wrapRef.current && !wrapRef.current.contains(e.target as Node) &&
                !(portal && portal.contains(e.target as Node))
            ) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", onDocClick);
        return () => document.removeEventListener("mousedown", onDocClick);
    }, []);

    const updateRect = () => {
        if (barRef.current) setRect(barRef.current.getBoundingClientRect());
    };

    const openDrop = () => {
        setOpen(true);
        updateRect();
    };

    const selectPatient = (p: DBPatient) => {
        onSelectExisting(p);
        setQuery("");
        setOpen(false);
        setMatches([]);
    };

    const createNew = () => {
        onCreateNew(query.trim());
        setQuery("");
        setOpen(false);
        setMatches([]);
    };

    const showDrop = open && query.trim().length >= 2;
    // Index of the "Register new patient" row within the navigable list.
    const registerIdx = matches.length;

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault();
            if (active >= 0 && active < matches.length) selectPatient(matches[active]);
            else if (query.trim()) createNew();
            return;
        }
        if (!showDrop) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, registerIdx));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, -1));
        } else if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
        }
    };

    const dropdown = showDrop && rect
        ? createPortal(
            <div
                id="launcher-dropdown-portal"
                style={{ position: "fixed", top: rect.bottom + 7, left: rect.left, width: rect.width }}
                className="z-[70] max-h-[380px] overflow-y-auto rounded-[9px] border border-[#d5d9e2] bg-white shadow-[0_24px_60px_rgba(16,24,40,0.24)]"
            >
                {matches.length > 0 && (
                    <>
                        <div className="px-4 pb-[5px] pt-[11px] text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#837bb2]">
                            {t("existingPatients")}
                        </div>
                        {matches.map((p, i) => (
                            <div
                                key={p.id}
                                onMouseEnter={() => setActive(i)}
                                onClick={() => selectPatient(p)}
                                className={`flex min-h-[44px] cursor-pointer items-center gap-3 px-4 py-[10px] ${
                                    active === i ? "bg-[rgba(47,107,237,0.08)]" : "hover:bg-[#f2f4f8]"
                                }`}
                            >
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-[#e0ebfe] text-[13px] font-bold text-[#1746b8]">
                                    {initials(p.name)}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-[14px] font-semibold text-[#161d29]">{p.name}</div>
                                    <div className="text-[12px] text-[#5a6472]">
                                        {p.phone}
                                        <span className="mx-[5px] text-[#8a91a0]">·</span>
                                        {p.age} yrs, {p.gender}
                                    </div>
                                </div>
                            </div>
                        ))}
                        <div className="my-1 h-px bg-[#e6e9f0]" />
                    </>
                )}
                {/* No "No matching patients" line — the "Register new patient
                    «name»" row below already says exactly that, and the extra
                    line was only dead vertical space. */}
                <div
                    onMouseEnter={() => setActive(registerIdx)}
                    onClick={createNew}
                    className={`flex min-h-[44px] cursor-pointer items-center gap-[11px] px-4 py-3 text-[13.5px] font-semibold text-[#2f6bed] ${
                        active === registerIdx ? "bg-[rgba(47,107,237,0.08)]" : "hover:bg-[rgba(47,107,237,0.055)]"
                    }`}
                >
                    <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] bg-[#e0ebfe]">
                        <Plus size={15} />
                    </span>
                    {query.trim() ? t("registerNewNamed", { q: query.trim() }) : t("registerNew")}
                </div>
            </div>,
            document.body
        )
        : null;

    return (
        <div ref={wrapRef} className="group relative mb-[10px]">
            <div
                ref={barRef}
                // No overflow-hidden here (the ambient wash below is clipped in
                // its own inner layer instead) — overflow-hidden on this element
                // would silently clip its own box-shadow, which is exactly why
                // the calm outer glow wasn't visible before.
                className="relative flex h-[54px] items-center gap-[10px] rounded-[12px] border-[1.5px] border-[#c9cdd9] bg-white pl-[15px] pr-[10px] shadow-[0_1px_2px_rgba(20,30,50,0.05),0_0_0_1px_rgba(124,92,240,0.05),0_10px_26px_-6px_rgba(124,92,240,0.38)] transition-[border-color,box-shadow] duration-150 focus-within:border-[#2f6bed] focus-within:shadow-[0_0_0_4px_rgba(99,102,241,0.24),0_10px_26px_-6px_rgba(124,92,240,0.42)]"
            >
                {/* Dawn wash (§6): a static violet→pink glow bleeding in from the
                    left. It breathes ±6% over 8s while idle (one of two ambient
                    animations); the breath stops and the wash brightens on focus.
                    Clipped to its own rounded layer so the bar's outer shadow
                    (above) isn't cut off too. */}
                <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[12px]">
                    <div
                        className={`absolute inset-y-0 -left-[10%] w-[130%] ${focused ? "" : "aren-breath"}`}
                        style={{
                            backgroundImage: focused
                                ? "linear-gradient(90deg, rgba(124,92,240,0.09), rgba(240,171,200,0.05) 30%, transparent 55%)"
                                : "linear-gradient(90deg, rgba(124,92,240,0.06), rgba(240,171,200,0.04) 30%, transparent 55%)",
                        }}
                    />
                </div>
                <Search size={17} strokeWidth={2.2} className="relative shrink-0 text-[#5b5580]" />
                <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); openDrop(); }}
                    onFocus={() => { setFocused(true); openDrop(); }}
                    onBlur={() => setFocused(false)}
                    onKeyDown={onKeyDown}
                    placeholder={t("launcherPlaceholder")}
                    className="fd-bare relative flex-1 text-[14px] font-[450] placeholder:font-[450]"
                />
                {/* Add Patient lives INSIDE the search bar (V3): a labelled solid-
                    blue button with a soft glow — the launcher's one loud element.
                    Was a blue→purple gradient; flattened to one brand blue
                    (#2f6bed, same blue as the rest of Front Desk's primary
                    actions) with a glow instead of a hue shift — session
                    2026-08-23, Anmol's call: the gradient "looked terrible". */}
                <button
                    type="button"
                    title={t("launcherAddTitle")}
                    onClick={() => onCreateNew("")}
                    className="relative flex h-9 shrink-0 items-center gap-[6px] rounded-[10px] bg-[#2f6bed] px-[13px] text-[12.5px] font-bold text-white shadow-[0_3px_12px_rgba(47,107,237,0.4),0_0_16px_rgba(47,107,237,0.28)] transition-[box-shadow,transform,background-color] duration-100 hover:bg-[#1d51c9] hover:shadow-[0_3px_16px_rgba(47,107,237,0.55),0_0_22px_rgba(47,107,237,0.38)] active:scale-[0.97] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(47,107,237,0.28)]"
                >
                    <Plus size={15} strokeWidth={2.6} />
                    <span className="max-[900px]:hidden">{t("addPatient")}</span>
                </button>
            </div>
            {dropdown}
        </div>
    );
}
