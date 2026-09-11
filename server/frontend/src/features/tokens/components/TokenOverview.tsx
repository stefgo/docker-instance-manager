import { useState, useEffect, useCallback } from "react";
import { Token } from "@dim/shared";
import { TokenList } from "./TokenList";
import { apiFetch } from "../../../lib/apiFetch";
import { TokenModal } from "./TokenModal";

export const TokenOverview = () => {
    const [tokens, setTokens] = useState<Token[]>([]);
    const [createdToken, setCreatedToken] = useState<{
        token: string;
        expiresAt: string;
    } | null>(null);
    const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);

    // Declared before the effect that calls it, and memoised so the effect can list it.
    const fetchTokens = useCallback(async () => {
        try {
            const res = await apiFetch("/api/v1/tokens");
            if (res.ok) setTokens(await res.json());
        } catch (e) {
            console.error(e);
        }
    }, []);

    useEffect(() => {
        fetchTokens();
    }, [fetchTokens]);

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

    const generateToken = async () => {
        try {
            const res = await apiFetch("/api/v1/tokens", {
                method: "POST",
            });
            if (res.ok) {
                const newToken = await res.json();
                setCreatedToken(newToken);
                setIsTokenModalOpen(true);
                fetchTokens();
            }
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div className="space-y-6">
            <TokenList
                tokens={tokens}
                deleteToken={deleteToken}
                generateToken={generateToken}
            />

            {isTokenModalOpen && createdToken && (
                <TokenModal
                    token={createdToken.token}
                    expiresAt={createdToken.expiresAt}
                    onClose={() => setIsTokenModalOpen(false)}
                />
            )}
        </div>
    );
};
