import { useState, useMemo, useCallback } from "react";
import { RefreshCw, Download, Trash2 } from "lucide-react";
import { plural } from "../../../utils";
import { Button, DataAction, Select, useConfirm } from "@stefgo/react-ui-components";
import { useImagesData } from "../hooks/useImagesData";
import { ImageTreeNode } from "../lib/imageTree";
import { useImageNodeActions } from "../hooks/useImageNodeActions";
import { removeImage, useCheckingImages, useUpdatingImages } from "../../../queries/docker";
import { waitForAll } from "../../../lib/hostResults";
import { ImageRepositoryList } from "./ImageRepositoryList";
import { describePruneAll, describePruneNode, describePruneSelection } from "../confirmations";
import {
    changeSelection,
    collectPrunableRefs,
    mergeRefs,
    planSelection,
    shownSelection,
    type PruneRef,
} from "../lib/selection";
import { shortDigest } from "../lib/digest";
import { filterImages } from "../lib/filterImages";
import { useSearchQueryParam } from "../../../hooks/useSearchQueryParam";
import { IMAGE_FILTER_PARAMS } from "../../../lib/paths";
import { UPDATE_FILTER_OPTIONS, parseUpdateFilter } from "../lib/updateStatus";
import { CheckLabel } from "./CheckLabel";
import { listScope } from "../../../lib/listScope";

// As in the container list: on a phone the filter shares the row with the search.
const FILTER_SELECT = {
    select: "truncate max-sm:w-[8.25rem]",
};

/** How a tree row names itself, in the prune dialog and on its checkbox. */
function pruneLabel(node: ImageTreeNode): string {
    if (node.nodeType === "repository") return node.repository;
    if (node.nodeType === "tag") return `${node.repository}:${node.tag}`;
    return `${node.repository}:${node.tag}@${shortDigest(node.digest)}`;
}

function canPrune(node: ImageTreeNode): boolean {
    if (node.nodeType === "digest") return node.containerIds.length === 0;
    return (node.children ?? []).some(canPrune);
}

interface ManagedImagesProps {
    /** Limits the list to the images one project runs on. */
    projectId?: string;
    /**
     * The query parameter the search is kept in, `search.<list>` where the list shares its
     * route with others. The update filter takes the same suffix (`update.<list>`).
     */
    searchParamKey?: string;
}

export const ManagedImages = ({ projectId, searchParamKey }: ManagedImagesProps = {}) => {
    const checkingImages = useCheckingImages();
    const updatingImages = useUpdatingImages();
    const images = useImagesData(projectId);
    const {
        checkUpdate,
        pull,
        checkSelection,
        pullSelection,
        isChecking,
        isUpdating,
        isAnyChecking,
        canCheck,
        canPull,
        pullLabel,
    } = useImageNodeActions();
    const { confirm } = useConfirm();
    const [isPruning, setIsPruning] = useState(false);
    const [pruningNodes, setPruningNodes] = useState<Record<string, boolean>>({});

    // Kept here rather than in the list, so the header's buttons and the selection act on the
    // rows it shows (on every page).
    const [searchQuery, setSearchQuery] = useSearchQueryParam(searchParamKey);
    const suffix = searchParamKey?.replace(/^search/, "") ?? "";
    const [updateParam, setUpdateFilter] = useSearchQueryParam(IMAGE_FILTER_PARAMS.update + suffix);
    const updateFilter = parseUpdateFilter(updateParam);
    const shown = useMemo(
        () => filterImages(images, { query: searchQuery, update: updateFilter }),
        [images, searchQuery, updateFilter],
    );
    // What the header's buttons say they reach: everything, or the hits alone.
    const scope = listScope(searchQuery !== "" || updateFilter !== "all");

    // The rows picked for an action on several at once. What the search or the filter takes
    // off the list leaves the selection as well. Kept as digest rows; the box of a tag and of a
    // repository follows from the rows under it.
    const [picked, setPicked] = useState<ReadonlySet<string | number>>(() => new Set());
    const selected = useMemo(() => shownSelection(shown, picked), [shown, picked]);
    const plan = useMemo(() => planSelection(shown, selected), [shown, selected]);
    const hasSelection = plan.rows > 0;
    const clearSelection = useCallback(() => setPicked(new Set()), []);

    // Every image of the list that no container uses, tagged or not, as the rows' trash
    // icons would remove it.
    const prunableRefs = useMemo(() => mergeRefs(shown.flatMap(collectPrunableRefs)), [shown]);

    const checkShown = useCallback(() => {
        for (const repo of shown) {
            if (canCheck(repo)) checkUpdate(repo);
        }
    }, [shown, canCheck, checkUpdate]);

    const prune = async (refs: PruneRef[]) => {
        if (refs.length === 0) return;
        setIsPruning(true);
        // Every image is tried; the ones a host refused to remove are named in the dialog.
        await waitForAll(
            refs.map(({ ref, clientIds }) => removeImage(ref, clientIds)),
        ).finally(() => setIsPruning(false));
    };

    const pruneNode = async (node: ImageTreeNode) => {
        const refs = collectPrunableRefs(node);
        if (refs.length === 0) return;
        setPruningNodes((prev) => ({ ...prev, [node.id]: true }));
        await waitForAll(
            refs.map(({ ref, clientIds }) => removeImage(ref, clientIds)),
        ).finally(() => setPruningNodes((prev) => ({ ...prev, [node.id]: false })));
    };

    // Both prune buttons ask first and keep the dialog open until the images are gone: the
    // header's of what the list shows, the bar's of what is picked. A prune of the selection
    // ends it: the rows it removed are no longer there to be picked.
    const requestPruneShown = () =>
        confirm({ ...describePruneAll(prunableRefs.length), onConfirm: () => prune(prunableRefs) });
    const requestPruneSelection = () =>
        confirm({
            ...describePruneSelection(plan.prune.length),
            onConfirm: () => prune(plan.prune).finally(clearSelection),
        });

    /** A selection button's tooltip: how many of the picked images it reaches. */
    const reach = (count: number) => (hasSelection ? `${plural(count, "image")} of the selection` : undefined);

    const requestPruneNode = (node: ImageTreeNode) =>
        confirm({
            ...describePruneNode(pruneLabel(node), collectPrunableRefs(node).length),
            onConfirm: () => pruneNode(node),
        });

    return (
        <ImageRepositoryList
            images={shown}
            hasImages={images.length > 0}
            search={{ value: searchQuery, onChange: setSearchQuery }}
            isFiltered={updateFilter !== "all"}
            searchActions={
                // "all" writes no parameter: an empty value removes it.
                <Select
                    aria-label="Filter by update status"
                    fullWidth={false}
                    classNames={FILTER_SELECT}
                    value={updateFilter}
                    onChange={(e) => setUpdateFilter(e.target.value === "all" ? "" : e.target.value)}
                    options={UPDATE_FILTER_OPTIONS}
                />
            }
            selection={{
                value: selected,
                onChange: (next) => setPicked(changeSelection(shown, picked, next)),
                // The boxes count repositories and tags as well; what is acted on are the images.
                label: () => `${plan.rows} selected`,
                rowLabel: (node) => `Select ${pruneLabel(node)}`,
            }}
            checkingImages={checkingImages}
            updatingImages={updatingImages}
            renderRowActions={(node) => {
                // The same reading the Update column shows, so the icon and the buttons agree.
                const checking = isChecking(node);
                const updating = isUpdating(node);
                return (
                    <DataAction
                        rowId={node.id}
                        actions={[
                            {
                                icon: RefreshCw,
                                onClick: () => checkUpdate(node),
                                tooltip: {
                                    enabled: "Check for updates",
                                    disabled: checking ? "Checking…" : "This image cannot be checked",
                                },
                                color: "blue",
                                disabled: !canCheck(node) || checking,
                            },
                            {
                                icon: Download,
                                onClick: () => pull(node),
                                tooltip: {
                                    enabled: pullLabel(node),
                                    disabled: updating ? "Pulling…" : "No update available",
                                },
                                color: "green",
                                disabled: !canPull(node) || updating,
                            },
                            {
                                icon: Trash2,
                                onClick: () => requestPruneNode(node),
                                tooltip: {
                                    enabled: "Prune",
                                    disabled: pruningNodes[node.id] ? "Pruning…" : "Every image here is in use",
                                },
                                color: "red",
                                disabled: !canPrune(node) || !!pruningNodes[node.id],
                            },
                        ]}
                    />
                );
            }}
            globalActions={
                <>
                    {/* What the list shows: with the search or the filter, the hits alone. */}
                    <Button
                        size="sm"
                        icon={RefreshCw}
                        onClick={checkShown}
                        disabled={isAnyChecking || shown.length === 0}
                        classNames={{ icon: isAnyChecking ? "animate-spin" : "" }}
                    >
                        <CheckLabel scope={scope} />
                    </Button>
                    <Button
                        variant="danger"
                        size="sm"
                        icon={Trash2}
                        onClick={requestPruneShown}
                        disabled={isPruning || prunableRefs.length === 0}
                    >
                        Prune {scope}
                    </Button>
                </>
            }
            selectionActions={() => (
                <>
                    {/*
                        As in the container list: each is off where it reaches no picked image,
                        and says in its tooltip how many it does -- not in its label, which would
                        move the buttons next to it with every pick. Only images a container runs
                        are checked, so a pull found here recreates containers. A pull and a prune
                        end the selection, a check leaves it for the pull that follows.
                    */}
                    <Button
                        size="sm"
                        variant="secondary"
                        icon={Download}
                        onClick={async () => {
                            if (await pullSelection(plan.pull, plan.recreate)) clearSelection();
                        }}
                        disabled={plan.pull.length === 0}
                        title={reach(plan.pull.length)}
                    >
                        Pull &amp; Recreate
                    </Button>
                    <Button
                        size="sm"
                        variant="secondary"
                        icon={RefreshCw}
                        onClick={() => checkSelection(plan.check)}
                        disabled={isAnyChecking || plan.check.length === 0}
                        title={reach(plan.check.length)}
                    >
                        <CheckLabel />
                    </Button>
                    <Button
                        variant="danger"
                        size="sm"
                        icon={Trash2}
                        onClick={requestPruneSelection}
                        disabled={isPruning || plan.prune.length === 0}
                        title={reach(plan.prune.length)}
                    >
                        Prune
                    </Button>
                </>
            )}
        />
    );
};
