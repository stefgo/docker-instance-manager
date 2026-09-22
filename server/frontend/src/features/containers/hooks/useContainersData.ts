import { useMemo, useEffect } from "react";
import { CLIENT_STATUS, DockerImage } from "@dim/shared";
import { useDockerStore } from "../../../stores/useDockerStore";
import { useClientStore } from "../../../stores/useClientStore";
import { useAutoUpdateStore } from "../../../stores/useAutoUpdateStore";
import { clientName } from "../../../utils";
import {
    AutoUpdateEnrollment,
    aggregateAutoUpdate,
    anyConflict,
    resolveAutoUpdate,
} from "../autoUpdate";
import { UpdateStatus, aggregateUpdateStatus } from "../../images/hooks/useImagesData";
import {
    belongsTo,
    containerKey,
    hostHasSchedule,
    useProjectAssignment,
} from "../../projects/hooks/useProjectMembers";

/**
 * `unknown` when no instance sits on a connected client: the last snapshot of an offline host
 * is not its present, and reading it as such showed a stopped container as running.
 */
export type ContainerAggregateState = "running" | "stopped" | "paused" | "mixed" | "unknown";

export interface ContainerInstance {
    clientId: string;
    containerId: string;
    state: string;
    /** Whether the server holds a connection to the host -- `state` is only current if so. */
    clientOnline: boolean;
}

/**
 * What the last registry check said about one host's copy of the image, kept beside the
 * status. `updateStatus` collapses an error into `unchecked`, which is right for the
 * indicator but leaves the detail page with nothing to say about why -- this is that why.
 */
export interface ContainerUpdateCheck {
    checkedAt: string;
    error?: string;
}

export interface ContainerNode {
    id: string;
    nodeType: "container";
    name: string;
    configImage: string;
    clientCount: number;
    clientIds: string[];
    repoDigests: string[];
    updateStatus: UpdateStatus;
    /** The answers of this container's hosts, one per instance that has one. */
    updateChecks: ContainerUpdateCheck[];
    instances: ContainerInstance[];
    aggregateState: ContainerAggregateState;
    /** `mixed` where the instances of this container do not take part the same way. */
    autoUpdate: AutoUpdateEnrollment | "mixed";
    /** Whether any instance matches several projects -- what a `mixed` reading cannot show. */
    hasConflict: boolean;
    children?: ClientNode[];
}

export interface ClientNode {
    id: string;
    nodeType: "client";
    clientName: string;
    clientId: string;
    configImage: string;
    clientIds: string[];
    repoDigests: string[];
    updateStatus: UpdateStatus;
    containerId: string;
    containerState: string;
    containerName: string;
    /** Whether the server holds a connection to the host -- `containerState` is only current if so. */
    clientOnline: boolean;
    autoUpdate: AutoUpdateEnrollment;
    /** Absent while this host's image has never been checked. */
    updateCheck?: ContainerUpdateCheck;
}

export type ContainerTreeNode = ContainerNode | ClientNode;

function imageToUpdateStatus(img: DockerImage | undefined): UpdateStatus {
    if (!img) return "none";
    if (!img.updateCheck) return "unchecked";
    if (img.updateCheck.error) return "unchecked";
    return img.updateCheck.hasUpdate ? "update" : "current";
}

/** The state of a group, read from the instances whose host is connected. */
function aggregateContainerState(states: string[]): ContainerAggregateState {
    if (states.length === 0) return "unknown";
    const unique = new Set(states);
    if (unique.size === 1) {
        const s = states[0];
        if (s === "running") return "running";
        if (s === "paused") return "paused";
        return "stopped";
    }
    return "mixed";
}

interface ClientEntry {
    clientId: string;
    containerId: string;
    containerName: string;
    containerState: string;
    clientOnline: boolean;
    repoDigests: string[];
    updateStatus: UpdateStatus;
    autoUpdate: AutoUpdateEnrollment;
    updateCheck?: ContainerUpdateCheck;
}

/**
 * Every container of the fleet, grouped by name and image.
 *
 * `projectId` narrows the result to one project: the same rows the whole fleet shows, only
 * without the containers assigned to another project or to none. A container in conflict
 * between projects is listed under each of them.
 */
export function useContainersData(projectId?: string): ContainerNode[] {
    const dockerStates = useDockerStore((s) => s.dockerStates);
    const fetchDockerState = useDockerStore((s) => s.fetchDockerState);
    const clients = useClientStore((s) => s.clients);
    const labelFilter = useAutoUpdateStore((s) => s.labelFilter);
    const assignment = useProjectAssignment();

    useEffect(() => {
        clients.forEach((c) => fetchDockerState(c.id));
    }, [clients, fetchDockerState]);

    return useMemo(() => {
        const clientMap = new Map(clients.map((c) => [c.id, clientName(c)]));
        const clientById = new Map(clients.map((c) => [c.id, c]));
        const grouped = new Map<string, {
            clientEntries: ClientEntry[];
            repoDigests: Set<string>;
            updateStatuses: UpdateStatus[];
        }>();

        for (const [clientId, state] of Object.entries(dockerStates)) {
            for (const container of state.containers) {
                const assigned = assignment.get(containerKey(clientId, container.id));
                if (projectId !== undefined && !belongsTo(assigned, projectId)) continue;
                const name = container.names[0]?.replace(/^\//, "") ?? container.id;
                const configImage = container.configImage ?? "";
                const lastSlash = configImage.lastIndexOf("/");
                const namePart = configImage.slice(lastSlash + 1);
                const normalizedConfigImage = configImage !== "" && !namePart.includes(":") && !configImage.includes("@")
                    ? `${configImage}:latest`
                    : configImage;
                const key = `${name}||${normalizedConfigImage}`;

                let entry = grouped.get(key);
                if (!entry) {
                    entry = { clientEntries: [], repoDigests: new Set(), updateStatuses: [] };
                    grouped.set(key, entry);
                }

                const img = state.images.find((i) => i.repoTags.includes(normalizedConfigImage));
                const clientRepoDigests: string[] = [];
                if (img) {
                    for (const rd of img.repoDigests) {
                        entry.repoDigests.add(rd);
                        clientRepoDigests.push(rd);
                    }
                }
                const updateStatus = imageToUpdateStatus(img);
                entry.updateStatuses.push(updateStatus);
                const check = img?.updateCheck;

                entry.clientEntries.push({
                    clientId,
                    containerId: container.id,
                    containerName: name,
                    containerState: container.state,
                    clientOnline: clientById.get(clientId)?.status === CLIENT_STATUS.ONLINE,
                    repoDigests: clientRepoDigests,
                    updateStatus,
                    ...(check
                        ? { updateCheck: { checkedAt: check.checkedAt, ...(check.error ? { error: check.error } : {}) } }
                        : {}),
                    autoUpdate: resolveAutoUpdate(
                        container,
                        labelFilter,
                        assigned,
                        hostHasSchedule(clientById.get(clientId)),
                    ),
                });
            }
        }

        return Array.from(grouped.entries()).map(([key, { clientEntries, repoDigests, updateStatuses }]) => {
            const [name, configImage] = key.split("||");

            const children: ClientNode[] = clientEntries.map(({ clientId, containerId, containerName, containerState, clientOnline, repoDigests: crd, updateStatus: cus, autoUpdate, updateCheck }) => ({
                id: `${key}||${clientId}`,
                nodeType: "client" as const,
                clientName: clientMap.get(clientId) ?? clientId,
                clientId,
                configImage,
                clientIds: [clientId],
                repoDigests: crd,
                updateStatus: cus,
                containerId,
                containerState,
                containerName,
                clientOnline,
                autoUpdate,
                ...(updateCheck ? { updateCheck } : {}),
            }));

            return {
                id: key,
                nodeType: "container" as const,
                name,
                configImage,
                clientCount: clientEntries.length,
                clientIds: clientEntries.map((e) => e.clientId),
                repoDigests: Array.from(repoDigests),
                updateStatus: aggregateUpdateStatus(updateStatuses),
                updateChecks: clientEntries.flatMap((e) => (e.updateCheck ? [e.updateCheck] : [])),
                instances: clientEntries.map(({ clientId, containerId, containerState, clientOnline }) => ({ clientId, containerId, state: containerState, clientOnline })),
                aggregateState: aggregateContainerState(
                    clientEntries.filter((e) => e.clientOnline).map((e) => e.containerState),
                ),
                autoUpdate: aggregateAutoUpdate(clientEntries.map((e) => e.autoUpdate)),
                hasConflict: anyConflict(clientEntries.map((e) => e.autoUpdate)),
                children: children.length > 0 ? children : undefined,
            };
        });
    }, [dockerStates, clients, labelFilter, assignment, projectId]);
}
