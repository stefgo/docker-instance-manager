import { createContext, useContext } from "react";

export interface AuthContextType {
    token: string | null;
    login: (token: string) => void;
    logout: () => void;
}

// Kept in a JSX-free module of its own: a file that exports the provider *and* this
// hook mixes component and non-component exports, which costs Fast Refresh for every
// consumer of the context. The provider lives in AuthProvider.tsx.
export const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};
