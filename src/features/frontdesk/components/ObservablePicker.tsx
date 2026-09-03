// ---------------------------------------------------------------------------
// OBSERVABLE PICKER — the Front Desk twin of Cortex's PickerCard.
//
// One component, two instances: History (context the patient volunteers) and
// Symptoms (today's complaints). Both read the SAME 374-row observable
// catalogue the doctor works with (`useCachedIntakeChips`), so a chip entered
// at reception is the exact clinical entity the consult and the engine see.
//
// ── The size rule ────────────────────────────────────────────────────────────
// A modal's geometry must not move with its content. So:
//   · match results render in a PORTAL dropdown (position:fixed, its own
//     scroll, capped at MAX_RESULTS) — never in-flow. Seven hits, twenty
//     fuzzy hits, or none: the field and the modal are byte-for-byte the same
//     size. This is the fix for the old inline picker that grew/shrank the
//     intake modal on every keystroke.
//   · the selected-chip well is capped at ~2 rows and scrolls; a long chip
//     list never pushes the modal taller either.
//
// Dismissal is on outside CLICK, never mousedown (a mousedown-close collapses
// layout between press and release and the mouseup lands on the backdrop —
// the "existing patient visits fail" regression). Escape closes the dropdown
// first (capture listener), the modal second.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clock3, Plus, Search } from "lucide-react";
import type { IntakeChip } from "@/lib/db/synapse";
import {
    ASKS_DURATION, bareNumber, parseDurationDays, shortDuration,
} from "@/features/consult/duration";
import { useCachedIntakeChips } from "../operational/referenceCache";
import { useT } from "../i18n/i18n";
import { bestTermScore, matchScore } from "./observableMatch";

const MAX_RESULTS = 10;

type Props = {
    /** which observable kinds this one field searches — Front Desk uses a
     *  single field over BOTH symptom and history, like Cortex. */
    kinds: ("symptom" | "history")[];
    selected: IntakeChip[];
    onChange: (next: IntakeChip[]) => void;
    inputRef: React.RefObject<HTMLInputElement | null>;
    error?: boolean;
    placeholder: string;
    /** the small-caps heading over the dropdown, e.g. "Symptom & history catalog" */
    catalogLabel: string;
    /** shown when a query matches nothing */
    noMatchLabel: string;
    /**
     * ── "How long?" at the desk (2026-09-03) ─────────────────────────────
     *
     * observableId -> days, and the way to change it. Optional: a picker
     * without these is exactly the picker it was before.
     *
     * Reception is usually the person who actually hears the answer — "since
     * Monday", "about three weeks" — and asking again in the consult room is
     * the double-entry Consult exists to remove. The same curated list decides
     * WHICH chips get a duration box (`ASKS_DURATION`), so the desk and the
     * doctor cannot disagree about which complaints the question is worth
     * asking for.
     */
    durations?: Map<number, number>;
    onDurationChange?: (observableId: number, days: number | null) => void;
};

const KIND_LABEL: Record<string, string> = { symptom: "symptom", history: "history" };

export function ObservablePicker({
    kinds, selected, onChange, inputRef, error, placeholder, catalogLabel, noMatchLabel,
    durations, onDurationChange,
}: Props) {
    const t = useT();
    const catalog = useCachedIntakeChips().data;
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const [rect, setRect] = useState<DOMRect | null>(null);

    const rootRef = useRef<HTMLDivElement>(null);
    const boxRef = useRef<HTMLDivElement>(null);
    const dropRef = useRef<HTMLDivElement>(null);

    const kindKey = kinds.join(",");
    const showKindTag = kinds.length > 1;
    const pool = useMemo(
        () => catalog.filter((c) => kinds.includes(c.kind as "symptom" | "history")),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [catalog, kindKey]
    );

    // With nothing typed the catalogue opens on a short everyday set, not 300+
    // chips (progressive-disclosure.md): the everyday general-system symptoms.
    // History is intentional — it surfaces once the receptionist types.
    const { results, restCount } = useMemo(() => {
        const chosen = new Set(selected.map((s) => s.observableId));
        const available = pool.filter((s) => !chosen.has(s.observableId));
        const q = query.trim().toLowerCase();

        if (!q) {
            const base = available.filter((s) => s.kind === "symptom" && s.system === "general");
            return { results: base.slice(0, MAX_RESULTS), restCount: Math.max(0, base.length - MAX_RESULTS) };
        }

        const scored = available
            .map((s) => ({ s, score: bestTermScore(s.terms, q) }))
            .filter((x): x is { s: IntakeChip; score: number } => x.score !== null)
            // symptom-kind ties break ahead of history-kind — the field's
            // primary job is today's complaint.
            .sort((a, b) => a.score - b.score
                || (a.s.kind === b.s.kind ? 0 : a.s.kind === "symptom" ? -1 : 1)
                || a.s.label.localeCompare(b.s.label))
            .map((x) => x.s);
        return { results: scored.slice(0, MAX_RESULTS), restCount: Math.max(0, scored.length - MAX_RESULTS) };
    }, [pool, query, selected]);

    useEffect(() => { setActive(0); }, [query, open]);

    const updateRect = useCallback(() => {
        if (boxRef.current) setRect(boxRef.current.getBoundingClientRect());
    }, []);

    useEffect(() => {
        if (!open) return;
        updateRect();
        window.addEventListener("resize", updateRect);
        window.addEventListener("scroll", updateRect, true);
        return () => {
            window.removeEventListener("resize", updateRect);
            window.removeEventListener("scroll", updateRect, true);
        };
    }, [open, updateRect]);

    // Outside CLICK (not mousedown) closes the catalogue — see the header.
    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => {
            const target = e.target as Node;
            if (!target.isConnected) return; // a chip we just removed
            const inRoot = rootRef.current?.contains(target);
            const inDrop = dropRef.current?.contains(target);
            if (!inRoot && !inDrop) {
                setOpen(false);
                setQuery("");
            }
        };
        const timer = setTimeout(() => document.addEventListener("click", onClick), 0);
        return () => {
            clearTimeout(timer);
            document.removeEventListener("click", onClick);
        };
    }, [open]);

    // Escape closes the catalogue, not the modal — capture beats ModalShell's
    // bubble listener.
    useEffect(() => {
        if (!open) return;
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                setOpen(false);
                setQuery("");
            }
        };
        document.addEventListener("keydown", onEsc, true);
        return () => document.removeEventListener("keydown", onEsc, true);
    }, [open]);

    const pick = (s: IntakeChip) => {
        onChange([...selected, s]);
        setQuery("");
        inputRef.current?.focus();
    };
    const remove = (id: number) => {
        onChange(selected.filter((s) => s.observableId !== id));
        // The duration qualified a chip that is gone. Leaving it behind would
        // silently re-attach "3 weeks" to the next chip that happens to reuse
        // this id — the same argument `useConsultChart` makes on its own side.
        onDurationChange?.(id, null);
    };

    /** the alias that explains a non-label match, so the receptionist sees their word landed */
    const matchedAlias = (s: IntakeChip): string | null => {
        const q = query.trim().toLowerCase();
        if (!q || s.label.toLowerCase().includes(q)) return null;
        const hit = s.aliases.find((a) => matchScore(a.term.toLowerCase(), q) !== null);
        return hit?.term ?? null;
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, results.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
            // Consume Enter only while there is a highlighted match to take;
            // otherwise let it bubble to the form's advance/save flow and take
            // the catalogue down with it.
            if (results[active]) {
                e.preventDefault();
                pick(results[active]);
            } else {
                setOpen(false);
                setQuery("");
            }
        } else if (e.key === "Tab") {
            setOpen(false);
            setQuery("");
        } else if (e.key === "Backspace" && !query && selected.length) {
            remove(selected[selected.length - 1].observableId);
        }
    };

    const dropdown =
        open && rect
            ? createPortal(
                  <div
                      ref={dropRef}
                      className="fixed z-[9999] overflow-hidden rounded-[11px] border border-[#e5e2f0] bg-white p-[5px] shadow-[0_18px_46px_rgba(18,44,92,0.16),0_0_0_0.5px_rgba(16,28,46,0.04)]"
                      style={{ top: rect.bottom + 5, left: rect.left, width: rect.width }}
                      role="listbox"
                  >
                      <div className="flex items-center justify-between px-[7px] pb-[6px] pt-[3px]">
                          <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#837bb2]">
                              {catalogLabel}
                          </span>
                          <span className="text-[11px] font-semibold tabular-nums text-[#a8aeba]">{results.length}</span>
                      </div>
                      {/* Fixed max-height + own scroll: the result count never
                          reaches the modal. */}
                      <div className="max-h-[248px] overflow-y-auto">
                          {results.length === 0 ? (
                              <p className="m-0 px-[10px] py-[14px] text-[13px] text-[#a8aeba]">{noMatchLabel}</p>
                          ) : (
                              results.map((s, i) => {
                                  const via = matchedAlias(s);
                                  return (
                                      <button
                                          key={s.observableId}
                                          type="button"
                                          role="option"
                                          aria-selected={i === active}
                                          onMouseEnter={() => setActive(i)}
                                          onClick={() => pick(s)}
                                          className={`flex w-full items-center gap-[9px] rounded-[7px] px-[10px] py-[8px] text-left text-[13.5px] font-[550] text-[#161d29] transition-colors ${
                                              i === active ? "bg-[rgba(99,102,241,0.1)]" : "hover:bg-[#f6f6fb]"
                                          }`}
                                      >
                                          <Plus size={13} className="shrink-0 text-[#a8aeba]" />
                                          <span className="min-w-0 flex-1 truncate">
                                              {s.label}
                                              {via && <span className="ml-[6px] font-normal text-[#8b93a3]">· {via}</span>}
                                          </span>
                                          {/* When one field searches both kinds, the row says
                                              which — a history row and a symptom row must not
                                              look alike. Otherwise fall back to the body system. */}
                                          {showKindTag ? (
                                              <span className={`shrink-0 rounded-[5px] px-[6px] py-[1px] text-[10px] font-bold uppercase tracking-[0.04em] ${
                                                  s.kind === "history" ? "bg-[rgba(124,92,240,0.1)] text-[#7c5cf0]" : "bg-[#f0f1f5] text-[#8a91a0]"
                                              }`}>
                                                  {KIND_LABEL[s.kind] ?? s.kind}
                                              </span>
                                          ) : (
                                              s.system && (
                                                  <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.03em] text-[#b3b9c6]">
                                                      {s.system.replace(/_/g, " ")}
                                                  </span>
                                              )
                                          )}
                                      </button>
                                  );
                              })
                          )}
                      </div>
                      {restCount > 0 && (
                          <p className="m-0 px-[10px] pb-[4px] pt-[7px] text-[11.5px] text-[#a8aeba]">
                              {t("pickerMore", { n: restCount })}
                          </p>
                      )}
                  </div>,
                  document.body
              )
            : null;

    return (
        <div ref={rootRef}>
            {/* Fixed height, always — the well is the same size with zero chips
                or fifty (it scrolls); the modal never moves with what is in it. */}
            <div
                ref={boxRef}
                onClick={() => { inputRef.current?.focus(); setOpen(true); }}
                className={`flex h-[62px] cursor-text flex-wrap content-start items-start gap-[6px] overflow-y-auto rounded-[10px] border-[1.5px] px-3 py-[6px] transition-[border-color,box-shadow,background-color] duration-150 ${
                    error
                        ? "border-[#d23b34] bg-[#fffafa]"
                        : open
                            ? "border-[#7c5cf0] bg-white shadow-[0_0_0_3px_rgba(99,102,241,0.22)]"
                            : "border-[#e9e7f4] bg-[#f8f8fd] hover:border-[#d9d3ee]"
                }`}
            >
                {selected.map((s) => (
                    <span
                        key={s.observableId}
                        /* Violet = history, rose = what the patient reports. The
                           exact pairing Cortex's own Case Sheet uses (CaseSheet's
                           TONE table), so one chip is the same colour at the desk
                           and in the consult room. The symptom half used to be
                           plain white, which read as "not yet classified" beside
                           a tinted history chip. */
                        className={`flex items-center gap-[5px] rounded-[8px] border py-[4px] pl-[9px] pr-[5px] text-[12.5px] font-medium shadow-[0_1px_2px_rgba(20,30,50,0.05)] ${
                            showKindTag && s.kind === "history"
                                ? "border-[#e2d9fb] bg-[rgba(124,92,240,0.07)] text-[#5b4bb0]"
                                : "border-[#f6c9d3] bg-[rgba(244,114,182,0.07)] text-[#a63a5c]"
                        }`}
                    >
                        {s.label}
                        {onDurationChange && s.kind === "symptom" && ASKS_DURATION.has(s.slug) && (
                            <DurationBox
                                days={durations?.get(s.observableId) ?? null}
                                onChange={(d) => onDurationChange(s.observableId, d)}
                            />
                        )}
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); remove(s.observableId); }}
                            aria-label={`${t("cancel")} ${s.label}`}
                            className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] text-[#a8aeba] transition-colors hover:bg-[#eef0f5] hover:text-[#5a6472]"
                        >
                            <span aria-hidden className="text-[13px] leading-none">×</span>
                        </button>
                    </span>
                ))}
                <div className="flex h-[26px] min-w-[120px] flex-1 items-center gap-[7px]">
                    <Search size={14} className="shrink-0 text-[#a8aeba]" />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                        onFocus={() => setOpen(true)}
                        onKeyDown={onKeyDown}
                        placeholder={selected.length ? "" : placeholder}
                        className="fd-bare"
                    />
                </div>
            </div>
            {dropdown}
        </div>
    );
}

/**
 * "How long?" on the chip that owns it.
 *
 * ── Why a free box and not a menu ─────────────────────────────────────────
 * Anmol, 2026-09-03: "if I try to put four days or five days there, there
 * isn't any option — there are just hardcoded options like one day, two days,
 * three days, one week." A fixed ladder cannot hold what a patient actually
 * says, so this takes any of `3` (days), `3d`, `2w`, `6m`, `1y` and stores
 * days. The hint under the caret says so rather than making anyone guess.
 *
 * ── Why it is a `<span role="button">` and not a `<button>` ───────────────
 * It lives inside a chip that already carries its own × button, and a button
 * inside a button is the invalid-DOM/hydration trap `cortex-gotchas.md`
 * records this codebase hitting twice. The chip itself is not interactive, so
 * a real `<button>` would be legal here — but the box becomes an `<input>` the
 * moment it is opened, and nesting THAT in a button is the same problem one
 * layer down. One shape, correct in both states.
 */
function DurationBox({ days, onChange }: { days: number | null; onChange: (days: number | null) => void }) {
    const [editing, setEditing] = useState(false);
    const [raw, setRaw] = useState("");
    const ref = useRef<HTMLInputElement>(null);

    useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

    const commit = () => {
        const q = raw.trim();
        setEditing(false);
        setRaw("");
        if (!q) return;                       // left empty = skipped, not zero
        const exact = parseDurationDays(q);
        if (exact !== null) { onChange(exact); return; }
        const bare = bareNumber(q);           // a plain number means days
        if (bare !== null) onChange(bare);
    };

    if (editing) {
        return (
            <input
                ref={ref}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                onBlur={commit}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                    e.stopPropagation();      // never reaches the picker's own Enter/Backspace
                    if (e.key === "Enter") { e.preventDefault(); commit(); }
                    if (e.key === "Escape") { e.preventDefault(); setEditing(false); setRaw(""); }
                }}
                placeholder="3d / 2w"
                aria-label="How long — a number of days, or 3d / 2w / 6m"
                className="h-[18px]! w-[52px] rounded-[5px]! border! border-[#e2e5ee]! bg-white! px-[4px]! text-[10.5px]! font-semibold text-[#374151] outline-none"
            />
        );
    }

    return (
        <span
            role="button"
            tabIndex={0}
            title={days ? "How long — click to change" : "How long has this been going on?"}
            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setEditing(true); }
            }}
            className={`flex cursor-pointer items-center gap-[3px] rounded-[5px] px-[5px] py-[1px] text-[10.5px] font-bold tabular-nums leading-none transition-colors ${
                days ? "bg-black/[0.07] text-current" : "text-current opacity-45 hover:opacity-80"
            }`}
        >
            {days ? shortDuration(days) : <Clock3 size={10} aria-hidden="true" />}
        </span>
    );
}
