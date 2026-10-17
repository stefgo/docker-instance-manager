/**
 * What a button in a list's header reaches. The header holds what does not depend on the
 * selection, and a button there that acts on rows acts on the rows the list shows: all of
 * them while nothing narrows the list, the hits alone while a search or a filter does. Its
 * label says which, so that a filter left on does not turn "everything" into a surprise.
 * What is picked has buttons of its own, in the selection bar.
 */
export type ListScope = "all" | "shown";

export const listScope = (narrowed: boolean): ListScope => (narrowed ? "shown" : "all");
