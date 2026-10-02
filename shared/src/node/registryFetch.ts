import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/**
 * `fetch` for registry requests, with the destination checked before every hop.
 *
 * The registry host comes out of an image reference, and on the server that reference is
 * whatever an agent reported. Unchecked, `nginx:latest` from `169.254.169.254` or from a
 * host on the server's own LAN makes the server issue requests the agent could not -- and
 * `fetch` would follow a redirect there from any public registry, too. So redirects are
 * followed here, one hop at a time, each one through the same check as the first request.
 *
 * The check resolves the name and the connection then resolves it again, so a DNS answer
 * that changes in between is not caught. It closes the plain cases -- a private name, a
 * redirect -- not a rebinding attack.
 */

/** Never a registry: the cloud metadata endpoints live here. Refused even when private ones are allowed. */
const LINK_LOCAL = new BlockList();
LINK_LOCAL.addSubnet("169.254.0.0", 16, "ipv4");
LINK_LOCAL.addSubnet("fe80::", 10, "ipv6");

/** Loopback, RFC 1918, CGNAT, unique-local and unspecified: a registry here is one on the LAN. */
const PRIVATE = new BlockList();
PRIVATE.addSubnet("0.0.0.0", 8, "ipv4");
PRIVATE.addSubnet("10.0.0.0", 8, "ipv4");
PRIVATE.addSubnet("100.64.0.0", 10, "ipv4");
PRIVATE.addSubnet("127.0.0.0", 8, "ipv4");
PRIVATE.addSubnet("172.16.0.0", 12, "ipv4");
PRIVATE.addSubnet("192.168.0.0", 16, "ipv4");
PRIVATE.addAddress("::", "ipv6");
PRIVATE.addAddress("::1", "ipv6");
PRIVATE.addSubnet("fc00::", 7, "ipv6");

/** Registry CDNs redirect once or twice; anything beyond this is a loop. */
const MAX_REDIRECTS = 5;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

let privateAllowed = false;

/**
 * Lets registry requests reach private addresses, for a registry on the LAN. Set once at
 * startup from the process's own config.yaml. Link-local addresses stay refused.
 */
export function allowPrivateRegistries(allow: boolean): void {
    privateAllowed = allow;
}

/** A registry request refused before it was sent; the message is what the UI shows. */
export class RegistryAddressError extends Error {}

/** `::ffff:10.0.0.5` is the IPv4 address it carries, and is checked as one. */
function classify(address: string): { address: string; type: "ipv4" | "ipv6" } {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) return { address: mapped[1], type: "ipv4" };
    return { address, type: isIP(address) === 6 ? "ipv6" : "ipv4" };
}

async function checkDestination(url: URL): Promise<void> {
    if (url.protocol !== "https:") {
        throw new RegistryAddressError(`Registry request refused: ${url.protocol}// is not https`);
    }
    // URL keeps the brackets around an IPv6 literal; isIP and lookup want it without.
    const host = url.hostname.replace(/^\[(.*)\]$/, "$1");
    const addresses = isIP(host)
        ? [host]
        : (await lookup(host, { all: true, verbatim: true })).map((entry) => entry.address);

    for (const raw of addresses) {
        const { address, type } = classify(raw);
        if (LINK_LOCAL.check(address, type)) {
            throw new RegistryAddressError(`Registry request refused: ${host} is link-local`);
        }
        if (!privateAllowed && PRIVATE.check(address, type)) {
            throw new RegistryAddressError(
                `Registry request refused: ${host} is a private address (allow private registries in config.yaml)`,
            );
        }
    }
}

/**
 * `fetch(url, init)` for a registry: https only, no private or link-local destination, and
 * redirects followed by hand so each target passes the same check. The Authorization header
 * is dropped when a redirect leaves the origin -- the CDN a registry sends a blob request
 * to has no business with its bearer token, which is also what `fetch` itself would do.
 *
 * Throws RegistryAddressError for a refused destination, and whatever `fetch` throws for a
 * failed connection.
 */
export async function registryFetch(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    let current = new URL(url);

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        await checkDestination(current);
        const res = await fetch(current, { ...init, headers, redirect: "manual" });
        const location = res.headers.get("location");
        if (!REDIRECT_STATUSES.has(res.status) || !location) return res;

        await res.body?.cancel();
        const next = new URL(location, current);
        if (next.origin !== current.origin) headers.delete("authorization");
        current = next;
    }
    throw new RegistryAddressError(`Registry request refused: more than ${MAX_REDIRECTS} redirects`);
}
