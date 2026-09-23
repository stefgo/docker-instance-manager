# [1.2.0](https://github.com/stefgo/docker-instance-manager/compare/v1.1.0...v1.2.0) (2026-09-23)


### Bug Fixes

* **activity:** Restore the seen state when marking fails ([dc3b367](https://github.com/stefgo/docker-instance-manager/commit/dc3b36731403e1a9c3380ceab890b877f372d052))
* **activity:** Use the pulse icon for the activity page ([6aed301](https://github.com/stefgo/docker-instance-manager/commit/6aed3019fc649ecab78a5c635f9e0dbc56136247))


### Features

* **activity:** Filter-aware seen handling on the notifications page ([e0734d1](https://github.com/stefgo/docker-instance-manager/commit/e0734d1b0b59133f99913872229c03b15c2e8b6b))
* **activity:** Rename the notifications page to Activity ([de97e6a](https://github.com/stefgo/docker-instance-manager/commit/de97e6a63f7a9c037f5d1b66c5a036330e046e13))
* **activity:** Report the seen state per user ([27112db](https://github.com/stefgo/docker-instance-manager/commit/27112db8b1014c337b58015b5b1e69ac05f11df2))
* **client:** Report the platform of every image and check updates against it ([a6dff25](https://github.com/stefgo/docker-instance-manager/commit/a6dff257289a12c32e40521632e43d5dedc30f87))
* **frontend:** Show images per platform and check only images a container runs ([a6a9dbb](https://github.com/stefgo/docker-instance-manager/commit/a6a9dbbc7bca915ac658479411215ac42edd2171))
* **image-update:** implement resume functionality for image update checks ([3fea179](https://github.com/stefgo/docker-instance-manager/commit/3fea179d8ceb0d9e070cf0d5bce5507903775e29))
* **image-update:** Pause the update checks per registry after a rate limit ([d0f146a](https://github.com/stefgo/docker-instance-manager/commit/d0f146a0b151ed2ac467166cc06cca3c8514894d))
* **images:** add short image reference display for better readability ([4464fa7](https://github.com/stefgo/docker-instance-manager/commit/4464fa7b5944e8596a03e024c237c6ec7c98a1f6))
* **images:** enhance image update checks with error handling and summaries ([79f8e30](https://github.com/stefgo/docker-instance-manager/commit/79f8e30c66441ec20f66ad80012a0c7a877cf9ab))
* **images:** Show the OCI labels of the image an update would bring ([34ba3eb](https://github.com/stefgo/docker-instance-manager/commit/34ba3ebfde4dd7d702ee45613a947c1a4172780a))
* **projects:** add platform column to project images table ([681610f](https://github.com/stefgo/docker-instance-manager/commit/681610fc1a3af09a53611c1776fcbddcafdb9b99))
* **server:** Cache update checks per platform and local image ([ae20afc](https://github.com/stefgo/docker-instance-manager/commit/ae20afc55f8a91bea535312139b0ce51aa5a6474))
* **settings:** add scheduler status box component for run details ([0efc7ce](https://github.com/stefgo/docker-instance-manager/commit/0efc7ce8c445c3372597f90e10e2d27292da0b75))
* **settings:** Persist the state of every server scheduler ([1f37b30](https://github.com/stefgo/docker-instance-manager/commit/1f37b302815fbbe48e6be5e3e1539b3e5a87478d))
* **settings:** refactor scheduler components and update documentation ([43d4d85](https://github.com/stefgo/docker-instance-manager/commit/43d4d8588bb8cadd5e695614dad352bdfb263e7b))
* **shared:** Compare the image built for the local platform when checking for updates ([c472db2](https://github.com/stefgo/docker-instance-manager/commit/c472db2f987e082d46963b60434c50d25c0fca67))
* **tokens:** Store registration tokens as SHA-256 hashes only ([76d5dfc](https://github.com/stefgo/docker-instance-manager/commit/76d5dfcf50adbc5ba6d71be520855600ce337c08))


### Performance Improvements

* **activity:** Broadcast the seen state only when it changed ([1b7b9f2](https://github.com/stefgo/docker-instance-manager/commit/1b7b9f2519e62bbd3a88a1dec25e987d044db513))
* **activity:** Keep the seen state in its own table ([883cf06](https://github.com/stefgo/docker-instance-manager/commit/883cf067943c376e3fed99a99dfaab3aa32be837))
* **activity:** Mark a group seen in one request ([34a0447](https://github.com/stefgo/docker-instance-manager/commit/34a04475e916d7868dbe721f31960b33629b4428))
* **activity:** Push new events as a delta instead of the whole list ([380b795](https://github.com/stefgo/docker-instance-manager/commit/380b795a41be2189fe5fc16b88d80744d2487026))
* **frontend:** Derive the notification badge tone in a store selector ([b93d146](https://github.com/stefgo/docker-instance-manager/commit/b93d14626ec93f93a5655c351cffc7d3be5b7a8d))
* **image-update:** Answer an unchanged image from the HEAD request alone ([f01ebcd](https://github.com/stefgo/docker-instance-manager/commit/f01ebcd0cc99acd851a41874bdcb08a949121bde))


### BREAKING CHANGES

* **tokens:** GET /api/v1/tokens returns tokenHash instead of token, and
DELETE /api/v1/tokens/:tokenHash takes the hash instead of the token.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
* **settings:** The setting retention_invalid_tokens_days is now called
token_retention_days and starts at its default of 30; a value set under the
old name is not carried over. retention_invalid_tokens_count is gone. Both
old keys are removed from config.yaml on startup. The scheduler-status
endpoint and the SCHEDULER_STATUS_UPDATE event have a new shape.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

# [1.1.0](https://github.com/stefgo/docker-instance-manager/compare/v1.0.0...v1.1.0) (2026-09-22)


### Bug Fixes

* Answer 404 when deleting a token that does not exist ([9a8b117](https://github.com/stefgo/docker-instance-manager/commit/9a8b1171a203738614dd513c2ad81a1ad5f2595d))
* Compare the agent's secrets in constant time ([c728521](https://github.com/stefgo/docker-instance-manager/commit/c728521777e8ed6010461ed87614014d42634f5c))
* Record the disconnect time in last_seen ([b6a52cf](https://github.com/stefgo/docker-instance-manager/commit/b6a52cfa32133824ff038edad971e1969b8a2b8a))
* Retry unacknowledged activity and persist the queue on a crash ([b593337](https://github.com/stefgo/docker-instance-manager/commit/b593337ff27a7a2675953188d71f9194f519039a))
* Roll back optimistic activity updates when the request fails ([86d2de6](https://github.com/stefgo/docker-instance-manager/commit/86d2de6786704c596249f24325af2419c4fb4ff2))


### Features

* Ask for the setup PIN in the outbound Add Client wizard ([95251ec](https://github.com/stefgo/docker-instance-manager/commit/95251ec05d14801bd89df403e5b6b9303ddff7db))
* **client:** Close the register page once the agent is registered ([f93fb05](https://github.com/stefgo/docker-instance-manager/commit/f93fb05f851442b7a390963776f8642dae778dc8))
* **client:** Register outbound agents with the setup PIN instead of a config secret ([6b3e57d](https://github.com/stefgo/docker-instance-manager/commit/6b3e57d345a30335a85ac114b79783485174ba7f))
* **client:** Serve only the web routes the configuration calls for ([db3065f](https://github.com/stefgo/docker-instance-manager/commit/db3065f5114dcdcbfdb6928fdf8581784867c1cf))
* Dial outbound agents over TLS ([1eb6fc5](https://github.com/stefgo/docker-instance-manager/commit/1eb6fc59e234aea72bf9719f9a18006ca13a5c05))
* Make the backend port configurable ([762a073](https://github.com/stefgo/docker-instance-manager/commit/762a07344eeb399b0aca5c5714d6f49566f6128b))
* Report a registration the agent could not store ([052ca78](https://github.com/stefgo/docker-instance-manager/commit/052ca78a15c0ecda0d6852e914d88d810412f593))
* Show only the client name in the client list ([14eafc4](https://github.com/stefgo/docker-instance-manager/commit/14eafc49b226b5997865f1c36fe5b7f95e70afe8))


### BREAKING CHANGES

* **client:** A registered agent can no longer be registered again from
its web UI. Delete identity.json from its data directory and restart the
agent; it then prints a new setup PIN.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
* **client:** registrationSecret in the agent's config.yaml is no longer
read; an agent that still has it logs a warning and waits for the setup PIN or
DIM_REGISTRATION_SECRET instead. Agents that are already registered are not
affected.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>

# [1.0.0](https://github.com/stefgo/docker-instance-manager/compare/v0.2.0...v1.0.0) (2026-09-19)


### Bug Fixes

* **dependencies:** update @stefgo/react-ui-components to version 4.1.0 ([8d31e3e](https://github.com/stefgo/docker-instance-manager/commit/8d31e3e7ec56be79b148a43bd3ee2cfb50b2a753))
* Derive every container status in the dashboard and drop the agent's text ([962a530](https://github.com/stefgo/docker-instance-manager/commit/962a5307bf4e687aa4383d7daca0182560932663))
* **frontend:** Call the project row action Delete instead of Remove ([f14dde6](https://github.com/stefgo/docker-instance-manager/commit/f14dde6276dc1328c9adb0e123e5765de0104103))
* **frontend:** Collapse all client details into the expandable header area ([9e02dee](https://github.com/stefgo/docker-instance-manager/commit/9e02dee9d0621b577a5922ffacfc5a6735e039af))
* **frontend:** Collapse all project details into the expandable header area ([b05fadb](https://github.com/stefgo/docker-instance-manager/commit/b05fadb0f2c4d9ee45a975ff4000b1131146aa2f))
* **frontend:** Drop the ID column from the image list ([24b545d](https://github.com/stefgo/docker-instance-manager/commit/24b545db2aa51e378a08c9da114990a2861b10c2))
* **frontend:** Fall back to the hostname for clients with an emptied display name ([5a3de8d](https://github.com/stefgo/docker-instance-manager/commit/5a3de8d15ef3800d8a4af65a748d56d4c6e36480))
* **frontend:** Let the settings tabs fill the width of the card ([bd13bbd](https://github.com/stefgo/docker-instance-manager/commit/bd13bbdcf6622f149a4bbf8fe830bba72139cef3))
* **frontend:** Show only the header for an offline client ([db6979e](https://github.com/stefgo/docker-instance-manager/commit/db6979e38ea56cb3724f8a57f429f5dd0af1ce31))
* **frontend:** Stack the project stat cards on narrow screens ([6ef3baa](https://github.com/stefgo/docker-instance-manager/commit/6ef3baac3f1b33bc9f81af5f052b3d41eb7db2cc))
* **frontend:** Unify wording, pluralisation and confirmations across the UI ([a82ad1e](https://github.com/stefgo/docker-instance-manager/commit/a82ad1e17f9d140ae22ab34a792d235201764d9c))
* **frontend:** Use the entity header on the image page ([4edfde4](https://github.com/stefgo/docker-instance-manager/commit/4edfde4a1e8de56349eb167561e23d677ef7c464))
* Keep the container uptime current between Docker state updates ([0636ed0](https://github.com/stefgo/docker-instance-manager/commit/0636ed00b17745d9f1bcb6206a91d5b0df452cde))


### Features

* **frontend:** Ask before every pull and route all confirmations through useConfirm ([3ad9801](https://github.com/stefgo/docker-instance-manager/commit/3ad9801e501b75c62ed15de268bd8fa7915816c8))
* **frontend:** Drop the Run Auto-Update action from the client list ([f64bb4f](https://github.com/stefgo/docker-instance-manager/commit/f64bb4f6879494be3f34824611b984a94e512253))
* **frontend:** Give the image page an action menu, details and a way back ([83991af](https://github.com/stefgo/docker-instance-manager/commit/83991af108a932055f7b634d792bfa001a24a17b))
* **frontend:** Give the user and token lists search and a list view ([436b54c](https://github.com/stefgo/docker-instance-manager/commit/436b54c6ee5b7cdf331940a0f30e9b5f895fdaff))
* **frontend:** Move the client and project headers to EntityHeader ([13230d4](https://github.com/stefgo/docker-instance-manager/commit/13230d48cbed0760f5bf7c952e5b39593645f90f))
* **frontend:** Open a container's own page from the container list ([bce8a50](https://github.com/stefgo/docker-instance-manager/commit/bce8a50bdcd62da4bfb4a3533dbe58dbf5445b81))
* **frontend:** Report and drive image updates from the project list ([ed090b1](https://github.com/stefgo/docker-instance-manager/commit/ed090b101348fbb77320531a07f242c77ac35c13))
* **frontend:** Save each settings section on its own and keep the open section in the URL ([41c9f5d](https://github.com/stefgo/docker-instance-manager/commit/41c9f5d12eb6fd55430ca1e76a48fb0d1be974c1))

# [0.2.0](https://github.com/stefgo/docker-instance-manager/compare/v0.1.0...v0.2.0) (2026-09-18)


### Bug Fixes

* **activity:** Show no notifications dot before the current user is known ([36d9ef3](https://github.com/stefgo/docker-instance-manager/commit/36d9ef3864c4780d2f4aa22309456334d43dad3a))
* **clients:** Label the client actions menu button for assistive technology ([be4647f](https://github.com/stefgo/docker-instance-manager/commit/be4647f39f7bd012083260d47b1ae45fd7f4ac79))
* **clients:** Report required fields left empty in the add client dialog ([855c849](https://github.com/stefgo/docker-instance-manager/commit/855c849fc59e90c00bb9b605cd0b738ea5b84c86))
* **frontend:** Give the project header the sidebar's project icon ([ecfa56d](https://github.com/stefgo/docker-instance-manager/commit/ecfa56d10b0e9f737aaac61ddbb134f64ba5508e))
* **projects:** Read the query description as a plain sentence ([323a44f](https://github.com/stefgo/docker-instance-manager/commit/323a44fdd7f77caf7b49e7d53f308355656354d2))
* **projects:** replace Boxes icon with Box in ProjectOverview component ([f8e2d93](https://github.com/stefgo/docker-instance-manager/commit/f8e2d93cfaacf332173b5a25a8df3d8a3c94ef25))
* **server:** Accept an activity batch event by event ([3bbeb0b](https://github.com/stefgo/docker-instance-manager/commit/3bbeb0b2b6c554334a4f9b4501dc46a650f2ee7c))


### Code Refactoring

* Drop the manual auto-update list ([9a20c2d](https://github.com/stefgo/docker-instance-manager/commit/9a20c2d7c536505de905156a448bbe72c3ad5b48))


### Features

* **activity:** Add trace level, name the client and search notifications ([59acb73](https://github.com/stefgo/docker-instance-manager/commit/59acb732c10bb3cfadb3ec33891bf8c82f9a44e5))
* **activity:** Colour the notifications badge by unseen warnings and errors ([6b2744c](https://github.com/stefgo/docker-instance-manager/commit/6b2744c8d0aac247c5a882137126f5b0b8278db9))
* Add projects as a management unit on the server ([6099f16](https://github.com/stefgo/docker-instance-manager/commit/6099f16f7e514f39702ed2d4355e27707d953e83))
* **auto-update:** enhance auto-update functionality with toast notifications ([ba1623e](https://github.com/stefgo/docker-instance-manager/commit/ba1623e99fbd735c99a27d26764a371bcce0cfad))
* **client:** Run the configured auto-update autonomously ([b73decf](https://github.com/stefgo/docker-instance-manager/commit/b73decf5aacc5940f668cbf582a5b1ed37014072))
* Configure and observe autonomous agent auto-updates ([38948c0](https://github.com/stefgo/docker-instance-manager/commit/38948c07fa927cbc8cc167729ef6a639ca236385))
* **containers:** add projectName and searchParamKey props to ManagedContainers ([4e3caeb](https://github.com/stefgo/docker-instance-manager/commit/4e3caebd8091f6b97481ab2c2488e3a22ce9df37))
* Distribute the auto-update policy to agents ([6d0e138](https://github.com/stefgo/docker-instance-manager/commit/6d0e138c357ac62b1768c2c516dfabf9f2683b09))
* Enroll containers in auto-update by project ([125dac1](https://github.com/stefgo/docker-instance-manager/commit/125dac18d23fe58fb6b4a32ee505268ef838bc80))
* **frontend:** Add a projects overview and detail page ([6f86c90](https://github.com/stefgo/docker-instance-manager/commit/6f86c9083e35faa6eab501d72b3de79a8096519c))
* **frontend:** Keep a tab's view state across a tab switch ([21fd29e](https://github.com/stefgo/docker-instance-manager/commit/21fd29eddcb566cbe695c9a755b9e26bcba221f7))
* **frontend:** Move the tabs onto the library's tab list ([b51dff6](https://github.com/stefgo/docker-instance-manager/commit/b51dff66df2c5ecd00c5b343e3cef92f7960a927))
* **frontend:** Show the project id and check every host from the clients tab ([1c64587](https://github.com/stefgo/docker-instance-manager/commit/1c6458783676a7dcb8465c1bd435b1be12c60dbc))
* Offer the auto-update schedule only where an agent can run it ([9ee7a86](https://github.com/stefgo/docker-instance-manager/commit/9ee7a860e94a78ced4face85500b28dbdd0538df))
* **projects:** Define projects by a query instead of a Compose project name ([508577d](https://github.com/stefgo/docker-instance-manager/commit/508577d656c5a632ad764acee89f3b8ea5634932))
* **projects:** List a project's images with the containers they run ([dd87024](https://github.com/stefgo/docker-instance-manager/commit/dd87024c49f9d0acc2e86c1f3e7121b450248829))
* **projects:** Make a project's clients tab about updates ([9d60d61](https://github.com/stefgo/docker-instance-manager/commit/9d60d61f38d44f92031030baf4a13e1c8ebbc520))
* **projects:** Move adding a project to its own page with a schedule ([2a2ae86](https://github.com/stefgo/docker-instance-manager/commit/2a2ae866134cf46f5f938d5d55380376de8e97e9))
* **projects:** Show a project's clients with the containers they run ([0b3887d](https://github.com/stefgo/docker-instance-manager/commit/0b3887db84b8fe35479dee142bfada90fe5fd4f8))
* **projects:** Show a project's images per host, with their digest ([57dadd0](https://github.com/stefgo/docker-instance-manager/commit/57dadd0739a54b597945956fa6a699326c3b32fb))
* Report activity as structured events from the agents ([419144d](https://github.com/stefgo/docker-instance-manager/commit/419144d8a9a9acd273fe4fe5f0374cec136b5d16))


### BREAKING CHANGES

* **projects:** The projects table is rebuilt empty, so existing projects have to be
created again. The project endpoints address a project by its id instead of its name.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
* A host whose agent predates autonomous auto-update is no
longer auto-updated once this server is running, because no sweep is left to
do it for the agent. Update the agents first, then the server. The setting
container_auto_update_refresh_check is gone with the sweep and is ignored if
left in config.yaml.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
* Migration 13 legt activity an und loescht notifications ohne
Datenuebernahme. Aus einem fertigen Satz lassen sich kind, level, Subjekt und
Korrelation nicht zurueckgewinnen; Meldungen aus frueheren Versionen werden
nicht uebernommen. Die REST-Routen heissen /api/v1/activity statt
/api/v1/notifications.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
* Containers enrolled in auto-update by hand are no longer
enrolled. They take part again by carrying the auto-update label, or by their
Compose project having auto-update switched on. Existing entries are listed
nowhere after the upgrade, so note them before updating the server.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>

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
