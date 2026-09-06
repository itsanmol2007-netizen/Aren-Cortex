// ---------------------------------------------------------------------------
// MOCK PROVIDER — the default until Meta credentials exist.
//
// Anmol's V1 spec: "The Communication page should therefore work with
// mock/test message data initially, while the backend interfaces are prepared
// for the real provider."
//
// ── What this is NOT
//
// It is not a stub that returns `{ok: true}`. It goes through the FULL path —
// the credit is debited, the ledger row is written, the message row is
// logged, the status transitions, the balance falls. Everything the doctor
// sees is real; only the WhatsApp hop is simulated. That is the whole point:
// a mock that short-circuits the interesting parts is a mock that proves the
// interesting parts work when they don't.
//
// It also FAILS sometimes, on purpose (`MESSAGING_MOCK_FAILURE_RATE`,
// default 0). The refund path is the one piece of this system that can only
// be exercised by a failure, and a failure path that has never run is a guess.
// Set it to 0.2 for an afternoon and watch REFUND rows appear next to their
// debits.
// ---------------------------------------------------------------------------

/** A plausible-looking Meta message id, so nothing downstream has to special-
 *  case the mock's output. Prefixed `wamid.MOCK` rather than a random string,
 *  because a row that reached production from a misconfigured server should
 *  be identifiable at a glance. */
function mockMessageId() {
    return `wamid.MOCK${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export const mockAdapter = {
    name: "mock",

    /** Always. Needing no credentials is the entire reason it exists. */
    configured() {
        return true;
    },

    async send(message) {
        const failureRate = Number(process.env.MESSAGING_MOCK_FAILURE_RATE || 0);
        if (failureRate > 0 && Math.random() < failureRate) {
            const err = new Error("Mock provider: simulated delivery failure");
            err.providerDetail = "simulated failure (MESSAGING_MOCK_FAILURE_RATE)";
            err.provider = "mock";
            throw err;
        }

        // A real send costs a network round trip. Returning instantly makes
        // every optimistic-UI bug invisible in development and obvious in
        // production, which is exactly backwards.
        await new Promise((resolve) => setTimeout(resolve, 250));

        console.log(
            `[messaging:mock] ${message.purpose} → ${message.to} (${message.patientName || "unknown patient"})`
        );
        return { providerMessageId: mockMessageId(), status: "sent" };
    },
};
