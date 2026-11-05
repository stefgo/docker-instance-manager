import { describe, expect, it, vi } from "vitest";
import { TOKEN_DEFAULT_LIFETIME_SECONDS, TOKEN_EXPIRY_MARGIN_SECONDS, TokenCache, type RegistryToken } from "./registryToken.js";

/** A cache on a clock the test moves by hand. */
function setup() {
    let now = 1_000_000;
    const cache = new TokenCache(() => now);
    return { cache, advance: (seconds: number) => { now += seconds * 1000; } };
}

const issue = (token: string, expiresInSeconds?: number) =>
    vi.fn(async (): Promise<RegistryToken | null> => (expiresInSeconds === undefined ? { token } : { token, expiresInSeconds }));

describe("TokenCache", () => {
    it("keeps a token until shortly before it expires", async () => {
        const { cache, advance } = setup();
        const fetch = issue("a", 300);

        expect(await cache.get("hub|library/nginx", fetch)).toEqual({ token: "a", cached: false });
        advance(300 - TOKEN_EXPIRY_MARGIN_SECONDS - 1);
        expect(await cache.get("hub|library/nginx", fetch)).toEqual({ token: "a", cached: true });
        expect(fetch).toHaveBeenCalledTimes(1);

        advance(1);
        expect(await cache.get("hub|library/nginx", fetch)).toEqual({ token: "a", cached: false });
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("assumes a lifetime for a token that names none", async () => {
        const { cache, advance } = setup();
        const fetch = issue("a");

        await cache.get("ghcr|o/i", fetch);
        advance(TOKEN_DEFAULT_LIFETIME_SECONDS - TOKEN_EXPIRY_MARGIN_SECONDS - 1);
        await cache.get("ghcr|o/i", fetch);
        expect(fetch).toHaveBeenCalledTimes(1);
        advance(1);
        await cache.get("ghcr|o/i", fetch);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("does not keep a token that expires within the margin", async () => {
        const { cache } = setup();
        const fetch = issue("a", TOKEN_EXPIRY_MARGIN_SECONDS);

        await cache.get("k", fetch);
        await cache.get("k", fetch);

        expect(fetch).toHaveBeenCalledTimes(2);
        expect(cache.size).toBe(0);
    });

    it("keeps tokens apart by key", async () => {
        const { cache } = setup();

        expect((await cache.get("hub|library/nginx", issue("a", 300))).token).toBe("a");
        expect((await cache.get("hub|library/redis", issue("b", 300))).token).toBe("b");
    });

    it("lets callers who ask meanwhile share one request", async () => {
        const { cache } = setup();
        let release!: (token: RegistryToken) => void;
        const fetch = vi.fn(() => new Promise<RegistryToken | null>((resolve) => { release = resolve; }));

        const first = cache.get("k", fetch);
        const second = cache.get("k", fetch);
        release({ token: "a", expiresInSeconds: 300 });

        expect(await first).toEqual({ token: "a", cached: false });
        expect(await second).toEqual({ token: "a", cached: true });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("does not keep the absence of a token", async () => {
        const { cache } = setup();
        const fetch = vi.fn(async (): Promise<RegistryToken | null> => null);

        expect(await cache.get("k", fetch)).toEqual({ token: null, cached: false });
        await cache.get("k", fetch);

        expect(fetch).toHaveBeenCalledTimes(2);
        expect(cache.size).toBe(0);
    });

    it("does not keep a request that threw", async () => {
        const { cache } = setup();
        const failing = vi.fn(async (): Promise<RegistryToken | null> => { throw new Error("down"); });

        await expect(cache.get("k", failing)).rejects.toThrow("down");
        expect(cache.size).toBe(0);
        expect((await cache.get("k", issue("a", 300))).token).toBe("a");
    });

    it("forgets a token the registry refused", async () => {
        const { cache } = setup();
        await cache.get("k", issue("a", 300));

        cache.evict("k", "a");

        expect(await cache.get("k", issue("b", 300))).toEqual({ token: "b", cached: false });
    });

    it("keeps the successor another caller fetched already", async () => {
        const { cache } = setup();
        await cache.get("k", issue("a", 300));
        cache.evict("k", "a");
        await cache.get("k", issue("b", 300));

        // A second caller that was refused with the old token as well.
        cache.evict("k", "a");

        expect(await cache.get("k", issue("c", 300))).toEqual({ token: "b", cached: true });
    });

    it("drops expired entries when it fetches a new one", async () => {
        const { cache, advance } = setup();
        await cache.get("a", issue("a", 300));
        await cache.get("b", issue("b", 300));
        advance(300);

        await cache.get("c", issue("c", 300));

        expect(cache.size).toBe(1);
    });
});
