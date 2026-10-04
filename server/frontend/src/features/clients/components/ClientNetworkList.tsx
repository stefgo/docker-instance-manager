import { useMemo } from "react";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { DockerNetwork, DockerActionType } from "@dim/shared";
import { Trash2, Network } from "lucide-react";
import {
    DataMultiView,
    DataAction,
    type DataColumnDef,
} from "@stefgo/react-ui-components";
import { PAGE_SIZE, pagination } from "../../../components/listDefaults";
import { ACTIONS_GROUP, listGroups } from "../../../components/listColumns";
import { STORAGE_KEYS } from "../../../lib/storageKeys";

interface ClientNetworkListProps {
    networks: DockerNetwork[];
    onAction: (action: DockerActionType, target: string) => void;
    /**
     * The query parameter this list's search is kept in. The caller namespaces it where
     * several lists share a route, so each tab remembers its own search instead of
     * inheriting the one next door.
     */
    searchParamKey?: string;
}

const SYSTEM_NETWORKS = new Set(["bridge", "host", "none"]);

export const ClientNetworkList = ({ networks, onAction, searchParamKey = "search" }: ClientNetworkListProps) => {
    const [searchQuery, setSearchQuery] = useSearchQueryParam(searchParamKey);

    const sortedNetworks = useMemo(
        () => [...networks].sort((a, b) => a.name.localeCompare(b.name)),
        [networks],
    );

    const filteredNetworks = useMemo(() => {
        if (!searchQuery) return sortedNetworks;
        const q = searchQuery.toLowerCase();
        return sortedNetworks.filter(n =>
            n.name.toLowerCase().includes(q) ||
            n.driver.toLowerCase().includes(q),
        );
    }, [sortedNetworks, searchQuery]);

    const columns: DataColumnDef<DockerNetwork>[] = [
        {
            header: "Name",
            sortable: true,
            sortValue: (n) => n.name,
            render: (n) => {
                const isSystem = SYSTEM_NETWORKS.has(n.name);
                return (
                    <div className="flex items-center gap-2 text-sm">
                        {n.name}
                        {isSystem && (
                            <span className="text-[10px] bg-hover text-text-muted px-1.5 py-0.5 rounded">
                                system
                            </span>
                        )}
                    </div>
                );
            },
        },
        {
            header: "Driver",
            sortable: true,
            accessorKey: "driver",
            table: { cellClassName: "text-sm text-text-muted" },
            render: (n, view) => (view === "list" ? <span className="text-sm">{n.driver}</span> : n.driver),
        },
        {
            header: "Subnet",
            table: { cellClassName: "text-sm text-text-muted" },
            render: (n, view) => {
                const subnet = n.ipam.config[0]?.subnet ?? "–";
                return view === "list" ? <span className="text-sm">{subnet}</span> : subnet;
            },
        },
        {
            header: "Scope",
            sortable: true,
            accessorKey: "scope",
            table: { cellClassName: "text-sm text-text-muted" },
            render: (n, view) => (view === "list" ? <span className="text-sm">{n.scope}</span> : n.scope),
        },
        {
            // Not `actionsColumn`: a system network has no actions, and its row must not
            // carry the empty wrapper -- with its margin -- that the helper would leave.
            header: "Actions",
            table: { headerClassName: "text-center", cellClassName: "content-center" },
            list: { label: null, group: ACTIONS_GROUP },
            render: (n, view) => {
                if (SYSTEM_NETWORKS.has(n.name)) return null;
                return (
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className={view === "list" ? "flex justify-end mt-2 md:mt-0" : undefined}
                    >
                        <DataAction
                            rowId={n.id}
                            menuEntries={[{ label: "Remove", icon: Trash2, onClick: () => onAction("network:remove", n.id), variant: "danger" }]}
                        />
                    </div>
                );
            },
        },
    ];

    return (
        <DataMultiView
            title={<><Network size={18} className="text-text-muted" /> Networks</>}
            sort={{ defaultValue: [{ colIndex: 0, direction: "asc" }] }}
            viewMode={{ persist: { key: STORAGE_KEYS.clientNetworksView, scope: "local" } }}
            data={filteredNetworks}
            columns={columns}
            listGroups={listGroups()}
            keyField="id"
            searchable
            searchPlaceholder="Search networks…"
            search={{ value: searchQuery, onChange: setSearchQuery }}
            emptyMessage="No networks found."
            pagination={pagination(PAGE_SIZE.embedded)}
        />
    );
};
