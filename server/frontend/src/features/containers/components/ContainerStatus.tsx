import type { DockerContainer } from "@dim/shared";
import { useNow } from "../../../hooks/useNow";
import { containerStatus } from "../containerState";

/**
 * A container's status with a duration that keeps counting between two state pushes. Its own
 * component so that only the cell re-renders on each tick, not the list around it.
 */
export const ContainerStatus = ({ container }: { container: DockerContainer }) => {
    const now = useNow();
    return <>{containerStatus(container, now)}</>;
};
