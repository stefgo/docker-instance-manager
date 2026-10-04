import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, CircleArrowUp, Monitor, Power, TriangleAlert } from "lucide-react";
import { LoadingIndicator, StatCard } from "@stefgo/react-ui-components";
import { QueryError } from "../../../components/QueryError";
import { ROUTES, containersFiltered } from "../../../lib/paths";
import { activityListOptions } from "../../../queries/activity";
import { useClients } from "../../../queries/clients";
import { schedulerStatusOptions } from "../../../queries/scheduler";
import { EMPTY_VALUE, formatDate } from "../../../utils";
import { unseenProblems } from "../../activity/lib/unseenTone";
import { useContainersData } from "../../containers/hooks/useContainersData";
import {
    type AttentionGroup,
    SCHEDULER_LABELS,
    clientCount,
    formatOnlineCount,
    needsAttention,
    nextSchedulerRun,
    notRunning,
    notRunningReading,
    problemSummary,
    updatesAvailable,
    updatesReading,
} from "../lib/dashboard";

const QUIET = "text-text-muted";

/** One group of "Needs attention": its first rows, and the way to the list with all of them. */
const AttentionList = ({ group }: { group: AttentionGroup }) => (
    <div className="min-w-0 rounded-md border border-border bg-card">
        <div className="border-b border-border px-4 py-2 text-sm font-medium text-text-primary">{group.title}</div>
        <ul>
            {group.items.map((item) => (
                <li key={item.key}>
                    <Link
                        to={item.to}
                        className="flex items-baseline justify-between gap-3 px-4 py-2 text-sm hover:bg-hover"
                    >
                        <span className="min-w-0 truncate text-text-primary">{item.label}</span>
                        <span className="shrink-0 text-xs text-text-muted">
                            {item.detail ??
                                (item.at ? `${group.id === "clients" ? "last seen " : ""}${formatDate(item.at)}` : null)}
                        </span>
                    </Link>
                </li>
            ))}
        </ul>
        {group.more > 0 && (
            <Link to={group.to} className="block border-t border-border px-4 py-2 text-xs text-text-muted hover:text-text-primary">
                {group.more} more
            </Link>
        )}
    </div>
);

/**
 * The start page: what needs a look, across every host.
 *
 * Each card is a count and the way to the list behind it. The counts are the functions of
 * `lib/dashboard.ts`, which the sidebar's badges read as well, on data the socket keeps
 * current -- so a card changes when a host does, without anything being asked for again.
 *
 * The two container cards open the container list with the filter that leaves exactly what
 * they counted. Below the cards, "Needs attention" names the first few of what three of them
 * count (`needsAttention`), each row the way to its page; the rest is on the page a card
 * leads to. With nothing to name, the section is not there.
 */
export const DashboardOverview = () => {
    const navigate = useNavigate();
    const { clients, isPending, error } = useClients();
    const groups = useContainersData();
    const events = useQuery(activityListOptions).data;
    const schedulers = useQuery(schedulerStatusOptions).data;

    const containers = useMemo(
        () => ({ updates: updatesAvailable(groups), stopped: notRunning(groups), updatesCard: updatesReading(groups) }),
        [groups],
    );
    const attention = useMemo(
        () => needsAttention({ clients, groups, events: events ?? [] }),
        [clients, groups, events],
    );
    // Until the list has arrived, a zero would read as "nothing wrong".
    const problems = useMemo(() => (events ? unseenProblems(events) : undefined), [events]);
    const next = useMemo(() => (schedulers ? nextSchedulerRun(schedulers) : undefined), [schedulers]);

    if (isPending) return <LoadingIndicator label="Loading overview…" />;

    const count = clientCount(clients);
    const offline = count.total - count.online;
    const stoppedCard = notRunningReading(groups, count);

    return (
        <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                <StatCard
                    label="Clients online"
                    value={error ? EMPTY_VALUE : formatOnlineCount(count)}
                    sub={error ? "Not known" : offline > 0 ? `${offline} offline` : "All connected"}
                    icon={Monitor}
                    onClick={() => navigate(ROUTES.clients)}
                    classNames={{ icon: !error && offline > 0 ? "text-warning" : QUIET }}
                />
                <StatCard
                    label="Updates available"
                    value={containers.updatesCard.value}
                    sub={containers.updatesCard.sub}
                    icon={CircleArrowUp}
                    onClick={() => navigate(containersFiltered({ update: "update" }))}
                    classNames={{ icon: containers.updates > 0 ? "text-warning" : QUIET }}
                />
                <StatCard
                    label="Containers not running"
                    value={error ? EMPTY_VALUE : stoppedCard.value}
                    sub={error ? "Not known" : stoppedCard.sub}
                    icon={Power}
                    onClick={() => navigate(containersFiltered({ state: "not-running" }))}
                    classNames={{ icon: !error && count.online > 0 && containers.stopped > 0 ? "text-warning" : QUIET }}
                />
                <StatCard
                    label="Errors / Warnings"
                    value={problems ? String(problems.errors + problems.warnings) : EMPTY_VALUE}
                    sub={problems ? problemSummary(problems) : "Loading…"}
                    icon={TriangleAlert}
                    onClick={() => navigate(ROUTES.activity)}
                    classNames={{
                        icon: problems?.errors ? "text-error" : problems?.warnings ? "text-warning" : QUIET,
                    }}
                />
                <StatCard
                    label="Next scheduled run"
                    value={next ? formatDate(next.at) : EMPTY_VALUE}
                    sub={next ? SCHEDULER_LABELS[next.scheduler] : next === null ? "No scheduler is active" : "Loading…"}
                    icon={CalendarClock}
                    onClick={() => navigate(ROUTES.settings)}
                    classNames={{ icon: QUIET }}
                />
            </div>

            {error && <QueryError title="Could not load the clients" error={error} />}

            {!error && attention.length > 0 && (
                <section aria-labelledby="needs-attention">
                    <h2 id="needs-attention" className="mb-3 text-sm font-medium text-text-muted">
                        Needs attention
                    </h2>
                    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-3">
                        {attention.map((group) => (
                            <AttentionList key={group.id} group={group} />
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
};
