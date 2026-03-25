export interface ImageGroup {
  id: string; // "repository:tag" als eindeutiger Key
  repository: string;
  tag: string;
  imageCount: number;
  clientCount: number;
  containerCount: number;
}
