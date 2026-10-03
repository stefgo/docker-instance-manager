import { getErrorMessage } from "../utils";

interface QueryErrorProps {
    /** What could not be read, as a sentence: "Could not load the users". */
    title: string;
    error: unknown;
}

/**
 * The one way a page says that its data could not be read: what failed, and the server's
 * own words for why. Shown instead of the list -- an empty list below a toast says there
 * is nothing, which is another statement altogether.
 */
export const QueryError = ({ title, error }: QueryErrorProps) => (
    <div className="p-6">
        <div role="alert" className="bg-error-bg text-error p-4 rounded-md">
            <div className="font-medium">{title}</div>
            <div className="text-sm mt-1">{getErrorMessage(error)}</div>
        </div>
    </div>
);
