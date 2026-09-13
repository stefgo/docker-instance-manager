import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import {
    AGENT_CAPABILITIES,
    agentCan,
    AutoUpdateAgentStatus,
    AutoUpdateStatusResponse,
} from "@dim/shared";
import { Button } from "@stefgo/react-ui-components";
import { apiFetch } from "../../../lib/apiFetch";
import { formatDate, getErrorMessage } from "../../../utils";

/** `host` is every container on the machine that belongs to no project DIM knows. */
function scheduleLabel(schedule: string): string {
    if (schedule === "host") return "Host";
    return schedule.startsWith("project:") ? `Project ${schedule.slice("project:".length)}` : schedule;
}

/**
 * What one agent is doing about auto-update, in one line per schedule.
 *
 * An agent without the capability is the one case worth spelling out: it is not switched off,
 * it is too old to run anything, and the cure is to update the agent. Its connection is
 * deliberately still accepted — refusing it would take away the only way to do that.
 */
function AgentRow({ agent }: { agent: AutoUpdateAgentStatus }) {
    // Only a reported list says anything: `null` is "not known right now", and an agent is
    // called too old only where its own answer leaves it out.
    const cannotAutoUpdate =
        agent.capabilities != null &&
        !agentCan(agent.capabilities, AGENT_CAPABILITIES.AUTO_UPDATE);
    return (
        <div className="p-3 rounded-lg border border-border">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <Link
                        to={`/client/${agent.clientId}`}
                        className="text-sm font-medium text-accent hover:underline"
                    >
                        {agent.clientName}
                    </Link>
                    <p className="text-xs text-text-muted mt-0.5">
                        {!agent.online ? (
                            "Offline — it runs its schedule on its own clock and reports when it is back"
                        ) : cannotAutoUpdate ? (
                            <span className="text-warning">
                                Agent too old{agent.version ? ` (v${agent.version})` : ""} — no auto-update
                            </span>
                        ) : (
                            "Auto-update: autonomous"
                        )}
                    </p>
                </div>
            </div>

            {agent.runs.length === 0 ? (
                <p className="text-xs text-text-muted mt-2">No run reported yet.</p>
            ) : (
                <ul className="mt-2 space-y-1">
                    {agent.runs.map((run) => (
                        <li key={run.schedule} className="text-xs text-text-muted">
                            <span className="text-text-primary">{scheduleLabel(run.schedule)}</span>
                            {" · "}
                            {formatDate(run.occurredAt)}
                            {" · "}
                            <span className={run.failed ? "text-error" : ""}>
                                {run.updated ?? 0} updated
                                {run.failed ? `, ${run.failed} failed` : ""}
                                {run.skipped ? `, ${run.skipped} postponed` : ""}
                            </span>
                            {run.catchUp && " · caught up"}
                            {run.manual && " · asked for"}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

/**
 * Auto-update across the fleet: who runs it, and what their last run did.
 *
 * There is no server-side schedule to show any more. Every figure here comes out of the
 * `autoupdate.run` events the agents reported, which is why it survives a restart of this
 * server — and why a host that updated itself at three in the morning with the server off
 * still appears, as soon as it hands its queue over.
 */
export const AutoUpdateFleet = () => {
    const [status, setStatus] = useState<AutoUpdateStatusResponse | null>(null);
    const [isTriggering, setIsTriggering] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    /** Bumped to ask for a fresh read; the loader lives inside the effect that depends on it. */
    const [reloadToken, setReloadToken] = useState(0);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const response = await apiFetch("/api/v1/settings/container-auto-update/status");
                if (!response.ok) return;
                const data = (await response.json()) as AutoUpdateStatusResponse;
                if (!cancelled) setStatus(data);
            } catch (e) {
                console.error("Failed to fetch the auto-update status", e);
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [reloadToken]);

    useEffect(() => {
        if (!result) return;
        const timer = setTimeout(() => setResult(null), 4000);
        return () => clearTimeout(timer);
    }, [result]);

    // A run belongs to its host and reports itself through its events, so what comes back
    // from the command is only whether the agents were asked. The list is read again a moment
    // later, which is when the first of those events has usually arrived.
    const reload = () => setTimeout(() => setReloadToken((n) => n + 1), 3000);

    const runAll = async () => {
        setIsTriggering(true);
        try {
            const response = await apiFetch("/api/v1/settings/container-auto-update/run", {
                method: "POST",
            });
            if (!response.ok) throw new Error("Failed to ask the agents to run");
            const data = (await response.json()) as { triggered?: number; skipped?: number };
            setResult(
                `${data.triggered ?? 0} asked${data.skipped ? ` / ${data.skipped} unable` : ""}`,
            );
            reload();
        } catch (e: unknown) {
            alert(getErrorMessage(e));
        } finally {
            setIsTriggering(false);
        }
    };

    return (
        <div className="md:col-span-2">
            <div className="flex items-end justify-between gap-4 mb-2">
                <div>
                    <p className="text-xs font-bold text-text-muted uppercase">Agents</p>
                    <p className="text-xs text-text-muted leading-relaxed">
                        Every agent runs the schedules above on its own clock and reports what it
                        did. The figures are that report, not this server&apos;s own record. A
                        single agent is asked to run from its row in the client list.
                    </p>
                </div>
                <Button
                    variant="secondary"
                    onClick={runAll}
                    disabled={isTriggering || !!result}
                    className="w-[200px] shrink-0"
                >
                    {isTriggering ? (
                        <RefreshCw size={16} className="animate-spin" />
                    ) : result ? (
                        <span className="animate-in zoom-in duration-300">{result}</span>
                    ) : (
                        <span>Run On All Agents</span>
                    )}
                </Button>
            </div>

            {status === null ? (
                <p className="text-xs text-text-muted">Loading…</p>
            ) : status.agents.length === 0 ? (
                <p className="text-xs text-text-muted">No clients yet.</p>
            ) : (
                <div className="space-y-2">
                    {status.agents.map((agent) => (
                        <AgentRow key={agent.clientId} agent={agent} />
                    ))}
                </div>
            )}
        </div>
    );
};
