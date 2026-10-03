import { create } from "zustand";
import { Client, ClientListSchema, UpdateClient } from "@dim/shared";
import { getErrorMessage } from "../utils";
import { api } from "../lib/api";

interface ClientsState {
    clients: Client[];
    isLoading: boolean;
    error: string | null;

    fetchClients: () => Promise<void>;
    deleteClient: (clientId: string) => Promise<void>;
    updateClient: (clientId: string, data: UpdateClient) => Promise<void>;
    createOutboundClient: (data: {
        hostname: string;
        outboundTargetAddress: string;
        registrationSecret: string;
    }) => Promise<void>;
    setClients: (clients: Client[]) => void;
}

export const useClientStore = create<ClientsState>((set, get) => ({
    clients: [],
    isLoading: false,
    error: null,

    /**
     * Fetches the complete list of registered clients from the backend.
     */
    fetchClients: async () => {
        set({ isLoading: true, error: null });
        try {
            const clients = await api.get("/api/v1/clients", ClientListSchema, {
                fallback: "Failed to fetch clients",
            });
            set({ clients });
        } catch (e: unknown) {
            set({ error: getErrorMessage(e) });
        } finally {
            set({ isLoading: false });
        }
    },

    /**
     * Deletes a client by ID with optimistic UI update.
     */
    deleteClient: async (clientId) => {
        const oldClients = get().clients;
        set({ clients: oldClients.filter((c) => c.id !== clientId) });

        try {
            await api.delete(`/api/v1/clients/${clientId}`, { fallback: "Failed to delete client" });
        } catch (e: unknown) {
            set({ clients: oldClients, error: getErrorMessage(e) });
            throw e;
        }
    },

    updateClient: async (clientId, data) => {
        const oldClients = get().clients;
        set({
            clients: oldClients.map((c) =>
                c.id === clientId ? { ...c, ...data } : c,
            ),
        });

        try {
            await api.put(`/api/v1/clients/${clientId}`, data, undefined, {
                fallback: "Failed to update client",
            });
        } catch (e: unknown) {
            set({ clients: oldClients, error: getErrorMessage(e) });
            throw e;
        }
    },

    /**
     * Creates a new outbound client on the server and triggers immediate registration.
     */
    createOutboundClient: async (data) => {
        await api.post("/api/v1/clients/outbound", data, undefined, {
            fallback: "Failed to create outbound client",
        });

        // Refresh list from server (server will push update via WS too)
        await get().fetchClients();
    },

    setClients: (clients) => {
        set({ clients });
    },
}));
