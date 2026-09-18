import { useMemo } from "react";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { DockerVolume, DockerActionType } from "@dim/shared";
import { Trash2, HardDrive } from "lucide-react";
import {
    DataMultiView,
    DataTableDef,
    DataListDef,
    DataListColumnDef,
    DataAction,
} from "@stefgo/react-ui-components";
import { formatDate } from "../../../utils";

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

    const tableDef: DataTableDef<DockerVolume>[] = [
        {
            tableHeader: "Name",
            sortable: true,
            sortValue: (v) => v.name,
            tableCellClassName: "text-sm text-text-primary max-w-[280px] truncate",
            tableItemRender: (v) => <span title={v.name}>{v.name}</span>,
        },
        {
            tableHeader: "Driver",
            sortable: true,
            accessorKey: "driver",
            tableCellClassName: "text-sm text-text-muted",
        },
        {
            tableHeader: "Created",
            sortable: true,
            sortValue: (v) => v.createdAt ?? "",
            tableCellClassName: "text-sm text-text-muted",
            tableItemRender: (v) => <>{v.createdAt ? formatDate(v.createdAt) : "–"}</>,
        },
        {
            tableHeader: "Actions",
            tableHeaderClassName: "text-center",
            tableCellClassName: "content-center",
            tableItemRender: (v) => (
                <div onClick={(e) => e.stopPropagation()}>
                    <DataAction
                        rowId={v.name}
                        menuEntries={[{ label: "Remove", icon: Trash2, onClick: () => onAction("volume:remove", v.name), variant: "danger" }]}
                    />
                </div>
            ),
        },
    ];

    const listColumns: DataListColumnDef<DockerVolume>[] = [
        {
            fields: [
                {
                    listLabel: "Name",
                    listItemRender: (v) => <span className="text-sm">{v.name}</span>,
                },
                {
                    listLabel: "Driver",
                    listItemRender: (v) => <span className="text-sm">{v.driver}</span>,
                },
                {
                    listLabel: "Created",
                    listItemRender: (v) => <span className="text-sm">{v.createdAt ? formatDate(v.createdAt) : "–"}</span>,
                },
            ] satisfies DataListDef<DockerVolume>[],
            columnClassName: "flex-1",
        },
        {
            fields: [
                {
                    listLabel: null,
                    listItemRender: (v) => (
                        <div onClick={(e) => e.stopPropagation()} className="flex justify-end mt-2 md:mt-0">
                            <DataAction
                                rowId={v.name}
                                menuEntries={[{ label: "Remove", icon: Trash2, onClick: () => onAction("volume:remove", v.name), variant: "danger" }]}
                            />
                        </div>
                    ),
                },
            ] satisfies DataListDef<DockerVolume>[],
            columnClassName: "md:text-right",
        },
    ];

    return (
        <DataMultiView
            title={<><HardDrive size={18} className="text-text-muted" /> Volumes</>}
            sort={{ defaultValue: [{ colIndex: 0, direction: "asc" }] }}
            viewMode={{ persist: { key: "dockerVolumeViewMode", scope: "local" } }}
            data={filteredVolumes}
            tableDef={tableDef}
            listColumns={listColumns}
            keyField="name"
            searchable
            searchPlaceholder="Search volumes…"
            search={{ value: searchQuery, onChange: setSearchQuery }}
            emptyMessage="No volumes found."
            pagination={{ defaultValue: { pageSize: 10 }, hideOnSinglePage: true }}
        />
    );
};
