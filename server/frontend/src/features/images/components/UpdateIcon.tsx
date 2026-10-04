import { CircleHelp, CircleArrowUp, CircleCheck, LoaderCircle } from "lucide-react";
import { Tooltip } from "@stefgo/react-ui-components";
import { UpdateStatus, updateStatusLabel } from "../lib/updateStatus";

interface UpdateIconProps {
    status: UpdateStatus;
    isChecking?: boolean;
    isUpdating?: boolean;
}

function glyph({ status, isChecking, isUpdating }: UpdateIconProps) {
    if (isUpdating) return <LoaderCircle size={16} className="text-success animate-spin" />;
    if (isChecking) return <LoaderCircle size={16} className="text-primary animate-spin" />;
    switch (status) {
        // An arrow rather than an exclamation mark: an update is something to do, not
        // something that went wrong. The overview's card draws the same one.
        case "update":    return <CircleArrowUp size={16} className="text-warning" />;
        case "unchecked": return <CircleHelp size={16} className="text-text-muted" />;
        case "current":   return <CircleCheck size={16} className="text-success" />;
        case "none":      return <span className="text-text-muted">–</span>;
    }
}

/**
 * The update status of a row. The glyph is decoration: the name and the tooltip come from
 * `updateStatusLabel`, so every list that draws the status says the same about it.
 */
export function UpdateIcon(props: UpdateIconProps) {
    const label = updateStatusLabel(props.status, props);
    return (
        <Tooltip content={label}>
            <span role="img" aria-label={label} className="inline-flex">
                <span aria-hidden="true" className="inline-flex">{glyph(props)}</span>
            </span>
        </Tooltip>
    );
}
