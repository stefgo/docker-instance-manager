import { CircleHelp, CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { UpdateStatus } from "../hooks/useImagesData";

export function UpdateIcon({ status, isChecking, isUpdating }: { status: UpdateStatus; isChecking?: boolean; isUpdating?: boolean }) {
  if (isUpdating) return <LoaderCircle size={16} className="text-green-500 animate-spin" />;
  if (isChecking) return <LoaderCircle size={16} className="text-primary animate-spin" />;
  switch (status) {
    case "update":    return <CircleAlert size={16} className="text-yellow-500" />;
    case "unchecked": return <CircleHelp size={16} className="text-text-muted dark:text-text-muted-dark" />;
    case "current":   return <CircleCheck size={16} className="text-green-500" />;
    case "none":      return <span className="text-text-muted dark:text-text-muted-dark">–</span>;
  }
}
