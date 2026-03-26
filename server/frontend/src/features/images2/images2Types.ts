import { DockerImageUpdateCheck } from "@dim/shared";

export interface ImageTreeNode {
  id: string; // "repository:tag" for repositories, "repository:tag@digest12" for images
  nodeType: "repository" | "image";
  repository: string;
  tag: string;
  imageCount: number; // Number of distinct images (repository) or always 1 (image)
  containerCount: number;
  clientIds: string[]; // IDs of clients that have this image
  repoDigests: string[]; // Full repoDigest strings (e.g. "nginx@sha256:...") for checkImageUpdate
  updateCheck?: DockerImageUpdateCheck; // Image nodes: direct check; repository nodes: aggregated from children
  digest?: string; // Digest only present when nodeType="image"
  children?: ImageTreeNode[];
}
