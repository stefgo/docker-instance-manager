import { describe, expect, it } from "vitest";
import { HostActionError, forEachHost, waitForAll } from "./hostResults";

const hosts = [{ clientId: "a" }, { clientId: "b" }, { clientId: "c" }];
const names: Record<string, string> = { a: "alpha", b: "beta", c: "gamma" };
const nameOf = (id: string) => names[id] ?? id;

/** Refuses on the hosts named, with the reason given for each. */
const refusing = (reasons: Record<string, string>) => async ({ clientId }: { clientId: string }) => {
    if (reasons[clientId]) throw new Error(reasons[clientId]);
};

describe("forEachHost", () => {
    it("resolves when every host carried the action out", async () => {
        await expect(forEachHost(hosts, refusing({}), nameOf)).resolves.toBeUndefined();
    });

    it("asks every host, also after one has refused", async () => {
        const asked: string[] = [];
        await forEachHost(hosts, async ({ clientId }) => {
            asked.push(clientId);
            if (clientId === "a") throw new Error("Client is not connected");
        }).catch(() => undefined);
        expect(asked).toEqual(["a", "b", "c"]);
    });

    it("names the hosts that refused and the ones that did not", async () => {
        const error = await forEachHost(hosts, refusing({ b: "Client is not connected" }), nameOf).catch(
            (e: unknown) => e,
        );
        expect(error).toBeInstanceOf(HostActionError);
        expect(error).toMatchObject({
            failed: [{ clientId: "b", message: "Client is not connected" }],
            succeeded: ["a", "c"],
        });
    });

    it("says in its message who refused and why", async () => {
        const send = refusing({ a: "Client is not connected", c: "No such container" });
        await expect(forEachHost(hosts, send, nameOf)).rejects.toThrow(
            "alpha: Client is not connected; gamma: No such container",
        );
    });

    it("says the same refusal of one host once", async () => {
        const twice = [{ clientId: "a" }, { clientId: "a" }];
        await expect(forEachHost(twice, refusing({ a: "Client is not connected" }), nameOf)).rejects.toThrow(
            /^alpha: Client is not connected$/,
        );
    });

    it("falls back to the id of a host nobody names", async () => {
        await expect(forEachHost([{ clientId: "zz" }], refusing({ zz: "Action timed out" }))).rejects.toThrow(
            "zz: Action timed out",
        );
    });

    it("does nothing for no hosts", async () => {
        await expect(forEachHost([], refusing({}), nameOf)).resolves.toBeUndefined();
    });
});

describe("waitForAll", () => {
    it("resolves when every action went through", async () => {
        await expect(waitForAll([Promise.resolve(), Promise.resolve()])).resolves.toBeUndefined();
    });

    it("waits for the rest before it fails", async () => {
        let finished = false;
        const slow = new Promise<void>((resolve) => setTimeout(resolve, 5)).then(() => {
            finished = true;
        });
        await waitForAll([Promise.reject(new Error("alpha: image is in use")), slow]).catch(() => undefined);
        expect(finished).toBe(true);
    });

    it("reports every refusal, each once", async () => {
        const actions = [
            Promise.reject(new Error("alpha: image is in use")),
            Promise.resolve(),
            Promise.reject(new Error("beta: Client is not connected")),
            Promise.reject(new Error("alpha: image is in use")),
        ];
        await expect(waitForAll(actions)).rejects.toThrow(/^alpha: image is in use; beta: Client is not connected$/);
    });
});
