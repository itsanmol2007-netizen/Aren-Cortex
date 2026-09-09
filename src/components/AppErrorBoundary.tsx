// ---------------------------------------------------------------------------
// The last line of defence. A render-time throw anywhere below this becomes a
// calm, actionable panel instead of a blank white screen — which, for a doctor
// mid-consult, is the difference between "reload and carry on" and "call
// Anmol".
//
// Deliberately self-sufficient: inline styles only, no imports beyond React,
// no dependency on the stylesheet or the design system having loaded. If the
// app is broken enough to land here, assume nothing else works.
//
// `onReset` remounts the subtree without a full page reload — wired in
// main.tsx to also fire on route changes, so navigating away from a screen
// that threw doesn't strand the user on this panel.
// ---------------------------------------------------------------------------

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
    children: ReactNode;
    /** Called by the "Try again" button — clears the error state so the
     *  subtree re-renders. */
    onReset?: () => void;
    /** When this value changes while an error is showing, the boundary clears
     *  itself. main.tsx passes the current pathname, so navigating away from a
     *  screen that threw doesn't strand the user on this panel. */
    resetKey?: string;
}

interface State {
    error: Error | null;
    info: ErrorInfo | null;
    showDetail: boolean;
    copied: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
    state: State = { error: null, info: null, showDetail: false, copied: false };

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        // Keep the full picture in the console for anyone with devtools open.
        // A real reporting sink (Sentry etc.) hangs off exactly here later —
        // one call, everything it needs is in scope.
        console.error("[AppErrorBoundary]", error, info.componentStack);
        this.setState({ info });
    }

    componentDidUpdate(prev: Props) {
        if (this.state.error && prev.resetKey !== this.props.resetKey) {
            this.reset();
        }
    }

    private reset = () => {
        this.setState({ error: null, info: null, showDetail: false, copied: false });
        this.props.onReset?.();
    };

    private reload = () => window.location.reload();

    private goHome = () => {
        window.location.href = "/";
    };

    private copyDetail = async () => {
        const { error, info } = this.state;
        const text = [
            `AREN Cortex — error report`,
            `when: ${new Date().toISOString()}`,
            `where: ${window.location.pathname}${window.location.search}`,
            `agent: ${navigator.userAgent}`,
            ``,
            `${error?.name ?? "Error"}: ${error?.message ?? "unknown"}`,
            ``,
            (error?.stack ?? "").trim(),
            ``,
            `component stack:${info?.componentStack ?? " (unavailable)"}`,
        ].join("\n");
        try {
            await navigator.clipboard.writeText(text);
            this.setState({ copied: true });
            setTimeout(() => this.setState({ copied: false }), 2000);
        } catch {
            /* clipboard blocked — the detail is still visible to select by hand */
        }
    };

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;

        return (
            <div style={S.scrim} role="alert" aria-live="assertive">
                <div style={S.card}>
                    <div style={S.mark} aria-hidden>⚠</div>
                    <h1 style={S.title}>Something went wrong on this screen</h1>
                    <p style={S.body}>
                        Your work up to the last save is safe. Try reloading — if it keeps
                        happening, copy the details below and send them to support.
                    </p>

                    <div style={S.row}>
                        <button style={{ ...S.btn, ...S.btnPrimary }} onClick={this.reload}>
                            Reload
                        </button>
                        <button style={S.btn} onClick={this.reset}>
                            Try again
                        </button>
                        <button style={S.btn} onClick={this.goHome}>
                            Back to start
                        </button>
                    </div>

                    <button
                        style={S.detailToggle}
                        onClick={() => this.setState((s) => ({ showDetail: !s.showDetail }))}
                    >
                        {this.state.showDetail ? "Hide" : "Show"} technical details
                    </button>

                    {this.state.showDetail && (
                        <div style={S.detailWrap}>
                            <pre style={S.pre}>
                                {error.name}: {error.message}
                                {"\n\n"}
                                {(error.stack ?? "").trim()}
                            </pre>
                            <button style={S.copyBtn} onClick={this.copyDetail}>
                                {this.state.copied ? "Copied" : "Copy details"}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }
}

const S: Record<string, React.CSSProperties> = {
    scrim: {
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "#eef3f8",
        fontFamily:
            "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        zIndex: 2147483647,
        overflow: "auto",
    },
    card: {
        width: "100%",
        maxWidth: 460,
        background: "#ffffff",
        border: "1px solid #d9e2ee",
        borderRadius: 14,
        padding: "28px 28px 24px",
        boxShadow: "0 18px 46px rgba(18, 44, 92, 0.15)",
        textAlign: "center",
    },
    mark: {
        fontSize: 28,
        lineHeight: 1,
        color: "#d94040",
        marginBottom: 12,
    },
    title: {
        margin: "0 0 8px",
        fontSize: 17,
        fontWeight: 700,
        color: "#0b1733",
    },
    body: {
        margin: "0 0 20px",
        fontSize: 13.5,
        lineHeight: 1.55,
        color: "#60708e",
    },
    row: {
        display: "flex",
        gap: 8,
        justifyContent: "center",
        flexWrap: "wrap",
    },
    btn: {
        appearance: "none",
        border: "1px solid #d9e2ee",
        background: "#ffffff",
        color: "#0b1733",
        fontSize: 13,
        fontWeight: 600,
        padding: "8px 14px",
        borderRadius: 8,
        cursor: "pointer",
    },
    btnPrimary: {
        border: "1px solid #1268e8",
        background: "#1268e8",
        color: "#ffffff",
    },
    detailToggle: {
        appearance: "none",
        border: "none",
        background: "none",
        color: "#8998b0",
        fontSize: 12,
        cursor: "pointer",
        marginTop: 18,
        textDecoration: "underline",
    },
    detailWrap: {
        marginTop: 12,
        textAlign: "left",
    },
    pre: {
        margin: 0,
        padding: 12,
        background: "#f5f8fc",
        border: "1px solid #e3ebf5",
        borderRadius: 8,
        fontSize: 11,
        lineHeight: 1.5,
        color: "#3a4966",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        maxHeight: 220,
        overflow: "auto",
        fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
    },
    copyBtn: {
        appearance: "none",
        border: "1px solid #d9e2ee",
        background: "#ffffff",
        color: "#0b1733",
        fontSize: 12,
        fontWeight: 600,
        padding: "6px 12px",
        borderRadius: 7,
        cursor: "pointer",
        marginTop: 8,
    },
};
