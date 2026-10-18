import { describe, expect, it } from "vitest";
import {
    SelfUpdateOutcome,
    correlationIdOf,
    filterHelperEnv,
    helperEnv,
    outcomeEvent,
    parseOutcome,
} from "./SelfUpdateOutcome.js";

const ID = "11111111-1111-4111-8111-111111111111";

const outcome = (over: Partial<SelfUpdateOutcome> = {}): SelfUpdateOutcome => ({
    outcome: "completed",
    container: "dim-client",
    correlationId: ID,
    fromImageId: "sha256:old",
    fromVersion: "1.7.0",
    toImage: "ghcr.io/stefgo/dim-client:latest",
    toImageId: "sha256:new",
    toVersion: "1.8.0",
    startedAt: "2026-10-18T10:00:00.000Z",
    finishedAt: "2026-10-18T10:01:00.000Z",
    ...over,
});

describe("correlationIdOf", () => {
    it("keeps a non-empty string", () => {
        expect(correlationIdOf(ID)).toBe(ID);
        expect(correlationIdOf(` ${ID} `)).toBe(ID);
    });

    it("treats anything else as none", () => {
        expect(correlationIdOf(undefined)).toBeNull();
        expect(correlationIdOf(null)).toBeNull();
        expect(correlationIdOf("")).toBeNull();
        expect(correlationIdOf("   ")).toBeNull();
        expect(correlationIdOf(42)).toBeNull();
    });
});

describe("helperEnv", () => {
    const base = { oldContainer: "dim-client", oldVersion: "1.7.0", verifySeconds: 120 };

    it("tells the helper what it needs", () => {
        expect(helperEnv(base)).toEqual([
            "DIM_HELPER_MODE=true",
            "DIM_OLD_CONTAINER=dim-client",
            "DIM_OLD_VERSION=1.7.0",
            "DIM_SELF_UPDATE_VERIFY_SECONDS=120",
        ]);
    });

    it("passes the group on where there is one", () => {
        expect(helperEnv({ ...base, correlationId: ID })).toContain(`DIM_CORRELATION_ID=${ID}`);
        expect(helperEnv({ ...base, correlationId: null }).some((e) => e.startsWith("DIM_CORRELATION_ID="))).toBe(false);
        expect(helperEnv({ ...base, correlationId: "" }).some((e) => e.startsWith("DIM_CORRELATION_ID="))).toBe(false);
    });

    it("passes the data directory on where one is set", () => {
        expect(helperEnv({ ...base, dataDir: " /data " })).toContain("DIM_CLIENT_DATA_DIR=/data");
        expect(helperEnv({ ...base, dataDir: "  " }).some((e) => e.startsWith("DIM_CLIENT_DATA_DIR="))).toBe(false);
    });
});

describe("filterHelperEnv", () => {
    it("keeps the helper's variables out of the new container", () => {
        const env = [...helperEnv({ oldContainer: "a", oldVersion: "1", verifySeconds: 1, correlationId: ID }), "TZ=UTC"];
        // The data directory is the agent's own setting, not the helper's.
        expect(filterHelperEnv([...env, "DIM_CLIENT_DATA_DIR=/data"])).toEqual(["TZ=UTC", "DIM_CLIENT_DATA_DIR=/data"]);
    });
});

describe("parseOutcome", () => {
    it("reads an outcome", () => {
        expect(parseOutcome(outcome())).toEqual(outcome());
    });

    it("rejects what is not one", () => {
        expect(parseOutcome(null)).toBeNull();
        expect(parseOutcome("completed")).toBeNull();
        expect(parseOutcome({ container: "dim-client" })).toBeNull();
    });
});

describe("outcomeEvent", () => {
    it("says nothing while the helper has not decided", () => {
        expect(outcomeEvent(outcome({ outcome: "pending" }))).toBeNull();
    });

    it("maps each outcome to its kind and level", () => {
        expect(outcomeEvent(outcome())).toMatchObject({ kind: "selfupdate.completed", level: "info" });
        expect(outcomeEvent(outcome({ outcome: "rolled-back" }))).toMatchObject({ kind: "selfupdate.rolledback", level: "error" });
        expect(outcomeEvent(outcome({ outcome: "failed" }))).toMatchObject({ kind: "selfupdate.failed", level: "error" });
    });

    it("reports into the group that asked for the update", () => {
        expect(outcomeEvent(outcome())?.correlationId).toBe(ID);
    });

    it("reports a file from an older helper without a group", () => {
        const old = outcome();
        delete old.correlationId;
        expect(outcomeEvent(old)?.correlationId).toBeNull();
        expect(outcomeEvent(outcome({ correlationId: null }))?.correlationId).toBeNull();
    });

    it("carries what the helper knew", () => {
        expect(outcomeEvent(outcome())).toEqual({
            kind: "selfupdate.completed",
            level: "info",
            occurredAt: "2026-10-18T10:01:00.000Z",
            correlationId: ID,
            subject: { containerName: "dim-client", imageRef: "ghcr.io/stefgo/dim-client:latest" },
            data: { fromVersion: "1.7.0", toVersion: "1.8.0", fromImageId: "sha256:old", toImageId: "sha256:new" },
        });
    });

    it("names the errors only where there are some", () => {
        const failed = outcomeEvent(outcome({ outcome: "failed", error: "unhealthy", rollbackError: "no such container" }));
        expect(failed?.data).toMatchObject({ error: "unhealthy", rollbackError: "no such container" });
        const rolledBack = outcomeEvent(outcome({ outcome: "rolled-back", error: "unhealthy" }));
        expect(rolledBack?.data).toHaveProperty("error", "unhealthy");
        expect(rolledBack?.data).not.toHaveProperty("rollbackError");
    });

    it("reports a helper that failed before it could inspect anything", () => {
        const early = outcomeEvent({
            outcome: "rolled-back",
            container: "dim-client",
            correlationId: ID,
            fromVersion: "1.7.0",
            toVersion: "1.8.0",
            startedAt: "2026-10-18T10:00:00.000Z",
            finishedAt: "2026-10-18T10:00:01.000Z",
            error: "no such container",
        });
        expect(early).toEqual({
            kind: "selfupdate.rolledback",
            level: "error",
            occurredAt: "2026-10-18T10:00:01.000Z",
            correlationId: ID,
            subject: { containerName: "dim-client" },
            data: { fromVersion: "1.7.0", toVersion: "1.8.0", error: "no such container" },
        });
    });
});
