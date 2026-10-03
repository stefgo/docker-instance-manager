import { queryOptions, useQuery } from "@tanstack/react-query";
import { TokenListSchema } from "@dim/shared";
import { api } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";

/**
 * The registration tokens. Always stale: a token is used up by a client registering with
 * it, which nothing tells the dashboard about, so the page reads the list again each time
 * it is opened.
 */
export const tokenListOptions = queryOptions({
    queryKey: queryKeys.tokens.list(),
    queryFn: () => api.get("/api/v1/tokens", TokenListSchema, { fallback: "Failed to load tokens" }),
    staleTime: 0,
});

export function useTokens() {
    return useQuery(tokenListOptions);
}
