/**
 * What a button in a list's header reaches. A list's buttons have one place, the header, and
 * a button there that acts on rows acts on the picked rows once something is picked. Without a
 * pick it acts on the rows the list shows: all of them while nothing narrows the list, the hits
 * alone while a search or a filter does. Its label says which, so that a filter left on or a
 * pick left over does not turn "everything" into a surprise.
 */
export type ListScope = "all" | "shown" | "selected";

export const listScope = (narrowed: boolean, picked = false): ListScope =>
    picked ? "selected" : narrowed ? "shown" : "all";
