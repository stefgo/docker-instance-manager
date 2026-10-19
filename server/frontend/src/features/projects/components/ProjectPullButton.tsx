import { Download } from "lucide-react";
import { Button } from "@stefgo/react-ui-components";
import { findProject, useProjects } from "../../../queries/projects";
import { useUpdatingImages } from "../../../queries/docker";
import { usePull } from "../../app/context/PullContext";
import { useAllProjectMembers } from "../hooks/useProjectMembers";
import { EMPTY_MEMBERS } from "../lib/projectMembers";
import { type ProjectPullReach, canPull, isPulling, projectPullRequest } from "../pullPlan";

interface ProjectPullButtonProps {
    projectId: string;
    /** What the list reaches: its picked containers, the ones it shows, or all of them. */
    reach: ProjectPullReach;
    /** Runs once the pull went out: a list that pulled its selection ends it. */
    onPulled?: () => void;
    title?: string;
}

/**
 * The Pull & Recreate button in the header of a project's tabs. It reaches what the tab
 * picks or shows (`reach`), and its dialog offers a forced pull of those containers beside
 * the pull of what is behind. Enabled as long as any of them can be pulled for -- a forced
 * pull needs no update to act on.
 */
export const ProjectPullButton = ({ projectId, reach, onPulled, title }: ProjectPullButtonProps) => {
    const project = findProject(useProjects().projects, projectId);
    const live = useAllProjectMembers().get(projectId) ?? EMPTY_MEMBERS;
    const pull = usePull();
    const updating = isPulling(live, useUpdatingImages());

    return (
        <Button
            size="sm"
            icon={Download}
            onClick={async () => {
                if (await pull(projectPullRequest(project?.name ?? projectId, live, reach))) onPulled?.();
            }}
            disabled={!canPull(live, reach.containerKeys) || updating}
            isLoading={updating}
            title={title}
        >
            Pull & Recreate
        </Button>
    );
};
