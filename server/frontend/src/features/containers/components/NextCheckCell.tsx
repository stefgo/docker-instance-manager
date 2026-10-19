import type { AutoUpdateScheduleRun } from "@dim/shared";
import { useNow } from "../../../hooks/useNow";
import { EMPTY_VALUE, formatDate, formatUntil } from "../../../utils";

interface NextCheckCellProps {
    /** The planned run, or `null` for a container on no schedule its agent has reported. */
    check: AutoUpdateScheduleRun | null;
    /** For a row standing for several hosts: the time is the earliest of them. */
    earliest?: boolean;
}

/**
 * How long until auto-update next looks at a container, with the date and the expression in
 * the tooltip. It moves on with the page's one clock (`useNow`), like `RelativeTime`.
 */
export const NextCheckCell = ({ check, earliest }: NextCheckCellProps) => {
    const now = useNow();
    if (!check?.nextRun) return <span className="text-sm text-text-muted">{EMPTY_VALUE}</span>;
    const title = `${earliest ? "Earliest of its hosts: " : ""}${formatDate(check.nextRun)} (${check.cron})`;
    return (
        <time dateTime={check.nextRun} title={title} className="text-sm whitespace-nowrap">
            {formatUntil(check.nextRun, now)}
        </time>
    );
};
