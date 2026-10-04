import { useMemo } from "react";
import { useLocation, useMatches, type To } from "react-router-dom";
import { parentPath } from "../lib/backPath";

/**
 * Where closing this page leads: its parent in the route tree. Read from the URL alone, so
 * a reloaded or shared link closes onto the same place as one opened by a click.
 *
 * The query string is kept by default. An editor has none of its own -- the surface that
 * opens it passes its own along, which is how the open tab and a list"s search are still
 * there on return. A page whose query *is* its own (the client page with its `tab`) leaves
 * with `keepSearch: false`, since those parameters mean nothing one level up.
 */
export function useBackPath({ keepSearch = true }: { keepSearch?: boolean } = {}): To {
    const matches = useMatches();
    const { search } = useLocation();
    const pathname = parentPath(matches.map((m) => m.pathname));

    return useMemo(() => ({ pathname, search: keepSearch ? search : "" }), [pathname, search, keepSearch]);
}
