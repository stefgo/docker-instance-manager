import type { UpdateFilter } from "../../../lib/paths";
import type { ImageTreeNode, RepositoryNode, TagNode } from "./imageTree";
import { matchesUpdateFilter } from "./updateStatus";

function matchesQuery(node: ImageTreeNode, q: string): boolean {
    if (node.nodeType === "repository") return node.repository.toLowerCase().includes(q);
    if (node.nodeType === "tag") return node.tag.toLowerCase().includes(q);
    return node.digest.toLowerCase().includes(q) || node.platform.toLowerCase().includes(q);
}

function filterTag(tag: TagNode, q: string): TagNode | null {
    if (tag.tag.toLowerCase().includes(q)) return tag;
    const filteredDigests = (tag.children ?? []).filter((d) => matchesQuery(d, q));
    if (filteredDigests.length > 0) return { ...tag, children: filteredDigests };
    return null;
}

function filterRepo(repo: RepositoryNode, q: string): RepositoryNode | null {
    if (repo.repository.toLowerCase().includes(q)) return repo;
    const filteredTags = (repo.children ?? [])
        .map((tag) => filterTag(tag, q))
        .filter((t): t is TagNode => t !== null);
    if (filteredTags.length > 0) return { ...repo, children: filteredTags };
    return null;
}

/**
 * The rows of a tree that keep the digest rows `keep` lets through. A row left with none
 * goes; one that keeps every row below it is handed back as it is.
 */
function pruneDigests(images: RepositoryNode[], keep: (node: ImageTreeNode) => boolean): RepositoryNode[] {
    return images.flatMap((repo) => {
        const tags = (repo.children ?? []).flatMap((tag) => {
            const digests = (tag.children ?? []).filter(keep);
            if (digests.length === 0) return [];
            return [digests.length === tag.children?.length ? tag : { ...tag, children: digests }];
        });
        if (tags.length === 0) return [];
        const whole = tags.length === repo.children?.length && tags.every((tag, i) => tag === repo.children?.[i]);
        return [whole ? repo : { ...repo, children: tags }];
    });
}

export interface ImageFilter {
    query?: string;
    update?: UpdateFilter;
}

/**
 * The image tree as the list shows it for a search and the update filter.
 *
 * The search: a row that matches keeps everything below it, a row that does not keeps only
 * the matching rows below it. The update filter then takes away the digest rows whose status
 * it does not let through, as the container list's takes away host rows. A repository or a
 * tag that keeps only some of its rows still shows its status as a whole -- the one of every
 * image below it, not only of the rows left.
 */
export function filterImages(images: RepositoryNode[], { query = "", update = "all" }: ImageFilter): RepositoryNode[] {
    const q = query.trim().toLowerCase();
    const searched = q
        ? images.map((repo) => filterRepo(repo, q)).filter((r): r is RepositoryNode => r !== null)
        : images;
    if (update === "all") return searched;
    return pruneDigests(searched, (node) => matchesUpdateFilter(node.updateStatus, update));
}
