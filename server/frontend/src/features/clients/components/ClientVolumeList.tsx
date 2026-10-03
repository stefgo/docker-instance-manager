import { useMemo } from "react";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { DockerVolume, DockerActionType } from "@dim/shared";
import { Trash2, HardDrive } from "lucide-react";
import {
    DataMultiView,
    DataAction,
    type DataColumnDef,
} from "@stefgo/react-ui-components";
import { formatDate } from "../../../utils";
import { PAGE_SIZE, pagination } from "../../../components/listDefaults";
import { actionsColumn, listGroups } from "../../../components/listColumns";

interface ClientVolumeListProps {
    volumes: DockerVolume[];
    onAction: (action: DockerActionType, target: string) => void;
    /**
     * The query parameter this list's search is kept in. The caller namespaces it where
     * several lists share a route, so each tab remembers its own search instead of
     * inheriting the one next door.
     */
    searchParamKey?: string;
}

export const ClientVolumeList = ({ volumes, onAction, searchParamKey = "search" }: ClientVolumeListProps) => {
    const [searchQuery, setSearchQuery] = useSearchQueryParam(searchParamKey);

    const sortedVolumes = useMemo(
        () => [...volumes].sort((a, b) => a.name.localeCompare(b.name)),
        [volumes],
    );

    const filteredVolumes = useMemo(() => {
        if (!searchQuery) return sortedVolumes;
        const q = searchQuery.toLowerCase();
        return sortedVolumes.filter(v =>
            v.name.toLowerCase().includes(q) ||
            v.driver.toLowerCase().includes(q),
        );
    }, [sortedVolumes, searchQuery]);

    const columns: DataColumnDef<DockerVolume>[] = [
        {
            header: "Name",
            sortable: true,
            sortValue: (v) => v.name,
            table: { cellClassName: "text-sm text-text-primary max-w-[280px] truncate" },
            render: (v, view) =>
                view === "list" ? <span className="text-sm">{v.name}</span> : <span title={v.name}>{v.name}</span>,
        },
        {
            header: "Driver",
            sortable: true,
            accessorKey: "driver",
            table: { cellClassName: "text-sm text-text-muted" },
            render: (v, view) => (view === "list" ? <span className="text-sm">{v.driver}</span> : v.driver),
        },
        {
            header: "Created",
            sortable: true,
            sortValue: (v) => v.createdAt ?? "",
            table: { cellClassName: "text-sm text-text-muted" },
            render: (v, view) => {
                const created = v.createdAt ? formatDate(v.createdAt) : "–";
                return view === "list" ? <span className="text-sm">{created}</span> : created;
            },
        },
        actionsColumn(
            (v) => (
                <div onClick={(e) => e.stopPropagation()}>
                    <DataAction
                        rowId={v.name}
                        menuEntries={[{ label: "Remove", icon: Trash2, onClick: () => onAction("volume:remove", v.name), variant: "danger" }]}
                    />
                </div>
            ),
            "flex justify-end mt-2 md:mt-0",
        ),
    ];

    return (
        <DataMultiView
            title={<><HardDrive size={18} className="text-text-muted" /> Volumes</>}
            sort={{ defaultValue: [{ colIndex: 0, direction: "asc" }] }}
            viewMode={{ persist: { key: "dockerVolumeViewMode", scope: "local" } }}
            data={filteredVolumes}
            columns={columns}
            listGroups={listGroups()}
            keyField="name"
            searchable
            searchPlaceholder="Search volumes…"
            search={{ value: searchQuery, onChange: setSearchQuery }}
            emptyMessage="No volumes found."
            pagination={pagination(PAGE_SIZE.embedded)}
        />
    );
};
