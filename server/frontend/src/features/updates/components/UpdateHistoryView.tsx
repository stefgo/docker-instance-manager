import { useMemo, useState } from "react";
import { History } from "lucide-react";
import {
    DataMultiView,
    EmptyState,
    PAGE_SIZE,
    Select,
    listPagination,
} from "@stefgo/react-ui-components";
import { UPDATE_RESULTS, UPDATE_TRIGGERS, type ContainerUpdateRecord } from "@dim/shared";
import { QueryError } from "../../../components/QueryError";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { STORAGE_KEYS } from "../../../lib/storageKeys";
import { useClients } from "../../../queries/clients";
import { useUpdateHistory } from "../../../queries/updates";
import { useClientLookup } from "../hooks/useClientLookup";
import {
    NO_FILTERS,
    RESULT_LABELS,
    TRIGGER_LABELS,
    clientsWithoutHistory,
    isFiltered,
    matchesFilters,
    matchesSearch,
    resultFilterOf,
    triggerFilterOf,
    type UpdateFilters,
} from "../lib/updateHistory";
import { OutdatedAgentsNotice } from "./UpdateParts";
import { updateColumns } from "./updateColumns";

/**
 * Every container update the server keeps, across all hosts, newest first: which container
 * came up on which image, who caused it, and the updates DIM tried that failed.
 *
 * The filters narrow the rows in front of the view; the search goes to the view, so it can
 * tell a search without a hit from a list the filters emptied.
 */
export const UpdateHistoryView = () => {
    const { data, isPending, error } = useUpdateHistory();
    const { clients } = useClients();
    const lookup = useClientLookup();
    const [searchQuery, setSearchQuery] = useSearchQueryParam();
    const [filters, setFilters] = useState<UpdateFilters>(NO_FILTERS);

    const history = useMemo(() => data ?? [], [data]);
    const filtered = useMemo(() => history.filter((u) => matchesFilters(u, filters)), [history, filters]);
    const columns = useMemo(() => updateColumns(lookup, { sortable: true }), [lookup]);
    const outdated = useMemo(() => clientsWithoutHistory(clients), [clients]);

    // Only the hosts that have an update to show: a filter that can only empty the list helps nobody.
    const clientOptions = useMemo(() => {
        const ids = [...new Set(history.map((u) => u.clientId))];
        return ids
            .map((id) => ({ value: id, label: lookup.name(id) }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [history, lookup]);

    const search = (update: ContainerUpdateRecord, query: string) =>
        matchesSearch(update, query, lookup.name(update.clientId));

    if (error) return <QueryError title="Could not load the update history" error={error} />;

    const filterSelects = (
        <div className="flex flex-wrap items-center gap-2">
            <Select
                aria-label="Filter by trigger"
                fullWidth={false}
                value={filters.trigger}
                onChange={(e) => setFilters({ ...filters, trigger: triggerFilterOf(e.target.value) })}
                options={[
                    { value: "all", label: "Trigger: all" },
                    ...UPDATE_TRIGGERS.map((t) => ({ value: t, label: `Trigger: ${TRIGGER_LABELS[t]}` })),
                ]}
            />
            <Select
                aria-label="Filter by result"
                fullWidth={false}
                value={filters.result}
                onChange={(e) => setFilters({ ...filters, result: resultFilterOf(e.target.value) })}
                options={[
                    { value: "all", label: "Result: all" },
                    ...UPDATE_RESULTS.map((r) => ({ value: r, label: `Result: ${RESULT_LABELS[r]}` })),
                ]}
            />
            {clientOptions.length > 1 && (
                <Select
                    aria-label="Filter by client"
                    fullWidth={false}
                    value={filters.clientId}
                    onChange={(e) => setFilters({ ...filters, clientId: e.target.value })}
                    options={[{ value: "all", label: "Client: all" }, ...clientOptions]}
                />
            )}
        </div>
    );

    return (
        <div className="flex flex-col gap-4">
            <OutdatedAgentsNotice clients={outdated} />
            <DataMultiView
                title={
                    <>
                        <History size={18} className="text-text-muted" /> Updates
                    </>
                }
                viewMode={{ persist: { key: STORAGE_KEYS.updatesView, scope: "local" } }}
                data={filtered}
                columns={columns}
                keyField="id"
                isLoading={isPending}
                loadingMessage="Loading updates…"
                // Column 5 is the time.
                sort={{ defaultValue: [{ colIndex: 5, direction: "desc" }] }}
                searchable
                searchPlaceholder="Search updates…"
                search={{ value: searchQuery, onChange: setSearchQuery }}
                searchFilter={search}
                searchActions={filterSelects}
                noResultsMessage={`No updates match “${searchQuery}”.`}
                // The filters work in front of the view, so "there are none" is told from
                // "none match" here.
                emptyMessage={
                    history.length === 0 || !isFiltered(filters) ? (
                        <EmptyState
                            icon={History}
                            title="No updates recorded yet"
                            description="A container that comes up on a new image is listed here, whoever updated it: the auto-update, the dashboard or something on the host."
                        />
                    ) : (
                        "No updates match these filters."
                    )
                }
                pagination={listPagination(PAGE_SIZE.page)}
            />
        </div>
    );
};
