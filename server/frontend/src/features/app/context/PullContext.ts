import { createContext, useContext } from "react";
import type { PullRequest } from "../../images/confirmations";

/**
 * Asks about a pull & recreate and sends it. Resolves to whether it went out -- not when it
 * was cancelled, nor with nothing to send.
 */
export type Pull = (request: PullRequest) => Promise<boolean>;

// JSX-free by design -- see AuthContext.ts. The provider lives in PullProvider.tsx.
export const PullContext = createContext<Pull | null>(null);

/**
 * Every pull & recreate goes through here: a row's own, a header's over what a list shows or
 * has picked, a project's. A button only says what it would pull (`PullRequest`); how it is
 * asked about, sent and reported is the same wherever it sits.
 */
export const usePull = (): Pull => {
    const context = useContext(PullContext);
    if (!context) {
        throw new Error("usePull must be used within a PullProvider");
    }
    return context;
};
