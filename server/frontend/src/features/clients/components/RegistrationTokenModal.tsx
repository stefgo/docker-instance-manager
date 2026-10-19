import { Button, CopyField, Modal } from "@stefgo/react-ui-components";
import { formatDate } from "../../../utils";

interface RegistrationTokenModalProps {
    token: string;
    expiresAt: string;
    onClose: () => void;
}

/**
 * A client's registration token, shown the one time it exists in the clear.
 *
 * Escape and a click beside the dialog are both refused: dismissing it is not a way out
 * here, it is losing the value the whole flow was for. The button below is the way out, and
 * it is the only one — which is exactly the case the library's `closeOnEscape` exists for.
 */
export const RegistrationTokenModal = ({ token, expiresAt, onClose }: RegistrationTokenModalProps) => (
    <Modal
        isOpen
        onClose={onClose}
        title="Registration Token"
        description="Copy it now — it is not shown again."
        size="lg"
        closeOnEscape={false}
        closeOnOverlayClick={false}
        hideCloseButton
        footer={
            <Button variant="primary" onClick={onClose} className="w-full">
                Close
            </Button>
        }
    >
        <div className="p-6 space-y-4">
            {/* Over plain HTTP there is no clipboard; the field then selects the token instead. */}
            <CopyField value={token} aria-label="Registration token" />

            <p className="text-sm text-text-muted">
                Enter it on the agent's <code>/register</code> page, together with this server's
                URL. It registers one agent, until {formatDate(expiresAt)}.
            </p>
        </div>
    </Modal>
);
