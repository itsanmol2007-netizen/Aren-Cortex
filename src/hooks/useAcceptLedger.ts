// ---------------------------------------------------------------------------
// THE DECISION LEDGER — which engine intent each thing on the plan came from,
// and how the doctor got to it.
//
// Extracted 2026-08-15 alongside useConsultPlan.ts (atlas §14.19, Stage 2).
// It exists as its own hook for one concrete reason, worth stating so nobody
// "simplifies" it back into the plan:
//
//   `useConsultIntelligence` needs the accepted intent ids at RENDER time —
//   they drive companions — and `useConsultPlan` needs the intelligence at
//   render time, for the brand index, the active signals and the hard
//   warnings. Those two cannot both come second. The ledger is the piece they
//   genuinely share, so it is declared first and handed to both.
//
// That is not merely a wiring convenience. This is the record `commitConsultation`
// writes: the ledger IS the decision log's input, and it outlives no
// consultation — every field here resets when the consult does.
//
// ── Why these are six collections and not one
//
// They answer six different questions, and the learning write treats them
// differently:
//
//   acceptedIntents      what was taken, keyed by the intent the engine ranked
//   chosenBrands         which product is on the plan for that intent
//   deliberateBrands     which of those the doctor picked ON PURPOSE — the
//                        only ones that teach the brand model, because
//                        recording a default as a choice would train the model
//                        on its own output
//   searchedAccepts      reached by search rather than by the ranked list, so
//                        it must not be logged as a ranked accept
//   acknowledgedIntents  hard warnings this doctor has actually read
//   dismissedCompanions  nudges waved off, this consultation only — never
//                        persisted, because dismissing a PPI for one patient
//                        says nothing about the next one
//
// Collapsing any of them into the prescription array would lose exactly the
// distinction the decision log depends on.
// ---------------------------------------------------------------------------

import { useCallback, useMemo, useState } from "react";
import type { AcceptPayload } from "../features/consult/types";
import type { SearchedAccept } from "../lib/db/synapse";

export interface AcceptLedger {
  acceptedIntents: Map<number, AcceptPayload>;
  setAcceptedIntents: React.Dispatch<React.SetStateAction<Map<number, AcceptPayload>>>;
  chosenBrands: Map<number, number>;
  setChosenBrands: React.Dispatch<React.SetStateAction<Map<number, number>>>;
  deliberateBrands: Map<number, number>;
  setDeliberateBrands: React.Dispatch<React.SetStateAction<Map<number, number>>>;
  searchedAccepts: SearchedAccept[];
  setSearchedAccepts: React.Dispatch<React.SetStateAction<SearchedAccept[]>>;
  acknowledgedIntents: Set<number>;
  setAcknowledgedIntents: React.Dispatch<React.SetStateAction<Set<number>>>;
  dismissedCompanions: Set<number>;
  setDismissedCompanions: React.Dispatch<React.SetStateAction<Set<number>>>;

  /** what the engine is told the doctor has taken — drives companions */
  acceptedIntentIds: number[];
  acceptedIntentIdSet: Set<number>;

  /**
   * Releasing an intent matters everywhere something is removed: an accept
   * the doctor took back is not an accept, and leaving it in the map would
   * teach the preference model a decision that never happened.
   */
  releaseIntent: (intentId: number) => void;
  reset: () => void;
}

export function useAcceptLedger(): AcceptLedger {
  const [acceptedIntents, setAcceptedIntents] = useState<Map<number, AcceptPayload>>(new Map());
  const [chosenBrands, setChosenBrands] = useState<Map<number, number>>(new Map());
  const [deliberateBrands, setDeliberateBrands] = useState<Map<number, number>>(new Map());
  const [searchedAccepts, setSearchedAccepts] = useState<SearchedAccept[]>([]);
  const [acknowledgedIntents, setAcknowledgedIntents] = useState<Set<number>>(new Set());
  const [dismissedCompanions, setDismissedCompanions] = useState<Set<number>>(new Set());

  const acceptedIntentIds = useMemo(
    () => [...acceptedIntents.keys()],
    [acceptedIntents]
  );

  const acceptedIntentIdSet = useMemo(
    () => new Set(acceptedIntents.keys()),
    [acceptedIntents]
  );

  const releaseIntent = useCallback((intentId: number) => {
    setAcceptedIntents((curr) => {
      const next = new Map(curr);
      next.delete(intentId);
      return next;
    });
    setChosenBrands((curr) => {
      const next = new Map(curr);
      next.delete(intentId);
      return next;
    });
    setSearchedAccepts((curr) => curr.filter((s) => s.intentId !== intentId));
  }, []);

  const reset = useCallback(() => {
    setAcceptedIntents(new Map());
    setChosenBrands(new Map());
    setSearchedAccepts([]);
    setAcknowledgedIntents(new Set());
    setDeliberateBrands(new Map());
    setDismissedCompanions(new Set());
  }, []);

  return {
    acceptedIntents, setAcceptedIntents,
    chosenBrands, setChosenBrands,
    deliberateBrands, setDeliberateBrands,
    searchedAccepts, setSearchedAccepts,
    acknowledgedIntents, setAcknowledgedIntents,
    dismissedCompanions, setDismissedCompanions,
    acceptedIntentIds,
    acceptedIntentIdSet,
    releaseIntent,
    reset,
  };
}
