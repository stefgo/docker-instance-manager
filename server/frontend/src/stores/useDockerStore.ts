import { create } from "zustand";
import { api, ApiError } from "../lib/api";
import { forEachHost } from "../lib/hostResults";
import {
    DockerState,
    DockerStateSchema,
    DockerActionResultSchema,
    DockerActionType,
    ImageUpdateCheckResponseSchema,
    formatPlatform,
} from "@dim/shared";
import { toDigest } from "../features/images/lib/digest";
import { clientName } from "../utils";
import { useClientStore } from "./useClientStore";

/** A host by the name the lists show it under, for a refusal that has to say whose it is. */
function hostName(clientId: string): string {
    const client = useClientStore.getState().clients.find((c) => c.id === clientId);
    return client ? clientName(client) : clientId;
}

/**
 * One Docker action on one host. The server answers with the agent's own result and with
 * 500 when the agent reports a failure, so a refusal arrives here as an `ApiError` that
 * carries the agent's reason.
 */
const sendAction = (clientId: string, body: { action: string; target?: string; params?: unknown }) =>
    api.post(`/api/v1/clients/${clientId}/docker/action`, body, DockerActionResultSchema, {
        fallback: "The action failed",
    });

interface DockerStoreState {
    /** Map of clientId → DockerState */
    dockerStates: Record<string, DockerState>;

    setDockerState: (clientId: string, state: DockerState) => void;
    getDockerState: (clientId: string) => DockerState | null;

    /** Fetch initial Docker state for a client via REST */
    fetchDockerState: (clientId: string) => Promise<void>;

    /** Tell the client agent to re-scan its Docker daemon. Throws when the host cannot be asked. */
    refreshDockerState: (clientId: string) => Promise<void>;

    /** Check if a newer version of an image is available. Throws when the check cannot be run. */
    checkImageUpdate: (imageRef: string, repoDigests: string[]) => Promise<void>;

    /** Map of imageRef and repoDigests → true while a checkImageUpdate call is in flight */
    checkingImages: Record<string, boolean>;

    /** Map of `${clientId}::${imageRef}` → true while image:update is in flight */
    updatingImages: Record<string, boolean>;

    /**
     * Pull updated image and recreate all affected containers on each client. Every client
     * is asked; the ones that refuse are thrown together as a `HostActionError`.
     */
    /** `containerIds`, per host, limits the recreate to those containers; absent, it covers all on the image. */
    /** `force` recreates those already on the new image too. */
    updateImage: (
        imageRef: string,
        clientIds: string[],
        containerIds?: Record<string, string[]>,
        force?: boolean,
    ) => Promise<void>;

    /** Remove an image from all specified clients. Throws like `updateImage`. */
    removeImage: (imageRef: string, clientIds: string[]) => Promise<void>;

    /**
     * Remove every image no container on the host uses, tagged or not. Throws with the
     * server's message when the action fails, so a dialog that asked for it stays open.
     */
    pruneImages: (clientId: string) => Promise<void>;

    /** Send a container action to one or more client instances. Throws like `updateImage`. */
    containerAction: (action: DockerActionType, instances: { clientId: string; containerId: string }[]) => Promise<void>;
}

export const useDockerStore = create<DockerStoreState>((set, get) => ({
    dockerStates: {},

    setDockerState: (clientId, newState) =>
        set((s) => {
            // Carry over existing updateCheck values for images not yet re-checked
            const existingState = s.dockerStates[clientId];
            const enrichedState = existingState
                ? {
                      ...newState,
                      images: newState.images.map((img) => {
                          if (img.updateCheck) return img;
                          // Same tag on the same platform: another platform is another image.
                          const prev = existingState.images.find((e) =>
                              formatPlatform(e.platform) === formatPlatform(img.platform) &&
                              e.repoTags.some((t) => img.repoTags.includes(t)),
                          );
                          if (!prev?.updateCheck) return img;
                          // If the local digest now matches the remote digest, the pull succeeded → image is current
                          const newLocalDigest = img.repoDigests[0]?.split("@")[1] ?? null;
                          if (newLocalDigest && newLocalDigest === prev.updateCheck.remoteDigest) {
                              return {
                                  ...img,
                                  updateCheck: {
                                      ...prev.updateCheck,
                                      hasUpdate: false,
                                      checkedAt: new Date().toISOString(),
                                  },
                              };
                          }
                          // Digest changed but doesn't match remote — discard stale check
                          if (img.repoDigests.join() !== prev.repoDigests.join()) return img;
                          return { ...img, updateCheck: prev.updateCheck };
                      }),
                  }
                : newState;

            return { dockerStates: { ...s.dockerStates, [clientId]: enrichedState } };
        }),

    getDockerState: (clientId) => get().dockerStates[clientId] ?? null,

    fetchDockerState: async (clientId) => {
        try {
            const state = await api.get(`/api/v1/clients/${clientId}/docker`, DockerStateSchema);
            set((s) => {
                const existing = s.dockerStates[clientId];
                const images = existing
                    ? state.images.map((img) => {
                          if (img.updateCheck) return img;
                          const prev = existing.images.find((e) =>
                              formatPlatform(e.platform) === formatPlatform(img.platform) &&
                              e.repoTags.some((t) => img.repoTags.includes(t)),
                          );
                          if (!prev?.updateCheck) return img;
                          const newLocalDigest = img.repoDigests[0]?.split("@")[1] ?? null;
                          if (newLocalDigest && newLocalDigest === prev.updateCheck.remoteDigest) {
                              return {
                                  ...img,
                                  updateCheck: {
                                      ...prev.updateCheck,
                                      hasUpdate: false,
                                      checkedAt: new Date().toISOString(),
                                  },
                              };
                          }
                          if (img.repoDigests.join() !== prev.repoDigests.join()) return img;
                          return { ...img, updateCheck: prev.updateCheck };
                      })
                    : state.images;
                return { dockerStates: { ...s.dockerStates, [clientId]: { ...state, images } } };
            });
        } catch (e) {
            // A host that has never reported has no state: an ordinary answer, not a failure.
            if (e instanceof ApiError && e.status === 404) return;
            // Anything else is not shown either, because nothing is missing: the server
            // sends every host's state over the socket on connect and on every change, and
            // this request only repeats it.
            console.error(`Failed to fetch the Docker state of ${hostName(clientId)}`, e);
        }
    },

    refreshDockerState: async (clientId) => {
        await api.post(`/api/v1/clients/${clientId}/docker/refresh`, undefined, undefined, {
            fallback: "The host could not be asked to report its state",
        });
    },

    checkingImages: {},

    updatingImages: {},

    containerAction: (action, instances) =>
        forEachHost(
            instances,
            ({ clientId, containerId }) => sendAction(clientId, { action, target: containerId }),
            hostName,
        ),

    removeImage: (imageRef, clientIds) =>
        forEachHost(
            clientIds.map((clientId) => ({ clientId })),
            ({ clientId }) => sendAction(clientId, { action: "image:remove", target: imageRef }),
            hostName,
        ),

    pruneImages: async (clientId) => {
        await sendAction(clientId, { action: "image:prune" });
    },

    updateImage: async (imageRef, clientIds, containerIds, force) => {
        set((s) => {
            const next = { ...s.updatingImages };
            for (const clientId of clientIds) next[`${clientId}::${imageRef}`] = true;
            return { updatingImages: next };
        });
        try {
            await forEachHost(
                clientIds.map((clientId) => ({ clientId })),
                ({ clientId }) =>
                    sendAction(clientId, {
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
                hostName,
            );
        } finally {
            set((s) => {
                const next = { ...s.updatingImages };
                for (const clientId of clientIds) delete next[`${clientId}::${imageRef}`];
                return { updatingImages: next };
            });
        }
    },

    checkImageUpdate: async (imageRef, repoDigests) => {
        // Keyed the way `isCheckingImage` reads it back: by digest, or by reference without one.
        const checkingKeys = repoDigests.length > 0 ? repoDigests.map(toDigest) : [imageRef];
        set((s) => {
            const next = { ...s.checkingImages };
            for (const key of checkingKeys) next[key] = true;
            return { checkingImages: next };
        });
        try {
            const params = new URLSearchParams({ repoTag: imageRef });
            if (repoDigests.length > 0) {
                params.set("repoDigests", repoDigests.join(","));
            }
            const response = await api.get(
                `/api/v1/docker/images/check-update?${params}`,
                ImageUpdateCheckResponseSchema,
                { fallback: "The update check failed" },
            );
            set((s) => {
                const updatedStates = { ...s.dockerStates };
                const checkedAt = new Date().toISOString();
                // Each client gets the answer for its own copy: the same tag is another image
                // on another platform. A client the server did not check -- no container runs
                // the image there -- keeps what it had.
                for (const result of response.results) {
                    const state = updatedStates[result.clientId];
                    if (!state) continue;
                    const platform = formatPlatform(result.platform);
                    const images = state.images.map((img) =>
                        formatPlatform(img.platform) === platform &&
                        (repoDigests.length > 0
                            ? repoDigests.some((d) => img.repoDigests.includes(d))
                            : img.repoTags.includes(imageRef))
                            ? {
                                  ...img,
                                  updateCheck: {
                                      hasUpdate: result.hasUpdate,
                                      remoteDigest: result.remoteDigest,
                                      checkedAt,
                                      ...(result.error ? { error: result.error } : {}),
                                  },
                              }
                            : img,
                    );
                    if (images.some((img, i) => img !== state.images[i])) {
                        updatedStates[result.clientId] = { ...state, images };
                    }
                }
                return { dockerStates: updatedStates };
            });
        } finally {
            set((s) => {
                const next = { ...s.checkingImages };
                for (const key of checkingKeys) delete next[key];
                return { checkingImages: next };
            });
        }
    },
}));
