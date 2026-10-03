import { useCallback, useMemo } from "react";
import { queryOptions, useMutation, useMutationState, useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
    DockerActionResultSchema,
    DockerStateSchema,
    ImageUpdateCheckResponseSchema,
    type DockerActionType,
    type DockerState,
} from "@dim/shared";
import { api, ApiError } from "../lib/api";
import { applyImageCheck, carryUpdateChecks, newerState, type ImageCheckTarget } from "../lib/cacheUpdates";
import { forEachHost } from "../lib/hostResults";
import { checkingImagesOf, updatingImagesOf, type ImageUpdateTarget } from "../lib/pendingImages";
import { queryClient } from "../lib/queryClient";
import { mutationKeys, queryKeys } from "../lib/queryKeys";
import { cachedClientName, useClients } from "./clients";

// ── State ────────────────────────────────────────────────────────────────────

/**
 * What a host last reported about its containers, images, volumes and networks. `null`
 * for a host that has never reported: the server answers 404, which is an ordinary state
 * and not a failure.
 *
 * Never stale by age. The server sends every host's state over the socket on connect and
 * again on every change (`DOCKER_STATE_UPDATE`), so the request here is made once, for a
 * page that is open before the socket has delivered -- and never again because the client
 * list changed. Three hooks used to ask for every host's state on every `CLIENTS_UPDATE`.
 */
export const dockerStateOptions = (clientId: string) =>
    queryOptions({
        queryKey: queryKeys.docker.state(clientId),
        queryFn: async (): Promise<DockerState | null> => {
            let fetched: DockerState;
            try {
                fetched = await api.get(`/api/v1/clients/${clientId}/docker`, DockerStateSchema);
            } catch (e) {
                if (e instanceof ApiError && e.status === 404) return null;
                throw e;
            }
            // What the socket delivered while this request was under way is the newer one.
            const cached =
                queryClient.getQueryData<DockerState | null>(queryKeys.docker.state(clientId)) ?? undefined;
            return newerState(cached, carryUpdateChecks(cached, fetched, new Date().toISOString()));
        },
        staleTime: Infinity,
    });

/** `DOCKER_STATE_UPDATE`: a host's new state, keeping the update checks it does not carry. */
export function setDockerState(clientId: string, state: DockerState): void {
    queryClient.setQueryData(dockerStateOptions(clientId).queryKey, (previous) =>
        carryUpdateChecks(previous ?? undefined, state, new Date().toISOString()),
    );
}

/** One host's state; `undefined` until it is known, and for a host that never reported. */
export function useDockerState(clientId: string | null | undefined): DockerState | undefined {
    const { data } = useQuery({ ...dockerStateOptions(clientId ?? ""), enabled: !!clientId });
    return data ?? undefined;
}

/**
 * At module scope, so its identity never changes: `useQueries` runs `combine` again only
 * when a result changed, and hands back the same array otherwise.
 */
const statesOf = (results: UseQueryResult<DockerState | null>[]) => results.map((result) => result.data);

/**
 * Every host's state, keyed by client id -- what the lists across the fleet are built
 * from. A host without a state has no key. The object is the same from render to render
 * until a state or the client list changes, so it can stand in a dependency array.
 */
export function useDockerStates(): Record<string, DockerState> {
    const { clients } = useClients();
    const states = useQueries({
        queries: clients.map((client) => dockerStateOptions(client.id)),
        combine: statesOf,
    });
    return useMemo(() => {
        const byClient: Record<string, DockerState> = {};
        clients.forEach((client, i) => {
            const state = states[i];
            if (state) byClient[client.id] = state;
        });
        return byClient;
    }, [clients, states]);
}

// ── Actions ──────────────────────────────────────────────────────────────────

/**
 * One Docker action on one host. The server answers with the agent's own result and with
 * 500 when the agent reports a failure, so a refusal arrives here as an `ApiError` that
 * carries the agent's reason.
 */
export const sendDockerAction = (
    clientId: string,
    body: { action: DockerActionType; target?: string; params?: unknown },
) =>
    api.post(`/api/v1/clients/${clientId}/docker/action`, body, DockerActionResultSchema, {
        fallback: "The action failed",
    });

/**
 * Sends a container action to one or more instances. Every host is asked; the ones that
 * refuse are thrown together as a `HostActionError`, by name and with their reason.
 */
export const containerAction = (
    action: DockerActionType,
    instances: readonly { clientId: string; containerId: string }[],
) =>
    forEachHost(
        instances,
        ({ clientId, containerId }) => sendDockerAction(clientId, { action, target: containerId }),
        cachedClientName,
    );

/** Removes an image from the hosts named. Throws like `containerAction`. */
export const removeImage = (imageRef: string, clientIds: readonly string[]) =>
    forEachHost(
        clientIds.map((clientId) => ({ clientId })),
        ({ clientId }) => sendDockerAction(clientId, { action: "image:remove", target: imageRef }),
        cachedClientName,
    );

/**
 * Removes every image no container on the host uses, tagged or not. Throws with the
 * server's message when the action fails, so a dialog that asked for it stays open.
 */
export const pruneImages = async (clientId: string): Promise<void> => {
    await sendDockerAction(clientId, { action: "image:prune" });
};

/**
 * Tells a host's agent to scan its Docker daemon again. The new state arrives over the
 * socket; this only throws when the host cannot be asked.
 */
export const refreshDockerState = (clientId: string) =>
    api.post(`/api/v1/clients/${clientId}/docker/refresh`, undefined, undefined, {
        fallback: "The host could not be asked to report its state",
    });

/** A pull as it is asked for: which containers it recreates, and whether it does so regardless. */
export interface ImageUpdateRequest extends ImageUpdateTarget {
    /** Per host, limits the recreate to those containers; absent, it covers all on the image. */
    containerIds?: Record<string, string[]>;
    /** Recreates those already on the new image too. */
    force?: boolean;
}

/**
 * Asks the registry whether an image has an update, and writes each host's answer onto its
 * own copy of the image. A client the server did not check -- no container runs the image
 * there -- keeps what it had.
 */
async function checkImageUpdate(target: ImageCheckTarget): Promise<void> {
    const params = new URLSearchParams({ repoTag: target.imageRef });
    if (target.repoDigests.length > 0) params.set("repoDigests", target.repoDigests.join(","));
    const response = await api.get(`/api/v1/docker/images/check-update?${params}`, ImageUpdateCheckResponseSchema, {
        fallback: "The update check failed",
    });
    const checkedAt = new Date().toISOString();
    for (const result of response.results) {
        queryClient.setQueryData(
            dockerStateOptions(result.clientId).queryKey,
            (state) => state && applyImageCheck(state, target, result, checkedAt),
        );
    }
}

/** Pulls the image on every host named and recreates the containers on it. */
const updateImage = ({ imageRef, clientIds, containerIds, force }: ImageUpdateRequest) =>
    forEachHost(
        clientIds.map((clientId) => ({ clientId })),
        ({ clientId }) =>
            sendDockerAction(clientId, {
                action: "image:update",
                target: imageRef,
                ...(containerIds || force
                    ? {
                          params: {
                              ...(containerIds ? { containerIds: containerIds[clientId] ?? [] } : {}),
                              ...(force ? { force: true } : {}),
                          },
                      }
                    : {}),
            }),
        cachedClientName,
    );

/**
 * The two actions whose being under way a list shows. They are mutations for that reason
 * alone: `useCheckingImages` and `useUpdatingImages` read what is pending off the cache,
 * from whichever component started it.
 *
 * `onFailure` is called for a check or a pull that was refused, with what was asked.
 */
export function useImageMutations(onFailure: (title: string, error: unknown) => void) {
    const check = useMutation({
        mutationKey: mutationKeys.imageCheck,
        mutationFn: checkImageUpdate,
        onError: (error, target) => onFailure(`Could not check ${target.imageRef}`, error),
    });
    const update = useMutation({
        mutationKey: mutationKeys.imageUpdate,
        mutationFn: updateImage,
        onError: (error, request) => onFailure(`Could not update ${request.imageRef}`, error),
    });
    const { mutate: runCheck } = check;
    const { mutate: runUpdate } = update;

    return {
        checkImageUpdate: useCallback(
            (imageRef: string, repoDigests: string[]) => runCheck({ imageRef, repoDigests }),
            [runCheck],
        ),
        updateImage: useCallback(
            (imageRef: string, clientIds: string[], containerIds?: Record<string, string[]>, force?: boolean) =>
                runUpdate({ imageRef, clientIds, containerIds, force }),
            [runUpdate],
        ),
    };
}

/** The update checks under way, keyed as `isCheckingImage` reads them. */
export function useCheckingImages(): Record<string, boolean> {
    const pending = useMutationState({
        filters: { mutationKey: mutationKeys.imageCheck, status: "pending" },
        select: (mutation) => mutation.state.variables as ImageCheckTarget,
    });
    return useMemo(() => checkingImagesOf(pending), [pending]);
}

/** The pulls under way, one key per host and reference (`updatingKey`). */
export function useUpdatingImages(): Record<string, boolean> {
    const pending = useMutationState({
        filters: { mutationKey: mutationKeys.imageUpdate, status: "pending" },
        select: (mutation) => mutation.state.variables as ImageUpdateRequest,
    });
    return useMemo(() => updatingImagesOf(pending), [pending]);
}
