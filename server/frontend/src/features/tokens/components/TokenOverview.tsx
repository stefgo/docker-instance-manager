import { useState, useEffect } from "react";
import { Token, TokenListSchema } from "@dim/shared";
import { TokenList } from "./TokenList";
import { api } from "../../../lib/api";
import { getErrorMessage } from "../../../utils";
import { useConfirm, useToast } from "@stefgo/react-ui-components";
import { describeDeleteToken } from "../confirmations";

export const TokenOverview = () => {
    const [tokens, setTokens] = useState<Token[]>([]);
    const { confirm } = useConfirm();
    const { show } = useToast();

    /** Bumped to load the list again after a change; the effect below is the only loader. */
    const [reloadCount, setReloadCount] = useState(0);

    /**
     * Only the first load shows as loading: the list used to say "No tokens yet." until the
     * answer arrived. A reload after a delete keeps the rows on screen instead of flashing.
     */
    const [isLoading, setIsLoading] = useState(true);

    // A response that arrives after the next reload has started is dropped, so an older
    // list cannot overwrite a newer one. The effect only ever lowers isLoading.
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const list = await api.get("/api/v1/tokens", TokenListSchema);
                if (!cancelled) setTokens(list);
            } catch (e) {
                if (!cancelled) show({ variant: "error", title: "Could not load the tokens", description: getErrorMessage(e) });
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [reloadCount, show]);

    const fetchTokens = () => setReloadCount((n) => n + 1);

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

    return (
        <div className="space-y-6">
            <TokenList tokens={tokens} isLoading={isLoading} deleteToken={requestDeleteToken} />
        </div>
    );
};
