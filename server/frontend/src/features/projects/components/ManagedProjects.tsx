import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Boxes, Plus, Trash2 } from "lucide-react";
import { ProjectSummary } from "@dim/shared";
import {
    Button,
    ConfirmDialog,
    DataAction,
    DataListColumnDef,
    DataListDef,
    DataMultiView,
    DataTableDef,
} from "@stefgo/react-ui-components";
import { useProjectStore } from "../../../stores/useProjectStore";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { useAllProjectMembers, EMPTY_MEMBERS, ProjectMembers } from "../hooks/useProjectMembers";
import { getErrorMessage } from "../../../utils";

/** A row of the list: the stored project plus what the live Docker state says about it. */
interface ProjectRow extends ProjectSummary {
    live: ProjectMembers;
}

function scheduleLabel(cron: string | null): string {
    return cron ?? "Default";
}

export const ManagedProjects = () => {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const projects = useProjectStore((s) => s.projects);
    const fetchProjects = useProjectStore((s) => s.fetchProjects);
    const deleteProject = useProjectStore((s) => s.deleteProject);
    const members = useAllProjectMembers();
    const [searchQuery, setSearchQuery] = useSearchQueryParam();

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    const rows = useMemo<ProjectRow[]>(
        () =>
            projects.map((p) => ({ ...p, live: members.get(p.name) ?? EMPTY_MEMBERS })),
        [projects, members],
    );

    const filteredRows = useMemo(() => {
        if (!searchQuery) return rows;
        const q = searchQuery.toLowerCase();
        return rows.filter((r) => r.name.toLowerCase().includes(q));
    }, [rows, searchQuery]);

    const [pendingDelete, setPendingDelete] = useState<ProjectRow | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const confirmDelete = async () => {
        if (!pendingDelete) return;
        setIsDeleting(true);
        try {
            await deleteProject(pendingDelete.name);
            setPendingDelete(null);
        } catch (e: unknown) {
            alert(getErrorMessage(e));
        } finally {
            setIsDeleting(false);
        }
    };

    const tableDef: DataTableDef<ProjectRow>[] = [
        {
            tableHeader: "Project",
            sortable: true,
            sortValue: (p) => p.name,
            tableCellClassName: "text-sm",
            tableItemRender: (p) => <span className="font-medium">{p.name}</span>,
        },
        {
            tableHeader: "Auto-Update",
            sortable: true,
            sortValue: (p) => (p.autoUpdate ? 1 : 0),
            tableCellClassName: "text-sm",
            tableItemRender: (p) =>
                p.autoUpdate ? (
                    <span className="text-success">On</span>
                ) : (
                    <span className="text-text-muted">Off</span>
                ),
        },
        {
            tableHeader: "Schedule",
            tableCellClassName: "text-sm text-text-muted",
            tableItemRender: (p) => <>{scheduleLabel(p.cron)}</>,
        },
        {
            tableHeader: "Clients",
            tableHeaderClassName: "text-center",
            tableCellClassName: "text-center text-sm text-text-muted",
            sortable: true,
            sortValue: (p) => p.live.clientIds.length,
            tableItemRender: (p) => <>{p.live.clientIds.length}</>,
        },
        {
            tableHeader: "Container",
            tableHeaderClassName: "text-center",
            tableCellClassName: "text-center text-sm text-text-muted",
            sortable: true,
            sortValue: (p) => p.live.containerCount,
            tableItemRender: (p) => <>{p.live.containerCount}</>,
        },
        {
            tableHeader: "Actions",
            tableHeaderClassName: "text-center",
            tableCellClassName: "content-center",
            tableItemRender: (p) => (
                <div onClick={(e) => e.stopPropagation()}>
                    <DataAction
                        rowId={p.name}
                        menuEntries={[
                            {
                                label: "Remove",
                                icon: Trash2,
                                onClick: () => setPendingDelete(p),
                                variant: "danger",
                            },
                        ]}
                    />
                </div>
            ),
        },
    ];

    const listColumns: DataListColumnDef<ProjectRow>[] = (() => {
        const contentFields: DataListDef<ProjectRow>[] = [
            {
                listLabel: null,
                listItemRender: (p) => (
                    <div className="flex items-center gap-2 py-1">
                        <Boxes size={16} className="text-text-muted" />
                        <span className="font-medium text-text-primary">{p.name}</span>
                    </div>
                ),
            },
            {
                listLabel: "Auto-Update",
                listItemRender: (p) => (
                    <span className={p.autoUpdate ? "text-success" : "text-text-muted"}>
                        {p.autoUpdate ? "On" : "Off"}
                    </span>
                ),
            },
            {
                listLabel: "Schedule",
                listItemRender: (p) => (
                    <span className="text-sm text-text-muted">{scheduleLabel(p.cron)}</span>
                ),
            },
            {
                listLabel: "Members",
                listItemRender: (p) => (
                    <span className="text-sm text-text-muted">
                        {p.live.clientIds.length} client(s), {p.live.containerCount} container
                    </span>
                ),
            },
        ];
        const actionFields: DataListDef<ProjectRow>[] = [
            {
                listLabel: null,
                listItemRender: (p) => (
                    <div onClick={(e) => e.stopPropagation()} className="mt-2 md:mt-0 flex justify-center">
                        <DataAction
                            rowId={p.name}
                            menuEntries={[
                                {
                                    label: "Remove",
                                    icon: Trash2,
                                    onClick: () => setPendingDelete(p),
                                    variant: "danger",
                                },
                            ]}
                        />
                    </div>
                ),
            },
        ];
        return [
            { fields: contentFields, columnClassName: "flex-1" },
            { fields: actionFields, columnClassName: "md:text-right" },
        ];
    })();

    return (
        <div className="space-y-4">
            <DataMultiView
                title={
                    <>
                        <Boxes size={18} className="text-text-muted" /> Projects
                    </>
                }
                extraActions={
                    <Button
                        size="sm"
                        icon={Plus}
                        onClick={() => navigate("/projects/new", { state: { from: pathname } })}
                    >
                        Add Project
                    </Button>
                }
                sort={{ defaultValue: [{ colIndex: 0, direction: "asc" }] }}
                viewMode={{ storageKey: "projectViewMode" }}
                data={filteredRows}
                tableDef={tableDef}
                listColumns={listColumns}
                keyField="name"
                searchable
                searchPlaceholder="Search Projects ..."
                search={{ value: searchQuery, onChange: setSearchQuery }}
                emptyMessage="No projects managed yet."
                onRowClick={(p) => navigate(`/project/${encodeURIComponent(p.name)}`)}
                pagination={{ defaultValue: { pageSize: 10 }, hideOnSinglePage: true }}
            />

            <ConfirmDialog
                isOpen={!!pendingDelete}
                onClose={() => setPendingDelete(null)}
                onConfirm={confirmDelete}
                title={`Remove "${pendingDelete?.name}" from DIM?`}
                description="Only the DIM entry is removed, together with its auto-update setting and schedule. The stack keeps running, nothing on any host is touched, and the project can be added again at any time."
                confirmLabel="Remove"
                variant="danger"
                isConfirming={isDeleting}
            />
        </div>
    );
};
