import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { DockerContainer, DockerImage, DockerActionType } from "@dim/shared";
import { Trash2, Download, Layers, RefreshCw } from "lucide-react";
import {
    DataMultiView,
    DataTableDef,
    DataListDef,
    DataListColumnDef,
    DataAction,
    Button,
    useConfirm,
} from "@stefgo/react-ui-components";
import { formatBytes } from "../../../utils";
import { isCheckingImage, normalizeImageId, shortDigest } from "../../images/lib/digest";
import { updateStatusOf } from "../../images/lib/updateStatus";
import { describePruneHost, describePull } from "../../images/confirmations";
import { UpdateIcon } from "../../images/components/UpdateIcon";
import { useDockerStore } from "../../../stores/useDockerStore";
import { PAGE_SIZE, pagination } from "../../../components/listDefaults";

interface ClientImageListProps {
    clientId: string;
    images: DockerImage[];
    /** The host's containers: an image one of them runs is in use, and only such an image is checked. */
    containers: DockerContainer[];
    onAction: (action: DockerActionType, target: string) => void;
    /**
     * The query parameter this list's search is kept in. The caller namespaces it where
     * several lists share a route, so each tab remembers its own search instead of
     * inheriting the one next door.
     */
    searchParamKey?: string;
}

export const ClientImageList = ({ clientId, images, containers, onAction, searchParamKey = "search" }: ClientImageListProps) => {
    const [searchQuery, setSearchQuery] = useSearchQueryParam(searchParamKey);
    const navigate = useNavigate();
    const { pathname, search } = useLocation();
    const { confirm } = useConfirm();
    const checkingImages = useDockerStore((s) => s.checkingImages);
    const updatingImages = useDockerStore((s) => s.updatingImages);
    const checkImageUpdate = useDockerStore((s) => s.checkImageUpdate);
    const updateImage = useDockerStore((s) => s.updateImage);
    const pruneImages = useDockerStore((s) => s.pruneImages);
    const isAnyChecking = Object.values(checkingImages).some(Boolean);

    const inUseImageIds = useMemo(
        () => new Set(containers.map((c) => normalizeImageId(c.imageId))),
        [containers],
    );

    const prunableImages = useMemo(
        () => images.filter((img) => !inUseImageIds.has(normalizeImageId(img.id))),
        [images, inUseImageIds],
    );

    // One image:prune: the host removes what no container uses, whatever the list last
    // showed, and an image with several tags goes as a whole. The dialog stays open until
    // the host has answered.
    const requestPrune = () =>
        confirm({ ...describePruneHost(prunableImages.length), onConfirm: () => pruneImages(clientId) });

    // What the page a row opens reads about its image, so the row and the page agree on the
    // status and on which of the update actions are offered.
    const updateInfo = (img: DockerImage) => {
        const ref = img.repoTags.find((t) => t !== "<none>:<none>");
        const inUse = inUseImageIds.has(normalizeImageId(img.id));
        return {
            ref,
            status: updateStatusOf(img, inUse),
            checking: !!ref && isCheckingImage(checkingImages, img.repoDigests, ref),
            updating: !!ref && !!updatingImages[`${clientId}::${ref}`],
            canCheck: !!ref && inUse && img.repoDigests.length > 0,
            inUse,
        };
    };

    const renderUpdateIcon = (img: DockerImage) => {
        const { status, checking, updating } = updateInfo(img);
        return <UpdateIcon status={status} isChecking={checking} isUpdating={updating} />;
    };

    // Every image a container runs, once per tag and digest, as the Check across all hosts does.
    const checkAll = () => {
        const seen = new Set<string>();
        for (const img of images) {
            const { ref, canCheck } = updateInfo(img);
            if (!ref || !canCheck) continue;
            const key = `${ref}@${img.repoDigests.join(",")}`;
            if (seen.has(key)) continue;
            seen.add(key);
            checkImageUpdate(ref, img.repoDigests);
        }
    };

    // The pull's progress shows in the Up-to-date column, so the dialog closes right away
    // instead of waiting for it.
    const pullAndRecreate = async (ref: string, inUse: boolean) => {
        if (await confirm(describePull([{ imageRef: ref, clientIds: [clientId] }], inUse))) {
            updateImage(ref, [clientId]);
        }
    };

    // A row opens the page of the image on this host, addressed by id: an untagged image has
    // no reference to name it by.
    const openImage = (img: DockerImage) =>
        navigate(
            `/client/${encodeURIComponent(clientId)}/image-id/${encodeURIComponent(img.id)}`,
            { state: { from: pathname + search } },
        );

    const filteredImages = useMemo((): DockerImage[] => {
        if (!searchQuery) return images;
        const q = searchQuery.toLowerCase();
        return images.filter(img =>
            img.repoTags.some(t => t.toLowerCase().includes(q)) ||
            img.id.replace("sha256:", "").toLowerCase().includes(q),
        );
    }, [images, searchQuery]);

    const buildMenuEntries = (img: DockerImage) => {
        const entries = [];
        if (img.repoTags[0]) {
            entries.push({ label: "Pull", icon: Download, onClick: () => onAction("image:pull", img.repoTags[0]), variant: "default" as const });
        }
        entries.push({ label: "Remove", icon: Trash2, onClick: () => onAction("image:remove", img.id), variant: "danger" as const });
        return entries;
    };

    // The update actions sit in the row as buttons, as on the page the row opens.
    const buildActions = (img: DockerImage) => {
        const { ref, status, checking, updating, canCheck, inUse } = updateInfo(img);
        return [
            {
                icon: RefreshCw,
                onClick: () => ref && checkImageUpdate(ref, img.repoDigests),
                tooltip: {
                    enabled: "Check for Update",
                    disabled: checking
                        ? "Checking…"
                        : inUse ? "This image cannot be checked" : "No container runs this image",
                },
                color: "blue" as const,
                disabled: !canCheck || checking,
            },
            {
                icon: Download,
                onClick: () => ref && pullAndRecreate(ref, inUse),
                tooltip: {
                    enabled: "Pull & Recreate",
                    disabled: updating ? "Pulling…" : "No update available",
                },
                color: "green" as const,
                disabled: status !== "update" || updating,
            },
        ];
    };

    const tableDef: DataTableDef<DockerImage>[] = [
        {
            tableHeader: "Repository / Tag",
            tableCellClassName: "text-sm text-text-primary",
            tableItemRender: (img) => <>{img.repoTags[0] ?? "<none>:<none>"}</>,
            sortable: true,
            sortValue: (img) => img.repoTags[0] ?? "",
        },
        {
            tableHeader: "ID",
            tableCellClassName: "font-mono text-xs text-text-muted",
            tableItemRender: (img) => <span title={img.id}>{shortDigest(img.id)}</span>,
            sortable: true,
            sortValue: (img) => img.id,
        },
        {
            tableHeader: "Size",
            tableCellClassName: "text-sm text-text-muted",
            tableItemRender: (img) => <>{formatBytes(img.size)}</>,
            sortable: true,
            sortValue: (img) => img.size,
        },
        {
            tableHeader: "Up-to-date",
            tableHeaderClassName: "text-center",
            tableCellClassName: "text-center",
            tableItemRender: (img) => <div className="flex justify-center">{renderUpdateIcon(img)}</div>,
        },
        {
            tableHeader: "Actions",
            tableHeaderClassName: "text-center",
            tableCellClassName: "content-center",
            tableItemRender: (img) => (
                <div onClick={(e) => e.stopPropagation()}>
                    <DataAction
                        rowId={img.id}
                        actions={buildActions(img)}
                        menuEntries={buildMenuEntries(img)}
                    />
                </div>
            ),
        },
    ];

    const listColumns: DataListColumnDef<DockerImage>[] = [
        {
            fields: [
                {
                    listLabel: "Tag",
                    listItemRender: (img) => (
                        <span className="text-sm text-text-primary">
                            {img.repoTags[0] ?? "<none>:<none>"}
                        </span>
                    ),
                },
                {
                    listLabel: "ID",
                    listItemRender: (img) => (
                        <span className="text-sm" title={img.id}>{shortDigest(img.id)}</span>
                    ),
                },
                {
                    listLabel: "Size",
                    listItemRender: (img) => <span className="text-sm">{formatBytes(img.size)}</span>,
                },
                {
                    listLabel: "Up-to-date",
                    listItemRender: renderUpdateIcon,
                },
            ] satisfies DataListDef<DockerImage>[],
            columnClassName: "flex-1",
        },
        {
            fields: [
                {
                    listLabel: null,
                    listItemRender: (img) => (
                        <div onClick={(e) => e.stopPropagation()} className="flex justify-end mt-2 md:mt-0">
                            <DataAction
                                rowId={img.id}
                                actions={buildActions(img)}
                                menuEntries={buildMenuEntries(img)}
                            />
                        </div>
                    ),
                },
            ] satisfies DataListDef<DockerImage>[],
            columnClassName: "md:text-right",
        },
    ];

    return (
        <DataMultiView
            title={<><Layers size={18} className="text-text-muted" /> Images</>}
            extraActions={
                <>
                    <Button
                        size="sm"
                        icon={RefreshCw}
                        onClick={checkAll}
                        disabled={isAnyChecking}
                        classNames={{ icon: isAnyChecking ? "animate-spin" : "" }}
                    >
                        Check
                    </Button>
                    <Button
                        variant="danger"
                        size="sm"
                        icon={Trash2}
                        onClick={requestPrune}
                        disabled={prunableImages.length === 0}
                    >
                        Prune
                    </Button>
                </>
            }
            viewMode={{ persist: { key: "dockerImageViewMode", scope: "local" } }}
            data={filteredImages}
            tableDef={tableDef}
            listColumns={listColumns}
            keyField="id"
            searchable
            searchPlaceholder="Search images…"
            search={{ value: searchQuery, onChange: setSearchQuery }}
            sort={{ defaultValue: [{ colIndex: 0, direction: "asc" }] }}
            emptyMessage="No images found."
            pagination={pagination(PAGE_SIZE.embedded)}
            onRowClick={openImage}
        />
    );
};
