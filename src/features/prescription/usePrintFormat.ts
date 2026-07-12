import { useState } from "react";

export type PrintFormat = "a5" | "a4" | "thermal";

const STORAGE_KEY = "aren_print_format";

export function usePrintFormat() {
    const saved = localStorage.getItem(STORAGE_KEY) as PrintFormat | null;

    const [format, setFormat] = useState<PrintFormat>(saved ?? "a5");
    const [remembered, setRemembered] = useState<boolean>(!!saved);

    function choose(f: PrintFormat, remember: boolean) {
        setFormat(f);
        setRemembered(remember);
        if (remember) {
            localStorage.setItem(STORAGE_KEY, f);
        } else {
            localStorage.removeItem(STORAGE_KEY);
        }
    }

    function forget() {
        localStorage.removeItem(STORAGE_KEY);
        setRemembered(false);
    }

    return { format, remembered, choose, forget };
}