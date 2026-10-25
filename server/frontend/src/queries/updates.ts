import { queryOptions, useQuery } from "@tanstack/react-query";
import { ContainerUpdateListSchema } from "@dim/shared";
import { api } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";

/**
 * Every container update the server keeps, newest first, across all hosts. The dashboard's
 * card and the history page read the same list.
 *
 * Never stale by age: new updates arrive as `UPDATES_APPENDED`. The list is not part of
 * what the socket pushes on connect, so it is read again after a reconnect.
 */
export const updateHistoryOptions = queryOptions({
    queryKey: queryKeys.updates.history(),
    queryFn: () => api.get("/api/v1/updates", ContainerUpdateListSchema, { fallback: "Could not load the update history" }),
    staleTime: Infinity,
});

export function useUpdateHistory() {
    return useQuery(updateHistoryOptions);
}
