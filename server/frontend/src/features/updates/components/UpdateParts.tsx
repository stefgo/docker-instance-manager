import { Link } from "react-router-dom";
import { CircleCheck, CircleX } from "lucide-react";
import { Alert, Badge } from "@stefgo/react-ui-components";
import type { Client, ContainerUpdateRecord, UpdateTrigger } from "@dim/shared";
import { paths } from "../../../lib/paths";
import { clientName, plural } from "../../../utils";
import {
    RESULT_LABELS,
    TRIGGER_DESCRIPTIONS,
    TRIGGER_LABELS,
    formatVersionChange,
    versionChange,
    type ClientLookup,
} from "../lib/updateHistory";

/** The pieces an update is shown with, on the dashboard's card and the history page alike. */

const TRIGGER_BADGE: Record<UpdateTrigger, "info" | "neutral" | "warning"> = {
    auto: "info",
    manual: "neutral",
    // Done on the host: worth a second look, since DIM neither planned nor saw it coming.
    external: "warning",
};

const LINK = "hover:text-text-primary hover:underline";

export const TriggerBadge = ({ trigger }: { trigger: UpdateTrigger }) => (
    <span title={TRIGGER_DESCRIPTIONS[trigger]}>
        <Badge variant={TRIGGER_BADGE[trigger]}>{TRIGGER_LABELS[trigger]}</Badge>
    </span>
);

export const ResultIcon = ({ update }: { update: ContainerUpdateRecord }) =>
    update.result === "failed" ? (
        <CircleX size={16} className="text-error shrink-0" aria-label={RESULT_LABELS.failed} />
    ) : (
        <CircleCheck size={16} className="text-success shrink-0" aria-label={RESULT_LABELS.updated} />
    );

export const VersionChangeText = ({ update }: { update: ContainerUpdateRecord }) => {
    const change = versionChange(update);
    if (!change.from && !change.to) return <span className="text-text-muted">—</span>;
    return (
        <span className="text-xs whitespace-nowrap" title={formatVersionChange(change)}>
            {change.from && <span className="text-text-muted">{change.from}</span>}
            {change.from && <span className="text-text-muted"> → </span>}
            {change.to ? <span className="text-text-primary">{change.to}</span> : <span className="text-error">—</span>}
        </span>
    );
};

/** The container, linked to its page on its host, with the image below and the error of a failure. */
export const ContainerCell = ({ update, clients }: { update: ContainerUpdateRecord; clients: ClientLookup }) => (
    <div className="min-w-0">
        {clients.exists(update.clientId) ? (
            <Link
                to={paths.containerInstance(update.clientId, update.containerName)}
                className={`text-sm font-medium text-text-primary ${LINK}`}
            >
                {update.containerName}
            </Link>
        ) : (
            <span className="text-sm font-medium text-text-primary">{update.containerName}</span>
        )}
        <p className="text-xs text-text-muted truncate" title={update.imageRef}>
            {update.imageRef}
        </p>
        {update.result === "failed" && update.error && (
            <p className="text-xs text-error break-words">{update.error}</p>
        )}
    </div>
);

export const ClientCell = ({ update, clients }: { update: ContainerUpdateRecord; clients: ClientLookup }) =>
    clients.exists(update.clientId) ? (
        <Link to={paths.client(update.clientId)} className={`text-sm text-text-muted whitespace-nowrap ${LINK}`}>
            {clients.name(update.clientId)}
        </Link>
    ) : (
        <span className="text-sm text-text-muted whitespace-nowrap">{clients.name(update.clientId)}</span>
    );


/**
 * Says which connected clients report no updates because their agent predates the history,
 * so a quiet list is not read as a quiet host.
 */
export const OutdatedAgentsNotice = ({ clients }: { clients: readonly Client[] }) => {
    if (clients.length === 0) return null;
    const names = clients.map(clientName).join(", ");
    return (
        <Alert tone="info" title={`${plural(clients.length, "client")} ${clients.length === 1 ? "reports" : "report"} no updates`}>
            The agent on {names} is older than the update history. Update it to see the updates of
            {clients.length === 1 ? " that host" : " those hosts"} here.
        </Alert>
    );
};
