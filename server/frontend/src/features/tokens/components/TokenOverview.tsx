import { useQueryClient } from "@tanstack/react-query";
import { Token } from "@dim/shared";
import { TokenList } from "./TokenList";
import { api } from "../../../lib/api";
import { tokenListOptions, useTokens } from "../../../queries/tokens";
import { QueryError } from "../../../components/QueryError";
import { useConfirm } from "@stefgo/react-ui-components";
import { describeDeleteToken } from "../confirmations";

const NO_TOKENS: Token[] = [];

export const TokenOverview = () => {
    const queryClient = useQueryClient();
    const { confirm } = useConfirm();
    // `isPending` only for the first load: the list used to say "No tokens yet." until the
    // answer arrived, and a reload after a delete keeps the rows on screen instead of flashing.
    const { data: tokens = NO_TOKENS, isPending, error } = useTokens();

    /** Reads the list again after a change. */
    const fetchTokens = () => queryClient.invalidateQueries({ queryKey: tokenListOptions.queryKey });

    // Asks first, like every other delete. A refused delete keeps the dialog open, with the
    // server's reason in it -- it used to fail without a word.
    const requestDeleteToken = (token: Token) => {
        const active = !token.usedAt && new Date(token.expiresAt) >= new Date();
        confirm({
            ...describeDeleteToken(active),
            onConfirm: async () => {
                await api.delete(`/api/v1/tokens/${token.tokenHash}`, { fallback: "Failed to delete token" });
                fetchTokens();
            },
        });
    };

    if (error) return <QueryError title="Could not load the tokens" error={error} />;

    return (
        <div className="space-y-6">
            <TokenList tokens={tokens} isLoading={isPending} deleteToken={requestDeleteToken} />
        </div>
    );
};
