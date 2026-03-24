import { useNavigate } from "react-router-dom";
import { BaseImageList, AggregatedImage } from "./BaseImageList";

export const ImageList = () => {
  const navigate = useNavigate();

  const handleRowClick = (img: AggregatedImage) => {
    navigate(`/image/${img.id.replace("sha256:", "")}`);
  };

  return <BaseImageList showClientsColumn={true} onRowClick={handleRowClick} />;
};
