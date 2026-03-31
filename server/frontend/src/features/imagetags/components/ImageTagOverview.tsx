import { useMemo, useState } from "react";
import { DockerActionType, DockerImageUpdateCheck } from "@dim/shared";
import { Box, Layers } from "lucide-react";
import { Card, StatCard } from "@stefgo/react-ui-components";
import { useAuth } from "../../auth/AuthContext";
import { useImagesData, RepositoryNode } from "../hooks/useImageTagsData";
import { useDockerStore } from "../../../stores/useDockerStore";
import { useClientStore } from "../../../stores/useClientStore";
import { ContainerList } from "../../docker/components/ContainerList";
import { ImageList } from "../../docker/components/ImageList";

type Tab = "containers" | "images";

interface ImageOverviewProps {
  imageTagId: string | undefined;
}

export const ImageOverview = ({ imageTagId }: ImageOverviewProps) => {
  const { token } = useAuth();
  const { dockerStates, checkImageUpdate, checkingImages, pullImage, imagePullStatus } = useDockerStore();
  const { clients } = useClientStore();
  const images = useImagesData();

  const [activeTab, setActiveTab] = useState<Tab>("images");

  const decodedId = imageTagId ? decodeURIComponent(imageTagId) : undefined;

  // ImageNode ids are "repo:tag@digest" — normalize to "repo:tag" for lookup
  const repositoryKey = decodedId?.includes("@") ? decodedId.split("@")[0] : decodedId;
  const node = images.find((n) => n.nodeType === "repository" && n.id === repositoryKey) as RepositoryNode | undefined;

  const { containers, containerClientMap, containerUpdateChecks, dockerImages, imageClientMap } = useMemo(() => {
    if (!node) return {
      containers: [],
      containerClientMap: new Map<string, string>(),
      containerUpdateChecks: new Map<string, DockerImageUpdateCheck>(),
      dockerImages: [],
      imageClientMap: new Map<string, string>(),
    };

    const allContainers = [];
    const containerMap = new Map<string, string>();
    const updateChecks = new Map<string, DockerImageUpdateCheck>();
    const allDockerImages = [];
    const imgMap = new Map<string, string>();

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
        if (!imgMap.has(img.id)) {
          imgMap.set(img.id, clientId);
          allDockerImages.push(img);
        }
        const imgContainers = state.containers.filter(
          (c) => c.imageId === img.id || img.repoTags.includes(c.image),
        );
        for (const c of imgContainers) {
          containerMap.set(c.id, clientId);
          allContainers.push(c);
          if (img.updateCheck) {
            updateChecks.set(c.id, img.updateCheck);
          }
        }
      }
    }

    return { containers: allContainers, containerClientMap: containerMap, containerUpdateChecks: updateChecks, dockerImages: allDockerImages, imageClientMap: imgMap };
  }, [node, dockerStates]);

  const containerClientLabels = useMemo(() => {
    const map = new Map<string, { name: string; online: boolean }>();
    for (const [containerId, clientId] of containerClientMap) {
      const client = clients.find((c) => c.id === clientId);
      map.set(containerId, {
        name: client?.displayName ?? client?.hostname ?? clientId,
        online: client?.status === "online",
      });
    }
    return map;
  }, [containerClientMap, clients]);

  const imageClientLabels = useMemo(() => {
    const map = new Map<string, { name: string; online: boolean }>();
    for (const [imageId, clientId] of imageClientMap) {
      const client = clients.find((c) => c.id === clientId);
      map.set(imageId, {
        name: client?.displayName ?? client?.hostname ?? clientId,
        online: client?.status === "online",
      });
    }
    return map;
  }, [imageClientMap, clients]);

  if (!node) {
    return (
      <p className="text-text-muted dark:text-text-muted-dark text-sm py-8 text-center">
        {images.length === 0 ? "Lade Images…" : "Image nicht gefunden."}
      </p>
    );
  }

  const sendAction = async (clientId: string, action: DockerActionType, target: string) => {
    if (!token) return;
    await fetch(`/api/v1/clients/${clientId}/docker/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, target }),
    });
  };

  const handleContainerAction = (action: DockerActionType, target: string) => {
    const clientId = containerClientMap.get(target);
    if (clientId) sendAction(clientId, action, target);
  };

  const handleImageAction = (action: DockerActionType, target: string) => {
    const clientId = imageClientMap.get(target);
    if (clientId) sendAction(clientId, action, target);
  };

  return (
    <div className="space-y-6">
      <Card
        title={
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-bold">
              {node.repository}:{node.tag}
            </h2>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4">
        <div className={activeTab === "images" ? "ring-2 ring-primary rounded-xl h-full" : "h-full"}>
          <StatCard
            label="Images"
            value={String(node.imageCount)}
            icon={<Layers size={20} />}
            onClick={() => setActiveTab("images")}
          />
        </div>
        <div className={activeTab === "containers" ? "ring-2 ring-primary rounded-xl h-full" : "h-full"}>
          <StatCard
            label="Container"
            value={String(node.containerCount)}
            icon={<Box size={20} />}
            onClick={() => setActiveTab("containers")}
          />
        </div>
      </div>

      {activeTab === "images" && (
        <ImageList images={dockerImages} onAction={handleImageAction} clientLabels={imageClientLabels} />
      )}

      {activeTab === "containers" && (
        <ContainerList
          containers={containers}
          onAction={handleContainerAction}
          clientLabels={containerClientLabels}
          updateChecks={containerUpdateChecks}
          isCheckingUpdate={!!checkingImages[node.id]}
          onCheckUpdate={() => token && checkImageUpdate(node.id, node.repoDigests, token)}
          isPulling={!!imagePullStatus[node.id]}
          onPullAndRecreate={() => token && pullImage(node.id, node.clientIds, token)}
        />
      )}
    </div>
  );
};
