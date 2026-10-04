import { ReactNode } from "react";
import { Input, ManualRun as LibraryManualRun, type ManualRunProps } from "@stefgo/react-ui-components";
import { describeFailure } from "../../../utils";

/**
 * The heading of a settings section: what it controls, in a sentence or two. The fields
 * fill the panel's width; running text is held to a readable line length instead.
 */
export const SectionHeader = ({ title, children }: { title: string; children: ReactNode }) => (
    <div className="mb-6">
        <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">{title}</h3>
        <p className="text-sm text-text-muted max-w-prose">{children}</p>
    </div>
);

/** The small uppercase caption above a field or a read-only value. */
export const FieldCaption = ({ children }: { children: ReactNode }) => (
    <p className="block text-xs font-bold text-text-muted uppercase mb-1">{children}</p>
);

interface NumberFieldProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    /** The lowest value accepted; anything below, or nothing at all, becomes this. */
    min?: number;
    placeholder?: string;
    hint: ReactNode;
}

/**
 * A whole number, stored as a string like every setting. Every section had this label,
 * field and hint written out by hand, with the clamping repeated in each onChange.
 */
export const NumberField = ({ label, value, onChange, min = 0, placeholder, hint }: NumberFieldProps) => (
    <div>
        <label className="block text-xs font-bold text-text-muted uppercase mb-1">{label}</label>
        <Input
            type="number"
            min={String(min)}
            value={value}
            onChange={(e) => onChange(Math.max(min, parseInt(e.target.value) || min).toString())}
            placeholder={placeholder}
        />
        <p className="text-xs text-text-muted leading-relaxed max-w-prose">{hint}</p>
    </div>
);

/**
 * "Run the job now", at the foot of the scheduler box. The library's `ManualRun`, reading a
 * failure the way the rest of the app does.
 */
export const ManualRun = (props: Omit<ManualRunProps, "formatError">) => (
    <LibraryManualRun formatError={describeFailure} {...props} />
);
