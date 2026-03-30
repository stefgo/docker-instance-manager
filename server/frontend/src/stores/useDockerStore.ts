import { create } from "zustand";
import { DockerState, ImageUpdateCheckResult } from "@dim/shared";

interface DockerStoreState {
    /** Map of clientId → DockerState */
    dockerStates: Record<string, DockerState>;

    setDockerState: (clientId: string, state: DockerState) => void;
    getDockerState: (clientId: string) => DockerState | null;

    /** Fetch initial Docker state for a client via REST */
    fetchDockerState: (clientId: string, token: string) => Promise<void>;

    /** Tell the client agent to re-scan its Docker daemon */
    refreshDockerState: (clientId: string, token: string) => Promise<void>;

    /** Check if a newer version of an image is available */
    checkImageUpdate: (imageRef: string, repoDigests: string[], token: string) => Promise<void>;

    /** Map of imageRef → true while image:update is in flight */
    imagePullStatus: Record<string, boolean>;

    /** Pull updated image and recreate all affected containers on each client */
    pullImage: (imageRef: string, clientIds: string[], token: string) => Promise<void>;
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
                          const prev = existingState.images.find((e) =>
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
                                      localDigest: newLocalDigest,
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

    fetchDockerState: async (clientId, token) => {
        try {
            const res = await fetch(`/api/v1/clients/${clientId}/docker`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return;
            const state: DockerState = await res.json();
            set((s) => {
                const existing = s.dockerStates[clientId];
                const images = existing
                    ? state.images.map((img) => {
                          if (img.updateCheck) return img;
                          const prev = existing.images.find((e) =>
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
                                      localDigest: newLocalDigest,
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

    refreshDockerState: async (clientId, token) => {
        try {
            await fetch(`/api/v1/clients/${clientId}/docker/refresh`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
        } catch {
            // silently ignore – update will arrive via WebSocket
        }
    },

    imagePullStatus: {},

    pullImage: async (imageRef, clientIds, token) => {
        set((s) => ({ imagePullStatus: { ...s.imagePullStatus, [imageRef]: true } }));
        try {
            await Promise.all(
                clientIds.map((clientId) =>
                    fetch(`/api/v1/clients/${clientId}/docker/action`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({ action: "image:update", target: imageRef }),
                    }),
                ),
            );
        } finally {
            set((s) => {
                const next = { ...s.imagePullStatus };
                delete next[imageRef];
                return { imagePullStatus: next };
            });
        }
    },

    checkImageUpdate: async (imageRef, repoDigests, token) => {
        try {
            const params = new URLSearchParams({ image: imageRef });
            if (repoDigests.length > 0) {
                params.set("repoDigests", repoDigests.join(","));
            }
            const res = await fetch(`/api/v1/docker/images/check-update?${params}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return;
            const result: ImageUpdateCheckResult = await res.json();
            set((s) => {
                const updatedStates = { ...s.dockerStates };
                for (const [clientId, state] of Object.entries(updatedStates)) {
                    const images = state.images.map((img) =>
                        img.repoTags.includes(imageRef)
                            ? {
                                  ...img,
                                  updateCheck: {
                                      hasUpdate: result.hasUpdate,
                                      localDigest: result.localDigest,
                                      remoteDigest: result.remoteDigest,
                                      checkedAt: new Date().toISOString(),
                                      ...(result.error ? { error: result.error } : {}),
                                  },
                              }
                            : img,
                    );
                    if (images.some((img, i) => img !== state.images[i])) {
                        updatedStates[clientId] = { ...state, images };
                    }
                }
                return { dockerStates: updatedStates };
            });
        } catch {
            // silently ignore
        }
    },
}));
