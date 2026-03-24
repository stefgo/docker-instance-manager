import { create } from "zustand";
import { DockerState, ImageUpdateCheckResult } from "@dim/shared";

interface DockerStoreState {
    /** Map of clientId → DockerState */
    dockerStates: Record<string, DockerState>;

    setDockerState: (clientId: string, state: DockerState) => void;
    getDockerState: (clientId: string) => DockerState | null;

    /** Fetch initial Docker state for a client via REST */
    fetchDockerState: (clientId: string, token: string) => Promise<void>;

    /** Map of imageRef → update check result (or "loading") */
    imageUpdateResults: Record<string, ImageUpdateCheckResult | "loading">;

    /** Check if a newer version of an image is available */
    checkImageUpdate: (imageRef: string, repoDigests: string[], token: string) => Promise<void>;

    /** Map of imageRef → true while image:update is in flight */
    imagePullStatus: Record<string, boolean>;

    /** Map of imageRef → true while update command was sent but server hasn't confirmed completion yet */
    imagesPendingUpdate: Record<string, boolean>;

    /** Pull updated image and recreate all affected containers on each client */
    pullImage: (imageRef: string, clientIds: string[], token: string) => Promise<void>;
}

export const useDockerStore = create<DockerStoreState>((set, get) => ({
    dockerStates: {},

    setDockerState: (clientId, newState) =>
        set((s) => {
            // Find image tags in the new state that have a pending update
            const completedRefs: string[] = [];
            for (const img of newState.images) {
                for (const tag of img.repoTags) {
                    if (s.imagesPendingUpdate[tag]) {
                        completedRefs.push(tag);
                    }
                }
            }

            if (completedRefs.length === 0) {
                return { dockerStates: { ...s.dockerStates, [clientId]: newState } };
            }

            // Patch ALL client states for images whose update just completed
            const updateCheckPatch = {
                hasUpdate: false,
                localDigest: null,
                remoteDigest: null,
                checkedAt: new Date().toISOString(),
            };

            const updatedStates = { ...s.dockerStates, [clientId]: newState };
            for (const [cId, state] of Object.entries(updatedStates)) {
                const patchedImages = state.images.map((img) =>
                    img.repoTags.some((t) => completedRefs.includes(t))
                        ? { ...img, updateCheck: updateCheckPatch }
                        : img,
                );
                if (patchedImages.some((img, i) => img !== state.images[i])) {
                    updatedStates[cId] = { ...state, images: patchedImages };
                }
            }

            const updatedPending = { ...s.imagesPendingUpdate };
            for (const ref of completedRefs) {
                delete updatedPending[ref];
            }

            return { dockerStates: updatedStates, imagesPendingUpdate: updatedPending };
        }),

    getDockerState: (clientId) => get().dockerStates[clientId] ?? null,

    fetchDockerState: async (clientId, token) => {
        try {
            const res = await fetch(`/api/v1/clients/${clientId}/docker`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return;
            const state: DockerState = await res.json();
            set((s) => ({ dockerStates: { ...s.dockerStates, [clientId]: state } }));
        } catch {
            // silently ignore – state will arrive via WebSocket
        }
    },

    imageUpdateResults: {},

    imagePullStatus: {},

    imagesPendingUpdate: {},

    pullImage: async (imageRef, clientIds, token) => {
        set((s) => ({
            imagePullStatus: { ...s.imagePullStatus, [imageRef]: true },
            imagesPendingUpdate: { ...s.imagesPendingUpdate, [imageRef]: true },
        }));
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
        set((s) => ({ imageUpdateResults: { ...s.imageUpdateResults, [imageRef]: "loading" } }));
        try {
            const params = new URLSearchParams({ image: imageRef });
            if (repoDigests.length > 0) {
                params.set("repoDigests", repoDigests.join(","));
            }
            const res = await fetch(`/api/v1/docker/images/check-update?${params}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            // Clear loading state regardless of outcome
            set((s) => {
                const next = { ...s.imageUpdateResults };
                delete next[imageRef];
                return { imageUpdateResults: next };
            });

            if (!res.ok) return;

            const result: ImageUpdateCheckResult = await res.json();

            // Patch the matching image in all dockerStates so the result survives re-renders
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
                            : img
                    );
                    if (images.some((img, i) => img !== state.images[i])) {
                        updatedStates[clientId] = { ...state, images };
                    }
                }
                return { dockerStates: updatedStates };
            });
        } catch {
            set((s) => {
                const next = { ...s.imageUpdateResults };
                delete next[imageRef];
                return { imageUpdateResults: next };
            });
        }
    },
}));
