import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, CircleArrowUp, Monitor, Power, TriangleAlert } from "lucide-react";
import { LoadingIndicator, StatCard } from "@stefgo/react-ui-components";
import { QueryError } from "../../../components/QueryError";
import { ROUTES, containersFiltered } from "../../../lib/paths";
import { activityListOptions } from "../../../queries/activity";
import { useClients } from "../../../queries/clients";
import { schedulerStatusOptions } from "../../../queries/scheduler";
import { EMPTY_VALUE, formatDate, plural } from "../../../utils";
import { unseenProblems } from "../../activity/lib/unseenTone";
import { useContainersData } from "../../containers/hooks/useContainersData";
import {
    SCHEDULER_LABELS,
    clientCount,
    containerCount,
    formatOnlineCount,
    nextSchedulerRun,
    notRunning,
    problemSummary,
    updatesAvailable,
} from "../lib/dashboard";

const QUIET = "text-text-muted";

/**
 * The start page: what needs a look, across every host.
 *
 * Each card is a count and the way to the list behind it. The counts are the functions of
 * `lib/dashboard.ts`, which the sidebar's badges read as well, on data the socket keeps
 * current -- so a card changes when a host does, without anything being asked for again.
 *
 * Nothing is listed here: what is wrong is on the pages the cards lead to. The two container
 * cards open the container list with the filter that leaves exactly what they counted.
 */
export const DashboardOverview = () => {
    const navigate = useNavigate();
    const { clients, isPending, error } = useClients();
    const groups = useContainersData();
    const events = useQuery(activityListOptions).data;
    const schedulers = useQuery(schedulerStatusOptions).data;

    const containers = useMemo(
        () => ({ total: containerCount(groups), updates: updatesAvailable(groups), stopped: notRunning(groups) }),
        [groups],
    );
    // Until the list has arrived, a zero would read as "nothing wrong".
    const problems = useMemo(() => (events ? unseenProblems(events) : undefined), [events]);
    const next = useMemo(() => (schedulers ? nextSchedulerRun(schedulers) : undefined), [schedulers]);

    if (isPending) return <LoadingIndicator label="Loading overview…" />;

    const count = clientCount(clients);
    const offline = count.total - count.online;
    const across = `Across ${plural(containers.total, "container")}`;

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
                    value={String(containers.updates)}
                    sub={across}
                    icon={CircleArrowUp}
                    onClick={() => navigate(containersFiltered({ update: "update" }))}
                    classNames={{ icon: containers.updates > 0 ? "text-warning" : QUIET }}
                />
                <StatCard
                    label="Containers not running"
                    value={String(containers.stopped)}
                    sub="On clients that are online"
                    icon={Power}
                    onClick={() => navigate(containersFiltered({ state: "not-running" }))}
                    classNames={{ icon: containers.stopped > 0 ? "text-warning" : QUIET }}
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
        </div>
    );
};
