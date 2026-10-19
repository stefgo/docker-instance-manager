import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import {
    CONNECTION_MODE,
    type CreateInboundClient,
    type CreatedInboundClient,
} from "@dim/shared";
import { Card, Wizard, WizardStep } from "@stefgo/react-ui-components";
import { getErrorMessage } from "../../../../utils";
import { RegistrationTokenModal } from "../RegistrationTokenModal";
import { StepConnectionMode } from "./steps/StepConnectionMode";
import { StepInboundDetails } from "./steps/StepInboundDetails";
import { StepOutboundDetails } from "./steps/StepOutboundDetails";
import { useAddClientForm } from "./useAddClientForm";
import { HeaderBreadcrumb } from "../../../app/HeaderBreadcrumb";

interface AddClientWizardProps {
    /** Leaves the flow without a client. */
    onClose: () => void;
    /** Creates the inbound client, which then waits for its agent, and its token. */
    onCreateInbound: (data: CreateInboundClient) => Promise<CreatedInboundClient>;
    onCreateOutbound: (data: {
        hostname: string;
        outboundTargetAddress: string;
        registrationSecret: string;
    }) => Promise<void>;
    /** Leaves the flow onto the inbound client it created, once its token has been seen. */
    onInboundCreated: (clientId: string) => void;
}

/**
 * One flow for both connection modes, replacing the separate "Add Outbound Client" dialog
 * and "Generate New Token" button. Which side opens the connection is the first decision,
 * and everything after it follows from that — as two entry points it was a decision the
 * operator had to have made before they got to a form.
 *
 * It lives in the workspace rather than in a modal: the two branches end in different
 * things — a token to carry to another machine, or a connection attempt that may fail with
 * a reason worth reading — and that is more than a dialog should hold.
 */
export const AddClientWizard = ({
    onClose,
    onCreateInbound,
    onCreateOutbound,
    onInboundCreated,
}: AddClientWizardProps) => {
    const form = useAddClientForm();
    const [step, setStep] = useState(0);
    const [isFinishing, setIsFinishing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [created, setCreated] = useState<CreatedInboundClient | null>(null);

    // The listener sits on `window`, one level further out than menus and dialogs, which
    // listen on `document` and stop the event there: an open select closes itself without
    // taking the wizard with it. It is off while the token is on screen -- that dialog
    // refuses Escape of its own accord, because the token is shown exactly once.
    useEffect(() => {
        if (created) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [created, onClose]);

    const isInbound = form.mode === CONNECTION_MODE.INBOUND;

    const finish = async () => {
        setIsFinishing(true);
        setError(null);
        try {
            if (isInbound) {
                setCreated(
                    await onCreateInbound({
                        displayName: form.displayName.trim(),
                        inboundAllowedIp: form.restrictIp
                            ? form.allowedIp.trim()
                            : undefined,
                    }),
                );
            } else {
                await onCreateOutbound({
                    hostname: form.hostname.trim() || form.targetAddress.trim(),
                    outboundTargetAddress: form.targetAddress.trim(),
                    registrationSecret: form.registrationSecret.trim(),
                });
                onClose();
            }
        } catch (e: unknown) {
            // The wizard stays on the step, next to the button that retries it. For the
            // outbound branch this is where the agent's own reason for refusing appears.
            setError(getErrorMessage(e));
        } finally {
            setIsFinishing(false);
        }
    };

    const steps: WizardStep[] = [
        {
            id: "mode",
            label: "Connection",
            description: "Which side dials",
            content: <StepConnectionMode mode={form.mode} onChange={form.setMode} />,
        },
        {
            id: "details",
            label: "Agent",
            description: isInbound ? "Name and token" : "Where to dial",
            canContinue: form.canContinue,
            content: (
                <div className="space-y-4">
                    {isInbound ? (
                        <StepInboundDetails form={form} />
                    ) : (
                        <StepOutboundDetails form={form} />
                    )}
                    {error && <p className="text-sm text-error">{error}</p>}
                </div>
            ),
        },
    ];

    return (
        <>
            <Card
                title={<HeaderBreadcrumb current="Add Client">Add Client</HeaderBreadcrumb>}
                classNames={{ header: "py-6 px-7" }}
            >
                <Wizard
                    steps={steps}
                    value={step}
                    onChange={setStep}
                    onCancel={onClose}
                    onFinish={finish}
                    finishLabel={isInbound ? "Add Client & Generate Token" : "Add Client"}
                    finishIcon={Plus}
                    isFinishing={isFinishing}
                    allowStepSelect
                />
            </Card>

            {created && (
                <RegistrationTokenModal
                    token={created.token}
                    expiresAt={created.expiresAt}
                    onClose={() => onInboundCreated(created.id)}
                />
            )}
        </>
    );
};
