import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./logger.js", () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("node:dns/promises", () => ({
    lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));

import { logger } from "./logger.js";
import { registryFetch } from "./registryFetch.js";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
    fetchMock.mockReset();
    vi.mocked(logger.debug).mockClear();
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("registryFetch", () => {
    it("sends every request with a signal that ends it", async () => {
        fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

        await registryFetch("https://registry.example.com/v2/");

        const init = fetchMock.mock.calls[0][1];
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        expect(init?.signal?.aborted).toBe(false);
    });

    it("keeps a signal the caller passed", async () => {
        fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
        const controller = new AbortController();
        controller.abort();

        await registryFetch("https://registry.example.com/v2/", { signal: controller.signal });

        expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    });

    it("logs each hop with its status, and not the token", async () => {
        fetchMock
            .mockResolvedValueOnce(new Response(null, { status: 307, headers: { location: "https://cdn.example.com/blob" } }))
            .mockResolvedValueOnce(new Response(null, { status: 200 }));

        await registryFetch("https://registry.example.com/v2/x/blobs/sha256:a", {
            headers: { Authorization: "Bearer secret" },
        });

        const lines = vi.mocked(logger.debug).mock.calls.map(([fields]) => fields as Record<string, unknown>);
        expect(lines).toEqual([
            expect.objectContaining({ method: "GET", url: "https://registry.example.com/v2/x/blobs/sha256:a", status: 307 }),
            expect.objectContaining({ method: "GET", url: "https://cdn.example.com/blob", status: 200 }),
        ]);
        expect(JSON.stringify(lines)).not.toContain("secret");
    });

    it("logs a request that threw, and passes the error on", async () => {
        fetchMock.mockRejectedValue(new DOMException("timed out", "TimeoutError"));

        await expect(registryFetch("https://registry.example.com/v2/")).rejects.toThrow("timed out");
        expect(logger.debug).toHaveBeenCalledWith(
            expect.objectContaining({ url: "https://registry.example.com/v2/" }),
            "Registry request failed",
        );
    });
});
