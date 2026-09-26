import { Badge, DataTable, DataTableDef } from "@stefgo/react-ui-components";
import { StatusDot } from "../../clients/components/StatusDot";
import { PAGE_SIZE, pagination } from "../../../components/listDefaults";

/** One container the query matches, as the editor's result table shows it. */
export interface QueryResultRow {
    key: string;
    clientName: string;
    clientOnline: boolean;
    containerName: string;
    image: string;
    state: string;
    /** 1-based numbers of the criteria that match this container on their own. */
    matchedCriteria: number[];
    /** The other project that already has this container, if any. */
    conflictWith: string | null;
}

interface QueryResultTableProps {
    rows: QueryResultRow[];
    /** Criteria are still incomplete, so there is nothing to evaluate yet. */
    isEmptyQuery: boolean;
}

const columns: DataTableDef<QueryResultRow>[] = [
    {
        tableHeader: "Client",
        sortable: true,
        sortValue: (r) => r.clientName,
        tableCellClassName: "text-sm",
        tableItemRender: (r) => (
            <span className="inline-flex items-center gap-2">
                <StatusDot online={r.clientOnline} size="sm" />
                {r.clientName}
            </span>
        ),
    },
    {
        tableHeader: "Container",
        sortable: true,
        sortValue: (r) => r.containerName,
        tableCellClassName: "text-sm",
        tableItemRender: (r) => (
            <span className="inline-flex items-center gap-2">
                <StatusDot online={r.state === "running"} size="sm" />
                {r.containerName}
            </span>
        ),
    },
    {
        tableHeader: "Image",
        sortable: true,
        sortValue: (r) => r.image,
        tableCellClassName: "text-sm text-text-muted break-all",
        tableItemRender: (r) => r.image,
    },
    {
        tableHeader: "Matched by",
        tableCellClassName: "text-sm",
        tableItemRender: (r) => (
            <span className="inline-flex flex-wrap gap-1">
                {r.matchedCriteria.map((n) => (
                    <Badge key={n} variant="neutral" size="sm">
                        #{n}
                    </Badge>
                ))}
            </span>
        ),
    },
    {
        tableHeader: "Conflict",
        sortable: true,
        sortValue: (r) => (r.conflictWith ? 0 : 1),
        tableCellClassName: "text-sm",
        tableItemRender: (r) =>
            r.conflictWith ? (
                <Badge variant="error" size="sm">
                    Already in {r.conflictWith}
                </Badge>
            ) : (
                <span className="text-text-muted">–</span>
            ),
    },
];

/**
 * What the query matches right now, container by container. Recomputed on every keystroke
 * from the live Docker state, so the effect of a criterion shows before it is saved.
 */
export const QueryResultTable = ({ rows, isEmptyQuery }: QueryResultTableProps) => (
    <DataTable
        data={rows}
        itemDef={columns}
        keyField="key"
        sort={{ defaultValue: [{ colIndex: 4, direction: "asc" }, { colIndex: 0, direction: "asc" }] }}
        emptyMessage={
            isEmptyQuery
                ? "Enter a value for at least one criterion to see what it matches."
                : "The query matches no container right now."
        }
        rowClassName={(r) => (r.conflictWith ? "bg-error-bg" : "")}
        pagination={pagination(PAGE_SIZE.embedded)}
        className="border-0 shadow-none"
    />
);
