import bcrypt from "bcryptjs";
import * as client from "openid-client";
import { appConfig, getOidcConfig } from "../config/AppConfig.js";
import { logger } from "../core/logger.js";
import { UserRepository } from "../repositories/UserRepository.js";

// State store for PKCE
const authStates = new Map<string, { code_verifier: string }>();

export class AuthService {
    static async initializeAdmin() {
        const userCount = UserRepository.countAll();
        // If no users exist, create a default admin account strictly for initial setup.
        // Password hash is pre-calculated for 'admin'.
        // Auth methods depend on configuration (local only or local+oidc).
        if (userCount === 0) {
            const hashedPassword = bcrypt.hashSync("admin", 10);
            const authMethods = appConfig.oidc?.enabled
                ? "local,oidc"
                : "local";
            UserRepository.create("admin", hashedPassword, authMethods);
            logger.info(
                `Default admin user created (password: admin, allowed: ${authMethods})`,
            );
        }
    }

    static checkLocalAuth(
        username: string,
        password: string,
    ): { user: any; error?: string } {
        const user = UserRepository.findByUsername(username);

        if (user && bcrypt.compareSync(password, user.password_hash)) {
            if (user.auth_methods && !user.auth_methods.includes("local")) {
                return {
                    user: null,
                    error: "Local authentication not allowed for this user",
                };
            }
            return { user };
        }
        return { user: null, error: "Invalid credentials" };
    }

    static getAuthConfig() {
        return { type: getOidcConfig() ? "oidc" : "local" };
    }

    static async generateOidcUrl() {
        const oidcConfig = getOidcConfig();
        if (!oidcConfig) throw new Error("OIDC not configured");

        // Generate PKCE code verifier and challenge for secure authorization.
        // This prevents authorization code interception attacks.
        const code_verifier = client.randomPKCECodeVerifier();
        const code_challenge =
            await client.calculatePKCECodeChallenge(code_verifier);
        const state = client.randomState();

        authStates.set(state, { code_verifier });
        setTimeout(() => authStates.delete(state), 60000);

        return client
            .buildAuthorizationUrl(oidcConfig, {
                redirect_uri: appConfig.oidc!.redirect_uri,
                scope: "openid profile groups email",
                state,
                code_challenge,
                code_challenge_method: "S256",
            })
            .toString();
    }

    static async handleOidcCallback(currentUrl: URL) {
        const oidcConfig = getOidcConfig();
        if (!oidcConfig) throw new Error("OIDC not configured");

        const state = currentUrl.searchParams.get("state");
        if (!state || !authStates.has(state)) {
            throw new Error("Invalid state or session expired");
        }

        const { code_verifier } = authStates.get(state)!;
        authStates.delete(state);

        const tokens = await client.authorizationCodeGrant(
            oidcConfig,
            currentUrl,
            {
                pkceCodeVerifier: code_verifier,
                expectedState: state,
            },
            {
                redirect_uri: appConfig.oidc!.redirect_uri,
            },
        );

        let claims = tokens.claims();
        if (!claims) throw new Error("No claims found");

        if (tokens.access_token) {
            try {
                const userinfo = await client.fetchUserInfo(
                    oidcConfig,
                    tokens.access_token,
                    claims.sub,
                );
                claims = { ...claims, ...userinfo };
            } catch (e) {
                logger.warn({ err: e }, "Failed to fetch userinfo");
            }
        }

        const username = (claims.preferred_username ||
            claims.email ||
            claims.sub) as string;

        // Find user
        let user = UserRepository.findByUsername(username);
        if (!user) {
            throw new Error("User not found");
        }

        if (user.auth_methods && !user.auth_methods.includes("oidc")) {
            throw new Error("OIDC authentication not allowed for this user");
        }

        return user;
    }
}
