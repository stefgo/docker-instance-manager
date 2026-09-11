import { CircleHelp, CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { UpdateStatus } from "../hooks/useImagesData";

export function UpdateIcon({ status, isChecking, isUpdating }: { status: UpdateStatus; isChecking?: boolean; isUpdating?: boolean }) {
    if (isUpdating) return <LoaderCircle size={16} className="text-success animate-spin" />;
    if (isChecking) return <LoaderCircle size={16} className="text-primary animate-spin" />;
    switch (status) {
        case "update":    return <CircleAlert size={16} className="text-warning" />;
        case "unchecked": return <CircleHelp size={16} className="text-text-muted" />;
        case "current":   return <CircleCheck size={16} className="text-success" />;
        case "none":      return <span className="text-text-muted">–</span>;
    }
}
