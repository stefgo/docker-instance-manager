import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import { NotificationLevel, NotificationStep } from "@dim/shared";
import { format } from "date-fns";

const stepIcon: Record<NotificationLevel, React.ReactNode> = {
    error: <AlertCircle size={12} className="text-error shrink-0" />,
    warning: <AlertTriangle size={12} className="text-warning shrink-0" />,
    info: <Info size={12} className="text-info shrink-0" />,
};

/**
 * The single steps of one operation -- a "Pull & Recreate" pulls the image and then
 * removes and recreates every container behind it. They belong to one notification, so
 * they are shown as its timeline instead of four entries in the list.
 */
export function NotificationSteps({ steps }: { steps: NotificationStep[] }) {
    return (
        <ul className="mt-1 space-y-0.5">
            {steps.map((step, i) => (
                <li key={`${step.at}-${i}`} className="flex items-center gap-2 text-xs text-text-muted">
                    <span className="font-mono tabular-nums shrink-0">
                        {format(new Date(step.at), "HH:mm:ss")}
                    </span>
                    {stepIcon[step.level]}
                    <span className="break-words">{step.message}</span>
                </li>
            ))}
        </ul>
    );
}
