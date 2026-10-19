import { plural } from "../../../utils";

/**
 * The count behind the title of a project's tab while rows are picked. Every tab acts on the
 * picked containers, but each groups them differently -- by host, by image, by container --
 * so the count names both what is acted on and on how many hosts, whatever the tab's title says.
 */
export const pickLabel = (rows: readonly { clientId: string }[]): string =>
    `${plural(rows.length, "container")} on ${plural(new Set(rows.map((row) => row.clientId)).size, "client")} selected`;
