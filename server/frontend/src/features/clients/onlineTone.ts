import type { StatusDotTone } from "@stefgo/react-ui-components";

/**
 * The dot of something that is either live or not: a connected client. The comparison belongs
 * to the caller -- two of the call sites have only the boolean -- the appearance belongs here,
 * so "offline" looks the same in every list.
 *
 * The dot stays decorative, without a label: every place that shows it also names the state
 * in text beside it.
 */
export const onlineTone = (online: boolean): StatusDotTone => (online ? "success" : "neutral");
