import { describe, expect, it } from "vitest";
import { outcomeToast, runningToast, type BatchFailure } from "./batchToast";

const pull = { action: "pull", noun: "image" } as const;
const refused = (count: number, message = "manifest unknown"): BatchFailure[] =>
    Array.from({ length: count }, (_, i) => ({ label: `app-${i}:latest`, message }));

describe("runningToast", () => {
    it("shows the bar while requests are out, and stays", () => {
        expect(runningToast(pull, { total: 12, done: 7, failures: [] })).toEqual({
            variant: "info",
            title: "Pulling 12 images",
            description: undefined,
            progress: { value: 7, max: 12 },
            duration: 0,
        });
    });

    it("counts the failures while it runs", () => {
        expect(runningToast(pull, { total: 12, done: 7, failures: refused(1) }).description).toBe("1 failed");
    });

    it("fills the bar when the last request is through", () => {
        expect(runningToast(pull, { total: 12, done: 12, failures: [] })).toMatchObject({
            title: "Pulling 12 images",
            progress: { value: 12, max: 12 },
        });
    });
});

describe("outcomeToast", () => {

    it("leaves by itself once everything went through", () => {
        const toast = outcomeToast(pull, { total: 12, done: 12, failures: [] });
        expect(toast).toMatchObject({ variant: "success", title: "Pulled 12 images" });
        // `update` keeps what a key does not replace: the bar has to be taken off, and the
        // countdown left to the provider's default.
        expect(toast).toHaveProperty("progress", undefined);
        expect(toast).toHaveProperty("duration", undefined);
        expect(toast).toHaveProperty("description", undefined);
    });

    it("warns and stays when some were refused", () => {
        const toast = outcomeToast(pull, { total: 12, done: 12, failures: refused(1) });
        expect(toast).toMatchObject({
            variant: "warning",
            title: "Could not pull 1 of 12 images",
            description: "manifest unknown — app-0:latest",
            duration: 0,
        });
        expect(toast).toHaveProperty("progress", undefined);
    });

    it("is an error when every request was refused", () => {
        expect(outcomeToast(pull, { total: 2, done: 2, failures: refused(2) }).variant).toBe("error");
    });

    it("says a reason once, with three of the items it refused and a count of the rest", () => {
        expect(outcomeToast(pull, { total: 5, done: 5, failures: refused(5, "registry unreachable") }).description).toBe(
            "registry unreachable — app-0:latest, app-1:latest, app-2:latest and 2 more",
        );
    });

    it("names three reasons and counts the others", () => {
        const failures = ["a", "b", "c", "d", "e"].map((reason) => ({ label: "app:1", message: reason }));
        expect(outcomeToast(pull, { total: 5, done: 5, failures }).description).toBe(
            "a — app:1; b — app:1; c — app:1; and 2 other reasons",
        );
    });

    it("gives a reason that names its subject itself as it is, once", () => {
        const failures = [{ message: "alpha: No such container" }, { message: "alpha: No such container" }];
        const stop = { action: "stop", noun: "container" } as const;
        expect(outcomeToast(stop, { total: 3, done: 3, failures })).toMatchObject({
            title: "Could not stop 2 of 3 containers",
            description: "alpha: No such container",
        });
    });
});

describe("a toast with a subject", () => {
    const prune = { action: "prune", noun: "image", subject: "the unused images of alpha" } as const;

    it("names the subject in place of the count", () => {
        expect(runningToast(prune, { total: 1, done: 0, failures: [] }).title).toBe("Pruning the unused images of alpha");
        expect(outcomeToast(prune, { total: 1, done: 1, failures: [] }).title).toBe("Pruned the unused images of alpha");
    });

    it("says it could not, without a count", () => {
        const failures = [{ message: "alpha: Client is not connected" }];
        expect(outcomeToast(prune, { total: 1, done: 1, failures })).toMatchObject({
            variant: "error",
            title: "Could not prune the unused images of alpha",
            description: "alpha: Client is not connected",
        });
    });
});
