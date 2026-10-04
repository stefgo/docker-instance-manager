/**
 * What the button that checks everything a list shows says. "Check" alone did not say what
 * is checked; the whole phrase does not fit a phone's header next to a second button. So the
 * rest is there for everyone and drawn from `sm` up -- a screen reader hears it at any width.
 */
export const CheckLabel = () => (
    // One element: a button lays its children out in a row, and a row of two would swallow
    // the space between them.
    <span>
        Check<span className="sr-only sm:not-sr-only"> for updates</span>
    </span>
);
