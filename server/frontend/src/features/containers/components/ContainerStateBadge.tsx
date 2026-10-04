import { Badge } from "@stefgo/react-ui-components";
import { stateBadge } from "../containerState";

/** A container's state in a page's header: one instance's, or a group's aggregate. */
export function ContainerStateBadge({ state }: { state: string }) {
    const badge = stateBadge(state);
    return <Badge variant={badge.variant}>{badge.label}</Badge>;
}
