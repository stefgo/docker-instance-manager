import { useOutletContext } from "react-router-dom";
import type { Client } from "@dim/shared";

/**
 * The client of the route above, for every route below `/clients/:clientId`.
 * `ClientBoundary` has resolved it by then -- no route down here waits or checks again.
 */
export const useRouteClient = () => useOutletContext<Client>();
