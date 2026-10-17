import type { ListScope } from "../../../lib/listScope";

/**
 * What a list's check button says. "Check" alone did not say what is checked; the whole
 * phrase does not fit a phone's header next to a second button. So the rest is there for
 * everyone and drawn from `sm` up -- a screen reader hears it at any width.
 *
 * In a header, `scope` says what the button reaches (`listScope`). In the selection bar it
 * is left out: the bar already says that it acts on what is picked.
 */
export const CheckLabel = ({ scope }: { scope?: ListScope }) => (
    // One element: a button lays its children out in a row, and a row of two would swallow
    // the space between them.
    <span>
        Check{scope && ` ${scope}`}<span className="sr-only sm:not-sr-only"> for updates</span>
    </span>
);
