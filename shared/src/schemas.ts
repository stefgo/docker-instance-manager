import { z } from "zod";
import {
    ACTIVITY_LEVELS,
    ACTIVITY_SOURCES,
    CLIENT_STATUS,
    CONNECTION_MODE,
    DEFAULT_AGENT_PORT,
    DOCKER_ACTION_TYPES,
} from "./constants.js";
import { normaliseTargetAddress } from "./targetAddress.js";
import { ProjectQuerySchema } from "./projectQuery.js";

/**
 * A single IPv4 address or an IPv4 network in CIDR notation. IPv4 only: addresses are
 * matched by the 32-bit comparison in network.ts, which cannot evaluate an IPv6 value.
 */
export const Ipv4OrCidrSchema = z.union([z.ipv4(), z.cidrv4()], {
    error: "Must be an IPv4 address or an IPv4 network in CIDR notation",
});

/** YAML turns an empty block (`settings:` with nothing below it) into null. */
const blockOrMissing = <T extends z.ZodType>(schema: T) =>
    z.preprocess((value) => value ?? undefined, schema);

/** The levels pino accepts, for both config files. */
export const LogLevelSchema = z.enum([
    "trace",
    "debug",
    "info",
    "warn",
    "error",
    "fatal",
    "silent",
]);

/**
 * Where the certificate and its private key are, for an agent that terminates TLS. The
 * paths stay exactly as the operator wrote them -- the agent resolves them against its own
 * directory and checks at startup that both files can be read.
 */
export const AgentTlsConfigSchema = z.object({
    cert: z.string().trim().min(1, { error: "Must be the path to a certificate file" }),
    key: z.string().trim().min(1, { error: "Must be the path to a private key file" }),
});

/**
 * The whole of the agent's config.yaml -- everything the operator writes, and nothing the
 * agent writes back: `clientId` and `authToken` are issued by the server and live in the
 * agent's data directory (see client/src/core/Identity.ts).
 *
 * Loose at the top level, so a key this version does not know stays a key it ignores rather
 * than a reason not to start. The agent edits the file through its YAML document, never by
 * writing this object back, so nothing here can delete what it did not parse.
 *
 * Every field carries its default, which makes this schema the one place that says what an
 * agent without a config.yaml does. Two settings are deliberately *not* validated here --
 * `logLevel` and `allowSelfSignedCertificates` are tolerated rather than fatal, and Config.ts
 * drops a wrong value with a warning before it reaches this schema.
 */
export const AgentConfigSchema = z.looseObject({
    /**
     * Where the server is, for an agent that dials in. Left unvalidated beyond "a
     * non-empty string": a URL nobody can parse costs the WebSocket, not the web UI the
     * operator would fix it in -- so it is a warning at derivation, not a refusal to start.
     */
    serverUrl: z.string().trim().min(1).nullish(),
    logLevel: LogLevelSchema.default("info"),
    /**
     * The Docker socket to talk to. Left out, the agent auto-detects it, which is what an
     * installation on the usual path wants.
     */
    dockerSocket: z.string().trim().min(1).nullish(),
    enableStatusPage: z.boolean().default(true),
    enableRegisterPage: z.boolean().default(true),
    /**
     * Networks the server may dial `/ws/register` and `/ws/agent` from. Empty means no
     * restriction, as before the setting existed. The local web UI on the same port is
     * deliberately not covered: it is where an operator registers the agent, and a list
     * holding only the server's address would shut them out of it.
     *
     * An entry that is not an address fails as `allowedNetworks.1: ...` -- the index names
     * which one.
     */
    allowedNetworks: z.array(Ipv4OrCidrSchema).default([]),
    /**
     * The port the local web server listens on. Coerced, because `DIM_CLIENT_PORT` is laid
     * over this field as a string. A value that is not a port is refused rather than
     * silently replaced by the default: an agent listening somewhere other than where its
     * operator put it is the harder fault to find. Port 0 -- "any free port" to Node -- is
     * never what this setting means, and the minimum rules it out.
     */
    listenPort: z.coerce
        .number({ error: "Must be an integer between 1 and 65535" })
        .int({ error: "Must be an integer between 1 and 65535" })
        .min(1)
        .max(65535)
        .default(DEFAULT_AGENT_PORT),
    /**
     * Accept a server certificate that does not validate, for registration and for the
     * WebSocket alike. Off by default: that WebSocket carries the auth token, and a
     * certificate nobody checks is one anybody in between can present.
     */
    allowSelfSignedCertificates: z.boolean().default(false),
    /**
     * Serve the agent's own web server over TLS. Absent means plain HTTP, which is what
     * every installation had before this existed. The other half of
     * `allowSelfSignedCertificates`: that one is about the certificate this agent checks
     * when it dials the server, this one about the certificate it presents when the server
     * dials it.
     */
    tls: blockOrMissing(AgentTlsConfigSchema.optional()),
});

export type AgentConfigParsed = z.output<typeof AgentConfigSchema>;

/** The identity the server issues at registration, as the agent stores it. */
export const AgentIdentitySchema = z.object({
    clientId: z.string().min(1),
    authToken: z.string().min(1),
});

export const ClientSchema = z.object({
    id: z.uuid(),
    hostname: z.string(),
    displayName: z.string().optional(),
    status: z.enum(CLIENT_STATUS),
    lastSeen: z.string(),
    version: z.string().optional(),
    connectionMode: z.enum(CONNECTION_MODE).optional(),
    /**
     * Inbound clients only: the address or network their connections must come from, or
     * null when the check is switched off. A plain string here, not Ipv4OrCidrSchema: a
     * client registered from an IPv6 address stores that address.
     */
    inboundAllowedIp: z.string().nullish(),
    /**
     * Inbound clients only: the address the agent last authenticated from. Nothing decides
     * on it -- the server writes it only once the allowed-address check has passed, so it is
     * always an address that was let in. It is here so the client editor can say what
     * `inboundAllowedIp` is about to be measured against, and warn before a value is saved
     * that would refuse the agent at its next reconnect. Not part of UpdateClient: the
     * server observes this, the operator does not set it.
     */
    inboundLastIp: z.string().nullish(),
    outboundTargetAddress: z.string().optional(),
    /**
     * This host's auto-update schedule for everything on it that is not in a project.
     * `null` inherits the default from the settings; an empty string is the host saying it
     * takes part through its projects and nothing else.
     */
    autoUpdateCron: z.string().nullish(),
    /**
     * What the agent on the wire right now says it can do, as it named it in its AUTH
     * payload. `null` while the client is offline: capabilities describe the build that is
     * connected, and an agent updated while it was away must not be credited with what its
     * predecessor could do. An empty list is the other answer entirely -- a connected agent
     * that names nothing. Observed, never set -- hence not part of UpdateClient.
     */
    capabilities: z.array(z.string()).nullish(),
});

/**
 * What an agent sends to `POST /api/v1/register`. It brings no identity of its own: the
 * server issues both `clientId` and the auth token and returns them below.
 */
export const RegistrationPayloadSchema = z.object({
    token: z.string().min(1),
    hostname: z.string().optional(),
});

/** The identity the server issues. The agent stores both values in its config.yaml. */
export const RegistrationResponseSchema = z.object({
    token: z.string(),
    clientId: z.string(),
});

/** A registration token as the list shows it: by its hash, never the token itself. */
export const TokenSchema = z.object({
    /** SHA-256 of the token, hex. Also what `DELETE /api/v1/tokens/:tokenHash` takes. */
    tokenHash: z.string(),
    createdAt: z.string(),
    expiresAt: z.string(),
    usedAt: z.string().optional(),
    /**
     * What the operator fixed when issuing the token, for the client it creates. Absent
     * means the agent's hostname and the address it registers from decide, as before.
     */
    displayName: z.string().nullish(),
    inboundAllowedIp: z.string().nullish(),
});

/**
 * `POST /api/v1/tokens`: the one response that carries the token in the clear. The server
 * stores only its hash, so this is the only time it can be shown.
 */
export const CreatedTokenSchema = z.object({
    token: z.string(),
    expiresAt: z.string(),
    displayName: z.string().nullish(),
    inboundAllowedIp: z.string().nullish(),
});

// WS Payloads schemas

export const AuthPayloadSchema = z.object({
    hostname: z.string(),
    version: z.string().optional(),
    /**
     * What this agent can do, from `AGENT_CAPABILITIES`. Plain strings rather than an enum:
     * an agent of a newer build may name something this server has never heard of, and the
     * list is read by asking whether an entry is in it, never by exhausting it. An agent
     * that predates the field sends none, which is the honest answer for it.
     */
    capabilities: z.array(z.string()).default([]),
});

// REST request bodies
//
// What the HTTP endpoints accept. They exist for the same reason the WebSocket schemas do: an
// unchecked body reaches a repository, the config file or an agent's Docker socket unaltered.
// They live here rather than in the backend so the frontend can derive its types from them.

/** `POST /api/login`. An empty field is a malformed request, not a failed login. */
export const LoginPayloadSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
});

/**
 * A comma-separated list of `local` and `oidc`. The empty string is accepted because the
 * user dialog sends it when no box is ticked, and the controllers read it as "not given".
 */
const AuthMethodsSchema = z
    .string()
    .regex(
        /^((local|oidc)(,(local|oidc))*)?$/,
        'Must be a comma-separated list of "local" and "oidc"',
    );

/**
 * `POST /api/v1/users`. `password` is optional here because an OIDC-only user has none; that
 * a local user needs one is a rule about the combination, checked by the controller.
 */
export const CreateUserSchema = z.object({
    username: z.string().trim().min(1).max(100),
    password: z.string().min(1).optional(),
    auth_methods: AuthMethodsSchema.optional(),
});

/** `PUT /api/v1/users/:userId`. Either field alone is a valid edit. */
export const UpdateUserSchema = z.object({
    password: z.string().min(1).optional(),
    auth_methods: AuthMethodsSchema.optional(),
});

/**
 * Where the server dials an outbound agent, as `host:port`. Transformed rather than only
 * checked, so what reaches the database is the normalised form: the value is interpolated
 * into a `ws://` URL, and a scheme, path or credentials in it would quietly send the agent
 * connection elsewhere.
 */
export const TargetAddressSchema = z
    .string()
    .transform((value) => normaliseTargetAddress(value))
    .refine((address): address is string => address !== null, {
        error: "Must be a host or host:port, without scheme, path or credentials",
    });

/**
 * `POST /api/v1/tokens`. Both fields are optional: a token without them behaves as every
 * token did before they existed -- the agent's hostname names the client, and the address
 * it registers from becomes its allowed address.
 */
export const CreateTokenSchema = z.object({
    displayName: z.string().trim().max(100).optional(),
    inboundAllowedIp: Ipv4OrCidrSchema.optional(),
});

/** `POST /api/v1/clients/outbound`. */
export const CreateOutboundClientSchema = z.object({
    outboundTargetAddress: TargetAddressSchema,
    /**
     * What the server presents on the agent's `/ws/register`: the setup PIN from the agent's
     * log, or the agent's `DIM_REGISTRATION_SECRET`. The agent tells the two apart itself.
     */
    registrationSecret: z.string().min(1),
    hostname: z.string().optional(),
});

/**
 * `PUT /api/v1/clients/:clientId`. Every field is optional, but at least one has to be there.
 *
 * `inboundAllowedIp` has three states on the wire: a value restricts, `null` switches the
 * check off, and an absent key leaves the stored value alone.
 *
 * `outboundTargetAddress` applies to outbound clients only; the controller refuses it for
 * an inbound one, the way it refuses `inboundAllowedIp` for an outbound one.
 */
export const UpdateClientSchema = z
    .object({
        displayName: z.string().optional(),
        inboundAllowedIp: Ipv4OrCidrSchema.nullable().optional(),
        outboundTargetAddress: TargetAddressSchema.optional(),
        /**
         * Three states, like `inboundAllowedIp`: an expression sets this host's schedule,
         * `null` goes back to the default from the settings, and an absent key changes
         * nothing. `""` is a value of its own -- the host then auto-updates only what
         * belongs to a project.
         */
        autoUpdateCron: z.string().trim().nullable().optional(),
    })
    .refine(
        (body) =>
            body.displayName !== undefined ||
            body.inboundAllowedIp !== undefined ||
            body.outboundTargetAddress !== undefined ||
            body.autoUpdateCron !== undefined,
        { message: "Nothing to update" },
    );

/**
 * `POST /api/v1/clients/:clientId/docker/action`. `target` may only be absent for
 * `image:prune`, which acts on the whole host.
 */
export const DockerActionRequestSchema = z
    .object({
        action: z.enum(DOCKER_ACTION_TYPES),
        target: z.string().optional(),
        params: z.record(z.string(), z.unknown()).optional(),
    })
    .refine((body) => body.action === "image:prune" || !!body.target, {
        message: "Required for every action except image:prune",
        path: ["target"],
    });

/** `GET /api/v1/docker/images/check-update`. */
export const ImageUpdateCheckQuerySchema = z.object({
    repoTag: z.string().min(1),
    repoDigests: z.string().optional(),
});

/** `POST /api/v1/settings/container-auto-update/validate-cron`. */
export const ValidateCronSchema = z.object({
    expr: z.string(),
});

/**
 * A count, a number of days or an interval. YAML reads `30` without quotes as a number, and
 * the settings page sends back what it read, so both spellings are accepted and stored as
 * the string the rest of the backend expects.
 */
const WholeNumberSettingSchema = z
    .union([
        z.string().regex(/^\d+$/, "Must be a whole number"),
        z.number().int().nonnegative(),
    ])
    .transform(String);

const BooleanSettingSchema = z
    .union([z.enum(["true", "false"]), z.boolean()])
    .transform(String);

/**
 * `PUT /api/v1/settings/cleanup`.
 *
 * Loose on purpose: the settings page reads the whole block and sends it back, so a key an
 * operator added to config.yaml by hand travels through here on every save. A strict schema
 * would strip it and the save would delete it from the file.
 *
 * `security` is refused. It decides which networks may connect as an agent and whether
 * HSTS is sent, the page never edits it, and it belongs to config.yaml alone -- a stolen
 * session must not be able to lock every agent out.
 */
export const CleanupSettingsSchema = z.looseObject({
    token_retention_days: WholeNumberSettingSchema.optional(),
    token_cleanup_interval_hours: WholeNumberSettingSchema.optional(),
    image_version_cache_ttl_days: WholeNumberSettingSchema.optional(),
    image_version_cache_cleanup_orphans: BooleanSettingSchema.optional(),
    image_version_cache_cleanup_interval_hours: WholeNumberSettingSchema.optional(),
    image_update_check_interval_seconds: WholeNumberSettingSchema.optional(),
    container_auto_update_cron: z.string().optional(),
    container_auto_update_label: z.string().optional(),
    container_auto_update_delay_label: z.string().optional(),
    notification_retention_days: WholeNumberSettingSchema.optional(),
    notification_retention_count: WholeNumberSettingSchema.optional(),
    notification_cleanup_interval_hours: WholeNumberSettingSchema.optional(),
    security: z
        .undefined({
            error: "Configured in config.yaml only, not through this endpoint",
        })
        .optional(),
});

// Agent web UI

/**
 * `POST /api/register` on the agent's own web server. The values decide which server the
 * agent obeys from then on, so the URL has to be http(s) and nothing else.
 */
export const AgentWebRegisterSchema = z.object({
    url: z.url({ protocol: /^https?$/, error: "Must be an http:// or https:// URL" }),
    token: z.string().trim().min(1),
    pin: z.string().trim().min(1),
});

// Server configuration (config.yaml)

/**
 * The `settings` block, with every default the server falls back to. Loose for the same
 * reason CleanupSettingsSchema is: the settings page writes the block back whole, so a key
 * added by hand has to survive. Values are stored as strings, whatever spelling YAML used.
 */
export const AppSettingsSchema = z
    .looseObject({
        token_retention_days: WholeNumberSettingSchema.default("30"),
        token_cleanup_interval_hours: WholeNumberSettingSchema.default("24"),
        image_version_cache_ttl_days: WholeNumberSettingSchema.default("30"),
        image_version_cache_cleanup_orphans: BooleanSettingSchema.default("true"),
        image_version_cache_cleanup_interval_hours: WholeNumberSettingSchema.default("24"),
        image_update_check_interval_seconds: WholeNumberSettingSchema.default("0"),
        container_auto_update_cron: z.string().default(""),
        container_auto_update_label: z.string().default("dim.auto-update=true"),
        container_auto_update_delay_label: z.string().default("dim.auto-update-delay"),
        notification_retention_days: WholeNumberSettingSchema.default("90"),
        notification_retention_count: WholeNumberSettingSchema.default("500"),
        notification_cleanup_interval_hours: WholeNumberSettingSchema.default("24"),
    })
    .prefault({});

/**
 * OIDC. The example config ships the block with empty fields and `enabled: false`, so the
 * fields are only required -- and checked -- once the block is switched on.
 */
export const OidcConfigSchema = z
    .looseObject({
        enabled: z.boolean().default(false),
        issuer: z.string().nullish(),
        client_id: z.string().nullish(),
        client_secret: z.string().nullish(),
        redirect_uri: z.string().nullish(),
    })
    .superRefine((oidc, ctx) => {
        if (!oidc.enabled) return;
        for (const key of ["issuer", "redirect_uri"] as const) {
            if (!z.url().safeParse(oidc[key]).success) {
                ctx.addIssue({
                    code: "custom",
                    path: [key],
                    message: "Required as a URL while oidc.enabled is true",
                });
            }
        }
        for (const key of ["client_id", "client_secret"] as const) {
            if (!oidc[key]) {
                ctx.addIssue({
                    code: "custom",
                    path: [key],
                    message: "Required while oidc.enabled is true",
                });
            }
        }
    });

export const SecurityConfigSchema = z
    .object({
        /** Networks an agent may connect from at all. Empty means no restriction. */
        allowed_networks: z.array(Ipv4OrCidrSchema).default([]),
        /** Send Strict-Transport-Security. Off unless set -- see config.example.yaml. */
        hsts: z.boolean().default(false),
        /**
         * Whether an outbound agent dialled over `wss://` may present a certificate this
         * server cannot verify. Off by default, so a wrong or expired certificate is a
         * failed connection rather than a silent one.
         *
         * It exists because an agent on a home network usually carries a self-signed
         * certificate, and the alternative -- running a CA for a handful of hosts -- is
         * more than that situation warrants. Mirrors `allowSelfSignedCertificates` on the
         * agent, which is the same decision for the other direction of the same link.
         */
        allow_self_signed_agent_certificates: z.boolean().default(false),
    })
    .prefault({});

/**
 * The whole of config.yaml.
 *
 * Loose at the top level: saveConfig() writes the parsed object back into the YAML
 * document, so a strict schema would not only ignore a key an operator added -- the next
 * save would delete it from the file.
 *
 * `jwtSecret` is required although a fresh installation has none: the server generates and
 * saves one before this schema is applied, so a missing value at that point is an error,
 * not a server that signs tokens with `undefined`.
 */
export const AppConfigSchema = z.looseObject({
    jwtSecret: z.string().min(1),
    /** Any span @fastify/jwt accepts. There is no way to switch expiry off. */
    jwtExpiresIn: z.string().min(1).default("12h"),
    logLevel: LogLevelSchema.optional(),
    /**
     * Optional like `logLevel`, and for the same reason: left out it stays DEFAULT_SERVER_PORT,
     * and nothing writes the number into a file the operator never put it in.
     */
    port: z.number().int().min(1).max(65535).optional(),
    oidc: blockOrMissing(OidcConfigSchema.optional()),
    settings: blockOrMissing(AppSettingsSchema),
    security: blockOrMissing(SecurityConfigSchema),
});

export type AppConfigParsed = z.output<typeof AppConfigSchema>;

// WebSocket messages from the server to the agent

/**
 * `DOCKER_ACTION`. The agent checks it before anything reaches Dockerode: this runs on the
 * host with access to the Docker socket, and a server of a different build -- or a message
 * that is simply malformed -- must not turn into a call with undefined arguments.
 *
 * `target` is a string for every action; the server sends "" for image:prune.
 */
export const DockerActionSchema = z
    .object({
        actionId: z.string().min(1),
        action: z.enum(DOCKER_ACTION_TYPES),
        target: z.string(),
        params: z.record(z.string(), z.unknown()).optional(),
    })
    .refine((a) => a.action === "image:prune" || a.target.length > 0, {
        message: "Required for every action except image:prune",
        path: ["target"],
    });

/** `REGISTRATION_REQUEST` on the agent's /ws/register (server dials the agent). */
export const RegistrationRequestSchema = z.object({
    /** The agent's setup PIN or its `DIM_REGISTRATION_SECRET`. */
    secret: z.string(),
    authToken: z.string().min(1),
    /**
     * The id the server files this agent under. Required: the agent presents it together
     * with the token on every later connection, and one half without the other is an
     * identity that cannot connect.
     */
    clientId: z.string().min(1),
});

// WebSocket messages from the agent to the server

/** `DOCKER_ACTION_RESULT`. Resolves the waiting request, so it has to be well-formed. */
export const DockerActionResultSchema = z.object({
    actionId: z.string().min(1),
    success: z.boolean(),
    error: z.string().optional(),
});

/**
 * `DOCKER_UPDATE`, checked for what the server itself reads -- the container fields the
 * auto-updater and the state lookup use, the image tags and digests the update checks
 * iterate. Every object is loose: a newer agent that reports more must not be dropped, only
 * one that reports something the server would trip over.
 */
export const DockerUpdatePayloadSchema = z.looseObject({
    containers: z.array(
        z.looseObject({
            id: z.string(),
            names: z.array(z.string()),
            image: z.string(),
            state: z.string(),
            labels: z.record(z.string(), z.string()).nullish(),
        }),
    ),
    images: z.array(
        z.looseObject({
            id: z.string(),
            repoTags: z.array(z.string()),
            repoDigests: z.array(z.string()),
        }),
    ),
    volumes: z.array(z.looseObject({ name: z.string() })),
    networks: z.array(z.looseObject({ id: z.string(), name: z.string() })),
});

// ── Projects ─────────────────────────────────────────────────────────────────

/**
 * A group of containers DIM carries a setting for, defined by a query over hosts,
 * containers and images (see projectQuery.ts). Membership is never stored -- it is resolved
 * from the containers the agents report -- and a container belongs to one project at most.
 */
export const ProjectSchema = z.object({
    id: z.string().min(1),
    name: z.string().trim().min(1),
    query: ProjectQuerySchema,
    autoUpdate: z.boolean(),
    /**
     * `null` means "inherit", not "off": the schedule then comes from the level above.
     * Auto-update is switched off through `autoUpdate`, never through an empty schedule.
     */
    cron: z.string().nullable(),
    createdAt: z.string(),
});

/** `POST /api/v1/projects`. */
export const CreateProjectSchema = z.object({
    name: z.string().trim().min(1, "A project needs a name"),
    query: ProjectQuerySchema,
    autoUpdate: z.boolean().default(false),
    cron: z.string().trim().nullish(),
});

/**
 * `PATCH /api/v1/projects/:id`. Every field is optional and a missing one is left as it is,
 * which is why `cron: null` (inherit) has to be distinguishable from "not mentioned".
 */
export const UpdateProjectSchema = z
    .object({
        name: z.string().trim().min(1, "A project needs a name").optional(),
        query: ProjectQuerySchema.optional(),
        autoUpdate: z.boolean().optional(),
        cron: z.string().trim().nullish(),
    })
    .refine((p) => Object.values(p).some((v) => v !== undefined), {
        message: "Give at least one field to change",
    });

/** `POST /api/v1/projects/preview`: what a query would match before it is saved. */
export const ProjectPreviewRequestSchema = z.object({
    query: ProjectQuerySchema,
    /** The project being edited, whose own members are not a conflict. */
    excludeId: z.string().optional(),
});

// ── Auto-update policy ───────────────────────────────────────────────────────

/**
 * One project as the policy carries it. `cron` is already resolved -- the agent never sees
 * a `null` here and never has to know the inheritance rules. The query is evaluated by the
 * agent itself, against the host identity the policy carries.
 *
 * Projects with `autoUpdate: false` are in the list too, because a container may take part
 * through its label while still belonging to a project, and the project is what decides
 * *when* it is updated.
 */
export const AutoUpdatePolicyProjectSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    query: ProjectQuerySchema,
    createdAt: z.string(),
    autoUpdate: z.boolean(),
    /** An empty expression means this project has no schedule on this host. */
    cron: z.string(),
});

/**
 * `AUTO_UPDATE_POLICY`. Everything an agent needs to run auto-update on its own, resolved
 * by the server: which label puts a container in, which label delays it, when this host
 * updates what is not in a project, and when each project updates.
 *
 * The agent stores the last one it received and keeps acting on it while the server is
 * away -- that is the whole point of resolving the schedules here rather than shipping the
 * settings and letting every agent reimplement the inheritance.
 */
export const AutoUpdatePolicySchema = z.object({
    /** When the server built this policy. The agent logs it; nothing decides on it. */
    updatedAt: z.string().min(1),
    /**
     * This host as the server knows it. Client criteria of a project query are matched
     * against these values, not against what the agent reads locally, so the agent reaches
     * the same membership the dashboard shows.
     */
    host: z.object({
        hostname: z.string().nullable(),
        displayName: z.string().nullable(),
    }),
    /**
     * The label that enrols a container, and the value it must carry. `labelValue: null`
     * means the mere presence of the key is enough. An empty `labelKey` switches the label
     * route off altogether -- there is then no key to write an opt-out on either.
     */
    labelKey: z.string(),
    labelValue: z.string().nullable(),
    /** The label holding a per-container delay in days. Empty means no delay is honoured. */
    delayLabelKey: z.string(),
    /**
     * This host's schedule for containers that belong to no project. Empty means it has
     * none -- the host then updates only through its projects.
     */
    hostCron: z.string(),
    projects: z.array(AutoUpdatePolicyProjectSchema),
});

// ── Activity ─────────────────────────────────────────────────────────────────

/**
 * What an event is about. Loose on purpose: an agent that knows more about its subject than
 * this build asks for should not have that trimmed off on the way in.
 */
export const ActivitySubjectSchema = z.looseObject({
    containerName: z.string().optional(),
    containerId: z.string().optional(),
    imageRef: z.string().optional(),
    /** The project an auto-update run belongs to, as the agent names it. */
    projectName: z.string().optional(),
    projectId: z.string().optional(),
    /**
     * Every project the event is about, entered by the server when it stores the event: the
     * projects of the container, or of the containers running the image, on that host at
     * that moment. Several for a container in conflict, none for an event about no container.
     */
    projectIds: z.array(z.string()).optional(),
});

/**
 * One thing that happened, as its originator saw it. The originator gives it an id, so
 * delivery may repeat without the event doing so: the server stores it under that id and a
 * second copy changes nothing.
 *
 * None of the three vocabulary fields -- `kind`, `level`, `source` -- may refuse a word it
 * does not know. An agent of another version may report one, and refusing it would throw
 * away an observation nobody can make again. `kind` is therefore a plain string rather than
 * an enum over `ACTIVITY_KINDS`; the dashboard phrases what it recognises and falls back to
 * a generic line for the rest. `level` and `source` stay enums but normalise an unknown
 * value instead of rejecting it -- the readers of those two compare against the known set
 * (`ACTIVITY_LEVELS.indexOf` in the frontend), so a foreign word passed through would read
 * as "below everything" rather than as itself.
 */
export const ActivityEventSchema = z.object({
    id: z.string().min(1),
    /** The originator's clock. The server records its own arrival time separately. */
    occurredAt: z.string().min(1),
    // `ingest` overwrites this with what the connection says anyway, so it must never be
    // the reason an event is refused.
    source: z.enum(ACTIVITY_SOURCES).catch("agent"),
    clientId: z.string().nullish(),
    kind: z.string().min(1),
    // A level this build does not know becomes `info`: visible, and comparable against the
    // levels that do exist. The table has no CHECK constraint, so this enum is the only
    // guard there is.
    level: z.enum(ACTIVITY_LEVELS).catch("info"),
    /** The run or action that caused this, entered by whoever caused it. */
    correlationId: z.string().nullish(),
    subject: ActivitySubjectSchema.nullish(),
    data: z.record(z.string(), z.unknown()).nullish(),
});

/**
 * `ACTIVITY`. A batch, because an agent that was offline has a queue to hand over and one
 * message per event would be a burst of them on every reconnect. `clientId` is not read off
 * the payload: the connection the batch arrives on says whose events these are.
 */
export const ActivityBatchSchema = z.object({
    events: z.array(ActivityEventSchema).min(1),
});

/**
 * The envelope of an `ACTIVITY` batch, without its contents. The server parses the events
 * one by one against `ActivityEventSchema` instead of the whole array at once: an event it
 * cannot read must not take the rest of the batch with it, because an unacknowledged batch
 * is offered again on every connection and the same queue head would block for as long as
 * the agent keeps it.
 */
export const ActivityBatchEnvelopeSchema = z.object({
    events: z.array(z.unknown()).min(1),
});

/** `POST /api/v1/activity/seen`. The events the calling user has seen. */
export const MarkActivitySeenSchema = z.object({
    ids: z.array(z.string().min(1)).min(1),
});

/** `ACTIVITY_ACK`. The ids the server has stored; the agent drops them from its queue. */
export const ActivityAckSchema = z.object({
    ids: z.array(z.string().min(1)),
});
