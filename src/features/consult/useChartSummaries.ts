// ---------------------------------------------------------------------------
// CHART SUMMARIES — the one-line clinical extract shown on each specialty
// examination launcher.
//
// Deliberately NOT a new engine. Every string here is built from the same
// label maps the charts themselves render with, so a summary can never
// describe a tooth differently from the odontogram beside it:
//   dental -> TOOTH_LABEL + surfaceLabel + DENTAL_CONDITION_LABEL
//   body   -> siteLabel (region + aspect + side, as one phrase)
//   joints -> the same `listBodySites` / `siteLabel` as `body` (2026-08-17) —
//             `JointMapCard` writes to the same `visit_body_sites` table
//             `BodyMapCard` does, just a different chart key so a facility
//             on `body` and one on `joints` never show the wrong launcher.
// It is the existing conversion logic read back as a sentence.
//
// The fetch lives here rather than in the chart cards because the launcher
// has to know what is charted WITHOUT the chart being mounted — the cards
// only exist while their modal is open. `refreshKey` lets the caller re-read
// after a modal closes, since that is when the contents may have changed.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { listDentalFindings } from "../../lib/db/dental";
import { listBodySites } from "../../lib/db/bodySites";
import { TOOTH_BY_CODE, surfaceLabel } from "../../lib/dental/anatomy";
import { DENTAL_CONDITION_LABEL, TOOTH_LABEL } from "../../lib/dental/types";
import { siteLabel } from "../../lib/body/anatomy";

/** How many items a summary names before it starts counting the rest. */
const NAMED = 2;

function joinWithRest(parts: string[]): string {
    if (parts.length === 0) return "";
    if (parts.length <= NAMED) return parts.join(" · ");
    const rest = parts.length - NAMED;
    return `${parts.slice(0, NAMED).join(" · ")} +${rest} more`;
}

export function useChartSummaries(
    visitId: string | null,
    keys: string[],
    refreshKey: unknown
): Map<string, string> {
    const [summaries, setSummaries] = useState<Map<string, string>>(new Map());
    const wantDental = keys.includes("dental");
    const wantBody = keys.includes("body");
    const wantJoints = keys.includes("joints");

    useEffect(() => {
        if (!visitId || (!wantDental && !wantBody && !wantJoints)) {
            setSummaries(new Map());
            return;
        }
        let cancelled = false;

        (async () => {
            const next = new Map<string, string>();

            if (wantDental) {
                try {
                    const items = await listDentalFindings(visitId);
                    const parts = items.map((f) => {
                        const tooth = TOOTH_LABEL[f.toothNumber] ?? f.toothNumber;
                        const geom = TOOTH_BY_CODE[f.toothNumber];
                        const surf = f.surface && geom
                            ? ` ${surfaceLabel(f.surface, geom)}`
                            : "";
                        return `${tooth}${surf} ${DENTAL_CONDITION_LABEL[f.condition]}`;
                    });
                    next.set("dental", joinWithRest(parts));
                } catch {
                    /* a summary is a convenience — never fail the consult for it */
                }
            }

            if (wantBody || wantJoints) {
                try {
                    const items = await listBodySites(visitId);
                    // `siteLabel` is what the body/joint map itself renders
                    // with — it already folds region, aspect and side into
                    // one phrase. Both charts read the same rows; only the
                    // launcher key differs, and a facility only ever has one
                    // of the two in `specialty.charts` at a time.
                    const parts = items.map((s) => siteLabel(s.region, s.aspect, s.side));
                    const summary = joinWithRest(parts);
                    if (wantBody) next.set("body", summary);
                    if (wantJoints) next.set("joints", summary);
                } catch {
                    /* as above */
                }
            }

            if (!cancelled) setSummaries(next);
        })();

        return () => { cancelled = true; };
    }, [visitId, wantDental, wantBody, wantJoints, refreshKey]);

    return summaries;
}
