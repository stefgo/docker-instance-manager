import { DockerImageUpdateCheck } from "@dim/shared";

export interface RepositoryNode {
  id: string; // "repository:tag"
  nodeType: "repository";
  repository: string;
  tag: string;
  imageCount: number;
  containerCount: number;
  clientIds: string[];
  repoDigests: string[];
  updateCheck?: DockerImageUpdateCheck;
  children?: ImageNode[];
}

export interface ImageNode {
  id: string; // "repository:tag@digest"
  nodeType: "image";
  repository: string;
  tag: string;
  digest: string;
  containerCount: number;
  clientIds: string[];
  repoDigests: string[];
  updateCheck?: DockerImageUpdateCheck;
}

export type ImageTreeNode = RepositoryNode | ImageNode;
