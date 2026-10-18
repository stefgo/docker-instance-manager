/**
 * The event an agent reports once a run of its auto-update is over -- one that changed
 * something, or one somebody asked for. When a host last ran at all is not read from these:
 * a scheduled run with nothing to do reports none, so the client carries that time itself
 * (`autoUpdateLastRun`).
 */
export const AUTO_UPDATE_RUN_KIND = "autoupdate.run";

/**
 * The event an agent reports instead, for a run that was asked for while it was replacing its
 * own container. It answers whoever asked, but is no run.
 */
export const AUTO_UPDATE_REFUSED_KIND = "autoupdate.refused";
