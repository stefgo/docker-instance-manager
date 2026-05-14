import { create } from "zustand";
import { Client } from "@dim/shared";
import { getErrorMessage } from "../utils";

interface ClientsState {
  clients: Client[];
  isLoading: boolean;
  error: string | null;

  fetchClients: (token: string) => Promise<void>;
  deleteClient: (clientId: string, token: string) => Promise<void>;
  updateClient: (
    clientId: string,
    data: { displayName?: string },
    token: string,
  ) => Promise<void>;
  createOutboundClient: (
    data: { hostname: string; outboundTargetAddress: string; registrationSecret: string },
    token: string,
  ) => Promise<void>;
  setClients: (clients: Client[]) => void;
}

export const useClientStore = create<ClientsState>((set, get) => ({
  clients: [],
  isLoading: false,
  error: null,

  /**
   * Fetches the complete list of registered clients from the backend.
   */
  fetchClients: async (token) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch("/api/v1/clients", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch clients");
      const data = await res.json();
      set({ clients: data });
    } catch (e: unknown) {
      set({ error: getErrorMessage(e) });
    } finally {
      set({ isLoading: false });
    }
  },

  /**
   * Deletes a client by ID with optimistic UI update.
   */
  deleteClient: async (clientId, token) => {
    const oldClients = get().clients;
    set({ clients: oldClients.filter((c) => c.id !== clientId) });

    try {
      const res = await fetch(`/api/v1/clients/${clientId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete client");
      }
    } catch (e: unknown) {
      set({ clients: oldClients, error: getErrorMessage(e) });
      throw e;
    }
  },

  updateClient: async (clientId, data, token) => {
    const oldClients = get().clients;
    set({
      clients: oldClients.map((c) =>
        c.id === clientId ? { ...c, displayName: data.displayName } : c,
      ),
    });

    try {
      const res = await fetch(`/api/v1/clients/${clientId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update client");
      }
    } catch (e: unknown) {
      set({ clients: oldClients, error: getErrorMessage(e) });
      throw e;
    }
  },

  /**
   * Creates a new outbound client on the server and triggers immediate registration.
   */
  createOutboundClient: async (data, token) => {
    const res = await fetch("/api/v1/clients/outbound", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to create outbound client");
    }

    // Refresh list from server (server will push update via WS too)
    await get().fetchClients(token);
  },

  setClients: (clients) => {
    set({ clients });
  },
}));
