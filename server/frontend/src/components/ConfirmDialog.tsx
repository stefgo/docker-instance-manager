import { ReactNode, useEffect, useId, useRef } from "react";
import { Button, Card } from "@stefgo/react-ui-components";

/**
 * A stand-in for `ConfirmDialog` from @stefgo/react-ui-components 3.0.
 *
 * The installed library is 2.16, which has neither `ConfirmDialog` nor the `Modal` it is
 * built on. The props below are the 3.0 API minus `size` and `classNames`, which belong to
 * that `Modal` -- so the migration to 3.0 (F2) swaps the import and deletes this file,
 * without touching a single caller.
 */
export interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: ReactNode;
    /** What is about to happen. Name the consequence, not the button. */
    description?: ReactNode;
    children?: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    /** `danger` for anything that destroys data. */
    variant?: "primary" | "danger";
    /** Shows a spinner on the confirm button and blocks both buttons. */
    isConfirming?: boolean;
}

export const ConfirmDialog = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    children,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    variant = "primary",
    isConfirming = false,
}: ConfirmDialogProps) => {
    const titleId = useId();
    const descriptionId = useId();
    const buttonsRef = useRef<HTMLDivElement>(null);

    // Focus starts on Cancel: Enter right after opening must not confirm a delete. Found
    // through the button row because Button in 2.16 does not accept a ref.
    useEffect(() => {
        if (isOpen) buttonsRef.current?.querySelector("button")?.focus();
    }, [isOpen]);

    // Escape is the same answer as Cancel -- except while the request runs, when neither
    // button may be used either.
    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !isConfirming) onClose();
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [isOpen, isConfirming, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
            onClick={(e) => {
                // A click beside the dialog dismisses it, as Cancel would.
                if (e.target === e.currentTarget && !isConfirming) onClose();
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={description ? descriptionId : undefined}
                className="max-w-md w-full animate-fade-in"
            >
                <Card title={<span id={titleId}>{title}</span>}>
                    <div className="p-6 space-y-4">
                        {description && (
                            <p
                                id={descriptionId}
                                className="text-sm text-text-muted dark:text-text-muted-dark"
                            >
                                {description}
                            </p>
                        )}
                        {children}
                        <div ref={buttonsRef} className="flex justify-end gap-3 pt-2">
                            {/* type="button" on both: inside a form, a bare <button> submits it. */}
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={onClose}
                                disabled={isConfirming}
                            >
                                {cancelLabel}
                            </Button>
                            <Button
                                type="button"
                                variant={variant === "danger" ? "danger" : "primary"}
                                onClick={onConfirm}
                                isLoading={isConfirming}
                            >
                                {confirmLabel}
                            </Button>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
};
