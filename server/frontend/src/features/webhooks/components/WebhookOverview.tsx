import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { WebhookListSchema, type Webhook } from "@dim/shared";
import { useConfirm, useToast } from "@stefgo/react-ui-components";
import { api } from "../../../lib/api";
import { getErrorMessage } from "../../../utils";
import { describeDeleteWebhook } from "../confirmations";
import { WebhookList } from "./WebhookList";

/** The page at `/webhooks`. Adding and editing happen on pages of their own. */
export const WebhookOverview = () => {
    const navigate = useNavigate();
    const { pathname, search } = useLocation();
    const { confirm } = useConfirm();
    const { show } = useToast();
    const [webhooks, setWebhooks] = useState<Webhook[]>([]);

    /** Bumped to load the list again after a change; the effect below is the only loader. */
    const [reloadCount, setReloadCount] = useState(0);
    /** Only the first load shows as loading; a reload keeps the rows on screen. */
    const [isLoading, setIsLoading] = useState(true);

    // A response that arrives after the next reload has started is dropped, so an older
    // list cannot overwrite a newer one.
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const list = await api.get("/api/v1/webhooks", WebhookListSchema);
                if (!cancelled) setWebhooks(list);
            } catch (e) {
                if (!cancelled) show({ variant: "error", title: "Could not load the webhooks", description: getErrorMessage(e) });
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [reloadCount, show]);

    // The editor goes back to where it was opened from, search included.
    const open = (to: string) => navigate(to, { state: { from: pathname + search } });

    const requestDelete = (webhook: Webhook) =>
        confirm({
            ...describeDeleteWebhook(webhook.name),
            onConfirm: async () => {
                await api.delete(`/api/v1/webhooks/${webhook.id}`, { fallback: "Failed to delete the webhook" });
                setReloadCount((n) => n + 1);
            },
        });

    // The switch moves at once; the reload afterwards shows what the server holds, which puts
    // it back if the change was refused -- and the refusal is said, where it used to go to the
    // console. PUT takes the whole webhook, so the row is sent as is.
    const toggleEnabled = async (webhook: Webhook, enabled: boolean) => {
        setWebhooks((list) => list.map((w) => (w.id === webhook.id ? { ...w, enabled } : w)));
        try {
            await api.put(`/api/v1/webhooks/${webhook.id}`, { ...webhook, enabled });
        } catch (e) {
            show({
                variant: "error",
                title: `Could not ${enabled ? "enable" : "disable"} ${webhook.name}`,
                description: getErrorMessage(e),
            });
        } finally {
            setReloadCount((n) => n + 1);
        }
    };

    return (
        <div className="space-y-6">
            <WebhookList
                webhooks={webhooks}
                isLoading={isLoading}
                onAdd={() => open("/webhooks/new")}
                onEdit={(webhook) => open(`/webhooks/${webhook.id}`)}
                onDelete={requestDelete}
                onToggleEnabled={toggleEnabled}
            />
        </div>
    );
};
