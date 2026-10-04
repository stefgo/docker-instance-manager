import type { ComponentProps } from "react";
import type { EntityHeader } from "@stefgo/react-ui-components";

/**
 * The header of a detail page, whose title is the breadcrumb (`HeaderBreadcrumb`).
 *
 * - A trail is longer than the name it replaces, so it has the size of a card's title, not
 *   a page's.
 * - On a narrow screen the badges take a line of their own, below the title and the
 *   actions. The library keeps title and badges in one box beside the actions, which left
 *   the badges a column the width of the truncated title; `contents` dissolves that box so
 *   the badges can wrap below the whole row. It names the box by its `flex-1`, which is the
 *   library's markup and not its API -- this belongs in `EntityHeader` itself.
 */
export const ENTITY_HEADER: NonNullable<ComponentProps<typeof EntityHeader>["classNames"]> = {
    header: "max-sm:flex-wrap max-sm:gap-y-2 max-sm:[&>div.flex-1]:contents",
    title: "text-base font-semibold max-sm:flex-1",
    meta: "max-sm:order-1 max-sm:basis-full",
};

/**
 * The same, for a header with more than one action -- a row of buttons rather than the one
 * that opens a menu. On a narrow screen they take the last line, at its right-hand end:
 * beside the title they left it a few letters. Which header has more than one is said by
 * the page -- its actions arrive as one node, so there is nothing here to count.
 */
export const ENTITY_HEADER_ACTION_ROW: typeof ENTITY_HEADER = {
    ...ENTITY_HEADER,
    actions: "max-sm:order-2 max-sm:basis-full max-sm:justify-end",
};
