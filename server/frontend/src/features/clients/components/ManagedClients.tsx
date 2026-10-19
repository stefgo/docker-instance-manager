import { Plus, Edit, Trash2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Client } from "@dim/shared";
import { ClientList } from "./ClientList";
import { reconnectClient } from "../../../queries/clients";
import { refreshDockerState } from "../../../queries/docker";
import { Button, DataAction, useConfirm, useToast } from "@stefgo/react-ui-components";
import { useBatch } from "../../../hooks/useBatch";
import { clientName, getErrorMessage } from "../../../utils";
import { describeDeleteClient } from "../confirmations";
import { reloadStep, type ReloadStep } from "../lib/clientReload";

interface ManagedClientsProps {
    clients: Client[];
    onSelect: (client: Client | null) => void;
    onRefresh: () => void;
    /** Resolves once the client is gone, so the dialog can hold its spinner until then; rejects on failure. */
    onDelete: (clientId: string) => Promise<void>;
    /** Opens the add wizard -- its own route, so the URL says what is on screen. */
    onAdd: () => void;
    /** Opens the client editor for this client. */
    onEdit: (client: Client) => void;
}

/**
 * The client list and what only the list can do: delete a client, and reload one or all.
 *
 * Everything that opens a form -- add and edit -- is a route of its own and therefore a
 * navigation, not a state flag here. This component used to swap both surfaces in and out
 * of the same `div`, which meant the URL described neither of them and a reload dropped the
 * operator back on the list.
 */
export const ManagedClients = ({
    clients,
    onSelect,
    onRefresh,
    onDelete,
    onAdd,
    onEdit,
}: ManagedClientsProps) => {
    const { confirm } = useConfirm();
    const { show } = useToast();
    const track = useBatch();

    // A failed delete keeps the dialog open with the message in it: the store reverts its
    // optimistic removal, so the row comes back, and closing would hide both the failure
    // and the button that retries it.
    const requestDelete = (client: Client) =>
        confirm({ ...describeDeleteClient(client), onConfirm: () => onDelete(client.id) });

    const [isReloading, setIsReloading] = useState(false);

    /** Rejects on failure, so the one caller and the many can each word their own message. */
    const reload = (client: Client, step: ReloadStep) =>
        step === "reconnect" ? reconnectClient(client.id) : refreshDockerState(client.id);

    const handleReloadClient = async (client: Client) => {
        const step = reloadStep(client);
        if (!step) return;
        try {
            await reload(client, step);
            if (step === "reconnect") onRefresh();
        } catch (e: unknown) {
            // Neither request used to be looked at: a host that could not be reached
            // simply stayed as it was.
            show({
                variant: "error",
                title: `Could not reload ${clientName(client)}`,
                description: getErrorMessage(e),
            });
        }
    };

    // Every client a reload can do something for; an offline one that dials in itself is
    // left out rather than counted as a failure.
    const reloadableOf = (shown: Client[]) =>
        shown.flatMap((client) => {
            const step = reloadStep(client);
            return step ? [{ client, step }] : [];
        });

    /**
     * The clients the list shows, all at once, in one toast (`useBatch`) that names the ones
     * that failed instead of a toast each. It never rejects.
     */
    const handleReloadShown = async (reloadable: { client: Client; step: ReloadStep }[]) => {
        setIsReloading(true);
        await track(
            { action: "reload", noun: "client" },
            reloadable.map(({ client, step }) => ({ label: clientName(client), result: reload(client, step) })),
        );
        if (reloadable.some(({ step }) => step === "reconnect")) onRefresh();
        setIsReloading(false);
    };

    return (
        <div id="client-list-section">
            <ClientList
                clients={clients}
                setSelectedClient={onSelect}
                renderRowActions={(client) => (
                    <DataAction
                        rowId={client.id}
                        actions={[
                            {
                                icon: RefreshCw,
                                onClick: () => handleReloadClient(client),
                                tooltip: {
                                    enabled: "Reload",
                                    disabled: "Offline — the agent connects on its own",
                                },
                                color: "blue",
                                disabled: !reloadStep(client),
                            },
                        ]}
                        menuEntries={[
                            {
                                label: "Edit",
                                icon: Edit,
                                onClick: () => onEdit(client),
                                variant: "default",
                            },
                            {
                                label: "Delete",
                                icon: Trash2,
                                onClick: () => requestDelete(client),
                                variant: "danger",
                            },
                        ]}
                    />
                )}
                extraActions={(shown, scope) => {
                    const reloadable = reloadableOf(shown);
                    return (
                        <>
                            <Button
                                size="sm"
                                variant="secondary"
                                icon={RefreshCw}
                                onClick={() => handleReloadShown(reloadable)}
                                disabled={isReloading || reloadable.length === 0}
                                classNames={{ icon: isReloading ? "animate-spin" : "" }}
                            >
                                Reload {scope}
                            </Button>
                            <Button size="sm" icon={Plus} onClick={onAdd}>
                                Add Client
                            </Button>
                        </>
                    );
                }}
            />

        </div>
    );
};
