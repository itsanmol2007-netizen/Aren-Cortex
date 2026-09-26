// ---------------------------------------------------------------------------
// SITE ASSESSMENT DETAILS — an assessment's details, edited where it was made.
//
// On the body map the site is already chosen: the doctor clicked the right
// wrist and typed "fracture". Opening the Assessment modal on top of that
// would ask the one question already answered, so the details open here,
// under the fracture's own token: bone, skin, displacement, angulation, the
// rare ones folded behind "More details", and the exact line that will
// print. Every change is live (the line on the Assessment card changes as
// the doctor clicks), so there is no Save; "Done" only folds it away.
//
// The same fields, the same rules and the same composed text as
// AssessmentSiteModal (assessmentFamilies.ts), so an assessment made here
// and one made from the Assessment card are the same record.
// ---------------------------------------------------------------------------

import { Plus, Stethoscope } from "lucide-react";
import { useState } from "react";
import type { AssessmentLine } from "./assessmentPlan";
import { familyFor, pruneDetails, visibleFields, type AssessmentDetails } from "./assessmentFamilies";
import { DetailInput } from "./DetailInput";

export function SiteAssessmentDetails({ line, onChange, onDone, disabled = false }: {
    line: AssessmentLine;
    onChange: (details: AssessmentDetails) => void;
    onDone: () => void;
    disabled?: boolean;
}) {
    const family = familyFor(line.label);
    const mainKeys = new Set(family?.main ?? family?.fields.map((f) => f.key) ?? []);
    const [showMore, setShowMore] = useState(() => Object.keys(line.details).some((k) => !mainKeys.has(k)));
    if (!family) return null;

    const details = pruneDetails(family, line.site, line.details);
    const fields = visibleFields(family, details, line.site);
    const main = fields.filter((f) => mainKeys.has(f.key));
    const more = fields.filter((f) => !mainKeys.has(f.key));
    const set = (key: string, v: string | boolean | undefined) => {
        const next = { ...details };
        if (v === undefined || v === "" || v === false) delete next[key];
        else next[key] = v;
        onChange(next);
    };

    return (
        <section className="cs-jf-dx" aria-label={`${line.label} details`}>
            <header className="cs-jf-dx-head">
                <span className="cs-jf-dx-glyph" aria-hidden="true"><Stethoscope size={13} /></span>
                <span className="cs-jf-dx-title">{line.label}</span>
                <span className="cs-jf-dx-eyebrow">Assessment</span>
                <button type="button" className="cs-jf-dx-done" onClick={onDone}>Done</button>
            </header>

            {fields.length === 0 ? (
                <p className="cs-jf-dx-none">Nothing more to add for this one; the place says it.</p>
            ) : (
                <div className="cs-jf-dx-fields">
                    {main.map((f) => (
                        <DetailInput key={f.key} field={f} site={line.site} value={details[f.key]} onChange={(v) => !disabled && set(f.key, v)} />
                    ))}
                    {more.length > 0 && (showMore
                        ? more.map((f) => (
                            <DetailInput key={f.key} field={f} site={line.site} value={details[f.key]} onChange={(v) => !disabled && set(f.key, v)} />
                        ))
                        : (
                            <button type="button" className="cs-dx-adddetails" onClick={() => setShowMore(true)}>
                                <Plus size={14} /> More details
                            </button>
                        ))}
                </div>
            )}

            <p className="cs-jf-dx-preview" aria-live="polite">
                <span>Records</span>
                <b>{line.text}</b>
            </p>
        </section>
    );
}
