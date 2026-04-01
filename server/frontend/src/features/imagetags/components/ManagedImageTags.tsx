import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useDockerStore } from "../../../stores/useDockerStore";
import { useImagesData, ImageTreeNode } from "../hooks/useImageTagsData";
import { ImageList } from "./ImageTagList";

export const ManagedImages = () => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { checkImageUpdate, updateImage: pullImage, removeImage, checkingImages, imagePullStatus } = useDockerStore();
  const images = useImagesData();

  const handleCheckUpdate = async (node: ImageTreeNode) => {
    if (!token || node.tag === "<none>" || node.repoDigests.length === 0) return;
    await checkImageUpdate(`${node.repository}:${node.tag}`, node.repoDigests, token);
  };

  const handlePullAndRecreate = (imageRef: string, clientIds: string[]) => {
    if (!token) return;
    pullImage(imageRef, clientIds, token);
  };

  const handleRemoveImage = (imageRef: string, clientIds: string[]) => {
    if (!token) return;
    removeImage(imageRef, clientIds, token);
  };

  const handleRowClick = (node: ImageTreeNode) => {
    navigate(`/imagetag/${encodeURIComponent(node.id)}`);
  };

  const handlePrune = async () => {
    if (!token) return;
    const clientIds = [...new Set(images.flatMap((n) => n.clientIds))];
    await Promise.all(
      clientIds.map((clientId) =>
        fetch(`/api/v1/clients/${clientId}/docker/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: "image:prune" }),
        }),
      ),
    );
  };

  return (
    <ImageList
      images={images}
      onCheckUpdate={handleCheckUpdate}
      onPullAndRecreate={handlePullAndRecreate}
      onRemoveImage={handleRemoveImage}
      onPrune={handlePrune}
      onRowClick={handleRowClick}
      checkingImages={checkingImages}
      imagePullStatus={imagePullStatus}
    />
  );
};
