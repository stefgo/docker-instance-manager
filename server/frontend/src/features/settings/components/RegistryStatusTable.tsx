import { Badge, DataTable, DataTableDef, Tooltip } from "@stefgo/react-ui-components";
import { registryLabel, type RegistryStatus } from "@dim/shared";
import { EMPTY_VALUE, formatDate } from "../../../utils";

type RegistryState = "ok" | "paused" | "error";

function stateOf(r: RegistryStatus): RegistryState {
    if (r.pausedUntil) return "paused";
    return r.error ? "error" : "ok";
}

const STATE_BADGE: Record<RegistryState, { label: string; variant: "success" | "warning" | "error" }> = {
    ok: { label: "Ok", variant: "success" },
    paused: { label: "Paused", variant: "warning" },
    error: { label: "Error", variant: "error" },
};

const columns: DataTableDef<RegistryStatus>[] = [
    {
        tableHeader: "Registry",
        sortable: true,
        sortValue: (r) => registryLabel(r.registry),
        tableCellClassName: "text-sm text-text-primary",
        tableItemRender: (r) => <span title={r.registry}>{registryLabel(r.registry)}</span>,
    },
    {
        tableHeader: "Images",
        sortable: true,
        sortValue: (r) => r.targets,
        tableCellClassName: "text-sm text-text-muted",
        tableItemRender: (r) => r.targets,
    },
    {
        tableHeader: "Status",
        sortable: true,
        sortValue: (r) => stateOf(r),
        tableCellClassName: "text-sm",
        tableItemRender: (r) => {
            const badge = STATE_BADGE[stateOf(r)];
            return <Badge variant={badge.variant} size="sm">{badge.label}</Badge>;
        },
    },
    {
        tableHeader: "Last Check",
        sortable: true,
        sortValue: (r) => r.lastCheckedAt ?? "",
        tableCellClassName: "text-sm text-text-muted font-mono",
        tableItemRender: (r) => (r.lastCheckedAt ? formatDate(r.lastCheckedAt) : EMPTY_VALUE),
    },
    {
        tableHeader: "Next Attempt",
        tableCellClassName: "text-sm text-text-muted font-mono",
        tableItemRender: (r) => (r.pausedUntil ? formatDate(r.pausedUntil) : EMPTY_VALUE),
    },
    {
        tableHeader: "Remaining",
        tableCellClassName: "text-sm text-text-muted",
        // Only registries that send `ratelimit-remaining` have a number to show.
        tableItemRender: (r) => r.remaining ?? EMPTY_VALUE,
    },
    {
        tableHeader: "Note",
        tableCellClassName: "text-sm text-text-muted max-w-[240px]",
        tableItemRender: (r) =>
            r.error ? (
                <Tooltip content={r.error}>
                    <span className="block truncate">{r.error}</span>
                </Tooltip>
            ) : (
                EMPTY_VALUE
            ),
    },
];

/**
 * How the scheduled update check fares with each registry. The scheduler status above says
 * whether it runs; this says why images from one registry are not getting fresh answers --
 * a rate limit pauses that registry alone.
 */
export const RegistryStatusTable = ({ registries }: { registries: RegistryStatus[] }) => (
    <DataTable
        data={registries}
        itemDef={columns}
        keyField="registry"
        sort={{ defaultValue: [{ colIndex: 0, direction: "asc" }] }}
        emptyMessage="No images to check yet."
        className="border-0 shadow-none"
    />
);
