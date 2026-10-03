import { useCallback, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, Boxes, Download, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { ProjectSummary } from "@dim/shared";
import {
    Button,
    DataAction,
    DataMultiView,
    type DataColumnDef,
    useConfirm,
} from "@stefgo/react-ui-components";
import { useDockerStore } from "../../../stores/useDockerStore";
import { useDockerActions } from "../../../hooks/useDockerActions";
import { useProjectStore } from "../../../stores/useProjectStore";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { useAllProjectMembers, EMPTY_MEMBERS, ProjectMembers } from "../hooks/useProjectMembers";
import { useProjectPull } from "../hooks/useProjectPull";
import { ProjectPullDialog } from "./ProjectPullDialog";
import { UpdateIcon } from "../../images/components/UpdateIcon";
import { UpdateStatus } from "../../images/hooks/useImagesData";
import { describeDeleteProject } from "../confirmations";
import { plural } from "../../../utils";
import { isCheckingImage } from "../../images/lib/digest";
import { PAGE_SIZE, pagination } from "../../../components/listDefaults";
import { ACTIONS_GROUP, listGroups } from "../../../components/listColumns";

/** Sorts the update column the way it reads: what needs attention first. */
const UPDATE_SORT: Record<UpdateStatus, number> = {
    update: 3,
    unchecked: 2,
    current: 1,
    none: 0,
};


/** A row of the list: the stored project plus what the live Docker state says about it. */
interface ProjectRow extends ProjectSummary {
    live: ProjectMembers;
}

/** Containers of this project that match another project too, and are updated through neither. */
const ConflictMarker = ({ count }: { count: number }) => {
    if (count === 0) return null;
    const title = count === 1
        ? "1 container also matches another project and is excluded from its auto-update"
        : `${count} containers also match another project and are excluded from its auto-update`;
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
    const { pathname, search } = useLocation();
    const projects = useProjectStore((s) => s.projects);
    const fetchProjects = useProjectStore((s) => s.fetchProjects);
    const deleteProject = useProjectStore((s) => s.deleteProject);
    const members = useAllProjectMembers();
    const { checkImageUpdate } = useDockerActions();
    const checkingImages = useDockerStore((s) => s.checkingImages);
    const pull = useProjectPull();
    const [searchQuery, setSearchQuery] = useSearchQueryParam();
    const { confirm } = useConfirm();

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

    const isChecking = useCallback(
        (p: ProjectRow) =>
            p.live.targets.some((t) => isCheckingImage(checkingImages, t.repoDigests, t.imageRef)),
        [checkingImages],
    );

    const isUpdating = (p: ProjectRow) => pull.isUpdating(p.live);

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

    // A failed delete keeps the dialog open, with the message in it.
    const requestDelete = (p: ProjectRow) =>
        confirm({ ...describeDeleteProject(p.name), onConfirm: () => deleteProject(p.id) });

    const editProject = (p: ProjectRow) =>
        navigate(`/project/${encodeURIComponent(p.id)}/edit`, { state: { from: pathname } });

    const columns: DataColumnDef<ProjectRow>[] = [
        {
            header: "Project",
            sortable: true,
            sortValue: (p) => p.name,
            table: { cellClassName: "text-sm" },
            list: { label: null },
            render: (p, view) =>
                view === "list" ? (
                    <div className="flex items-center gap-2 py-1">
                        <Boxes size={16} className="text-text-muted" />
                        <span className="font-medium text-text-primary">{p.name}</span>
                        <ConflictMarker count={p.live.conflictCount} />
                    </div>
                ) : (
                    <span className="inline-flex items-center gap-2 font-medium">
                        {p.name}
                        <ConflictMarker count={p.live.conflictCount} />
                    </span>
                ),
        },
        {
            header: "Auto-Update",
            sortable: true,
            sortValue: (p) => (p.autoUpdate ? 1 : 0),
            table: { cellClassName: "text-sm" },
            render: (p) => (
                <span className={p.autoUpdate ? "text-success" : "text-text-muted"}>
                    {p.autoUpdate ? "On" : "Off"}
                </span>
            ),
        },
        {
            header: "Schedule",
            table: { cellClassName: "text-sm text-text-muted" },
            render: (p, view) =>
                view === "list" ? (
                    <span className="text-sm text-text-muted">{scheduleLabel(p.cron)}</span>
                ) : (
                    scheduleLabel(p.cron)
                ),
        },
        {
            header: "Containers",
            sortable: true,
            sortValue: (p) => p.live.containerCount,
            table: { headerClassName: "text-center", cellClassName: "text-center text-sm text-text-muted" },
            list: false,
            render: (p) => p.live.containerCount,
        },
        {
            header: "Members",
            table: false,
            render: (p) => (
                <span className="text-sm text-text-muted">
                    {plural(p.live.clientIds.length, "client")}, {plural(p.live.containerCount, "container")}
                </span>
            ),
        },
        {
            // The worst of the project's images, drawn with the same icon the image lists
            // use, so "behind" looks the same wherever it is reported.
            header: "Up-to-date",
            sortable: true,
            sortValue: (p) => UPDATE_SORT[p.live.updateStatus],
            table: { headerClassName: "text-center", cellClassName: "text-center" },
            list: false,
            render: (p) => (
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
            // Not `actionsColumn`: Check and Pull are buttons of the table only -- the list
            // has no Up-to-date column for them to belong to -- so the cell reads `view`.
            header: "Actions",
            table: { headerClassName: "text-center", cellClassName: "content-center" },
            list: { label: null, group: ACTIONS_GROUP },
            render: (p, view) => {
                const checking = isChecking(p);
                const updating = isUpdating(p);
                const checkable = p.live.targets.some((t) => t.updateStatus !== "none");
                return (
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className={view === "list" ? "mt-2 md:mt-0 flex justify-center" : undefined}
                    >
                        <DataAction
                            rowId={p.id}
                            actions={
                                view === "list"
                                    ? undefined
                                    : [
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
                                              onClick: () => pull.request(p.name, p.live),
                                              tooltip: {
                                                  enabled: "Pull & Recreate",
                                                  disabled: updating
                                                      ? "Pulling…"
                                                      : "This project has no image that can be pulled",
                                              },
                                              color: "green",
                                              disabled: !pull.canPull(p.live) || updating,
                                          },
                                      ]
                            }
                            menuEntries={[
                                {
                                    label: "Edit Query",
                                    icon: Pencil,
                                    onClick: () => editProject(p),
                                },
                                {
                                    label: "Delete",
                                    icon: Trash2,
                                    onClick: () => requestDelete(p),
                                    variant: "danger",
                                },
                            ]}
                        />
                    </div>
                );
            },
        },
    ];

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
                columns={columns}
                listGroups={listGroups()}
                keyField="id"
                searchable
                searchPlaceholder="Search projects…"
                search={{ value: searchQuery, onChange: setSearchQuery }}
                emptyMessage="No projects managed yet."
                // `from` keeps the search, so leaving the project page returns to the same list.
                onRowClick={(p) =>
                    navigate(`/project/${encodeURIComponent(p.id)}`, { state: { from: pathname + search } })
                }
                pagination={pagination(PAGE_SIZE.page)}
            />
            <ProjectPullDialog pull={pull} />
        </div>
    );
};
