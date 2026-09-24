import { Download } from "lucide-react";
import { Button } from "@stefgo/react-ui-components";
import { useProjectStore } from "../../../stores/useProjectStore";
import { useAllProjectMembers, EMPTY_MEMBERS } from "../hooks/useProjectMembers";
import { useProjectPull } from "../hooks/useProjectPull";
import { ProjectPullDialog } from "./ProjectPullDialog";

interface ProjectPullButtonProps {
    projectId: string;
}

/**
 * The Pull & Recreate button of a project's tabs, with its dialog. Enabled as long as any
 * container of the project can be pulled for -- a forced pull needs no update to act on.
 */
export const ProjectPullButton = ({ projectId }: ProjectPullButtonProps) => {
    const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
    const live = useAllProjectMembers().get(projectId) ?? EMPTY_MEMBERS;
    const pull = useProjectPull();
    const updating = pull.isUpdating(live);

    return (
        <>
            <Button
                size="sm"
                icon={Download}
                onClick={() => pull.request(project?.name ?? projectId, live)}
                disabled={!pull.canPull(live) || updating}
                isLoading={updating}
            >
                Pull & Recreate
            </Button>
            <ProjectPullDialog pull={pull} />
        </>
    );
};
