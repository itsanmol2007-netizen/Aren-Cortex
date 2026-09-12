import { useEffect, useState } from "react";
import {
    getInstallPromptState,
    subscribeInstallPrompt,
    promptInstall,
    type InstallPromptState,
} from "../lib/pwa/installPrompt";

export interface UseInstallPrompt extends InstallPromptState {
    promptInstall: typeof promptInstall;
}

/** Thin React subscription over `lib/pwa/installPrompt.ts`'s module-level
 *  state — see that file for why capture happens outside React entirely. */
export function useInstallPrompt(): UseInstallPrompt {
    const [state, setState] = useState<InstallPromptState>(getInstallPromptState);
    useEffect(() => subscribeInstallPrompt(() => setState(getInstallPromptState())), []);
    return { ...state, promptInstall };
}
