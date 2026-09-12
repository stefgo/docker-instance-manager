import { LoaderCircle } from "lucide-react";
import { cn } from "@stefgo/react-ui-components";

interface LoadingIndicatorProps {
    /** What is being waited for. Shown next to the spinner and announced with it. */
    label?: string;
    className?: string;
}

/**
 * "Something is on its way", wherever a view has nothing to show yet.
 *
 * The places that needed it had each solved it differently: a bare line of muted text for a
 * lazy route, a sentence in a paragraph while the image list filled up, a third wording
 * while a client's first Docker snapshot arrived. None of them looked like waiting, and no
 * two looked alike.
 *
 * `role="status"` so the text is announced when it appears; the spinner itself is
 * decorative and stays out of the accessibility tree.
 */
export const LoadingIndicator = ({
    label = "Loading…",
    className,
}: LoadingIndicatorProps) => (
    <div
        role="status"
        className={cn(
            "flex items-center justify-center gap-2 py-8 text-sm text-text-muted",
            className,
        )}
    >
        <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
        {label}
    </div>
);
