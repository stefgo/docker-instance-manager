import {
    ProjectQuery,
    ProjectQueryCategory,
    ProjectQueryCriterion,
    ProjectQueryField,
    QueryHostState,
    categoryOf,
    composeProjectOf,
    containerNameOf,
    describeQuery,
    splitImageRef,
} from "@dim/shared";

export const CATEGORY_LABELS: Record<ProjectQueryCategory, string> = {
    client: "Client",
    container: "Container",
    image: "Image",
};

/** The attributes of a category, in the order the editor offers them. */
export const FIELDS_BY_CATEGORY: Record<ProjectQueryCategory, { field: ProjectQueryField; label: string }[]> = {
    client: [
        { field: "client.displayName", label: "Display name" },
        { field: "client.hostname", label: "Hostname" },
    ],
    container: [
        { field: "container.name", label: "Container name" },
        { field: "container.composeProject", label: "Compose project" },
    ],
    image: [{ field: "image.name", label: "Image name[:tag]" }],
};

export const FIELD_PLACEHOLDERS: Record<ProjectQueryField, string> = {
    "client.displayName": "e.g. prod-*",
    "client.hostname": "e.g. docker-01",
    "container.name": "e.g. nextcloud-*",
    "container.composeProject": "e.g. nextcloud",
    "image.name": "e.g. redis or redis:7*",
};

export function fieldLabel(field: ProjectQueryField): string {
    return FIELDS_BY_CATEGORY[categoryOf(field)].find((f) => f.field === field)!.label;
}

/**
 * Labels that carry their category themselves, for the sentence a query is described as.
 * The editor's labels lean on the category dropdown standing next to them, so naming the
 * category there as well would read as "Image Image name[:tag]".
 */
const SENTENCE_LABELS: Record<ProjectQueryField, string> = {
    "client.displayName": "Client display name",
    "client.hostname": "Client hostname",
    "container.name": "Container name",
    "container.composeProject": "Compose project",
    "image.name": "Image name",
};

/**
 * The editor shows operator and negation as one choice, which reads as a sentence:
 * "Hostname does not match web-*".
 */
export type OperatorChoice = "is" | "isNot" | "matches" | "notMatches";

export const OPERATOR_CHOICES: { value: OperatorChoice; label: string }[] = [
    { value: "is", label: "is" },
    { value: "isNot", label: "is not" },
    { value: "matches", label: "matches pattern" },
    { value: "notMatches", label: "does not match" },
];

export function operatorChoiceOf(c: ProjectQueryCriterion): OperatorChoice {
    if (c.op === "wildcard") return c.negate ? "notMatches" : "matches";
    return c.negate ? "isNot" : "is";
}

export function applyOperatorChoice(
    c: ProjectQueryCriterion,
    choice: OperatorChoice,
): ProjectQueryCriterion {
    return {
        ...c,
        op: choice === "matches" || choice === "notMatches" ? "wildcard" : "equals",
        negate: choice === "isNot" || choice === "notMatches",
    };
}

let counter = 0;

/** Row ids only have to be unique within one query; `crypto.randomUUID` needs HTTPS. */
export function newCriterionId(): string {
    counter += 1;
    return `c${Date.now().toString(36)}${counter.toString(36)}`;
}

export function newCriterion(partial: Partial<ProjectQueryCriterion> = {}): ProjectQueryCriterion {
    return {
        id: newCriterionId(),
        join: "and",
        field: "container.composeProject",
        op: "equals",
        negate: false,
        value: "",
        ...partial,
    };
}

/** The criteria that can be evaluated: a criterion without a value is still being typed. */
export function completeCriteria(query: ProjectQuery): ProjectQuery {
    return query.filter((c) => c.value.trim().length > 0).map((c) => ({ ...c, value: c.value.trim() }));
}

export function describeCriterion(c: ProjectQueryCriterion): string {
    const op = OPERATOR_CHOICES.find((o) => o.value === operatorChoiceOf(c))!.label;
    return `${SENTENCE_LABELS[c.field]} ${op} "${c.value || "…"}"`;
}

export function describe(query: ProjectQuery): string {
    return describeQuery(query, describeCriterion);
}

/** The values the fleet currently has for each attribute, for the editor's suggestions. */
export function collectSuggestions(states: readonly QueryHostState[]): Record<ProjectQueryField, string[]> {
    const sets: Record<ProjectQueryField, Set<string>> = {
        "client.displayName": new Set(),
        "client.hostname": new Set(),
        "container.name": new Set(),
        "container.composeProject": new Set(),
        "image.name": new Set(),
    };
    for (const state of states) {
        const displayName = state.host.displayName || state.host.hostname;
        if (displayName) sets["client.displayName"].add(displayName);
        if (state.host.hostname) sets["client.hostname"].add(state.host.hostname);
        for (const container of state.containers) {
            sets["container.name"].add(containerNameOf(container));
            const compose = composeProjectOf(container);
            if (compose) sets["container.composeProject"].add(compose);
            const ref = container.configImage ?? container.image;
            if (ref && !ref.startsWith("sha256:")) {
                const { repository, tag } = splitImageRef(ref);
                sets["image.name"].add(repository);
                sets["image.name"].add(`${repository}:${tag}`);
            }
        }
    }
    const result = {} as Record<ProjectQueryField, string[]>;
    for (const [field, values] of Object.entries(sets)) {
        result[field as ProjectQueryField] = [...values].sort((a, b) => a.localeCompare(b));
    }
    return result;
}
