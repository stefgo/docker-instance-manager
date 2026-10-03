import { queryOptions, useQuery } from "@tanstack/react-query";
import { AutoUpdateLabelSchema } from "@dim/shared";
import { parseLabelFilter, type AutoUpdateLabelFilter } from "../features/containers/autoUpdate";
import { api } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";

/**
 * The Docker label that puts a container into auto-update, as the settings configure it
 * -- the raw `key` or `key=value` text. Nothing is enrolled from here: the container lists
 * read it to show which containers carry it.
 *
 * Never stale by age: the server broadcasts it as `AUTO_UPDATE_LABEL_UPDATE` when it
 * changes. It is not among what a socket sends on connect, so the reconnect reads it again.
 */
export const autoUpdateLabelOptions = queryOptions({
    queryKey: queryKeys.settings.autoUpdateLabel(),
    queryFn: async (): Promise<string> =>
        (
            await api.get("/api/v1/settings/container-auto-update/label", AutoUpdateLabelSchema, {
                fallback: "Could not load the auto-update label",
            })
        ).labelFilter,
    staleTime: Infinity,
});

/** The label as the lists match it; `null` while unknown and when none is configured. */
export function useAutoUpdateLabel(): AutoUpdateLabelFilter | null {
    return useQuery({ ...autoUpdateLabelOptions, select: parseLabelFilter }).data ?? null;
}
