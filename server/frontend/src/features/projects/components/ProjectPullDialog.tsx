import { ConfirmDialog, Radio, RadioGroup } from "@stefgo/react-ui-components";
import { plural } from "../../../utils";
import { ProjectPull } from "../hooks/useProjectPull";
import { PullMode, planPull } from "../pullPlan";

interface ProjectPullDialogProps {
    pull: ProjectPull;
}

/**
 * Asks how far a project's pull & recreate goes, with the number of containers each option
 * recreates. Both stay within the project: other containers on the same images are left as
 * they are.
 */
export const ProjectPullDialog = ({ pull }: ProjectPullDialogProps) => {
    const { pending, mode, setMode, confirm, cancel } = pull;
    const updates = pending ? planPull(pending.live, "updates") : null;
    const force = pending ? planPull(pending.live, "force") : null;
    const selected = mode === "force" ? force : updates;
    const count = selected?.containerCount ?? 0;
    const hostCount = new Set(selected?.targets.flatMap((t) => t.clientIds) ?? []).size;

    return (
        <ConfirmDialog
            isOpen={pending !== null}
            onClose={cancel}
            onConfirm={confirm}
            title={`Pull & recreate "${pending?.name ?? ""}"?`}
            description={`${plural(count, "container")} of this project on ${plural(hostCount, "host")} ${count === 1 ? "is" : "are"} recreated from a freshly pulled image. The containers are unavailable while that happens; other containers on the same images are left as they are.`}
            confirmLabel={`Pull & recreate ${plural(count, "container")}`}
        >
            <RadioGroup
                label="Containers"
                value={mode}
                onChange={(next) => setMode(next as PullMode)}
            >
                <Radio
                    value="updates"
                    disabled={(updates?.containerCount ?? 0) === 0}
                    label={`Only with an update (${plural(updates?.containerCount ?? 0, "container")})`}
                />
                <Radio
                    value="force"
                    label={`All containers, forced (${plural(force?.containerCount ?? 0, "container")})`}
                />
            </RadioGroup>
        </ConfirmDialog>
    );
};
