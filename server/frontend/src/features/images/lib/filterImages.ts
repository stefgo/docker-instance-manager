import type { ImageTreeNode, RepositoryNode, TagNode } from "../hooks/useImagesData";

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
 * The image tree as the list shows it for a search: a row that matches keeps everything
 * below it, a row that does not keeps only the matching rows below it.
 */
export function filterImages(images: RepositoryNode[], query: string): RepositoryNode[] {
    if (!query) return images;
    const q = query.toLowerCase();
    return images
        .map((repo) => filterRepo(repo, q))
        .filter((r): r is RepositoryNode => r !== null);
}
