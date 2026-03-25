export interface ImageTreeNode {
  id: string; // "repository:tag" for repositories, "repository:tag@digest12" for images
  nodeType: "repository" | "image";
  repository: string;
  tag: string;
  digest?: string; // Short digest (12 chars), only present when nodeType="image"
  imageCount: number; // Number of distinct images (repository) or always 1 (image)
  clientCount: number;
  containerCount: number;
  children?: ImageTreeNode[];
}
