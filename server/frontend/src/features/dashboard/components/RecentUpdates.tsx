import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { History } from "lucide-react";
import { Button, DataMultiView, EmptyState } from "@stefgo/react-ui-components";
import { QueryError } from "../../../components/QueryError";
import { ROUTES } from "../../../lib/paths";
import { useUpdateHistory } from "../../../queries/updates";
import { updateColumns } from "../../updates/components/updateColumns";
import { useClientLookup } from "../../updates/hooks/useClientLookup";
import { RECENT_UPDATES } from "../../updates/lib/updateHistory";

/**
 * The overview's last few container updates, across every host: what changed lately, and the
 * way to the whole history. New ones arrive over the socket, so the card moves on its own.
 * A host whose agent reports no updates is a finding of the overview, not a notice here.
 */
export const RecentUpdates = () => {
    const navigate = useNavigate();
    const { data, isPending, error } = useUpdateHistory();
    const lookup = useClientLookup();
    const recent = useMemo(() => (data ?? []).slice(0, RECENT_UPDATES), [data]);
    const columns = useMemo(() => updateColumns(lookup, { sortable: false }), [lookup]);

    if (error) return <QueryError title="Could not load the update history" error={error} />;

    return (
        <DataMultiView
            title={
                <>
                    <History size={18} className="text-text-muted" /> Recent updates
                </>
            }
            extraActions={
                <Button size="sm" variant="secondary" onClick={() => navigate(ROUTES.updates)}>
                    All updates
                </Button>
            }
            data={recent}
            columns={columns}
            keyField="id"
            isLoading={isPending}
            loadingMessage="Loading updates…"
            emptyMessage={
                <EmptyState
                    icon={History}
                    title="No updates recorded yet"
                    description="A container that comes up on a new image is listed here, whoever updated it."
                />
            }
        />
    );
};
