import { useState, type ReactNode } from "react";

interface TabPanelProps {
    active: boolean;
    children: ReactNode;
}

/**
 * One tab's content: mounted the first time it is opened, and kept mounted -- hidden --
 * from then on.
 *
 * The display state of a list (sort order, expanded rows, page, scroll position) lives
 * inside the view itself. Rendering a tab as `active && <View/>` unmounts the view on every
 * switch and throws that state away, which is why a list came back sorted by its default
 * with everything collapsed. Keeping the view mounted gives that state exactly the lifetime
 * it should have -- as long as the page is open -- without a single view having to hand its
 * internals to this component.
 *
 * Mounting is lazy, so a tab that is never opened costs nothing; the price of the whole
 * approach is only paid for what was actually looked at.
 */
export const TabPanel = ({ active, children }: TabPanelProps) => {
    const [everActive, setEverActive] = useState(active);
    // Derived from a prop, so it is reseeded while rendering rather than in an effect.
    if (active && !everActive) setEverActive(true);
    if (!everActive) return null;

    // The `hidden` attribute rather than a CSS class: it takes the subtree out of the
    // accessibility tree as well. The wrapper stays classless on purpose -- any Tailwind
    // display utility here would win over the attribute and show the hidden tab.
    return <div hidden={!active}>{children}</div>;
};
