import { create } from "zustand";
import { apiFetch } from "../lib/apiFetch";
import { DockerState, DockerActionType, ImageUpdateCheckResponse, formatPlatform } from "@dim/shared";
import { toDigest } from "../features/images/lib/digest";

interface DockerStoreState {
    /** Map of clientId → DockerState */
    dockerStates: Record<string, DockerState>;

    setDockerState: (clientId: string, state: DockerState) => void;
    getDockerState: (clientId: string) => DockerState | null;

    /** Fetch initial Docker state for a client via REST */
    fetchDockerState: (clientId: string) => Promise<void>;

    /** Tell the client agent to re-scan its Docker daemon */
    refreshDockerState: (clientId: string) => Promise<void>;

    /** Check if a newer version of an image is available */
    checkImageUpdate: (imageRef: string, repoDigests: string[]) => Promise<void>;

    /** Map of imageRef and repoDigests → true while a checkImageUpdate call is in flight */
    checkingImages: Record<string, boolean>;

    /** Map of `${clientId}::${imageRef}` → true while image:update is in flight */
    imageUpdateStatus: Record<string, boolean>;

    /** Pull updated image and recreate all affected containers on each client */
    /** `containerIds`, per host, limits the recreate to those containers; absent, it covers all on the image. */
    /** `force` recreates those already on the new image too. */
    updateImage: (
        imageRef: string,
        clientIds: string[],
        containerIds?: Record<string, string[]>,
        force?: boolean,
    ) => Promise<void>;

    /** Remove an image from all specified clients */
    removeImage: (imageRef: string, clientIds: string[]) => Promise<void>;

    /** Send a container action to one or more client instances */
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
            const res = await apiFetch(`/api/v1/clients/${clientId}/docker`);
            if (!res.ok) return;
            const state: DockerState = await res.json();
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
        } catch {
            // silently ignore – state will arrive via WebSocket
        }
    },

    refreshDockerState: async (clientId) => {
        try {
            await apiFetch(`/api/v1/clients/${clientId}/docker/refresh`, {
                method: "POST",
            });
        } catch {
            // silently ignore – update will arrive via WebSocket
        }
    },

    checkingImages: {},

    imageUpdateStatus: {},

    containerAction: async (action, instances) => {
        await Promise.all(
            instances.map(({ clientId, containerId }) =>
                apiFetch(`/api/v1/clients/${clientId}/docker/action`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action, target: containerId }),
                }),
            ),
        );
    },

    removeImage: async (imageRef, clientIds) => {
        await Promise.all(
            clientIds.map((clientId) =>
                apiFetch(`/api/v1/clients/${clientId}/docker/action`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "image:remove", target: imageRef }),
                }),
            ),
        );
    },

    updateImage: async (imageRef, clientIds, containerIds, force) => {
        set((s) => {
            const next = { ...s.imageUpdateStatus };
            for (const clientId of clientIds) next[`${clientId}::${imageRef}`] = true;
            return { imageUpdateStatus: next };
        });
        try {
            await Promise.all(
                clientIds.map((clientId) =>
                    apiFetch(`/api/v1/clients/${clientId}/docker/action`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
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
                    }),
                ),
            );
        } finally {
            set((s) => {
                const next = { ...s.imageUpdateStatus };
                for (const clientId of clientIds) delete next[`${clientId}::${imageRef}`];
                return { imageUpdateStatus: next };
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
            const res = await apiFetch(`/api/v1/docker/images/check-update?${params}`);
            if (!res.ok) return;
            const response: ImageUpdateCheckResponse = await res.json();
            set((s) => {
                const updatedStates = { ...s.dockerStates };
                const checkedAt = new Date().toISOString();
                // Each client gets the answer for its own copy: the same tag is another image
                // on another platform. A client the server did not check -- no container runs
                // the image there -- keeps what it had.
                for (const result of response.results ?? []) {
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
