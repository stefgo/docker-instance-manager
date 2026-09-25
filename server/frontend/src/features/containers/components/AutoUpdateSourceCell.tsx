import { useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, Boxes } from "lucide-react";
import { AutoUpdateEnrollment, ProjectRef } from "../autoUpdate";

interface AutoUpdateSourceCellProps {
    /** One container's reading, or `mixed` for a row that stands for several of them. */
    enrollment: AutoUpdateEnrollment | "mixed";
    /** For a `mixed` row: whether any of its instances matches several projects. */
    hasConflict?: boolean;
}

const ConflictIcon = ({ title }: { title: string }) => (
    <AlertCircle size={14} className="shrink-0 text-error" aria-label={title}>
        <title>{title}</title>
    </AlertCircle>
);

function conflictText(projects: ProjectRef[], byLabel: boolean): string {
    const names = projects.map((p) => p.name).join(", ");
    return byLabel
        ? `Matches several projects (${names}) — updated through its label on the host schedule`
        : `Matches several projects (${names}) — excluded from auto-update`;
}

/**
 * Why a container updates itself -- a statement, not a control.
 *
 * There is nothing to switch here any more: a container takes part because it carries the
 * label or because its project is switched on, and both are changed where they live. A
 * container whose queries overlap is marked as an error, with a link to each project
 * involved.
 */
export const AutoUpdateSourceCell = ({ enrollment, hasConflict }: AutoUpdateSourceCellProps) => {
    const navigate = useNavigate();
    const { pathname, search } = useLocation();

    const projectLink = (project: ProjectRef, label: string) => (
        <button
            key={project.id}
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                // `from` is where the project page leads back to: the list this cell sits in.
                navigate(`/project/${encodeURIComponent(project.id)}`, {
                    state: { from: pathname + search },
                });
            }}
            className="font-inherit text-sm text-accent hover:underline"
        >
            {label}
        </button>
    );

    if (enrollment === "mixed") {
        const title = hasConflict
            ? "Not every instance takes part the same way; some match several projects"
            : "Not every instance takes part the same way";
        return (
            <span className="inline-flex items-center gap-1 text-sm text-text-muted" title={title}>
                {hasConflict && <ConflictIcon title={title} />}
                Mixed
            </span>
        );
    }

    if (enrollment.conflict) {
        const byLabel = enrollment.source === "label";
        const title = conflictText(enrollment.conflict, byLabel);
        return (
            <span className="inline-flex flex-wrap items-center justify-center gap-1 text-sm" title={title}>
                <ConflictIcon title={title} />
                <span className={byLabel ? undefined : "text-error"}>{byLabel ? "Label" : "Conflict"}</span>
                {enrollment.conflict.map((p, i) => (
                    <span key={p.id} className="inline-flex items-center">
                        {i > 0 && <span className="text-text-muted mr-1">/</span>}
                        {projectLink(p, p.name)}
                    </span>
                ))}
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

    if (enrollment.source === "project" && enrollment.projectId) {
        const name = enrollment.projectName ?? enrollment.projectId;
        return (
            <span className="inline-flex items-center gap-1 text-sm" title={`Enrolled by project ${name}`}>
                <Boxes size={14} className="shrink-0 text-text-muted" />
                {name}
            </span>
        );
    }

    return <span className="text-sm text-text-muted">–</span>;
};
