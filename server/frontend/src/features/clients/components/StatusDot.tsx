import { cn } from "@stefgo/react-ui-components";

interface StatusDotProps {
    /** Whether the server currently holds a connection to the client. */
    online: boolean;
    /** `md` for the detail view's header, `sm` everywhere in a list. */
    size?: "sm" | "md";
    className?: string;
}

/**
 * Whether the server currently holds a connection to a client.
 *
 * This stood inline in five places -- both views of the client list, the header of the
 * detail page, and the client labels of the image lists -- and had already drifted: the
 * header draws a larger dot, which is fine, but nothing said so, and the glow and the pulse
 * were five copies of one rule. Five copies of what "online" looks like is how five
 * different answers start.
 *
 * A boolean rather than the client's status field, because two of the call sites have only
 * the boolean: the comparison belongs to the caller, the appearance belongs here.
 *
 * The dot is decorative. Every place that shows it also names the state in text -- an
 * "Online" cell, a "Last seen" column, the client label beside it -- so announcing it again
 * would only repeat what is already there.
 */
export const StatusDot = ({ online, size = "sm", className }: StatusDotProps) => (
    <div
        aria-hidden="true"
        className={cn(
            "rounded-full shrink-0",
            size === "md" ? "w-3 h-3" : "w-2 h-2",
            online ? "bg-success shadow-glow-success animate-pulse-glow" : "bg-border",
            className,
        )}
    />
);
