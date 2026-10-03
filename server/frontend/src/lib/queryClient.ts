import { QueryClient } from "@tanstack/react-query";

/**
 * How long an answer counts as current when nothing pushes changes to it. Long enough that
 * moving between pages does not ask again, short enough that a list nobody broadcasts --
 * users, webhooks -- is read again the next time it is opened.
 */
export const DEFAULT_STALE_MS = 30_000;

/**
 * The one cache for everything the server holds.
 *
 * A module-level instance rather than one created inside `App`: the socket handler in
 * `WebSocketProvider` and `useAutoUpdateRunToasts` write to and read from it outside
 * React's render, where no hook can hand it over.
 *
 * - No refetch on window focus or on the browser's `online` event: the dashboard socket
 *   keeps the cache current, and its reconnect -- not the browser's idea of being online
 *   -- is what invalidates everything (see `WebSocketProvider`).
 * - No retry: an offline host answers an action with a refusal that the page has to show
 *   at once, and an expired session must never be asked again.
 */
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: DEFAULT_STALE_MS,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            retry: false,
        },
        mutations: {
            retry: false,
        },
    },
});
