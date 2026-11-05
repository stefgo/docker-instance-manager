/**
 * The bearer tokens of registry requests, kept until shortly before they expire.
 *
 * A check used to ask the token service for every image it looked at, so an image without
 * an update cost two requests: the token and the HEAD. A token is valid for the repository
 * it was issued for, for minutes (`expires_in`, 300 s at Docker Hub), so it is kept here and
 * the next check of the same repository asks the registry alone.
 *
 * Kept in memory only. These are anonymous pull tokens for public repositories, and a
 * process that starts again simply asks for a new one.
 */

/** A token as the token service handed it out. */
export interface RegistryToken {
    token: string;
    /** `expires_in` of the answer; absent where the service does not say. */
    expiresInSeconds?: number;
}

/** What a token without `expires_in` is assumed to live (ghcr.io does not say). */
export const TOKEN_DEFAULT_LIFETIME_SECONDS = 60;

/** Dropped this long before it expires, so a request does not go out with a token that dies on the way. */
export const TOKEN_EXPIRY_MARGIN_SECONDS = 30;

interface Entry {
    token: Promise<string | null>;
    /** The token once the request is through; compared by `evict`. */
    value?: string;
    /** Infinity while the request is under way: whoever asks meanwhile waits for it. */
    expiresAt: number;
}

export class TokenCache {
    private readonly entries = new Map<string, Entry>();

    constructor(private readonly now: () => number = Date.now) {}

    /**
     * The token for `key`: the kept one while it is valid, otherwise the one `fetch` gets.
     * Callers that ask while a request for the key is under way share it. `cached` tells
     * whether the token came from an earlier call -- the only kind a 401 can mean is stale.
     *
     * No token (a registry without a token service, a failed request) is not kept: the next
     * check asks again.
     */
    async get(
        key: string,
        fetch: () => Promise<RegistryToken | null>,
    ): Promise<{ token: string | null; cached: boolean }> {
        const existing = this.entries.get(key);
        if (existing && existing.expiresAt > this.now()) {
            return { token: await existing.token, cached: true };
        }

        this.prune();
        const entry: Entry = { token: Promise.resolve(null), expiresAt: Infinity };
        entry.token = fetch().then(
            (result) => {
                const lifetime = (result?.expiresInSeconds ?? TOKEN_DEFAULT_LIFETIME_SECONDS) - TOKEN_EXPIRY_MARGIN_SECONDS;
                if (!result || lifetime <= 0) {
                    this.drop(key, entry);
                    return result?.token ?? null;
                }
                entry.value = result.token;
                entry.expiresAt = this.now() + lifetime * 1000;
                return result.token;
            },
            (err: unknown) => {
                this.drop(key, entry);
                throw err;
            },
        );
        this.entries.set(key, entry);
        return { token: await entry.token, cached: false };
    }

    /**
     * Forgets the token of `key`, if it is still `token`. A registry that refused it has
     * revoked it early; another caller may have fetched its successor already, which stays.
     */
    evict(key: string, token: string): void {
        const entry = this.entries.get(key);
        if (entry?.value === token) this.entries.delete(key);
    }

    /** How many tokens are kept or being fetched; for tests. */
    get size(): number {
        return this.entries.size;
    }

    private drop(key: string, entry: Entry): void {
        if (this.entries.get(key) === entry) this.entries.delete(key);
    }

    /** Removes the expired entries, so the map holds only the repositories checked lately. */
    private prune(): void {
        const now = this.now();
        for (const [key, entry] of this.entries) {
            if (entry.expiresAt <= now) this.entries.delete(key);
        }
    }
}
