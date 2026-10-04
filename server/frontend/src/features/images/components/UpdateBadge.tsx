import { Badge } from "@stefgo/react-ui-components";
import { UpdateStatus, updateStatusBadge } from "../lib/updateStatus";

/** The update status in a page's header. Draws nothing for a status that has no badge. */
export function UpdateBadge({ status }: { status: UpdateStatus }) {
    const badge = updateStatusBadge(status);
    return badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : null;
}
