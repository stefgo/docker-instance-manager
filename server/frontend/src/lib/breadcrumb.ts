import { ownName, type TitleHandle, type TitleSubject } from "./pageTitle";

/** The part of a route's `handle` the breadcrumb is read from: what the title reads, and one more. */
export interface CrumbHandle extends TitleHandle {
    /**
     * The route shows its subject on one host -- one instance of a container, one host's
     * copy of an image. Its trail names the subject across all hosts first and the host
     * last: `Containers › authelia › auth.internal`.
     */
    onHost?: boolean;
}

/** One link of the trail. The last has no `to`: it is the page that is open. */
export interface Crumb {
    label: string;
    to?: string;
}

/** What `useMatches()` yields, as far as the trail needs it. */
export interface CrumbMatch {
    pathname: string;
    handle?: CrumbHandle;
}

export interface CrumbResolver {
    /** The name of a subject, from what is cached -- the same answer the document title gets. */
    nameOf: (subject: TitleSubject) => string | undefined;
    /**
     * The page of a subject across all hosts, for a route that shows one host of it. The
     * route tree does not know it: an instance sits below its area, beside that page.
     */
    pathOf: (subject: TitleSubject) => string | undefined;
}

/**
 * The trail to the open route, read off the handles of its matches like the document
 * title, outermost first: the area, then what lies below it. Each link leads to the route
 * that named it; the last one is the open page and leads nowhere.
 *
 * Empty for a page with nothing above it -- a list, the overview -- so only a route below
 * a list shows a trail.
 */
export function breadcrumb(matches: readonly CrumbMatch[], { nameOf, pathOf }: CrumbResolver): Crumb[] {
    const crumbs = matches.flatMap(({ pathname, handle }): Crumb[] => {
        if (!handle) return [];
        const area = handle.nav ? [{ label: handle.nav.label, to: pathname }] : [];
        const own = ownName(handle, nameOf);
        if (!own) return area;
        if (!handle.onHost) return [...area, { label: own, to: pathname }];

        // Until the host has a name the subject stands for the page, as it does in the title.
        const host = nameOf("client");
        const subject = { label: own, to: handle.subject && pathOf(handle.subject) };
        return host ? [...area, subject, { label: host, to: pathname }] : [...area, subject];
    });

    if (crumbs.length < 2) return [];
    return crumbs.map((crumb, i) => (i === crumbs.length - 1 ? { label: crumb.label } : crumb));
}

/**
 * The one link a narrow screen keeps: the nearest one above the open page that leads
 * somewhere. A subject whose page is not known yet is no way back, so it is looked past.
 */
export function parentCrumb(crumbs: readonly Crumb[]): (Crumb & { to: string }) | undefined {
    for (let i = crumbs.length - 2; i >= 0; i--) {
        const { label, to } = crumbs[i];
        if (to) return { label, to };
    }
    return undefined;
}
