// ---------------------------------------------------------------------------
// DETAIL INPUT — one optional field of a site-placed item, drawn from its
// family definition (assessmentFamilies.ts / interventionFamilies.ts).
// Shared by the assessment and intervention modals so a "Grade" chip row
// looks and behaves the same wherever it appears.
// ---------------------------------------------------------------------------

import { Check } from "lucide-react";
import { optionsOf, type DetailField } from "./assessmentFamilies";
import type { SiteRef } from "../../lib/body/clinicalSite";

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
            <div className="cs-dx-field">
                <button
                    type="button"
                    className={`cs-dx-chip is-flag${value ? " is-on" : ""}`}
                    aria-pressed={!!value}
                    onClick={() => onChange(!value)}
                >
                    {value && <Check size={12} />}
                    {field.label}
                </button>
            </div>
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
                <span className="cs-dx-fieldlabel">{field.label} <em>any</em></span>
                <div className="cs-dx-chips" role="group" aria-label={field.label}>
                    {opts.map((o) => (
                        <button
                            key={o}
                            type="button"
                            aria-pressed={chosen.includes(o)}
                            className={`cs-dx-chip is-multi${chosen.includes(o) ? " is-on" : ""}`}
                            onClick={() => toggle(o)}
                        >
                            {chosen.includes(o) && <Check size={12} />}
                            {o}
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    if (field.kind === "choice") {
        const opts = optionsOf(field, site);
        return (
            <div className="cs-dx-field">
                <span className="cs-dx-fieldlabel">{field.label}</span>
                <div className="cs-dx-chips" role="radiogroup" aria-label={field.label}>
                    {opts.map((o) => (
                        <button
                            key={o}
                            type="button"
                            role="radio"
                            aria-checked={value === o}
                            className={`cs-dx-chip${value === o ? " is-on" : ""}`}
                            // Picking the chosen one again clears it — every
                            // detail stays optional.
                            onClick={() => onChange(value === o ? undefined : o)}
                        >
                            {o}
                        </button>
                    ))}
                </div>
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
                        const v = field.kind === "number" ? e.target.value.replace(/[^0-9.]/g, "") : e.target.value;
                        onChange(v);
                    }}
                />
                {field.kind === "number" && <em>{field.unit}</em>}
            </span>
        </label>
    );
}
