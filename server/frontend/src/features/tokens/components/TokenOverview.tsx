import { useState, useEffect } from "react";
import { Token } from "@dim/shared";
import { TokenList } from "./TokenList";
import { apiFetch } from "../../../lib/apiFetch";

export const TokenOverview = () => {
    const [tokens, setTokens] = useState<Token[]>([]);

    /** Bumped to load the list again after a change; the effect below is the only loader. */
    const [reloadCount, setReloadCount] = useState(0);

    // A response that arrives after the next reload has started is dropped, so an older
    // list cannot overwrite a newer one.
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const res = await apiFetch("/api/v1/tokens");
                if (res.ok) {
                    const list = await res.json();
                    if (!cancelled) setTokens(list);
                }
            } catch (e) {
                console.error(e);
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [reloadCount]);

    const fetchTokens = () => setReloadCount((n) => n + 1);

    const deleteToken = async (tokenStr: string) => {
        try {
            const res = await apiFetch(`/api/v1/tokens/${tokenStr}`, {
                method: "DELETE",
            });
            if (res.ok) fetchTokens();
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div className="space-y-6">
            <TokenList tokens={tokens} deleteToken={deleteToken} />
        </div>
    );
};
