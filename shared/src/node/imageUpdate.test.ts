import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./logger.js", () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// The registry is a table of answers; every request is recorded, so a test can count them.
vi.mock("./registryFetch.js", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./registryFetch.js")>()),
    registryFetch: vi.fn(),
}));

import { registryFetch } from "./registryFetch.js";

type Answer = Response | (() => Response | Promise<Response>);

const requests: string[] = [];

/** Answers `METHOD url` from `routes`, and with 404 for anything not in it. */
function serve(routes: Record<string, Answer>): void {
    vi.mocked(registryFetch).mockImplementation(async (url: string, init: RequestInit = {}) => {
        const key = `${init.method ?? "GET"} ${url}`;
        requests.push(key);
        const answer = routes[key];
        if (!answer) return new Response(null, { status: 404 });
        return typeof answer === "function" ? answer() : answer.clone();
    });
}

const REGISTRY = "https://registry-1.docker.io/v2/library/nginx";
const TOKEN = "GET https://auth.docker.io/token?service=registry.docker.io&scope=repository:library/nginx:pull";

const token = (value = "t1", expiresIn = 300) => Response.json({ token: value, expires_in: expiresIn });
const head = (digest: string) => new Response(null, { status: 200, headers: { "Docker-Content-Digest": digest } });

/** The module keeps its tokens between calls, so each test starts with a fresh copy. */
async function load() {
    vi.resetModules();
    return (await import("./imageUpdate.js")).ImageUpdateService;
}

beforeEach(() => {
    requests.length = 0;
    vi.mocked(registryFetch).mockReset();
});

describe("checkForUpdate", () => {
    it("answers an unchanged index with the HEAD request alone", async () => {
        serve({ [TOKEN]: token(), [`HEAD ${REGISTRY}/manifests/latest`]: head("sha256:same") });
        const service = await load();

        const result = await service.checkForUpdate("nginx:latest", ["nginx@sha256:same"]);

        expect(result).toMatchObject({ hasUpdate: false, remoteDigest: "sha256:same", localDigest: "sha256:same" });
        expect(requests).toEqual([TOKEN, `HEAD ${REGISTRY}/manifests/latest`]);
    });

    it("names the timeout when the registry does not answer", async () => {
        serve({
            [TOKEN]: token(),
            [`HEAD ${REGISTRY}/manifests/latest`]: () => {
                throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
            },
        });
        const service = await load();

        const result = await service.checkForUpdate("nginx:latest", ["nginx@sha256:old"]);

        expect(result).toMatchObject({ hasUpdate: false, error: "Registry did not answer within 15 s" });
        expect(result.rateLimited).toBeUndefined();
    });

    it("still calls a connection that failed otherwise unreachable", async () => {
        serve({
            [TOKEN]: token(),
            [`HEAD ${REGISTRY}/manifests/latest`]: () => {
                throw new TypeError("fetch failed");
            },
        });
        const service = await load();

        const result = await service.checkForUpdate("nginx:latest", ["nginx@sha256:old"]);

        expect(result.error).toBe("Registry unreachable");
    });
});
