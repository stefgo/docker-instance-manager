import type { PullTarget } from "../confirmations";
import type { DigestNode, ImageTreeNode, RepositoryNode } from "./imageTree";
import { collectCheckableDigests, collectTaggedDigests } from "./nodeStatus";

type RowKey = string | number;

/** One reference a prune removes, and the hosts it is removed on. */
export type PruneRef = { ref: string; clientIds: string[] };

/**
 * What removing the unused images below a row takes. It reads the digest rows the row has,
 * which a search may have narrowed: an unused tag is removed only on the hosts of the digests
 * the list still shows, not on every host that has it.
 */
export function collectPrunableRefs(node: ImageTreeNode): PruneRef[] {
    if (node.nodeType === "digest") {
        if (node.containerIds.length > 0) return [];
        return node.imageIds.map((id) => ({ ref: id, clientIds: node.clientIds }));
    }
    const children: ImageTreeNode[] = node.children ?? [];
    if (node.nodeType === "tag" && node.tag !== "<none>" && node.containerIds.length === 0) {
        const clientIds = new Set(children.flatMap((d) => d.clientIds));
        return [{ ref: `${node.repository}:${node.tag}`, clientIds: Array.from(clientIds) }];
    }
    return children.flatMap(collectPrunableRefs);
}

/** One entry per reference, with the hosts of every entry that named it. */
export function mergeRefs(refs: PruneRef[]): PruneRef[] {
    const byRef = new Map<string, Set<string>>();
    for (const { ref, clientIds } of refs) {
        if (!byRef.has(ref)) byRef.set(ref, new Set());
        for (const clientId of clientIds) byRef.get(ref)!.add(clientId);
    }
    return Array.from(byRef, ([ref, clientIds]) => ({ ref, clientIds: Array.from(clientIds) }));
}

/**
 * The digest rows a selection stands for. A picked repository or tag stands for the digest
 * rows shown under it -- with a search set those are the ones the search left. A digest row
 * picked next to its tag counts once.
 */
export function selectedDigests(repos: RepositoryNode[], keys: ReadonlySet<RowKey>): DigestNode[] {
    return repos.flatMap((repo) =>
        (repo.children ?? []).flatMap((tag) => {
            const digests = tag.children ?? [];
            return keys.has(repo.id) || keys.has(tag.id) ? digests : digests.filter((digest) => keys.has(digest.id));
        }),
    );
}

/**
 * The selection as the list shows it, from the digest rows that are picked. Digest rows are
 * what is kept: a tag is picked exactly when every digest row shown under it is, and a
 * repository when every tag is, so a box and the boxes below it cannot disagree. A row the
 * search has taken off the list is not in it -- nothing is acted on behind the reader's back.
 */
export function shownSelection(repos: RepositoryNode[], digestKeys: ReadonlySet<RowKey>): Set<RowKey> {
    const shown = new Set<RowKey>();
    for (const repo of repos) {
        const tags = repo.children ?? [];
        let everyTag = tags.length > 0;
        for (const tag of tags) {
            const digests = tag.children ?? [];
            const picked = digests.filter((digest) => digestKeys.has(digest.id));
            picked.forEach((digest) => shown.add(digest.id));
            if (picked.length > 0 && picked.length === digests.length) shown.add(tag.id);
            else everyTag = false;
        }
        if (everyTag) shown.add(repo.id);
    }
    return shown;
}

/**
 * The digest rows picked after the list changed the selection to `next`. A repository or a
 * tag that was ticked takes every digest row under it along, one that was unticked lets them
 * all go -- the repository deciding before its tags; a digest row changes by itself, and the
 * rows above follow from that (`shownSelection`).
 */
export function changeSelection(
    repos: RepositoryNode[],
    digestKeys: ReadonlySet<RowKey>,
    next: ReadonlySet<RowKey>,
): Set<RowKey> {
    const before = shownSelection(repos, digestKeys);
    const ticked = (id: RowKey) => next.has(id) && !before.has(id);
    const unticked = (id: RowKey) => !next.has(id) && before.has(id);
    const result = new Set<RowKey>();
    for (const repo of repos) {
        for (const tag of repo.children ?? []) {
            const all = ticked(repo.id) || (!unticked(repo.id) && ticked(tag.id));
            const none = unticked(repo.id) || (!ticked(repo.id) && unticked(tag.id));
            for (const digest of tag.children ?? []) {
                if (all || (!none && next.has(digest.id))) result.add(digest.id);
            }
        }
    }
    return result;
}

/** What each header action would reach. An empty list disables its button. */
export interface SelectionPlan {
    /** The digest rows the selection stands for -- what the title counts. */
    rows: number;
    /** One check per tag and digest; the rows a digest has on several platforms share it. */
    check: { imageRef: string; repoDigests: string[] }[];
    /** One pull per reference: the hosts of the picked rows that have an update. */
    pull: PullTarget[];
    /** Whether a container runs one of the images the pull is for, and is recreated by it. */
    recreate: boolean;
    /** The picked images no container uses, as the prune removes them. */
    prune: PruneRef[];
}

/**
 * Turns a selection into what its actions send, by the rules of a single row: a check asks
 * about the tagged images a container runs, a pull is for the rows a check found an update
 * for. A prune removes a tag by its name only where every digest row shown under it is
 * picked; of a tag picked in part it removes the picked images alone, so nothing outside
 * the selection goes with them.
 */
export function planSelection(repos: RepositoryNode[], keys: ReadonlySet<RowKey>): SelectionPlan {
    const digests = selectedDigests(repos, keys);
    const picked = new Set(digests.map((digest) => digest.id));

    const checks = new Map<string, { imageRef: string; repoDigests: string[] }>();
    for (const digest of digests.flatMap(collectCheckableDigests)) {
        const imageRef = `${digest.repository}:${digest.tag}`;
        const key = `${imageRef}@${digest.digest}`;
        if (!checks.has(key)) checks.set(key, { imageRef, repoDigests: digest.repoDigests });
    }

    const behind = digests.flatMap(collectTaggedDigests).filter((digest) => digest.updateStatus === "update");
    const pulls = new Map<string, Set<string>>();
    for (const digest of behind) {
        const imageRef = `${digest.repository}:${digest.tag}`;
        const clientIds = pulls.get(imageRef) ?? new Set<string>();
        digest.clientIds.forEach((clientId) => clientIds.add(clientId));
        pulls.set(imageRef, clientIds);
    }

    const prune = repos.flatMap((repo) =>
        (repo.children ?? []).flatMap((tag) => {
            const shown = tag.children ?? [];
            const mine = shown.filter((digest) => picked.has(digest.id));
            if (mine.length === 0) return [];
            return mine.length === shown.length ? collectPrunableRefs(tag) : mine.flatMap(collectPrunableRefs);
        }),
    );

    return {
        rows: digests.length,
        check: [...checks.values()],
        pull: [...pulls].map(([imageRef, clientIds]) => ({ imageRef, clientIds: [...clientIds] })),
        recreate: behind.some((digest) => digest.containerIds.length > 0),
        prune: mergeRefs(prune),
    };
}
