import { useNavigate } from "react-router-dom";
import { AutoUpdateEnrollment } from "../autoUpdate";

interface AutoUpdateSourceCellProps {
    /** One container's reading, or `mixed` for a row that stands for several of them. */
    enrollment: AutoUpdateEnrollment | "mixed";
}

/**
 * Why a container updates itself -- a statement, not a control.
 *
 * There is nothing to switch here any more: a container takes part because it carries the
 * label or because its stack is switched on, and both are changed where they live. The
 * project leads to its own page, because that is where its switch is.
 */
export const AutoUpdateSourceCell = ({ enrollment }: AutoUpdateSourceCellProps) => {
    const navigate = useNavigate();

    if (enrollment === "mixed") {
        return (
            <span
                className="text-sm text-text-muted"
                title="Not every instance takes part the same way"
            >
                Mixed
            </span>
        );
    }

    if (enrollment.source === "label") {
        return (
            <span className="text-sm" title="Enrolled by its Docker label">
                Label
            </span>
        );
    }

    if (enrollment.source === "project" && enrollment.projectName) {
        const name = enrollment.projectName;
        return (
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/project/${encodeURIComponent(name)}`);
                }}
                className="font-inherit text-sm text-accent hover:underline"
                title={`Enrolled by project ${name}`}
            >
                Project {name}
            </button>
        );
    }

    return <span className="text-sm text-text-muted">–</span>;
};
