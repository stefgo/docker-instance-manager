import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, Boxes, Download, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
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
import { useDockerStore } from "../../../stores/useDockerStore";
import { useProjectStore } from "../../../stores/useProjectStore";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { useAllProjectMembers, EMPTY_MEMBERS, ProjectMembers } from "../hooks/useProjectMembers";
import { getErrorMessage } from "../../../utils";
import { UpdateIcon } from "../../images/components/UpdateIcon";
import { UpdateStatus } from "../../images/hooks/useImagesData";

/** Sorts the update column the way it reads: what needs attention first. */
const UPDATE_SORT: Record<UpdateStatus, number> = {
    update: 3,
    unchecked: 2,
    current: 1,
    none: 0,
};

/** A digest a check is keyed by, whether it arrives as `repo@sha256:…` or bare. */
const toDigest = (d: string) => (d.includes("@") ? d.slice(d.indexOf("@") + 1) : d);

/** A row of the list: the stored project plus what the live Docker state says about it. */
interface ProjectRow extends ProjectSummary {
    live: ProjectMembers;
}

/** Containers of this project that match another project too, and are updated through neither. */
const ConflictMarker = ({ count }: { count: number }) => {
    if (count === 0) return null;
    const title = `${count} container(s) also match another project and are excluded from its auto-update`;
    return (
        <span className="inline-flex items-center gap-1 text-xs font-normal text-error" title={title}>
            <AlertCircle size={14} aria-hidden="true" />
            {count}
        </span>
    );
};

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
    const checkImageUpdate = useDockerStore((s) => s.checkImageUpdate);
    const checkingImages = useDockerStore((s) => s.checkingImages);
    const updateImage = useDockerStore((s) => s.updateImage);
    const imageUpdateStatus = useDockerStore((s) => s.imageUpdateStatus);
    const [searchQuery, setSearchQuery] = useSearchQueryParam();

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    const rows = useMemo<ProjectRow[]>(
        () =>
            projects.map((p) => ({ ...p, live: members.get(p.id) ?? EMPTY_MEMBERS })),
        [projects, members],
    );

    const filteredRows = useMemo(() => {
        if (!searchQuery) return rows;
        const q = searchQuery.toLowerCase();
        return rows.filter((r) => r.name.toLowerCase().includes(q));
    }, [rows, searchQuery]);

    const checkProject = useCallback(
        (p: ProjectRow) => {
            for (const target of p.live.targets) {
                if (target.updateStatus === "none") continue;
                checkImageUpdate(target.imageRef, target.repoDigests);
            }
        },
        [checkImageUpdate],
    );

    /** Only what a check found an update for: the rest is already what the registry has. */
    const pullProject = useCallback(
        (p: ProjectRow) => {
            for (const target of p.live.targets) {
                if (target.updateStatus !== "update") continue;
                updateImage(target.imageRef, target.clientIds);
            }
        },
        [updateImage],
    );

    const isChecking = useCallback(
        (p: ProjectRow) =>
            p.live.targets.some((t) =>
                t.repoDigests.length > 0
                    ? t.repoDigests.some((d) => !!checkingImages[toDigest(d)])
                    : !!checkingImages[t.imageRef],
            ),
        [checkingImages],
    );

    const isUpdating = useCallback(
        (p: ProjectRow) =>
            p.live.targets.some((t) =>
                t.clientIds.some((id) => !!imageUpdateStatus[`${id}::${t.imageRef}`]),
            ),
        [imageUpdateStatus],
    );

    const isAnyChecking = Object.values(checkingImages).some(Boolean);

    /**
     * The header's check, over every managed project at once. Keyed by reference rather than
     * by project: two projects that run the same image ask the registry one question.
     */
    const checkAll = useCallback(() => {
        const byRef = new Map<string, Set<string>>();
        for (const row of rows) {
            for (const target of row.live.targets) {
                if (target.updateStatus === "none") continue;
                let digests = byRef.get(target.imageRef);
                if (!digests) byRef.set(target.imageRef, (digests = new Set()));
                for (const digest of target.repoDigests) digests.add(digest);
            }
        }
        for (const [imageRef, digests] of byRef) checkImageUpdate(imageRef, [...digests]);
    }, [rows, checkImageUpdate]);

    const hasCheckable = useMemo(
        () => rows.some((r) => r.live.targets.some((t) => t.updateStatus !== "none")),
        [rows],
    );

    const [pendingDelete, setPendingDelete] = useState<ProjectRow | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const confirmDelete = async () => {
        if (!pendingDelete) return;
        setIsDeleting(true);
        try {
            await deleteProject(pendingDelete.id);
            setPendingDelete(null);
        } catch (e: unknown) {
            alert(getErrorMessage(e));
        } finally {
            setIsDeleting(false);
        }
    };

    const editProject = (p: ProjectRow) =>
        navigate(`/project/${encodeURIComponent(p.id)}/edit`, { state: { from: pathname } });

    const tableDef: DataTableDef<ProjectRow>[] = [
        {
            tableHeader: "Project",
            sortable: true,
            sortValue: (p) => p.name,
            tableCellClassName: "text-sm",
            tableItemRender: (p) => (
                <span className="inline-flex items-center gap-2 font-medium">
                    {p.name}
                    <ConflictMarker count={p.live.conflictCount} />
                </span>
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
            tableCellClassName: "text-sm text-text-muted",
            tableItemRender: (p) => <>{scheduleLabel(p.cron)}</>,
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
            // The worst of the project's images, drawn with the same icon the image lists
            // use, so "behind" looks the same wherever it is reported.
            tableHeader: "Update",
            tableHeaderClassName: "text-center",
            tableCellClassName: "text-center",
            sortable: true,
            sortValue: (p) => UPDATE_SORT[p.live.updateStatus],
            tableItemRender: (p) => (
                <div className="flex justify-center">
                    <UpdateIcon
                        status={p.live.updateStatus}
                        isChecking={isChecking(p)}
                        isUpdating={isUpdating(p)}
                    />
                </div>
            ),
        },
        {
            tableHeader: "Actions",
            tableHeaderClassName: "text-center",
            tableCellClassName: "content-center",
            tableItemRender: (p) => {
                const checking = isChecking(p);
                const updating = isUpdating(p);
                const checkable = p.live.targets.some((t) => t.updateStatus !== "none");
                return (
                    <div onClick={(e) => e.stopPropagation()}>
                        <DataAction
                            rowId={p.id}
                            actions={[
                                {
                                    icon: RefreshCw,
                                    onClick: () => checkProject(p),
                                    tooltip: {
                                        enabled: "Check for Update",
                                        disabled: checking
                                            ? "Checking…"
                                            : "This project has no image that can be checked",
                                    },
                                    color: "blue",
                                    disabled: !checkable || checking,
                                },
                                {
                                    icon: Download,
                                    onClick: () => pullProject(p),
                                    tooltip: {
                                        enabled: "Pull & Recreate",
                                        disabled: updating ? "Pulling…" : "No update available",
                                    },
                                    color: "green",
                                    disabled: p.live.updateStatus !== "update" || updating,
                                },
                            ]}
                            menuEntries={[
                                {
                                    label: "Edit Query",
                                    icon: Pencil,
                                    onClick: () => editProject(p),
                                },
                                {
                                    label: "Delete",
                                    icon: Trash2,
                                    onClick: () => setPendingDelete(p),
                                    variant: "danger",
                                },
                            ]}
                        />
                    </div>
                );
            },
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
                        <ConflictMarker count={p.live.conflictCount} />
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
                            rowId={p.id}
                            menuEntries={[
                                {
                                    label: "Edit Query",
                                    icon: Pencil,
                                    onClick: () => editProject(p),
                                },
                                {
                                    label: "Delete",
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
                    <>
                        <Button
                            size="sm"
                            icon={RefreshCw}
                            onClick={checkAll}
                            disabled={isAnyChecking || !hasCheckable}
                            classNames={{ icon: isAnyChecking ? "animate-spin" : "" }}
                        >
                            Check
                        </Button>
                        <Button
                            size="sm"
                            icon={Plus}
                            onClick={() => navigate("/projects/new", { state: { from: pathname } })}
                        >
                            Add Project
                        </Button>
                    </>
                }
                sort={{ defaultValue: [{ colIndex: 0, direction: "asc" }] }}
                viewMode={{ persist: { key: "projectViewMode", scope: "local" } }}
                data={filteredRows}
                tableDef={tableDef}
                listColumns={listColumns}
                keyField="id"
                searchable
                searchPlaceholder="Search Projects ..."
                search={{ value: searchQuery, onChange: setSearchQuery }}
                emptyMessage="No projects managed yet."
                onRowClick={(p) => navigate(`/project/${encodeURIComponent(p.id)}`)}
                pagination={{ defaultValue: { pageSize: 10 }, hideOnSinglePage: true }}
            />

            <ConfirmDialog
                isOpen={!!pendingDelete}
                onClose={() => setPendingDelete(null)}
                onConfirm={confirmDelete}
                title={`Remove "${pendingDelete?.name}" from DIM?`}
                description="Only the DIM entry is removed, together with its query, auto-update setting and schedule. The containers keep running, nothing on any host is touched, and the project can be added again at any time."
                confirmLabel="Remove"
                variant="danger"
                isConfirming={isDeleting}
            />
        </div>
    );
};
