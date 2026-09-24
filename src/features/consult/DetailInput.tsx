// ---------------------------------------------------------------------------
// DETAIL INPUT — one optional field of a site-placed item, drawn from its
// family definition (assessmentFamilies.ts / interventionFamilies.ts).
// Shared by the assessment, imaging and intervention modals.
//
// ── The control follows the size of the choice, not a single chip style
//
//   2–3 options (or a few very short ones)  → one joined segmented control
//                                              [ Closed | Open ]
//   anything longer                          → a dropdown: one control to
//                                              scan instead of ten chips
//                                              [ Select pattern ▾ ]
//   yes/no                                   → a checkbox row
//   several at once                          → checkable chips (short lists)
//
// Labels sit above in small uppercase ink — readable, never greyed out —
// so the chosen VALUE is what the eye lands on.
// ---------------------------------------------------------------------------

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { optionsOf, type DetailField } from "./assessmentFamilies";
import type { SiteRef } from "../../lib/body/clinicalSite";

/** Few enough, and short enough, to sit side by side as one control. */
export function fitsSegmented(opts: string[]): boolean {
    if (opts.length <= 3) return opts.join("").length <= 42;
    return opts.length <= 5 && opts.join("").length <= 26;
}

export function Segmented({
    label, options, value, onChange, disabled,
}: {
    label: string;
    options: { value: string; label?: string }[];
    value: string | null | undefined;
    onChange: (v: string | undefined) => void;
    disabled?: boolean;
}) {
    return (
        <div className="cs-seg" role="radiogroup" aria-label={label}>
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={value === o.value}
                    disabled={disabled}
                    className={value === o.value ? "is-on" : undefined}
                    // Picking the chosen one again clears it — every detail
                    // stays optional.
                    onClick={() => onChange(value === o.value ? undefined : o.value)}
                >
                    {o.label ?? o.value}
                </button>
            ))}
        </div>
    );
}

/**
 * A compact select: one line showing the choice (or "Select …"), opening a
 * clean list. Keyboard: ↑/↓ to move, Enter to pick, Esc to close — and
 * while open it marks itself `data-popover-open` so the modal's own Enter
 * and Esc leave it alone.
 */
export function DetailSelect({
    label, options, value, onChange,
}: {
    label: string;
    options: string[];
    value: string | undefined;
    onChange: (v: string | undefined) => void;
}) {
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const wrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        setActive(Math.max(0, value ? options.indexOf(value) : 0));
        const away = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", away);
        return () => document.removeEventListener("mousedown", away);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const pick = (o: string | undefined) => { onChange(o); setOpen(false); };

    return (
        <div className="cs-dsel" ref={wrapRef}>
            <button
                type="button"
                className={`cs-dsel-btn${value ? " has-value" : ""}${open ? " is-open" : ""}`}
                aria-haspopup="listbox"
                aria-expanded={open}
                data-popover-open={open ? "true" : undefined}
                onClick={() => setOpen((v) => !v)}
                onKeyDown={(e) => {
                    if (!open) {
                        if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); }
                        return;
                    }
                    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); }
                    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, options.length - 1)); }
                    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
                    else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); pick(options[active]); }
                }}
            >
                <span>{value ?? `Select ${label.toLowerCase()}`}</span>
                <ChevronDown size={14} aria-hidden="true" />
            </button>
            {open && (
                <div className="cs-dsel-list" role="listbox" aria-label={label}>
                    {value && (
                        <button type="button" className="cs-dsel-opt is-clear" onClick={() => pick(undefined)}>
                            Clear
                        </button>
                    )}
                    {options.map((o, i) => (
                        <button
                            key={o}
                            type="button"
                            role="option"
                            aria-selected={value === o}
                            className={`cs-dsel-opt${i === active ? " is-active" : ""}${value === o ? " is-on" : ""}`}
                            onMouseEnter={() => setActive(i)}
                            onClick={() => pick(o)}
                        >
                            <span>{o}</span>
                            {value === o && <Check size={13} aria-hidden="true" />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export function DetailInput({
    field, site, value, onChange,
}: {
    field: DetailField;
    site: SiteRef | null;
    value: string | boolean | undefined;
    onChange: (v: string | boolean | undefined) => void;
}) {
    if (field.kind === "flag") {
        return (
            <button
                type="button"
                role="checkbox"
                aria-checked={!!value}
                className={`cs-dx-check${value ? " is-on" : ""}`}
                onClick={() => onChange(!value)}
            >
                <span className="cs-dx-checkbox" aria-hidden="true">{value && <Check size={11} />}</span>
                {field.label}
            </button>
        );
    }

    if (field.kind === "multi") {
        const opts = optionsOf(field, site);
        const chosen = typeof value === "string" && value ? value.split("|") : [];
        const toggle = (o: string) => {
            const next = chosen.includes(o) ? chosen.filter((x) => x !== o) : [...chosen, o];
            // Kept in the option order, so the printed list never depends on
            // the order they were clicked.
            onChange(opts.filter((x) => next.includes(x)).join("|"));
        };
        return (
            <div className="cs-dx-field">
                <span className="cs-dx-fieldlabel">{field.label}</span>
                <div className="cs-dx-chips" role="group" aria-label={field.label}>
                    {opts.map((o) => (
                        <button
                            key={o}
                            type="button"
                            role="checkbox"
                            aria-checked={chosen.includes(o)}
                            className={`cs-dx-check is-chip${chosen.includes(o) ? " is-on" : ""}`}
                            onClick={() => toggle(o)}
                        >
                            <span className="cs-dx-checkbox" aria-hidden="true">{chosen.includes(o) && <Check size={11} />}</span>
                            {o}
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    if (field.kind === "choice") {
        const opts = optionsOf(field, site);
        const v = typeof value === "string" ? value : undefined;
        return (
            <div className="cs-dx-field">
                <span className="cs-dx-fieldlabel">{field.label}</span>
                {fitsSegmented(opts)
                    ? <Segmented label={field.label} options={opts.map((o) => ({ value: o }))} value={v} onChange={onChange} />
                    : <DetailSelect label={field.label} options={opts} value={v} onChange={onChange} />}
            </div>
        );
    }

    return (
        <label className="cs-dx-field">
            <span className="cs-dx-fieldlabel">{field.label}</span>
            <span className="cs-dx-inputrow">
                <input
                    className={`cs-anat-input${field.kind === "number" ? " is-num" : ""}`}
                    value={typeof value === "string" ? value : ""}
                    inputMode={field.kind === "number" ? "decimal" : undefined}
                    placeholder={field.kind === "text" ? field.placeholder : "—"}
                    onChange={(e) => {
                        const next = field.kind === "number" ? e.target.value.replace(/[^0-9.]/g, "") : e.target.value;
                        onChange(next);
                    }}
                />
                {field.kind === "number" && field.unit && <em>{field.unit}</em>}
            </span>
        </label>
    );
}
