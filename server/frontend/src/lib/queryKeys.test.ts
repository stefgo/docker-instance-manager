import { beforeEach, describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { isPushedOnConnect, queryKeys } from "./queryKeys";

const CLIENT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

/** Whether invalidating `prefix` reaches `key` -- asked of the cache itself, not rebuilt here. */
function reaches(prefix: readonly unknown[], key: readonly unknown[]): boolean {
    const queryClient = new QueryClient();
    queryClient.setQueryData(key, "cached");
    return queryClient.getQueryCache().findAll({ queryKey: prefix }).length === 1;
}

describe("queryKeys", () => {
    it("reaches every host's state from docker.states", () => {
        expect(reaches(queryKeys.docker.states(), queryKeys.docker.state(CLIENT))).toBe(true);
        expect(reaches(queryKeys.docker.states(), queryKeys.docker.state(OTHER))).toBe(true);
        expect(reaches(queryKeys.docker.all, queryKeys.docker.state(CLIENT))).toBe(true);
    });

    it("keeps one host's state apart from another's", () => {
        expect(reaches(queryKeys.docker.state(CLIENT), queryKeys.docker.state(OTHER))).toBe(false);
    });

    // The client list is its own entry: a host's Docker state is not below it, so a
    // CLIENTS_UPDATE that replaces the list leaves every state where it is.
    it("does not reach a host's state from the client list", () => {
        expect(reaches(queryKeys.clients.all, queryKeys.docker.state(CLIENT))).toBe(false);
    });

    it("reaches the scheduler status and the label from settings.all, and neither from the other", () => {
        expect(reaches(queryKeys.settings.all, queryKeys.settings.schedulerStatus())).toBe(true);
        expect(reaches(queryKeys.settings.all, queryKeys.settings.autoUpdateLabel())).toBe(true);
        expect(reaches(queryKeys.settings.schedulerStatus(), queryKeys.settings.autoUpdateLabel())).toBe(false);
    });
});

describe("isPushedOnConnect", () => {
    it("names what the server sends on every connect", () => {
        expect(isPushedOnConnect(queryKeys.clients.list())).toBe(true);
        expect(isPushedOnConnect(queryKeys.docker.state(CLIENT))).toBe(true);
        expect(isPushedOnConnect(queryKeys.activity.list())).toBe(true);
    });

    // These are broadcast when they change, but not sent to a socket that connects.
    it("leaves out what has to be read again after a reconnect", () => {
        expect(isPushedOnConnect(queryKeys.projects.list())).toBe(false);
        expect(isPushedOnConnect(queryKeys.settings.autoUpdateLabel())).toBe(false);
        expect(isPushedOnConnect(queryKeys.settings.schedulerStatus())).toBe(false);
        expect(isPushedOnConnect(queryKeys.webhooks.list())).toBe(false);
        expect(isPushedOnConnect(queryKeys.users.list())).toBe(false);
        expect(isPushedOnConnect(queryKeys.tokens.list())).toBe(false);
    });
});

/**
 * What the socket handler relies on: an update is written with a function that receives
 * what is cached, and an entry that was never read is not created by it.
 */
describe("an update to an entry that was never read", () => {
    let queryClient: QueryClient;
    const key = queryKeys.projects.list();

    beforeEach(() => {
        queryClient = new QueryClient();
    });

    it("creates no entry", () => {
        queryClient.setQueryData<string[]>(key, (projects) => projects && [...projects, "p1"]);
        expect(queryClient.getQueryData(key)).toBeUndefined();
        expect(queryClient.getQueryCache().find({ queryKey: key })).toBeUndefined();
    });

    it("changes one that was", () => {
        queryClient.setQueryData<string[]>(key, []);
        queryClient.setQueryData<string[]>(key, (projects) => projects && [...projects, "p1"]);
        expect(queryClient.getQueryData(key)).toEqual(["p1"]);
    });
});
