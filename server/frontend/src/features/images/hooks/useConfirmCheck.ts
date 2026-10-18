import { useCallback } from "react";
import { useConfirm } from "@stefgo/react-ui-components";
import { describeCheck, type CheckReach } from "../confirmations";

/**
 * The check in a list's header, behind its question (`describeCheck`). Every list with a
 * check button in its header goes through here, so each asks the same way; a row's own
 * check goes out at once. Resolves to whether it went out -- not with nothing to reach.
 */
export function useConfirmCheck() {
    const { confirm } = useConfirm();
    return useCallback(async (reach: CheckReach, run: () => void): Promise<boolean> => {
        if (reach.count === 0 || !(await confirm(describeCheck(reach)))) return false;
        run();
        return true;
    }, [confirm]);
}
