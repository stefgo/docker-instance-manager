import type { ConfirmOptions } from "@stefgo/react-ui-components";

/**
 * Only the DIM entry goes: a project is a query over containers, not the containers. So it
 * is a delete, like a client or a user -- "remove" is kept for what goes from a host.
 */
export function describeDeleteProject(name: string): ConfirmOptions {
    return {
        title: `Delete project "${name}"?`,
        description: "Only the DIM entry is deleted, together with its query, auto-update setting and schedule. The containers keep running, nothing on any host is touched, and the project can be added again at any time.",
        confirmLabel: "Delete project",
        variant: "danger",
    };
}
