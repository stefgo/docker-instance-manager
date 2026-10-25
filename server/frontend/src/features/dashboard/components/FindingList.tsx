import { Link } from "react-router-dom";
import { AlertCircle, AlertTriangle } from "lucide-react";
import { FOCUS_RING, cn } from "@stefgo/react-ui-components";
import { useNow } from "../../../hooks/useNow";
import { formatDate } from "../../../utils";
import { findingAge, type Finding } from "../lib/findings";

/**
 * What needs a look, one finding per line, errors in red. A finding leads to the page where
 * something can be done about it, and says below how long it has lasted where that is known.
 */
export const FindingList = ({ findings }: { findings: readonly Finding[] }) => {
    const now = useNow();
    return (
        <ul className="divide-y divide-border">
            {findings.map((finding) => {
                const isError = finding.severity === "error";
                const Icon = isError ? AlertCircle : AlertTriangle;
                const age = findingAge(finding, now);
                const note = finding.until ? `Until ${formatDate(finding.until)}` : age;
                return (
                    <li key={finding.id} className="flex items-start gap-3 px-4 py-3">
                        <Icon
                            size={16}
                            className={cn("mt-0.5 shrink-0", isError ? "text-error" : "text-warning")}
                            aria-label={finding.severity}
                        />
                        <div className="min-w-0">
                            {finding.to ? (
                                <Link
                                    to={finding.to}
                                    className={cn("rounded-sm text-sm text-text-primary hover:text-primary break-words", FOCUS_RING)}
                                >
                                    {finding.text}
                                </Link>
                            ) : (
                                <span className="text-sm text-text-primary break-words">{finding.text}</span>
                            )}
                            {note && (
                                <p
                                    className="mt-0.5 text-xs text-text-muted"
                                    title={finding.since ? `Since ${formatDate(finding.since)}` : undefined}
                                >
                                    {note}
                                </p>
                            )}
                        </div>
                    </li>
                );
            })}
        </ul>
    );
};
