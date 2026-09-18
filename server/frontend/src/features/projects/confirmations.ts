import type { ConfirmOptions } from "@stefgo/react-ui-components";

/** Only the DIM entry goes: a project is a query over containers, not the containers. */
export function describeRemoveProject(name: string): ConfirmOptions {
    return {
        title: `Remove "${name}" from DIM?`,
        description: "Only the DIM entry is removed, together with its query, auto-update setting and schedule. The containers keep running, nothing on any host is touched, and the project can be added again at any time.",
        confirmLabel: "Remove",
        variant: "danger",
    };
}
