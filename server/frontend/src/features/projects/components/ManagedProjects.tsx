import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Boxes, Plus, Trash2, X } from "lucide-react";
import { ProjectSummary } from "@dim/shared";
import {
    Button,
    Card,
    ConfirmDialog,
    DataAction,
    DataListColumnDef,
    DataListDef,
    DataMultiView,
    DataTableDef,
    Input,
    Switch,
    cn,
    FOCUS_RING,
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
    const projects = useProjectStore((s) => s.projects);
    const discovered = useProjectStore((s) => s.discovered);
    const fetchProjects = useProjectStore((s) => s.fetchProjects);
    const createProject = useProjectStore((s) => s.createProject);
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

    // A stack the hosts report that has no entry yet. The store's list is the server's view
    // of it; anything the live state has picked up since is added here.
    const suggestions = useMemo(() => {
        const known = new Set(projects.map((p) => p.name));
        const names = new Set([...discovered, ...members.keys()]);
        return [...names].filter((n) => !known.has(n)).sort();
    }, [discovered, members, projects]);

    // Adding happens inline above the list rather than in a dialog: the suggestions below the
    // field are read off the same hosts the list shows, so both stay visible while one is picked.
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [newName, setNewName] = useState("");
    const [newAutoUpdate, setNewAutoUpdate] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);
    const [isAdding, setIsAdding] = useState(false);

    const openAdd = () => {
        setNewName("");
        setNewAutoUpdate(false);
        setAddError(null);
        setIsAddOpen(true);
    };

    const confirmAdd = async () => {
        const name = newName.trim();
        if (!name) return;
        setIsAdding(true);
        setAddError(null);
        try {
            await createProject({ name, autoUpdate: newAutoUpdate });
            setIsAddOpen(false);
        } catch (e: unknown) {
            // Stays open with the message beside the button that retries it -- the most
            // likely failure is a name that is already managed.
            setAddError(getErrorMessage(e));
        } finally {
            setIsAdding(false);
        }
    };

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
            tableItemRender: (p) => (
                <div className="flex items-center gap-2">
                    <Boxes size={16} className="text-text-muted" />
                    <span className="text-sm text-text-primary">{p.name}</span>
                </div>
            ),
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
            tableCellClassName: "font-mono text-xs text-text-muted",
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
                        <span className="text-text-primary">{p.name}</span>
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
                    <span className="font-mono text-xs text-text-muted">{scheduleLabel(p.cron)}</span>
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
            {isAddOpen && (
                <Card
                    title={
                        <div className="flex items-center gap-2">
                            <Plus size={18} className="text-text-muted" /> Add Project
                        </div>
                    }
                    action={
                        <Button
                            variant="ghost"
                            size="sm"
                            icon={X}
                            onClick={() => setIsAddOpen(false)}
                            aria-label="Close"
                        />
                    }
                    padding="md"
                    classNames={{ content: "space-y-4" }}
                >
                    <p className="text-sm text-text-muted">
                        A project is a Compose stack, identified by its project name. DIM only
                        stores the name and its settings — which containers belong to it is read
                        off the hosts.
                    </p>

                    <Input
                        label="Project name"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="nextcloud"
                        className="font-mono"
                    />

                    {/* The stacks the hosts report that are not managed yet. Typing a name
                        that no host runs is allowed: a project may be set up before its
                        stack is deployed. */}
                    {suggestions.length > 0 && (
                        <div>
                            <span className="block text-xs font-bold text-text-muted uppercase mb-1">
                                Found on the hosts
                            </span>
                            <div className="flex flex-wrap gap-2">
                                {suggestions.map((name) => (
                                    <button
                                        key={name}
                                        type="button"
                                        onClick={() => setNewName(name)}
                                        className={cn(
                                            "text-xs px-2 py-1 rounded border border-border hover:bg-hover font-mono",
                                            FOCUS_RING,
                                        )}
                                    >
                                        {name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <Switch
                        label="Auto-Update"
                        hint="Every container of this stack takes part in auto-update, on every host it runs on."
                        value={newAutoUpdate}
                        onChange={setNewAutoUpdate}
                    />

                    {addError && <p className="text-sm text-error">{addError}</p>}

                    <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setIsAddOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            onClick={confirmAdd}
                            disabled={!newName.trim() || isAdding}
                        >
                            Add project
                        </Button>
                    </div>
                </Card>
            )}

            <DataMultiView
                title={
                    <>
                        <Boxes size={18} className="text-text-muted" /> Projects
                    </>
                }
                extraActions={
                    <Button size="sm" icon={Plus} onClick={openAdd} disabled={isAddOpen}>
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
