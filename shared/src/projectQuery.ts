import { z } from "zod";
import type { DockerContainer } from "./types.js";

// ── Query model ──────────────────────────────────────────────────────────────

/**
 * What a criterion looks at, as `<category>.<attribute>`. Every criterion is asked about one
 * container on one host, so a client criterion answers for every container of that host and
 * an image criterion for every container running that image.
 */
export const PROJECT_QUERY_FIELDS = [
    "client.displayName",
    "client.hostname",
    "container.name",
    "image.name",
] as const;

export type ProjectQueryField = (typeof PROJECT_QUERY_FIELDS)[number];
export type ProjectQueryCategory = "client" | "container" | "image";

export const PROJECT_QUERY_OPERATORS = ["equals", "wildcard"] as const;
export type ProjectQueryOperator = (typeof PROJECT_QUERY_OPERATORS)[number];

export const PROJECT_QUERY_JOINS = ["and", "or"] as const;
export type ProjectQueryJoin = (typeof PROJECT_QUERY_JOINS)[number];

export const ProjectQueryCriterionSchema = z.object({
    /** Stable within the query, so an editor can key its rows by it. */
    id: z.string().min(1),
    /** How this criterion joins what comes before it. Ignored on the first criterion. */
    join: z.enum(PROJECT_QUERY_JOINS),
    field: z.enum(PROJECT_QUERY_FIELDS),
    op: z.enum(PROJECT_QUERY_OPERATORS),
    /** Inverts the match: "is not" / "does not match". */
    negate: z.boolean().default(false),
    value: z.string().trim().min(1, "A criterion needs a value"),
});

export const ProjectQuerySchema = z
    .array(ProjectQueryCriterionSchema)
    .min(1, "A query needs at least one criterion");

export type ProjectQueryCriterion = z.infer<typeof ProjectQueryCriterionSchema>;
export type ProjectQuery = z.infer<typeof ProjectQuerySchema>;

export function categoryOf(field: ProjectQueryField): ProjectQueryCategory {
    return field.slice(0, field.indexOf(".")) as ProjectQueryCategory;
}

// ── Evaluation ───────────────────────────────────────────────────────────────

/** The host a container runs on, as far as a query can ask about it. */
export interface ProjectQueryHost {
    hostname: string | null;
    displayName: string | null;
}

export function containerNameOf(container: DockerContainer): string {
    return container.names?.[0]?.replace(/^\//, "") ?? container.id;
}

/**
 * Splits an image reference into repository and tag. A digest is dropped, and a reference
 * without a tag carries `latest`, which is what Docker pulls for it.
 */
export function splitImageRef(ref: string): { repository: string; tag: string } {
    const withoutDigest = ref.split("@")[0];
    const lastSlash = withoutDigest.lastIndexOf("/");
    const colon = withoutDigest.indexOf(":", lastSlash + 1);
    if (colon === -1) return { repository: withoutDigest, tag: "latest" };
    return { repository: withoutDigest.slice(0, colon), tag: withoutDigest.slice(colon + 1) };
}

/** Whether an image criterion names a tag, i.e. has a `:` after the last `/`. */
export function imagePatternHasTag(pattern: string): boolean {
    return pattern.indexOf(":", pattern.lastIndexOf("/") + 1) !== -1;
}

/** Whether a value uses the wildcard characters `*` or `?`. */
export function hasWildcard(value: string): boolean {
    return /[*?]/.test(value);
}

const wildcardCache = new Map<string, RegExp>();

function wildcardRegExp(pattern: string): RegExp {
    let re = wildcardCache.get(pattern);
    if (!re) {
        const source = pattern
            .split("")
            .map((ch) => {
                if (ch === "*") return ".*";
                if (ch === "?") return ".";
                return ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
            })
            .join("");
        re = new RegExp(`^${source}$`, "i");
        wildcardCache.set(pattern, re);
    }
    return re;
}

/** Compares without regard to case: host, container and image names are lower case in practice. */
export function matchValue(op: ProjectQueryOperator, pattern: string, value: string): boolean {
    if (op === "wildcard") return wildcardRegExp(pattern).test(value);
    return pattern.toLowerCase() === value.toLowerCase();
}

/**
 * The values a criterion is compared with for one container. An image pattern without a
 * tag is compared with the repository alone, so `nginx` matches every tag of it; with a tag
 * it is compared with `repository:tag`.
 */
function subjectOf(
    criterion: ProjectQueryCriterion,
    host: ProjectQueryHost,
    container: DockerContainer,
): string | null {
    switch (criterion.field) {
        case "client.displayName":
            return host.displayName || host.hostname;
        case "client.hostname":
            return host.hostname;
        case "container.name":
            return containerNameOf(container);
        case "image.name": {
            const ref = container.configImage ?? container.image;
            if (!ref) return null;
            const { repository, tag } = splitImageRef(ref);
            return imagePatternHasTag(criterion.value) ? `${repository}:${tag}` : repository;
        }
    }
}

export function matchCriterion(
    criterion: ProjectQueryCriterion,
    host: ProjectQueryHost,
    container: DockerContainer,
): boolean {
    const subject = subjectOf(criterion, host, container);
    // A missing attribute matches nothing -- and so its negation matches.
    const hit = subject !== null && matchValue(criterion.op, criterion.value, subject);
    return criterion.negate ? !hit : hit;
}

/**
 * Evaluates the query strictly from left to right: `A or B and C` is `(A or B) and C`.
 * There is no precedence of `and` over `or`, only the order of the criteria.
 */
export function matchQuery(
    query: ProjectQuery,
    host: ProjectQueryHost,
    container: DockerContainer,
): boolean {
    if (query.length === 0) return false;
    let result = matchCriterion(query[0], host, container);
    for (let i = 1; i < query.length; i++) {
        const criterion = query[i];
        if (criterion.join === "and") {
            result = result && matchCriterion(criterion, host, container);
        } else {
            result = result || matchCriterion(criterion, host, container);
        }
    }
    return result;
}

// ── Assignment ───────────────────────────────────────────────────────────────

/** The part of a project the assignment needs. */
export interface QueryProject {
    id: string;
    name: string;
    query: ProjectQuery;
    createdAt: string;
}

/**
 * Which project a container belongs to.
 *
 * Saving a query that overlaps another is refused, but a container started later can still
 * match two. Such a container is a **conflict**: it belongs to none of them, and it is not
 * updated through any of them -- there is no rule that would pick one the operator can see.
 */
export type ProjectAssignment<P extends QueryProject> =
    | { kind: "none" }
    | { kind: "project"; project: P }
    | { kind: "conflict"; projects: P[] };

export function resolveAssignment<P extends QueryProject>(
    projects: readonly P[],
    host: ProjectQueryHost,
    container: DockerContainer,
): ProjectAssignment<P> {
    const matches = projects.filter((p) => matchQuery(p.query, host, container));
    if (matches.length === 0) return { kind: "none" };
    if (matches.length === 1) return { kind: "project", project: matches[0] };
    return { kind: "conflict", projects: matches };
}

/** The projects an assignment names: one, several for a conflict, or none. */
export function assignedProjects<P extends QueryProject>(assignment: ProjectAssignment<P>): P[] {
    if (assignment.kind === "project") return [assignment.project];
    if (assignment.kind === "conflict") return assignment.projects;
    return [];
}

/** One host with the containers it reports. */
export interface QueryHostState {
    clientId: string;
    host: ProjectQueryHost;
    containers: DockerContainer[];
}

export interface ProjectQueryHit {
    clientId: string;
    container: DockerContainer;
}

/** Every container of the fleet a query matches. */
export function resolveQuery(query: ProjectQuery, states: readonly QueryHostState[]): ProjectQueryHit[] {
    const hits: ProjectQueryHit[] = [];
    for (const state of states) {
        for (const container of state.containers) {
            if (matchQuery(query, state.host, container)) {
                hits.push({ clientId: state.clientId, container });
            }
        }
    }
    return hits;
}

export interface ProjectQueryConflict {
    clientId: string;
    containerId: string;
    containerName: string;
    projectId: string;
    projectName: string;
}

/**
 * The containers a query would share with other projects. `excludeId` is the project being
 * edited, whose own current members are not a conflict.
 */
export function findQueryConflicts(
    query: ProjectQuery,
    projects: readonly QueryProject[],
    states: readonly QueryHostState[],
    excludeId?: string,
): ProjectQueryConflict[] {
    const others = projects.filter((p) => p.id !== excludeId);
    const conflicts: ProjectQueryConflict[] = [];
    for (const { clientId, container } of resolveQuery(query, states)) {
        const host = states.find((s) => s.clientId === clientId)!.host;
        for (const other of others) {
            if (!matchQuery(other.query, host, container)) continue;
            conflicts.push({
                clientId,
                containerId: container.id,
                containerName: containerNameOf(container),
                projectId: other.id,
                projectName: other.name,
            });
        }
    }
    return conflicts;
}

/**
 * Reads the query the way it is evaluated: every `and` or `or` closes over everything
 * before it. The brackets that say so are only drawn where the joins mix, because
 * that is where the reading differs from the usual precedence — `A OR B AND C` is
 * `(A OR B) AND C` here. A query on a single join is associative and reads without them.
 */
export function describeQuery(
    query: ProjectQuery,
    describe: (criterion: ProjectQueryCriterion) => string,
): string {
    if (query.length === 0) return "";
    const mixed = query.slice(1).some((c) => c.join !== query[1].join);
    let text = describe(query[0]);
    for (let i = 1; i < query.length; i++) {
        const joined = `${text} ${query[i].join.toUpperCase()} ${describe(query[i])}`;
        text = mixed && i < query.length - 1 ? `(${joined})` : joined;
    }
    return text;
}
