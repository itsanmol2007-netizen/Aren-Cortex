// ---------------------------------------------------------------------------
// Settings' "App Lock" card — where a doctor turns the PIN lock on, changes
// it, and (if this device supports it) turns on the Face ID/Touch ID/
// Windows Hello fast-unlock. Self-contained on purpose, the same way
// `PrescriptionPreviewModal.tsx` is: `SettingsPage.tsx` only ever renders
// `<AppLockCard userId={...} />` and never touches the crypto itself.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { Fingerprint, Lock, ShieldCheck } from "lucide-react";
import { SettingsCard } from "./SettingsPage";
import {
    hasPinConfigured, setupPin, changePin, hasEscrowBackup, lockNow, getActiveDek,
} from "../../lib/security/deviceKey";
import { exportDekBytes } from "../../lib/security/crypto";
import { isWebAuthnUnlockAvailable, registerWebAuthnUnlock } from "../../lib/security/webauthn";

type Mode = "idle" | "setup" | "change";

export function AppLockCard({ userId }: { userId: string }) {
    const [configured, setConfigured] = useState<boolean | null>(null);
    const [escrowed, setEscrowed] = useState(false);
    const [webAuthnOn, setWebAuthnOn] = useState(false);
    const [platformSupported, setPlatformSupported] = useState(false);
    const [mode, setMode] = useState<Mode>("idle");

    const refresh = async () => {
        const [cfg, esc] = await Promise.all([hasPinConfigured(userId), hasEscrowBackup(userId)]);
        setConfigured(cfg);
        setEscrowed(esc);
        setWebAuthnOn(await isWebAuthnUnlockAvailable(userId));
        setPlatformSupported(
            typeof window !== "undefined" && !!window.PublicKeyCredential &&
            await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false)
        );
    };

    useEffect(() => {
        void refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);

    const enableWebAuthn = async () => {
        const dek = getActiveDek(userId);
        if (!dek) return; // Settings is only reachable unlocked, so this shouldn't happen
        const ok = await registerWebAuthnUnlock(userId, await exportDekBytes(dek));
        if (ok) setWebAuthnOn(true);
    };

    return (
        <SettingsCard
            id="set-card-app-lock"
            icon={<Lock size={17} />}
            tint="bg-[rgba(124,58,237,0.10)] text-[var(--cs-violet)]"
            title="App Lock"
        >
            <p className="m-0 rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[12px] py-[9px] text-[12px] leading-[1.5] text-[var(--cs-muted)]">
                A 4-digit PIN, just for you — locks the whole app after 10 minutes of
                inactivity so anyone who picks up this device sees only your name and
                clinic, nothing else.
            </p>

            {configured === null ? null : mode === "setup" ? (
                <PinForm
                    title="Choose a 4-digit PIN"
                    steps={["first", "confirm"]}
                    onSubmit={async (pin) => {
                        const res = await setupPin(userId, pin);
                        setEscrowed(res.escrowed);
                        setConfigured(true);
                        setMode("idle");
                    }}
                    onCancel={() => setMode("idle")}
                />
            ) : mode === "change" ? (
                <PinForm
                    title="Enter your current PIN, then your new one"
                    steps={["old", "first", "confirm"]}
                    onSubmit={async (pin, oldPin) => {
                        const ok = await changePin(userId, oldPin!, pin);
                        if (ok) {
                            setMode("idle");
                            void refresh();
                        }
                        return ok;
                    }}
                    onCancel={() => setMode("idle")}
                />
            ) : configured ? (
                <div className="mt-[10px] flex flex-col gap-[10px]">
                    <div className="flex items-center justify-between gap-[10px] rounded-[10px] border border-[var(--cs-line)] px-[12px] py-[10px]">
                        <span className="flex items-center gap-[8px] text-[12.5px] font-semibold text-[var(--cs-ink)]">
                            <ShieldCheck size={15} className="text-[#16a34a]" /> PIN lock is on
                        </span>
                        <button
                            type="button"
                            onClick={() => setMode("change")}
                            className="rounded-[8px] border border-[var(--cs-line-strong)] bg-white px-[11px] py-[6px] text-[11.5px] font-bold text-[var(--cs-violet)] hover:border-[var(--cs-violet)]"
                        >
                            Change PIN
                        </button>
                    </div>

                    <div className="flex items-center justify-between gap-[10px] rounded-[10px] border border-[var(--cs-line)] px-[12px] py-[10px]">
                        <span className="text-[12px] leading-[1.4] text-[var(--cs-faint)]">
                            {escrowed
                                ? "Recovery is backed up — a forgotten PIN can be reset without losing any data on this device."
                                : "Recovery isn't backed up yet — reconnect to the internet once and it will be, automatically."}
                        </span>
                    </div>

                    {platformSupported && (
                        <div className="flex items-center justify-between gap-[10px] rounded-[10px] border border-[var(--cs-line)] px-[12px] py-[10px]">
                            <span className="flex items-center gap-[8px] text-[12.5px] font-semibold text-[var(--cs-ink)]">
                                <Fingerprint size={15} className="text-[var(--cs-violet)]" /> Fast unlock
                            </span>
                            {webAuthnOn ? (
                                <span className="text-[11.5px] font-bold text-[#16a34a]">On, for this device</span>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => void enableWebAuthn()}
                                    className="rounded-[8px] border border-[var(--cs-line-strong)] bg-white px-[11px] py-[6px] text-[11.5px] font-bold text-[var(--cs-violet)] hover:border-[var(--cs-violet)]"
                                >
                                    Turn on
                                </button>
                            )}
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={() => lockNow()}
                        className="self-start text-[11.5px] font-semibold text-[var(--cs-faint)] underline decoration-[var(--cs-line-strong)] underline-offset-2 hover:text-[var(--cs-ink)]"
                    >
                        Lock now
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => setMode("setup")}
                    className="mt-[10px] flex h-[38px] w-fit cursor-pointer items-center gap-[8px] rounded-[10px] border-0 bg-gradient-to-br from-[#f472b6] to-[#a855f7] px-[16px] text-[12.5px] font-bold text-white transition-opacity hover:opacity-90"
                >
                    <Lock size={14} /> Set up a PIN
                </button>
            )}
        </SettingsCard>
    );
}

/** A tiny state machine covering both flows this card needs: `["first",
 *  "confirm"]` for first-time setup, `["old", "first", "confirm"]` for a
 *  change. One shared component so the two never drift into inconsistent
 *  copy or behaviour. */
function PinForm({
    title, steps, onSubmit, onCancel,
}: {
    title: string;
    steps: ("old" | "first" | "confirm")[];
    onSubmit: (newPin: string, oldPin?: string) => Promise<boolean | void>;
    onCancel: () => void;
}) {
    const [stepIndex, setStepIndex] = useState(0);
    const [oldPin, setOldPin] = useState("");
    const [firstPin, setFirstPin] = useState("");
    const [value, setValue] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const step = steps[stepIndex];
    const label =
        step === "old" ? "Current PIN" : step === "first" ? "New PIN" : "Confirm new PIN";

    const advance = async (digits: string) => {
        if (step === "old") {
            setOldPin(digits);
            setValue("");
            setStepIndex(stepIndex + 1);
            return;
        }
        if (step === "first") {
            setFirstPin(digits);
            setValue("");
            setStepIndex(stepIndex + 1);
            return;
        }
        // "confirm"
        if (digits !== firstPin) {
            setError("PINs didn't match — start over.");
            setValue("");
            setStepIndex(steps.indexOf("old") >= 0 ? 1 : 0);
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const result = await onSubmit(digits, oldPin || undefined);
            if (result === false) setError("That current PIN wasn't right.");
        } finally {
            setBusy(false);
        }
    };

    const onChange = (raw: string) => {
        const digits = raw.replace(/\D/g, "").slice(0, 4);
        setValue(digits);
        if (digits.length === 4) void advance(digits);
    };

    return (
        <div className="mt-[10px] flex flex-col gap-[10px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] p-[12px]">
            <span className="text-[12px] font-semibold text-[var(--cs-ink)]">{title}</span>
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--cs-faint)]">{label}</span>
            <input
                type="password"
                inputMode="numeric"
                autoFocus
                disabled={busy}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-[42px] w-[120px] rounded-[9px] border border-[var(--cs-line-strong)] bg-white text-center text-[18px] font-bold tracking-[0.5em] text-[var(--cs-ink)] outline-none focus:border-[var(--cs-violet)]"
            />
            {error && <span className="text-[11.5px] font-semibold text-[var(--cs-red)]">{error}</span>}
            <button
                type="button"
                onClick={onCancel}
                className="w-fit text-[11.5px] font-semibold text-[var(--cs-faint)] hover:text-[var(--cs-ink)]"
            >
                Cancel
            </button>
        </div>
    );
}
