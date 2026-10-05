import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AutoUpdatePolicy } from "@dim/shared";

// DataStore writes below the agent's data directory. The test keeps the one file in memory.
const store = vi.hoisted(() => ({ files: new Map<string, unknown>() }));
vi.mock("../core/DataStore.js", () => ({
    readJsonFile: (name: string) => store.files.get(name) ?? null,
    writeJsonFile: (name: string, value: unknown) => {
        store.files.set(name, value);
        return true;
    },
}));

const POLICY_FILE = "policy.json";

const policy = (over: Partial<AutoUpdatePolicy> = {}): AutoUpdatePolicy => ({
    updatedAt: "2026-01-01T00:00:00.000Z",
    host: { hostname: "docker-01", displayName: null },
    labelKey: "dim.auto-update",
    labelValue: null,
    delayLabelKey: "",
    hostCron: "0 4 * * *",
    projects: [],
    ...over,
});

/** PolicyService keeps what it loaded for the life of the process, so each test gets its own. */
async function freshService() {
    vi.resetModules();
    return (await import("./PolicyService.js")).PolicyService;
}

beforeEach(() => {
    store.files.clear();
});

describe("PolicyService", () => {
    it("knows no policy before one arrived", async () => {
        const PolicyService = await freshService();

        expect(PolicyService.get()).toBeNull();
    });

    it("takes a policy from the server, stores it and tells its listeners", async () => {
        const PolicyService = await freshService();
        const listener = vi.fn();
        PolicyService.subscribe(listener);

        PolicyService.apply(policy());

        expect(PolicyService.get()).toEqual(policy());
        expect(store.files.get(POLICY_FILE)).toEqual(policy());
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it("ignores a malformed policy and keeps acting on the one it has", async () => {
        const PolicyService = await freshService();
        const listener = vi.fn();
        PolicyService.apply(policy());
        PolicyService.subscribe(listener);

        PolicyService.apply({ ...policy(), hostCron: 4 });
        PolicyService.apply(null);

        expect(PolicyService.get()).toEqual(policy());
        expect(store.files.get(POLICY_FILE)).toEqual(policy());
        expect(listener).not.toHaveBeenCalled();
    });

    it("loads the stored policy when the agent comes up without a server", async () => {
        store.files.set(POLICY_FILE, policy({ hostCron: "0 5 * * *" }));
        const PolicyService = await freshService();

        expect(PolicyService.get()?.hostCron).toBe("0 5 * * *");
    });

    it("discards a stored policy that does not parse", async () => {
        store.files.set(POLICY_FILE, { hostCron: "0 5 * * *" });
        const PolicyService = await freshService();

        expect(PolicyService.get()).toBeNull();
    });

    it("tells the remaining listeners when one of them throws", async () => {
        const PolicyService = await freshService();
        const second = vi.fn();
        PolicyService.subscribe(() => {
            throw new Error("listener failed");
        });
        PolicyService.subscribe(second);

        PolicyService.apply(policy());

        expect(second).toHaveBeenCalledTimes(1);
    });
});
