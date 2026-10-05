import { useState, useMemo, useCallback } from "react";
import { RefreshCw, Download, Trash2 } from "lucide-react";
import { plural } from "../../../utils";
import { Button, DataAction, useConfirm } from "@stefgo/react-ui-components";
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
import { CheckLabel } from "./CheckLabel";

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

    // The same search the list reads, so Prune and the selection act on the rows it shows
    // (on every page).
    const [searchQuery] = useSearchQueryParam(searchParamKey);
    const shown = useMemo(() => filterImages(images, searchQuery), [images, searchQuery]);

    // The rows picked for an action on several at once. What the search takes off the list
    // leaves the selection as well. Kept as digest rows; the box of a tag and of a
    // repository follows from the rows under it.
    const [picked, setPicked] = useState<ReadonlySet<string | number>>(() => new Set());
    const selected = useMemo(() => shownSelection(shown, picked), [shown, picked]);
    const plan = useMemo(() => planSelection(shown, selected), [shown, selected]);
    const hasSelection = plan.rows > 0;
    const clearSelection = useCallback(() => setPicked(new Set()), []);

    // Every image of the list that no container uses, tagged or not, as the rows' trash
    // icons would remove it.
    const prunableRefs = useMemo(() => mergeRefs(shown.flatMap(collectPrunableRefs)), [shown]);

    const handleCheckAll = useCallback(() => {
        for (const repo of images) {
            if (canCheck(repo)) checkUpdate(repo);
        }
    }, [images, canCheck, checkUpdate]);

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

    // What the header's Prune removes: of the picked rows while there are any, of the whole
    // list otherwise.
    const headerPrune = hasSelection ? plan.prune : prunableRefs;

    // Both prune buttons ask first and keep the dialog open until the images are gone. A
    // prune of the selection ends it: the rows it removed are no longer there to be picked.
    const requestPrune = () =>
        confirm(
            hasSelection
                ? {
                      ...describePruneSelection(plan.prune.length),
                      onConfirm: () => prune(plan.prune).finally(clearSelection),
                  }
                : { ...describePruneAll(prunableRefs.length), onConfirm: () => prune(prunableRefs) },
        );

    /** A header button's tooltip: how many of the picked images it reaches. */
    const reach = (count: number) => (hasSelection ? `${plural(count, "image")} of the selection` : undefined);

    const requestPruneNode = (node: ImageTreeNode) =>
        confirm({
            ...describePruneNode(pruneLabel(node), collectPrunableRefs(node).length),
            onConfirm: () => pruneNode(node),
        });

    return (
        <ImageRepositoryList
            images={images}
            searchParamKey={searchParamKey}
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
            extraActions={
                <>
                    {/*
                        As in the container list: always there, off until a picked image has
                        an update, and without a number in its label, which would move the
                        buttons next to it with every pick. The tooltip says what it reaches.
                        Only images a container runs are checked, so a pull found here
                        recreates containers. A pull ends the selection, a check leaves it
                        for the pull that follows.
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
                    {/* One button each for the check and the prune: of what is picked, or of everything. */}
                    <Button
                        size="sm"
                        icon={RefreshCw}
                        onClick={() => (hasSelection ? checkSelection(plan.check) : handleCheckAll())}
                        disabled={isAnyChecking || (hasSelection && plan.check.length === 0)}
                        classNames={{ icon: isAnyChecking ? "animate-spin" : "" }}
                        title={reach(plan.check.length)}
                    >
                        <CheckLabel />
                    </Button>
                    <Button
                        variant="danger"
                        size="sm"
                        icon={Trash2}
                        onClick={requestPrune}
                        disabled={isPruning || headerPrune.length === 0}
                        title={reach(plan.prune.length)}
                    >
                        Prune
                    </Button>
                </>
            }
        />
    );
};
