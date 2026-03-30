import { RefreshCw, CheckCircle2, AlertCircle, HelpCircle } from "lucide-react";
import { DockerImageUpdateCheck } from "@dim/shared";

interface UpdateStatusCellProps {
  imageRef: string;
  updateCheck?: DockerImageUpdateCheck;
  isAnimating?: boolean;
}

export function UpdateStatusCell({ imageRef, updateCheck, isAnimating }: UpdateStatusCellProps) {
  if (!imageRef || imageRef === "<none>") {
    return <span className="text-xs text-text-muted dark:text-text-muted-dark">–</span>;
  }

  if (isAnimating) {
    return <RefreshCw size={18} className="animate-spin text-text-muted dark:text-text-muted-dark" />;
  }

  if (!updateCheck || updateCheck.error) {
    return (
      <span title={updateCheck?.error} className="text-text-muted dark:text-text-muted-dark">
        <HelpCircle size={18} />
      </span>
    );
  }

  if (updateCheck.hasUpdate) {
    return (
      <span title={`Update available\n${updateCheck.remoteDigest?.slice(0, 19)}`} className="text-amber-500 dark:text-amber-400">
        <AlertCircle size={18} />
      </span>
    );
  }

  return (
    <span title={`Current (checked: ${new Date(updateCheck.checkedAt).toLocaleString()})`} className="text-green-600 dark:text-green-400">
      <CheckCircle2 size={18} />
    </span>
  );
}
