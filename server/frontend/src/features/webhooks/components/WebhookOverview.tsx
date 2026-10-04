import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Webhook } from "@dim/shared";
import { useConfirm, useToast } from "@stefgo/react-ui-components";
import { useDeleteWebhook, useSaveWebhook, useWebhooks } from "../../../queries/webhooks";
import { QueryError } from "../../../components/QueryError";
import { getErrorMessage } from "../../../utils";
import { describeDeleteWebhook } from "../confirmations";
import { WebhookList } from "./WebhookList";
import { ROUTES, paths } from "../../../lib/paths";

/** The page at `/webhooks`. Adding and editing happen on pages of their own. */
export const WebhookOverview = () => {
    const navigate = useNavigate();
    const { search } = useLocation();
    const { confirm } = useConfirm();
    const { show } = useToast();
    // `isPending` only for the first load; a reload after a change keeps the rows on screen.
    const { webhooks, isPending, error } = useWebhooks();
    const { mutateAsync: deleteWebhook } = useDeleteWebhook();
    const { mutateAsync: saveWebhook } = useSaveWebhook();
    /** The switch moves at once, before the server has answered. */
    const [pendingEnabled, setPendingEnabled] = useState<Record<string, boolean>>({});

    // The editor closes onto this list and keeps the query it is handed, so the list's
    // search is still there on return.
    const open = (pathname: string) => navigate({ pathname, search });

    // A refused delete keeps the dialog open, with the server's reason in it. The list has
    // been read again by the time the dialog closes.
    const requestDelete = (webhook: Webhook) =>
        confirm({ ...describeDeleteWebhook(webhook.name), onConfirm: () => deleteWebhook(webhook.id) });

    // The list is read again once the server has answered, which puts the switch back if
    // the change was refused -- and the refusal is said, where it used to go to the console.
    // PUT takes the whole webhook, so the row is sent as is.
    const toggleEnabled = async (webhook: Webhook, enabled: boolean) => {
        setPendingEnabled((p) => ({ ...p, [webhook.id]: enabled }));
        try {
            await saveWebhook({ id: webhook.id, input: { ...webhook, enabled } });
        } catch (e) {
            show({
                variant: "error",
                title: `Could not ${enabled ? "enable" : "disable"} ${webhook.name}`,
                description: getErrorMessage(e),
            });
        } finally {
            setPendingEnabled((p) => {
                const next = { ...p };
                delete next[webhook.id];
                return next;
            });
        }
    };

    if (error) return <QueryError title="Could not load the webhooks" error={error} />;

    const shown = webhooks.map((w) => (w.id in pendingEnabled ? { ...w, enabled: pendingEnabled[w.id] } : w));

    return (
        <div className="space-y-6">
            <WebhookList
                webhooks={shown}
                isLoading={isPending}
                onAdd={() => open(ROUTES.webhookNew)}
                onEdit={(webhook) => open(paths.webhook(webhook.id))}
                onDelete={requestDelete}
                onToggleEnabled={toggleEnabled}
            />
        </div>
    );
};
