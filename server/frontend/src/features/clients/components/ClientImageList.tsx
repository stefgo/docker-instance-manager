import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { DockerContainer, DockerImage, DockerActionType } from "@dim/shared";
import { Trash2, Download, Layers, RefreshCw } from "lucide-react";
import {
    DataMultiView,
    EmptyState,
    DataAction,
    type DataColumnDef,
    Button,
    useConfirm,
    PAGE_SIZE,
    listPagination,
    actionsColumn,
    listGroups,
} from "@stefgo/react-ui-components";
import { formatBytes } from "../../../utils";
import { isCheckingImage, normalizeImageId, shortDigest, shownTags } from "../../images/lib/digest";
import { updateStatusOf } from "../../images/lib/updateStatus";
import { describePruneHost } from "../../images/confirmations";
import { usePull } from "../../app/context/PullContext";
import { UpdateIcon } from "../../images/components/UpdateIcon";
import { useDockerActions } from "../../../hooks/useDockerActions";
import { pruneImages, removeImage, useCheckingImages, useUpdatingImages } from "../../../queries/docker";
import { waitForAll } from "../../../lib/hostResults";
import { paths } from "../../../lib/paths";
import { STORAGE_KEYS } from "../../../lib/storageKeys";
import { CheckLabel } from "../../images/components/CheckLabel";
import { useConfirmCheck } from "../../images/hooks/useConfirmCheck";
import { listScope } from "../../../lib/listScope";

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

// Handed to the view instead of applied in front of it: only then can the view tell a search
// without a hit from a list with nothing in it.
const matchesSearch = (img: DockerImage, query: string) => {
    const q = query.toLowerCase();
    return (
        shownTags(img.repoTags).some(t => t.toLowerCase().includes(q)) ||
        img.id.replace("sha256:", "").toLowerCase().includes(q)
    );
};

export const ClientImageList = ({ clientId, images, containers, onAction, searchParamKey = "search" }: ClientImageListProps) => {
    const [searchQuery, setSearchQuery] = useSearchQueryParam(searchParamKey);
    const navigate = useNavigate();
    const { confirm } = useConfirm();
    const confirmCheck = useConfirmCheck();
    const checkingImages = useCheckingImages();
    const updatingImages = useUpdatingImages();
    const { checkImageUpdate } = useDockerActions();
    const pull = usePull();
    const isAnyChecking = Object.values(checkingImages).some(Boolean);

    const inUseImageIds = useMemo(
        () => new Set(containers.map((c) => normalizeImageId(c.imageId))),
        [containers],
    );

    // The rows the view shows, by the same test it applies.
    const shownImages = useMemo(
        () => (searchQuery ? images.filter((img) => matchesSearch(img, searchQuery)) : images),
        [images, searchQuery],
    );
    const isNarrowed = searchQuery !== "";

    const prunableImages = useMemo(
        () => shownImages.filter((img) => !inUseImageIds.has(normalizeImageId(img.id))),
        [shownImages, inUseImageIds],
    );

    // Without a search one image:prune: the host removes what no container uses, whatever the
    // list last showed. With one, each image the search leaves is removed on its own -- by
    // every tag in turn, as removing the last one deletes the image, or by id when it has
    // none. The dialog stays open until the host has answered and names what it refused.
    const removeShown = () =>
        waitForAll(
            prunableImages.map(async (img) => {
                const tags = img.repoTags.filter((t) => t !== "<none>:<none>");
                for (const ref of tags.length > 0 ? tags : [img.id]) await removeImage(ref, [clientId]);
            }),
        );
    const requestPrune = () =>
        confirm({
            ...describePruneHost(prunableImages.length, listScope(isNarrowed)),
            onConfirm: () => (isNarrowed ? removeShown() : pruneImages(clientId)),
        });

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

    // Every image a container runs, once per tag and digest, as the Check across all hosts does
    // -- of the rows the view shows, by the same test. Counted for the header's question.
    const shownChecks = new Map<string, { ref: string; repoDigests: string[] }>();
    for (const img of shownImages) {
        const { ref, canCheck } = updateInfo(img);
        if (!ref || !canCheck) continue;
        const key = `${ref}@${img.repoDigests.join(",")}`;
        if (!shownChecks.has(key)) shownChecks.set(key, { ref, repoDigests: img.repoDigests });
    }
    const checkShown = () =>
        void confirmCheck(
            { count: shownChecks.size, noun: "image", scope: listScope(isNarrowed) },
            Array.from(shownChecks.values(), ({ ref, repoDigests }) => ({ imageRef: ref, repoDigests })),
        );

    const pullAndRecreate = (ref: string, inUse: boolean) =>
        void pull({ targets: [{ imageRef: ref, clientIds: [clientId] }], recreate: inUse });

    // A row opens the page of the image on this host, addressed by id: an untagged image has
    // no reference to name it by.
    const openImage = (img: DockerImage) =>
        navigate(paths.clientImage(clientId, img.id));

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
                    enabled: "Check for updates",
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

    const columns: DataColumnDef<DockerImage>[] = [
        {
            header: "Repository / Tag",
            sortable: true,
            sortValue: (img) => img.repoTags[0] ?? "",
            table: { cellClassName: "text-sm text-text-primary" },
            list: { label: "Tag" },
            render: (img, view) => {
                const tag = shownTags(img.repoTags)[0];
                return view === "list" ? <span className="text-sm text-text-primary">{tag}</span> : tag;
            },
        },
        {
            header: "ID",
            sortable: true,
            sortValue: (img) => img.id,
            table: { cellClassName: "text-sm text-text-muted" },
            render: (img, view) => (
                <span className={view === "list" ? "text-sm" : undefined} title={img.id}>
                    {shortDigest(img.id)}
                </span>
            ),
        },
        {
            header: "Size",
            sortable: true,
            sortValue: (img) => img.size,
            table: { cellClassName: "text-sm text-text-muted" },
            render: (img, view) =>
                view === "list" ? <span className="text-sm">{formatBytes(img.size)}</span> : formatBytes(img.size),
        },
        {
            header: "Up-to-date",
            table: { headerClassName: "text-center", cellClassName: "text-center" },
            render: (img, view) =>
                view === "list" ? (
                    renderUpdateIcon(img)
                ) : (
                    <div className="flex justify-center">{renderUpdateIcon(img)}</div>
                ),
        },
        actionsColumn(
            (img) => (
                <div onClick={(e) => e.stopPropagation()}>
                    <DataAction
                        rowId={img.id}
                        actions={buildActions(img)}
                        menuEntries={buildMenuEntries(img)}
                    />
                </div>
            ),
            { listClassName: "flex justify-end mt-2 md:mt-0" },
        ),
    ];

    return (
        <DataMultiView
            title={<><Layers size={18} className="text-text-muted" /> Images</>}
            extraActions={
                <>
                    <Button
                        size="sm"
                        icon={RefreshCw}
                        onClick={checkShown}
                        disabled={isAnyChecking || shownChecks.size === 0}
                        classNames={{ icon: isAnyChecking ? "animate-spin" : "" }}
                    >
                        <CheckLabel />
                    </Button>
                    {/*
                        Of the images the list shows, as the check: all unused images of the
                        host without a search, the hits alone with one.
                    */}
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
            viewMode={{ persist: { key: STORAGE_KEYS.clientImagesView, scope: "local" } }}
            data={images}
            columns={columns}
            listGroups={listGroups()}
            keyField="id"
            searchable
            searchPlaceholder="Search images…"
            search={{ value: searchQuery, onChange: setSearchQuery }}
            searchFilter={matchesSearch}
            noResultsMessage={`No images match “${searchQuery}”.`}
            sort={{ defaultValue: [{ colIndex: 0, direction: "asc" }] }}
            emptyMessage={<EmptyState icon={Layers} title="No images found" />}
            pagination={listPagination(PAGE_SIZE.embedded)}
            onRowClick={openImage}
        />
    );
};
