import { useState } from "react";
import {
    Client,
    CONNECTION_MODE,
    DEFAULT_AGENT_PORT,
    Ipv4OrCidrSchema,
    normaliseTargetAddress,
    UpdateClient,
} from "@dim/shared";
import { Save, X } from "lucide-react";
import { ActionButton, Button, Card, Checkbox, Input } from "@stefgo/react-ui-components";
import { getErrorMessage } from "../../../utils";

interface ClientEditorProps {
    client: Client;
    onSave: (id: string, data: UpdateClient) => Promise<void>;
    onCancel: () => void;
}

export const ClientEditor = ({
    client,
    onSave,
    onCancel,
}: ClientEditorProps) => {
    const isInbound = client.connectionMode !== CONNECTION_MODE.OUTBOUND;
    const [displayName, setDisplayName] = useState(client.displayName || "");
    // The check is opt-out per client: the box carries the decision, the field the value.
    const [restrictIp, setRestrictIp] = useState(!!client.inboundAllowedIp);
    const [allowedIp, setAllowedIp] = useState(client.inboundAllowedIp || "");
    const [targetAddress, setTargetAddress] = useState(client.outboundTargetAddress || "");
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Same rule the server applies, so a rejected value is caught in the field instead of
    // coming back as a request error. A stored value the schema would not accept -- the
    // IPv6 address a client registered from -- stays savable as long as it is unchanged.
    const allowedIpTrimmed = allowedIp.trim();
    const allowedIpChanged = allowedIpTrimmed !== (client.inboundAllowedIp || "");
    const allowedIpInvalid =
        isInbound &&
        restrictIp &&
        allowedIpChanged &&
        !Ipv4OrCidrSchema.safeParse(allowedIpTrimmed).success;

    // Same rule the endpoint applies, from the same function: the field rejects an address
    // the server would reject. A stored value is only re-checked once it is edited, so an
    // address written before this check existed stays savable as long as it is left alone.
    const targetAddressTrimmed = targetAddress.trim();
    const targetAddressChanged =
        targetAddressTrimmed !== (client.outboundTargetAddress || "");
    const targetAddressInvalid =
        !isInbound &&
        targetAddressChanged &&
        normaliseTargetAddress(targetAddressTrimmed) === null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (allowedIpInvalid || targetAddressInvalid) return;
        setIsSaving(true);
        setError(null);
        try {
            const data: UpdateClient = { displayName: displayName.trim() };
            if (isInbound) {
                // Only sent when it changed: an absent key leaves the stored value alone, and
                // `null` is not "unchanged" but "switch the check off".
                if (!restrictIp && client.inboundAllowedIp) {
                    data.inboundAllowedIp = null;
                } else if (restrictIp && allowedIpChanged) {
                    data.inboundAllowedIp = allowedIpTrimmed;
                }
            } else if (targetAddressChanged) {
                data.outboundTargetAddress = targetAddressTrimmed;
            }
            await onSave(client.id, data);
            onCancel();
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Card
            className="flex flex-col"
            title="Edit Client"
            action={
                <ActionButton icon={X} tooltip="Close" onClick={onCancel} />
            }
            classNames={{ header: "py-6 px-7", headerTitle: "text-xl font-bold" }}
        >
            <div className="p-7 bg-card">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <Input
                        label="Display Name"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder={client.hostname}
                        disabled={isSaving}
                        hint={`Leave empty to use hostname (${client.hostname})`}
                    />

                    {isInbound && (
                        <div className="space-y-4">
                            <Checkbox
                                label="Restrict connections to an IP address or network"
                                checked={restrictIp}
                                onChange={(e) => setRestrictIp(e.target.checked)}
                                disabled={isSaving}
                            />
                            <p className="text-xs text-text-muted -mt-2 ml-6">
                                {restrictIp
                                    ? "The agent is refused when it connects from anywhere else."
                                    : "The agent's token is accepted from any address the server's allowed_networks permit. Suited to hosts whose address is assigned by their environment."}
                            </p>

                            {restrictIp && (
                                <Input
                                    label="Allowed IP or Network"
                                    value={allowedIp}
                                    onChange={(e) => setAllowedIp(e.target.value)}
                                    placeholder="192.168.1.50 or 192.168.1.0/24"
                                    disabled={isSaving}
                                    error={
                                        allowedIpInvalid
                                            ? "Enter an IPv4 address or an IPv4 network in CIDR notation."
                                            : undefined
                                    }
                                    hint="A client that connects from a different address is refused at its next reconnect."
                                />
                            )}
                        </div>
                    )}

                    {!isInbound && (
                        <Input
                            label="Target Address"
                            value={targetAddress}
                            onChange={(e) => setTargetAddress(e.target.value)}
                            placeholder={`192.168.1.100:${DEFAULT_AGENT_PORT}`}
                            disabled={isSaving}
                            error={
                                targetAddressInvalid
                                    ? "Enter a host or host:port, without scheme, path or credentials."
                                    : undefined
                            }
                            hint={`Host and port of the agent's web server. Without a port, :${DEFAULT_AGENT_PORT} is used. Saving reconnects to the new address at once.`}
                            required
                        />
                    )}

                    {error && <p className="text-sm text-error">{error}</p>}

                    <div className="flex justify-end gap-3 pt-2">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={onCancel}
                            disabled={isSaving}
                            icon={X}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            isLoading={isSaving}
                            disabled={
                                allowedIpInvalid ||
                                targetAddressInvalid ||
                                (isInbound && restrictIp && !allowedIpTrimmed) ||
                                (!isInbound && !targetAddressTrimmed)
                            }
                            icon={Save}
                            className="shadow-glow-accent"
                        >
                            {isSaving ? "Saving..." : "Save Changes"}
                        </Button>
                    </div>
                </form>
            </div>
        </Card>
    );
};
