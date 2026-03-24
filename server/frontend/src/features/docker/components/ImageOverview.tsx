import { DockerActionType } from "@dim/shared";
import { Card } from "@stefgo/react-ui-components";
import { useAuth } from "../../auth/AuthContext";
import { useAggregatedImages } from "../../../hooks/useAggregatedImages";
import { ContainerList } from "./ContainerList";
import { formatBytes } from "../imageTypes";

interface ImageOverviewProps {
  imageId: string | undefined;
}

export const ImageOverview = ({ imageId }: ImageOverviewProps) => {
  const { token } = useAuth();
  const images = useAggregatedImages();

  const image = images.find((img) => img.id.replace("sha256:", "") === imageId);

  if (!image) {
    return (
      <p className="text-text-muted dark:text-text-muted-dark text-sm py-8 text-center">
        {images.length === 0 ? "Lade Images…" : "Image nicht gefunden."}
      </p>
    );
  }

  const allContainers = image.clientUsages.flatMap((u) => u.containers);

  const containerClientMap = new Map<string, string>();
  image.clientUsages.forEach((u) => {
    u.containers.forEach((c) => containerClientMap.set(c.id, u.clientId));
  });

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

  const shortId = image.id.replace("sha256:", "").slice(0, 12);

  return (
    <div className="space-y-6">
      <Card
        title={
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-bold">{image.name}</h2>
            <div className="text-sm font-mono text-text-muted dark:text-text-muted-dark">{shortId}</div>
          </div>
        }
        action={
          <div className="text-right mr-2">
            <div className="text-xs text-text-muted dark:text-text-muted-dark uppercase tracking-wider font-bold mb-1">
              Size
            </div>
            <div className="text-sm text-text-primary dark:text-text-primary-dark font-mono">
              {formatBytes(image.size)}
            </div>
          </div>
        }
      />
      <ContainerList containers={allContainers} onAction={handleContainerAction} />
    </div>
  );
};
