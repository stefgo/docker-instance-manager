import { useCallback } from "react";
import { useConfirm } from "@stefgo/react-ui-components";
import { useBatch } from "../../../hooks/useBatch";
import { useDockerActions } from "../../../hooks/useDockerActions";
import type { ImageCheckTarget } from "../../../lib/cacheUpdates";
import { distinctChecks } from "../../../lib/pendingImages";
import { describeCheck, type CheckReach } from "../confirmations";

/**
 * The check in a list's header, behind its question (`describeCheck`). Every list with a
 * check button in its header goes through here, so each asks the same way; a row's own
 * check goes out at once. Resolves to whether it went out -- not with nothing to reach.
 *
 * The checks are sent from here, once per image (`distinctChecks`), and reported in one
 * toast (`useBatch`) rather than a toast per refusal.
 */
export function useConfirmCheck() {
    const { confirm } = useConfirm();
    const { checkImageUpdateAsync } = useDockerActions();
    const track = useBatch();
    return useCallback(async (reach: CheckReach, targets: readonly ImageCheckTarget[]): Promise<boolean> => {
        if (reach.count === 0 || !(await confirm(describeCheck(reach)))) return false;
        const steps = distinctChecks(targets).map(({ imageRef, repoDigests }) => ({
            label: imageRef,
            result: checkImageUpdateAsync(imageRef, repoDigests),
        }));
        void track({ action: "check", noun: "image" }, steps);
        return true;
    }, [confirm, checkImageUpdateAsync, track]);
}
