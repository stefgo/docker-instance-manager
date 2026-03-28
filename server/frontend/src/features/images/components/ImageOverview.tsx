import { useMemo } from "react";
import { DockerActionType } from "@dim/shared";
import { Card } from "@stefgo/react-ui-components";
import { useAuth } from "../../auth/AuthContext";
import { useImagesData, RepositoryNode } from "../hooks/useImagesData";
import { useDockerStore } from "../../../stores/useDockerStore";
import { ContainerList } from "../../docker/components/ContainerList";

interface ImageOverviewProps {
  imageId: string | undefined;
}

export const ImageOverview = ({ imageId }: ImageOverviewProps) => {
  const { token } = useAuth();
  const { dockerStates } = useDockerStore();
  const images = useImagesData();

  const decodedId = imageId ? decodeURIComponent(imageId) : undefined;

  // ImageNode ids are "repo:tag@digest" — normalize to "repo:tag" for lookup
  const repositoryKey = decodedId?.includes("@") ? decodedId.split("@")[0] : decodedId;
  const node = images.find((n) => n.nodeType === "repository" && n.id === repositoryKey) as RepositoryNode | undefined;

  const { containers, containerClientMap } = useMemo(() => {
    if (!node) return { containers: [], containerClientMap: new Map<string, string>() };

    const allContainers = [];
    const clientMap = new Map<string, string>();

    for (const clientId of node.clientIds) {
      const state = dockerStates[clientId];
      if (!state) continue;

      const childDigests = new Set((node.children ?? []).map((c) => c.digest));
      const matchingImages = state.images.filter((img) => {
        if (img.repoTags.includes(node.id)) return true;
        if (node.tag === "<none>") {
          if (img.repoDigests.some((d) => d.startsWith(node.repository + "@"))) return true;
          return childDigests.has(img.id.split(":")[1] ?? img.id);
        }
        return false;
      });

      for (const img of matchingImages) {
        const imgContainers = state.containers.filter(
          (c) => c.imageId === img.id || img.repoTags.includes(c.image),
        );
        for (const c of imgContainers) {
          clientMap.set(c.id, clientId);
          allContainers.push(c);
        }
      }
    }

    return { containers: allContainers, containerClientMap: clientMap };
  }, [node, dockerStates]);

  if (!node) {
    return (
      <p className="text-text-muted dark:text-text-muted-dark text-sm py-8 text-center">
        {images.length === 0 ? "Lade Images…" : "Image nicht gefunden."}
      </p>
    );
  }

  const handleContainerAction = async (action: DockerActionType, target: string) => {
    if (!token) return;
    const clientId = containerClientMap.get(target);
    if (!clientId) return;
    await fetch(`/api/v1/clients/${clientId}/docker/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, target }),
    });
  };

  return (
    <div className="space-y-6">
      <Card
        title={
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-bold">
              {node.repository}:{node.tag}
            </h2>
            <div className="text-sm font-mono text-text-muted dark:text-text-muted-dark">
              {node.imageCount} Image(s) · {node.clientIds.length} Client(s) · {node.containerCount} Container
            </div>
          </div>
        }
      />
      <ContainerList containers={containers} onAction={handleContainerAction} />
    </div>
  );
};
