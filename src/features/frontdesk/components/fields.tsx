import { useEffect } from "react";
import { useT } from "../i18n/i18n";

// Shared Bhor form primitives (extracted from CreateVisitModal in s39 when
// the Patients page's Edit Details modal needed the identical field system).
// Everything here obeys the §13 layer trap: chrome lives on divs/wrappers or
// the unlayered fd-* classes, never as Tailwind utilities on raw inputs.

// Violet micro-label + fading hairline: the section grouping device shared
// across the modal family (§4 micro-label system).
export function SectionLabel({ text, className = "" }: { text: string; className?: string }) {
    return (
        <div className={`mb-[7px] flex items-center gap-2 ${className}`}>
            <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[#837bb2]">{text}</span>
            <span aria-hidden className="h-px flex-1 bg-[linear-gradient(90deg,#e9e6f5,transparent)]" />
        </div>
    );
}

export function Field({
    icon,
    label,
    children,
    className = "",
    error,
    required,
    optional,
}: {
    icon?: React.ReactNode;
    label: string;
    children: React.ReactNode;
    className?: string;
    error?: string;
    required?: boolean;
    optional?: boolean;
}) {
    const t = useT();
    return (
        <div className={className}>
            {/* fd-ico / fd-tag are unlayered classes (FrontDeskStyles): the legacy
                `label span` rules would override Tailwind utilities here. */}
            <label className="fd-label mb-[4px] text-[12.5px] font-bold text-[#3b4453]">
                {icon && <span className="fd-ico">{icon}</span>}
                {label}
                {/* Required mark (§10.2): structural violet, known upfront — not
                    an error color discovered on a failed save. */}
                {required && <span aria-hidden className="h-[4px] w-[4px] shrink-0 rounded-full bg-[#a855f7] opacity-50" />}
                {optional && <span className="fd-tag">{t("optional")}</span>}
            </label>
            {children}
            {error && <p className="m-0 mt-[6px] text-[12px] font-medium text-[#d23b34]">{error}</p>}
        </div>
    );
}

// Compact numeric age: type it, nudge it with the arrow keys, or roll the
// mouse wheel while focused. Digits only, clamped to 0–120.
export function AgeInput({
    inputRef,
    value,
    onChange,
    error,
    placeholder,
}: {
    inputRef: React.RefObject<HTMLInputElement | null>;
    value: string;
    onChange: (v: string) => void;
    error?: boolean;
    placeholder: string;
}) {
    const step = (delta: number) => {
        const current = parseInt(value, 10);
        const base = Number.isFinite(current) ? current : 0;
        onChange(String(Math.min(120, Math.max(0, base + delta))));
    };

    // React's onWheel is passive — it cannot preventDefault, so the page would
    // scroll while the number changes. A manually attached non-passive
    // listener (re-bound each render to close over the latest value) can.
    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            if (document.activeElement !== el) return;
            e.preventDefault();
            step(e.deltaY < 0 ? 1 : -1);
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    });

    return (
        <input
            ref={inputRef}
            value={value}
            onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 3);
                onChange(digits === "" ? "" : String(Math.min(120, parseInt(digits, 10))));
            }}
            onKeyDown={(e) => {
                if (e.key === "ArrowUp") { e.preventDefault(); step(1); }
                else if (e.key === "ArrowDown") { e.preventDefault(); step(-1); }
            }}
            placeholder={placeholder}
            inputMode="numeric"
            maxLength={3}
            className={`fd-field text-center tabular-nums ${error ? "fd-field-error" : ""}`}
        />
    );
}

// Keyboard-first gender: one tab stop; M selects Male, F Female, O Other;
// arrow keys cycle. The dotted underline under each first letter quietly
// teaches the shortcut. Values are the stored English entity names.
const GENDER_OPTIONS = [
    { value: "Male", labelKey: "male" as const, keys: ["m"] },
    { value: "Female", labelKey: "female" as const, keys: ["f"] },
    { value: "Other", labelKey: "other" as const, keys: ["o"] },
];

export function GenderControl({
    groupRef,
    value,
    onChange,
    error,
}: {
    groupRef: React.RefObject<HTMLDivElement | null>;
    value: string;
    onChange: (v: string) => void;
    error?: boolean;
}) {
    const t = useT();

    const handleKeyDown = (e: React.KeyboardEvent) => {
        const key = e.key.toLowerCase();
        const hit = GENDER_OPTIONS.find((o) => o.keys.includes(key));
        if (hit) {
            e.preventDefault();
            onChange(hit.value);
            return;
        }
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
            e.preventDefault();
            const idx = GENDER_OPTIONS.findIndex((o) => o.value === value);
            const dir = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
            const next = GENDER_OPTIONS[(idx + dir + GENDER_OPTIONS.length) % GENDER_OPTIONS.length];
            onChange(next.value);
        }
    };

    return (
        <div
            ref={groupRef}
            role="radiogroup"
            aria-label={t("fldGender")}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            className={`flex h-[36px] items-stretch gap-[3px] rounded-[10px] border-[1.5px] p-[3px] outline-none transition-[border-color,box-shadow,background-color] duration-150 ${
                error
                    ? "border-[#d23b34] bg-[#fffafa]"
                    : "border-[#e9e7f4] bg-[#f8f8fd] focus-visible:border-[#7c5cf0] focus-visible:bg-white focus-visible:shadow-[0_0_0_3px_rgba(99,102,241,0.22)]"
            }`}
        >
            {GENDER_OPTIONS.map((o) => {
                const active = value === o.value;
                const label = t(o.labelKey);
                return (
                    <button
                        key={o.value}
                        type="button"
                        tabIndex={-1}
                        role="radio"
                        aria-checked={active}
                        onClick={() => onChange(o.value)}
                        className={`flex-1 rounded-[8px] text-[13px] transition-colors ${
                            active
                                ? "border border-[#e2e5ee] bg-white font-bold text-[#161d29] shadow-[0_1px_3px_rgba(20,30,50,0.08)]"
                                : "font-medium text-[#8a91a0] hover:text-[#5a6472]"
                        }`}
                    >
                        <span className={active ? "underline decoration-[#b7a8f2] decoration-dotted underline-offset-[3px]" : "underline decoration-[#d8dce6] decoration-dotted underline-offset-[3px]"}>
                            {label.slice(0, 1)}
                        </span>
                        {label.slice(1)}
                    </button>
                );
            })}
        </div>
    );
}

// India-first phone cell: +91 is assumed and shown; the user only ever types
// the 10 digits after it. Hard-capped with a live n/10 counter (green when
// complete). onChange always receives the cleaned digit string.
export function PhoneInput({
    inputRef,
    value,
    onChange,
    error,
    placeholder,
}: {
    inputRef: React.RefObject<HTMLInputElement | null>;
    value: string;
    onChange: (digits: string) => void;
    error?: boolean;
    placeholder: string;
}) {
    const complete = /^\d{10}$/.test(value);
    return (
        <div
            className={`flex h-[36px] items-center overflow-hidden rounded-[10px] border-[1.5px] transition-[border-color,box-shadow,background-color] duration-150 ${
                error
                    ? "border-[#d23b34] bg-[#fffafa]"
                    : "border-[#e9e7f4] bg-[#f8f8fd] focus-within:border-[#7c5cf0] focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(99,102,241,0.22)]"
            }`}
        >
            <span className="flex h-full shrink-0 items-center border-r border-[#e9e7f4] bg-[rgba(124,92,240,0.045)] px-3 text-[13px] font-bold tracking-[0.02em] text-[#6d5bc7]">
                +91
            </span>
            <input
                ref={inputRef}
                value={value}
                onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder={placeholder}
                inputMode="numeric"
                maxLength={10}
                className="fd-bare px-[13px] tabular-nums"
            />
            <span className={`shrink-0 pr-[13px] text-[11.5px] font-semibold tabular-nums ${complete ? "text-[#1c8a4d]" : "text-[#a8aeba]"}`}>
                {value.length}/10
            </span>
        </div>
    );
}
