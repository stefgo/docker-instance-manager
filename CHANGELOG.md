# [0.1.0](https://github.com/stefgo/docker-instance-manager/compare/v0.0.5...v0.1.0) (2026-09-12)


### Bug Fixes

* add notificationsCount to useMemo deps so badge updates immediately ([f1c29a5](https://github.com/stefgo/docker-instance-manager/commit/f1c29a5cabb676b9dedf23cd2b5aeceac86eec81))
* **auth:** Memoise login and logout ([07b43f4](https://github.com/stefgo/docker-instance-manager/commit/07b43f459afa8f6c88d74cf34be40e8496f42a69))
* **client:** Name the connection modes from the server's side ([70e683b](https://github.com/stefgo/docker-instance-manager/commit/70e683ba6292b3cb0f0ced769712ef7ef8d7dc3e))
* **client:** Reconnect with backoff and jitter ([7435f6a](https://github.com/stefgo/docker-instance-manager/commit/7435f6a6b8ad9d67ab57abbe03cbee894b613eb9))
* **client:** Tolerate a self-signed server certificate only when configured ([952712e](https://github.com/stefgo/docker-instance-manager/commit/952712e6f6908bf50db17860ad0a59484414aeb8))
* **frontend:** Align a notification's level icon with its first message line ([3eb703f](https://github.com/stefgo/docker-instance-manager/commit/3eb703f106a1e1d5d0a60c0b09906db5fa83fe27))
* **frontend:** Choose colours by role and use the library's controls ([3536777](https://github.com/stefgo/docker-instance-manager/commit/35367777b38b2006a9dce7a6fd099601bdb82031)), closes [#444444](https://github.com/stefgo/docker-instance-manager/issues/444444)
* **frontend:** Draw a container's status dot the way a client's is drawn ([8c63c18](https://github.com/stefgo/docker-instance-manager/commit/8c63c18e7b935b20da90c839e4a0edcd4b434a03))
* **frontend:** Let the Add Client wizard keep the card's own padding ([7023155](https://github.com/stefgo/docker-instance-manager/commit/702315521016ac13c469aae40f674929f6a1a621))
* **frontend:** Say what the Add Client steps are for in plain words ([c112f12](https://github.com/stefgo/docker-instance-manager/commit/c112f121463592c7e854a0d8a06b30a803d056b1))
* hide chevron icon in notifications when no detail is available ([a7e97e9](https://github.com/stefgo/docker-instance-manager/commit/a7e97e971a707aa347ebad71f5cfe73252355921))
* Keep a Pull & Recreate group open for the whole pull ([f1b8043](https://github.com/stefgo/docker-instance-manager/commit/f1b804345fc760b51b076b62ec6b1e534fcdda47))
* preserve comments and structure when modifying config.yaml ([4712247](https://github.com/stefgo/docker-instance-manager/commit/47122477f310cab1829e8eeaa02d06bcb3e50621))
* Send the client id on every outbound agent connection ([f097013](https://github.com/stefgo/docker-instance-manager/commit/f0970139f0035be1a0104e9244a99c7322c9c0dd))
* **server:** Anmeldung auf 10 Versuche je 15 Minuten begrenzen ([33b5517](https://github.com/stefgo/docker-instance-manager/commit/33b551747b9315458855ff9610e3bb8f8c622c2b))
* **server:** Answer a login against an account without a local password with 401 ([341302b](https://github.com/stefgo/docker-instance-manager/commit/341302ba5bfc572d2049923a443348bd5521b1e8))
* **server:** CORS spiegelt keine fremden Origins mehr und Tokens laufen ab ([ebdd161](https://github.com/stefgo/docker-instance-manager/commit/ebdd1616ed99402afad5476bd2a7f7b48d3b56a0))
* **server:** Fail pending Docker actions as soon as the agent disconnects ([23f1a5f](https://github.com/stefgo/docker-instance-manager/commit/23f1a5fce18700db458cb212b3433a1ba556ac98))
* **server:** Hänger beim Anlegen eines Outbound-Clients ([9e483d0](https://github.com/stefgo/docker-instance-manager/commit/9e483d09268923f000d99930d777c0ca1f9a0b49))
* **server:** Heartbeat der WebSocket-Verbindungen an einer Stelle, Ping-Leak behoben ([efa9c3d](https://github.com/stefgo/docker-instance-manager/commit/efa9c3df1533a9d4ffc35d7e84816fe7114255dd))
* **server:** Sicherheitskopfzeilen über helmet ([47005f8](https://github.com/stefgo/docker-instance-manager/commit/47005f831ebb787a37fbb48d15847fe9216d8166))
* **server:** Validate the input of every REST endpoint ([7ef8882](https://github.com/stefgo/docker-instance-manager/commit/7ef88825b8af6eeccf7dda640dfd5b40398bc709))
* update notification badge immediately on mark-seen and delete ([fa9c7ea](https://github.com/stefgo/docker-instance-manager/commit/fa9c7ea8dfb30dd43150e5d1225819b2a30051ee))
* **users:** Keep Cancel in the user dialog from saving the user ([8f35b28](https://github.com/stefgo/docker-instance-manager/commit/8f35b28c0e5e10026b61bafd4f9215ab157d32de))


### Code Refactoring

* **server:** Validate config.yaml against a Zod schema at startup ([7d2e879](https://github.com/stefgo/docker-instance-manager/commit/7d2e8795d2d49bee5238813d35773894ed7ed9da))


### Continuous Integration

* Create versions through an explicit release workflow ([d644796](https://github.com/stefgo/docker-instance-manager/commit/d644796b41c235e58d6091af7548882d0ec9b3b6))


### Features

* Add a health endpoint, container healthchecks and a CI smoke test ([008218b](https://github.com/stefgo/docker-instance-manager/commit/008218b7709d0de087a4c4b2dd5ab608472ccba1))
* add auto-update checkbox to list view and remove unused icons ([2f467e9](https://github.com/stefgo/docker-instance-manager/commit/2f467e9da9dea0e1f9f95eff90f0e4e67661b888))
* add bidirectional WebSocket support with inbound/outbound connection modes ([0038ddc](https://github.com/stefgo/docker-instance-manager/commit/0038ddc2d293e6ce750e90afc9f4eaa96ada24ac))
* Add clients through one wizard for both connection modes ([c7d78eb](https://github.com/stefgo/docker-instance-manager/commit/c7d78eb844a34dee72e006363822aa9e354305ae))
* add configurable web server pages and improved client status page ([6c6eb6a](https://github.com/stefgo/docker-instance-manager/commit/6c6eb6a681f28b10dcc5eca80570635c44331cf2))
* add container auto-update scheduler with label-based filtering ([212c8d3](https://github.com/stefgo/docker-instance-manager/commit/212c8d38fd9dd2b1a79d3440068eb093703d8f0c))
* add container state, status dot and actions to ManagedContainers ([67d85e0](https://github.com/stefgo/docker-instance-manager/commit/67d85e061ef7c3e80aa7a396ee6b45b721ec95ab))
* add image version cache cleanup and wire manual token cleanup ([473aab4](https://github.com/stefgo/docker-instance-manager/commit/473aab47aad0fa121813470ff5263e1ea61b6a0b))
* add per-container auto-update delay via Docker label ([5d05c31](https://github.com/stefgo/docker-instance-manager/commit/5d05c31403e11ac9766d197e4dfe9632de88c8cc))
* add scheduled image update check with WebSocket status updates ([63f97f1](https://github.com/stefgo/docker-instance-manager/commit/63f97f1b37021cd4fc5f7fbcb8f36929e6599e6f))
* Check an agent's client id and token as a pair ([6fa0db8](https://github.com/stefgo/docker-instance-manager/commit/6fa0db8226ce05e2d846a4075a36cc7d93213cb9))
* **clients:** Give the editor Escape and the dialogs a focus trap ([427ed49](https://github.com/stefgo/docker-instance-manager/commit/427ed49ffed9bce33bc62270200a6ed93220799f))
* **client:** Validate messages from the server against Zod schemas ([b7cd51b](https://github.com/stefgo/docker-instance-manager/commit/b7cd51b618ed82e85f90cc20876a8b07ac3c5fb9))
* Drop trusted_networks and make each client's allowed address editable ([3061117](https://github.com/stefgo/docker-instance-manager/commit/3061117a9bc02cdab4e286d98a57c39e43e74900))
* **frontend:** Add a ConfirmDialog with the API of react-ui-components 3.0 ([1acb1d0](https://github.com/stefgo/docker-instance-manager/commit/1acb1d0acb1b7c4d09637341b1b64e14d9a6538b))
* **frontend:** Ask before deleting a client or user and before removing Docker resources ([265f78f](https://github.com/stefgo/docker-instance-manager/commit/265f78fb30545a35752689145dee5a30e41d150b))
* **frontend:** Page the notifications table ([7c794b9](https://github.com/stefgo/docker-instance-manager/commit/7c794b92a49a2099dad521ebb473921ae6b05556))
* **frontend:** Put the client forms on routes and every list search in the URL ([46dd259](https://github.com/stefgo/docker-instance-manager/commit/46dd259548e58b55bb825fb7e423414027fca6ff))
* **frontend:** Route authenticated API calls through apiFetch ([1d01e8a](https://github.com/stefgo/docker-instance-manager/commit/1d01e8a4117b622f0ef13abb6e98354dbeb4e08d))
* improve client status page warnings and text wrapping ([79756d9](https://github.com/stefgo/docker-instance-manager/commit/79756d9f4e4a6d90002f6653daf00d76fcbb682b))
* Make the agent port configurable and the target address editable ([ed306e6](https://github.com/stefgo/docker-instance-manager/commit/ed306e69fb2e65140b6ec007f655f086c6b6ca4d))
* persist notifications in database with seen tracking and auto-cleanup ([2427bc6](https://github.com/stefgo/docker-instance-manager/commit/2427bc67b9ce486e3c9e2ad0358134354c84a464))
* replace auto-update menu entry with inline checkbox in column ([c876ea0](https://github.com/stefgo/docker-instance-manager/commit/c876ea084e8f4727881576a95abc6fcd9283bc50))
* Report a Pull & Recreate as one notification with its steps ([3fb8b04](https://github.com/stefgo/docker-instance-manager/commit/3fb8b0415867ced640df7f891086bb91fb053b7e))
* **server:** Keep the dashboard session in an httpOnly cookie ([9b32119](https://github.com/stefgo/docker-instance-manager/commit/9b321194b6eec3e639ae4ee44e6a5b688295ecd9))
* **server:** Validate messages from agents against Zod schemas ([07ecf2e](https://github.com/stefgo/docker-instance-manager/commit/07ecf2ec05a22e6cb276c9f29d33b7be79901aff))
* track container health status in Docker state ([3bc6b6b](https://github.com/stefgo/docker-instance-manager/commit/3bc6b6bd48876db4fae82bd10ec6b6185b8814ad))
* trigger immediate reconnect for offline outbound clients on reload ([8c922d6](https://github.com/stefgo/docker-instance-manager/commit/8c922d6c300bb6c9c8a1d27b85a8e21b562bc1fc))
* unhandledRejection und uncaughtException in Server und Agent behandeln ([e4a6d26](https://github.com/stefgo/docker-instance-manager/commit/e4a6d26e659f5d735126aba500407f6d9283c899))
* Warn before an allowed address locks an inbound agent out ([091e29b](https://github.com/stefgo/docker-instance-manager/commit/091e29b5fa1e0e8c3130fb7e6550eb1d2eb057d1))


### BREAKING CHANGES

* Server and agents have to be updated together. Inbound
clients keep their registration, their ids already match on both sides.
Outbound clients registered while agents still generated an id of their
own carry a different one and are refused -- add them again, or copy the
id from the dashboard into the agent's config.yaml.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
* footer raises the minor position. A requested run that
produces no release fails. semantic-release pushes the tag over GITHUB_TOKEN,
which starts no workflow, so the release job dispatches build.yml on the tag
and waits for it to pass.

Pushes to main and dev publish the rolling :main and :dev images and nothing
else. latest moves only with a tag without a hyphen, and the version baked into
an image loses the leading v, so it matches the Docker tag and package.json.
The root package.json starts at 0.0.5, the last tag, so the first release
continues from there.

One deviation, found because no release has run in that repository since its
commit-msg hook arrived. The release job runs npm ci, whose prepare script
activates the hook, and the release commit carries the generated notes with
lines longer than commitlint allows. commitlint therefore ignores
chore(release) commits that name a version; without that exception every
release would be rejected at its own commit.

ci.yml reads the Node version from .nvmrc, pins npm to the version in
packageManager, lints the commits of pull requests and leaves main and dev to
build.yml. pre-push now allows dev. The version string is derived in one order
in generate-version.sh and vite.config.js, from the build argument, then the
root package.json with the commit appended between releases, then git. The
server image and the backend build no longer write a VERSION file that
nothing reads.

Checked locally. A semantic-release dry run on main proposes 0.1.0, and 1.0.0
with FORCE_MAJOR. commitlint accepts a generated release commit and still
rejects feat! and a missing type. Both images build with npm 10 from the new
lockfile, the agent reports 1.2.0 from its build argument and the dashboard
bundle carries the same string. The lockfile only gains entries; no existing
package changed its version. The release workflow has not run on GitHub yet.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
* **server:** POST /v1/clients/:id/docker/action answers 503 instead of
504 when the agent disconnects before reporting a result. Server only.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
* **client:** An agent that talks to a server with a self-signed
certificate needs allowSelfSignedCertificates: true in its config.yaml, for
registration and for the connection. Agent only.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
* security.trusted_networks is ignored. An inbound client whose
current address differs from its stored one is refused at its next reconnect;
edit its address or switch the check off in the client editor. The API field
inboundRegisteredIp is renamed to inboundAllowedIp. doc/install.md has the
query to find affected clients. Server and agent stay deployable independently.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
* **server:** A config.yaml with an invalid value no longer starts the
server; the log line names the field to fix. Server only.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
* **server:** Requests that used to be accepted are rejected with 400:
a login without username or password (was 401), a settings update containing
`security` or an invalid value, manual auto-update entries with an empty
container name (were dropped silently). GET /v1/settings/cleanup no longer
returns `security`; it is configured in config.yaml only. On the agent,
POST /api/register answers 400 for a URL that is not http(s), where the
request used to fail later with 500. No protocol change; server and agent stay
deployable independently.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
