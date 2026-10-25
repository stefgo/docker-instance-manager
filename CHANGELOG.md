## [1.9.0](https://github.com/stefgo/docker-instance-manager/compare/v1.8.0...v1.9.0) (2026-10-25)

### New

- **You can see when an agent cannot reach Docker.** An agent whose Docker daemon is stopped
  or whose socket is not mounted used to look like any other connected host, with lists that
  silently stopped changing. The client list now marks it *Docker unreachable*, and the
  client's page says since when, with Docker's own message, how old the lists below are, and
  that actions will fail until Docker is back.
- **A running auto-update shows.** While a host's auto-update is under way, the client list
  shows *Running* in place of its last run, and the client's page says since when.
- **The container and image lists have one row of buttons.** The buttons for picked rows no
  longer sit in a bar of their own between the search and the list; they are in the list's
  header, next to the others. Without a selection, *Check*, *Pull & Recreate* and *Prune*
  act on what the list shows -- with a search or a filter, on the hits alone; once rows are
  picked, on those rows alone. Without a selection, *Pull & Recreate* pulls for every
  container or image shown that has an update. Every button asks first and says how many
  containers or images it is about to reach, and whether that is the whole list, what a
  search or a filter leaves, or the selection -- so a selection left over from earlier is
  never acted on unnoticed. *Start* and *Stop* stay disabled until something is picked. The
  number of picked rows is shown behind the list's title. On a host's image list, *Prune*
  with a search removes only the unused images the search leaves; without one it still
  clears every unused image of the host.
- **A project's tabs pull what they show.** The containers tab of a project showed two
  *Pull & Recreate* buttons, one for the whole project and one for the selection. There is
  one now. The clients and images tabs can pick rows as well: ticking a host or an image
  picks its containers. On every tab, *Pull & Recreate* and *Check* act on the picked
  containers, otherwise on the ones a search or a filter leaves, otherwise on the whole
  project -- the pull always with the choice between only the containers with an update
  and a forced pull of all of them.
- **A bulk action reports in one notification.** Checking a list for updates, pulling,
  starting or stopping the picked rows, pulling a project, pruning images and reloading
  every client now show a single notification with a progress bar that counts the images or
  containers done. It stays when you move to another page, and at the end says what
  happened: *Pulled 12 images*, or *Could not pull 1 of 12 images* with the reasons. A prune
  no longer keeps its dialog open until the last image is gone. Before, the rows' spinners
  were the only sign of progress, nothing said when the action was through,
  and every refusal raised a notification of its own -- twenty, when a registry could not
  be reached.
- **Checking a whole list for updates asks first.** The *Check for updates* button above
  every list -- containers, images, projects, a host's lists, an image's and a container's
  page -- now asks before it checks, like *Prune*, and says how many entries it is about to
  check and whether that is the whole list, only what the search or a filter leaves, or the
  selection. The check button of a single row still checks at once. Every list's button
  reads *Check for updates* again.
- **A new client is there before its agent.** Adding an inbound client now creates it right
  away, under the name you give it, marked *Awaiting registration*; the registration token is
  part of that client. When the token runs out, the client's page issues a new one. The
  *Client Tokens* page and its retention settings are gone -- there is nothing left to tidy
  up.
- **A project can be defined by its Compose project.** A project's query can now ask for the
  Compose project a container was started by (*Compose project is `shop`*), so a stack
  started with `docker compose` joins as a whole, whatever its containers are called. A
  container started without Compose has no Compose project.
- **Where a container comes from in Compose shows.** A container's page names its Compose
  project, its service and the directory it was started from. The container lists -- of the
  fleet, of a host and of a project -- and the project editor's preview have a *Compose
  Project* column that sorts a stack's containers together; in the lists that group a
  container across hosts, it is shown on each host's row. The column takes the place of the
  *Image* column: in the lists of the fleet and of a project the image is now shown in small
  print below each host's name, on a project's clients tab below each container's name, and
  a host's list no longer has a *Configured Image* column. The image is still on the
  container's page, and a search still finds a container by it. Searching the container
  lists finds a container by its Compose project as well.
- **The container lists say when auto-update next looks at a container.** The lists of the
  fleet and of a project have a *Next Auto-Update* column next to *Auto-Update*: how long
  until the schedule the container follows runs on its host -- its project's, or else its
  host's, each as inherited from the default -- with the date and the cron expression in the tooltip. A
  container on several hosts shows the earliest of them; *due* means the time has passed and
  the host has not reported the run yet.
- **The overview says what needs attention.** A new first card shows how the fleet is doing —
  *Healthy*, *Degraded* or *Critical* — and below the cards *Needs attention* lists every
  finding with a link to where it can be dealt with: a host that is offline or cannot reach
  Docker, a container that is dead, restarting, unhealthy or ended with an error, an update that
  failed, a container that matches two projects, an agent too old for the update history, a
  registry paused by a rate limit. Unlike the errors in the activity, a finding is not something
  that happened but something that is so right now: it disappears by itself once its cause is
  gone.
- **A history of container updates.** The overview lists the last updates under *Recent
  updates*, and the new *Updates* page has all of them, with a search and filters. Each entry
  says which container on which host came up on which version — *1.27.2 → 1.27.3* where the
  image carries a version label, the digests where the label stayed the same — and who caused it: the auto-update, *Pull & Recreate* from
  the dashboard, or something outside DIM, such as `docker compose up` or Watchtower. Updates
  DIM carried out that failed are listed with the reason. The history is kept apart from the
  activity, for a year by default (*Settings → Activity History → Update History*).
- **A reinstalled agent keeps its client.** *Re-register Agent* in a client's menu issues a
  token for a client that is already registered. The agent that registers with it takes the
  client over with its settings, projects and history; before, every new registration
  created a new client and left the old one behind.

### Fixed

- **A search finds images without a tag.** Such an image is listed as `<none>:<none>`, but
  searching for `none` on a host's image list or in the image overview found nothing. It now
  finds what the row says.
- **A container in a restart loop reads as one.** Its quick first restarts used to merge
  into one long entry titled *restarted*, although the container had stopped again. The
  activity list now shows the loop as a single row with a count, such as *Container web
  exited with code 1* (9×), however fast Docker restarts it. The restart that began the loop
  says how it ended: *restarted, then exited with code 1*. Entries already recorded are
  shown the same way.
- **Stopping or removing a container on its host is no longer a warning.** A `docker stop`,
  `docker rm -f` or `docker compose down` ends the container with a code such as 143, and
  that used to turn the whole entry, the sidebar dot and the page's starting filter to
  *warning* -- and send it to webhooks as one. The agent now reports the stop signal as well
  (a new event kind, `container.killed`, at level *trace*), and an exit that follows it is
  stored as *info*, everywhere at once. A container that ends by itself is still a warning,
  even if it is removed afterwards. One stopped on its host that did not react in time now
  reads *did not stop in time and was killed*, as it already did when DIM stopped it.
  Entries recorded before keep their level.
- **An agent's self-update reports its outcome where it was asked for.** Whether the agent came
  back on the new release or was rolled back to the old one used to appear as a row of its own,
  while the action or auto-update run that started it already read *completed*. The outcome is
  now part of that row, and a rollback marks it as an error. A self-update that failed before
  it had changed anything used to leave no entry at all; it now reads as rolled back.
- **The client list shows when each host last ran its auto-update.** The *Last Auto-Update*
  column used to stay empty for most hosts: a run that finds nothing to update writes no
  activity entry, and the entries of the runs that did were removed with the activity's
  retention. The agent now reports every run, and the server keeps the time with the host.
  Right after the upgrade the column shows the last run the activity still knows of. The client
  page also shows when the next run is due.
- **Every auto-update run keeps the update indicator current.** A run asks the registry about
  each image it looks at, but only a run that changed something passed those answers on, so
  after a quiet night the indicator still waited for the server's own check. Every run's
  answers now reach it.

### Upgrading

- **Registration tokens issued before the upgrade no longer work.** Add the client again, or
  generate a new token on a waiting client. The `/api/v1/tokens` endpoints are replaced by
  `POST /api/v1/clients/inbound`, and `token_retention_days` and
  `token_cleanup_interval_hours` can be deleted from `config.yaml`.
- **Update the server and every agent together.** Agents now report their status in a new
  form. An agent of an earlier release on this server, or an agent of this release on an
  earlier server, connects and works, but its last and next auto-update run, the *Next
  Check* of its containers and whether it reaches Docker are not shown. Agents older than 1.4 are no longer let in at all.
- **Update the agents before using a Compose project in a query.** An agent of an earlier
  release does not know the criterion and ignores the whole auto-update policy that carries
  it, keeping the one it had before.
- **Update the server before the agents.** The decision whether an exit was asked for moved
  from the agent to the server; a new agent on an old server would report the stops of DIM's
  own actions as warnings until the server follows.
- **The update history starts with the updated agents.** Nothing is carried over from before,
  and an agent of an earlier release reports no updates; the overview names the hosts whose
  agent does not yet.
- The self-update **to** this release is still carried out by the previous agent, so its
  outcome appears as a row of its own one last time.
- An *autoupdate.run* entry no longer carries the registry answers of its run (`checks`). A
  webhook body template that reads them has to do without.

### ⚠ BREAKING CHANGES

* **server:** GET/POST /api/v1/tokens, DELETE /api/v1/tokens/:tokenHash
and POST /api/v1/settings/cleanup/invalid-tokens are removed. Inbound
clients are created with POST /api/v1/clients/inbound, which returns the
client's id and its token; POST /api/v1/clients/:clientId/registration-token
issues a new one. Tokens issued before the upgrade no longer register an
agent.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
* Agents report their status as AGENT_STATUS. Server and
agents have to be updated together.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

### Features

* **backend:** Store the container update history ([a1f783b](https://github.com/stefgo/docker-instance-manager/commit/a1f783b11f51b2947c075ee6845fd82bc984563c))
* **client:** Detect container updates and report them to the server ([c603f86](https://github.com/stefgo/docker-instance-manager/commit/c603f867c63dff566116124891fcc77ab462db55))
* **client:** Report the next run of each auto-update schedule ([4174b1c](https://github.com/stefgo/docker-instance-manager/commit/4174b1c9bb157c3586b6f0f760f51c5c00eadae6))
* **frontend:** Ask before every header check and act on the selection ([747abd6](https://github.com/stefgo/docker-instance-manager/commit/747abd6c7e71eefe1a748fcc3169d76830be00de))
* **frontend:** Drop the image column from the container overview ([4354ece](https://github.com/stefgo/docker-instance-manager/commit/4354ece5de3d468df6611cff3a5262e6b8c702b1))
* **frontend:** Pick rows on a project's clients and images tabs ([ef84d60](https://github.com/stefgo/docker-instance-manager/commit/ef84d6054fef25bb6052f3ae1f5a9522fba1eeaf))
* **frontend:** Prune only the images a search leaves on a host's list ([57c96ca](https://github.com/stefgo/docker-instance-manager/commit/57c96caa526050fb1f689b78e82f19e8c02432ad))
* **frontend:** Pull what a list shows or picks, through one usePull ([2868501](https://github.com/stefgo/docker-instance-manager/commit/286850153a0518ad6c049e980a3ce0b1ea9d7d8c))
* **frontend:** Report every prune in one toast with a progress bar ([6d57f30](https://github.com/stefgo/docker-instance-manager/commit/6d57f3015633c9b21cba2a76b0a8568f0e5a0622))
* **frontend:** Show a container's Compose project ([cd9694c](https://github.com/stefgo/docker-instance-manager/commit/cd9694c38655c1ea83b92aeb4ceb5aeccaf8addf))
* **frontend:** Show the container update history ([2c71d4d](https://github.com/stefgo/docker-instance-manager/commit/2c71d4d8e5d4d46c91c18a24d68651d60fedf568))
* **frontend:** Show the progress of a bulk action in one notification ([9780a13](https://github.com/stefgo/docker-instance-manager/commit/9780a13e2ead1e2bc571622fe528efa2542da3bf))
* **frontend:** Show what needs attention on the overview ([3255e09](https://github.com/stefgo/docker-instance-manager/commit/3255e09615bde1d6ab751845524953226b79841a))
* **frontend:** Show when a container is next checked for an update ([fd369ef](https://github.com/stefgo/docker-instance-manager/commit/fd369ef80f71fdd98c2b62b24a0ea16828278eda))
* Report whether Docker is reachable and an auto-update is running ([12884ad](https://github.com/stefgo/docker-instance-manager/commit/12884ad7da3ca8722318097e01a88f31eab544f7))
* **server:** Store the registration token on its client ([6e6e25d](https://github.com/stefgo/docker-instance-manager/commit/6e6e25d4346b843447159655d5e5f0c8abc0ad41))
* **shared:** Add the container update history schemas and messages ([a99bd19](https://github.com/stefgo/docker-instance-manager/commit/a99bd19c9df65cb83b58e85e8d7c16e8c53e3460))
* **shared:** Let a project query ask for the Compose project ([75d48d9](https://github.com/stefgo/docker-instance-manager/commit/75d48d94385c3dcaad3d8158f5527af5726c0cf0))

### Bug Fixes

* **client:** Report a self-update's outcome in the group that started it ([0edf8cc](https://github.com/stefgo/docker-instance-manager/commit/0edf8ccc3520abb9faf987091c7e13183496e28d))
* **client:** Send the agent's state after every handshake ([bd9a415](https://github.com/stefgo/docker-instance-manager/commit/bd9a4152560f87410d265a1e6d6d2f2a4810f673))
* Decide on the server whether a container exit was asked for ([8f295d4](https://github.com/stefgo/docker-instance-manager/commit/8f295d49489e3821364388169d7edcfc1ea159be))
* Deliver the registry answers of every auto-update run ([4496e1e](https://github.com/stefgo/docker-instance-manager/commit/4496e1e356b80f5cde0d2375479d14833fae65f4))
* **frontend:** Drop the client filter from the update history ([359415c](https://github.com/stefgo/docker-instance-manager/commit/359415ceb2f7b107c6fe25eb27cb6e4c85e4fe7b))
* **frontend:** Find images without a tag by searching for none ([12f014e](https://github.com/stefgo/docker-instance-manager/commit/12f014e5c6f83f218ae595deed367ab5c7438b8f))
* **frontend:** Name the column of the next scheduled run "Next Auto-Update" ([a72894f](https://github.com/stefgo/docker-instance-manager/commit/a72894f9fa780a7789309ab9c62e6c02d9aed9e8))
* **frontend:** Name the first column of the container lists "Container / Client" ([3ec8a32](https://github.com/stefgo/docker-instance-manager/commit/3ec8a3217842bde8e8243e2f0711e2b0bf27cd61))
* **frontend:** Put Check last in a project tab's header ([c7b7cd7](https://github.com/stefgo/docker-instance-manager/commit/c7b7cd7a3a8eb2b2ec7bf460136734a8e55a24f3))
* **frontend:** Show the container name in the regular text color on a project's images tab ([41195d4](https://github.com/stefgo/docker-instance-manager/commit/41195d4c3cb10b4ba6a75d31041c24e8a19fb3eb))
* **frontend:** Show the digests where the version label stayed the same ([2a4c150](https://github.com/stefgo/docker-instance-manager/commit/2a4c15050b9c4cc840a258a87385f235b5e14526))
* **frontend:** Show the image below the name in the container lists ([496422c](https://github.com/stefgo/docker-instance-manager/commit/496422c5e8f73a115892d85101a71e4a0e92c9f0))
* **frontend:** Show the last auto-update with seconds, like the Docker state ([359b7c6](https://github.com/stefgo/docker-instance-manager/commit/359b7c657d3fbb0b937bb1f7edf0ac174c1d71cf))
* **frontend:** Split a crash loop into one activity row per run ([63d2d7f](https://github.com/stefgo/docker-instance-manager/commit/63d2d7f2dbb1e68cbd6cb8e06b03317d940f0240))
* Show when a host last ran its auto-update, even when nothing changed ([3cfb1a0](https://github.com/stefgo/docker-instance-manager/commit/3cfb1a00542402c237d120c28fdad331ac05d982))
* Stop counting a requested container exit as a warning ([ff07508](https://github.com/stefgo/docker-instance-manager/commit/ff07508f5c8edad15f6dc30bbd319e3a4412da38))

## [1.8.0](https://github.com/stefgo/docker-instance-manager/compare/v1.7.0...v1.8.0) (2026-10-18)

### The level of an activity event can be set per kind

Each kind of event in the activity history has a built-in level. It can now be changed in
the settings, under *Activity History*, with one select per kind. A kind can also be set to
"none": such an event is no longer stored and reaches no webhook. The kinds a grouped entry of the list is built from cannot be switched off.

A changed level applies to events from then on; events that are stored already keep theirs.

### An auto-update run names the containers it updated

The event that closes an auto-update run now lists the containers the run recreated, each with
its image, and the ones it failed on, each with the error. A webhook on `autoupdate.run` can
therefore send one message per run that says what was updated — the webhook guide has a
template for it. Until now the event carried the counts only.

### Reload clients at once

The client list has a Reload button next to Add Client. It asks every client the list shows
for its current Docker state, and dials those of them that are offline and that the server
connects to — all of them, or only the hits while the search narrows the list. The reload
of a single client has moved out of the row's menu and is now a button in the row itself.

A new column, *Docker State*, shows when each client last reported its state, so a reload
can be seen to have arrived.

### Filter the image list by update status

The image list has the same update filter as the container list, next to its search: *has
update*, *up to date* or *not checked*. It keeps the images with that status and the
repositories and tags they belong to. The filter is kept in the address, so a filtered list
can be bookmarked or shared.

### Buttons say what they act on

A list's buttons used to change what they did once rows were ticked: Check for updates
checked everything until something was selected, and only the selection from then on. They
now have two places:

- **The buttons above a list** act on what the list shows. They say so in their label:
  *Check all* while nothing narrows the list, *Check shown* while a search or a filter does.
  A check with a filter set therefore checks only the hits — before, it checked everything,
  whatever the list showed. The same goes for Prune in the image lists and for Reload in the
  client list. The Prune of a single host's images still removes every unused image on that
  host and is labelled *Prune all*.
- **A bar between the search and the rows** holds what acts on the ticked rows: Pull &
  Recreate, Start, Stop and Check in the container list, Pull & Recreate, Check and Prune in
  the image list. It is always there, says how many rows are ticked, and its buttons line up
  under the ones above.

### An agent reads its host's state once for a burst of changes

An agent used to read the complete Docker state of its host for every single Docker event.
Starting a stack of ten containers made it read that state some thirty times within seconds,
all at once, and the dashboard could be left showing an older state than the last one. The
agent now reads one state at a time and answers everything that happened meanwhile with a
single further read.

### A break in Docker's event stream no longer leaves a gap

An agent learns of changes on its host from Docker's event stream. When that stream broke —
for instance because the Docker daemon was restarted — the agent listened again a few seconds
later but did not look at what had changed in between. The dashboard kept showing the state
from before the break until something else happened on the host, and whatever had happened
meanwhile never reached the activity history or a webhook.

The agent now reports the state as soon as it is listening again, and asks Docker for the
events it missed. They appear in the activity history at the time they happened, and their
webhooks are called late; `event.occurredAt` tells when. Docker keeps only its latest events
and none from before its own restart, so after a long break or a restart of the daemon some
events stay lost. The state is correct again in every case.

Several events arriving from Docker at the very same moment could also be dropped
altogether. They are now all read.

### A container in a restart loop no longer floods its activity entry

When an event repeats, the activity history shows it once with a count, and the expanded
entry listed when else it happened. For a container that keeps restarting this list ran to
hundreds of dates. Up to five repeats are still listed one by one. More are summed up: the
latest three, how many more there were, since when, and about how often it happened.

### The agent's own pages use the project's colour

The register page and the status page an agent serves showed their button and highlights in
orange. They now use the same blue as the rest of the application.

### Wrapped text in tables sits closer

Text that wraps onto a second line in a table cell now sits as closely as text anywhere else
in the application; its lines were further apart than the text's size called for. Rows of a
single line are a little lower than before.

### A click beside a checkbox no longer opens the row

In a list whose rows can be ticked, a click that just missed the checkbox used to open the
row. The space around the checkbox now belongs to it: a click there neither opens the row
nor ticks it.

### Labels in the list view line up

In the list view, which shows each row as a card of labels and values, every value of a
row now starts at the same edge. A long label wraps instead of pushing its value aside, so
on a narrow screen it no longer runs out of the row.

### Upgrading

Nothing has to be done on the server. What is new in the agent — the list of containers of
an auto-update run, and how it reads and reports its host's state — applies to a host once
its agent is updated. The webhook templates behave as before; their engine now comes from
a package the stefgo projects share.

The list of containers comes from the agent, so a host reports it once its agent is updated.
A run of an older agent arrives without the list, and a template that loops over it sends
nothing for that run.

### Features

* **activity:** Make the level of each event kind configurable ([8961fd8](https://github.com/stefgo/docker-instance-manager/commit/8961fd89ffc826de9db63b3848793c98d661561e))
* **client:** Report the containers an auto-update run updated ([36e43c1](https://github.com/stefgo/docker-instance-manager/commit/36e43c174d81bc84dd2e9a7dae40dc1d80c2d879))
* **clients:** Reload all clients from the list's header ([14dc260](https://github.com/stefgo/docker-instance-manager/commit/14dc2605e240454dfd2bee73572f8e50354f3d11))
* **clients:** Show when a client last reported its Docker state ([516ddfd](https://github.com/stefgo/docker-instance-manager/commit/516ddfd9cdd0673cdb113784b360f3aaba99ae09))
* **deps:** add @stefgo/js-template-engine version 1.0.0 ([8b3a1d6](https://github.com/stefgo/docker-instance-manager/commit/8b3a1d6725a673fdbea971c6178e86f414b5e9dc))
* **frontend:** Let a list's buttons say whether they act on all rows or the shown ones ([d8a6efb](https://github.com/stefgo/docker-instance-manager/commit/d8a6efb0cb1944603f1b62728be83ec6777f5c12))
* **images:** Filter the image list by update status ([3d2ea3f](https://github.com/stefgo/docker-instance-manager/commit/3d2ea3fc37d5037f03c8478a76aa1b02326a528b))

### Bug Fixes

* **activity:** Sum up long runs of repeats instead of listing every date ([0ecb0b1](https://github.com/stefgo/docker-instance-manager/commit/0ecb0b1448ba77932908778345e6761b2955d999))
* **client:** Report the Docker events missed while the event stream was down ([c653538](https://github.com/stefgo/docker-instance-manager/commit/c653538884ecaa6d5fb1d2c2356aa010d2896c21))
* **client:** Report the Docker state again after the event stream broke ([a510639](https://github.com/stefgo/docker-instance-manager/commit/a5106395f1b681e1c62fc11421ad2016109b066b))
* **client:** Use the project's primary colour on the agent's pages ([d4faa4b](https://github.com/stefgo/docker-instance-manager/commit/d4faa4b9c4069e1ec1b46d352ac778caaeadcfb0))
* **compose:** correct image names for dim-server and dim-client ([b207f82](https://github.com/stefgo/docker-instance-manager/commit/b207f826189712a361412b681a6a4b461e5e7f49))
* Update the UI library so wrapped table text sits 20px apart ([6b9763e](https://github.com/stefgo/docker-instance-manager/commit/6b9763e4bf30d99b24c98d841fa1cb1c5c7a93e0))
* Update the UI library to 4.10.0 ([2697436](https://github.com/stefgo/docker-instance-manager/commit/26974367b1397f992662450d234516796ef5ccba))

### Performance

* **client:** Read one state snapshot for a burst of Docker events ([f347e21](https://github.com/stefgo/docker-instance-manager/commit/f347e21a799d9fbae4a35aa27ebecf6658f39877))

### Dependencies

* **deps:** bump the npm_and_yarn group across 1 directory with 3 updates ([#10](https://github.com/stefgo/docker-instance-manager/issues/10)) ([7c471ea](https://github.com/stefgo/docker-instance-manager/commit/7c471ead202640d74b259df111b42e7c2c555156))
* **deps:** Drop unused packages and update minor and patch versions ([aaf8621](https://github.com/stefgo/docker-instance-manager/commit/aaf8621d3f657598aca4ddb46e42e76f6a0fae89))

# [1.7.0](https://github.com/stefgo/docker-instance-manager/compare/v1.6.0...v1.7.0) (2026-10-10)


### Bug Fixes

* **backend:** Exit within the stop grace period on SIGTERM ([5787cf0](https://github.com/stefgo/docker-instance-manager/commit/5787cf031da767cf758cfdc818695f3e6de1f984))
* **client:** Recreate a container that shares another one's network ([fd21cab](https://github.com/stefgo/docker-instance-manager/commit/fd21cabda5c99e1dbd6e465a0660bda6b824fc36))
* **client:** Report an action refused during a self-update as info ([9c9c638](https://github.com/stefgo/docker-instance-manager/commit/9c9c638dfd9249acb7ffb708b98a0e70d805f471))
* **client:** Report an exit the agent asked for as a step, and the outcome last ([a748dd7](https://github.com/stefgo/docker-instance-manager/commit/a748dd78be755ce49a1bfc74991e0bbfb3161af6))
* **client:** Ship the font with the agent's pages ([6071284](https://github.com/stefgo/docker-instance-manager/commit/60712843230f3a4c45bff76e08f5a635d21bf5b7))
* **client:** Sync data files and set a damaged identity aside ([0dfd92c](https://github.com/stefgo/docker-instance-manager/commit/0dfd92cd39479a1403e40d2118d18a7cc0f834cc))
* **docker:** Build the agent on the Node image and restrict its container ([473cf03](https://github.com/stefgo/docker-instance-manager/commit/473cf03a9d1598cf070f551a2e5ba2991e00e370))
* **docker:** Report a host that refuses an action ([cf96302](https://github.com/stefgo/docker-instance-manager/commit/cf96302d42f942ef89f931450ad678e1d0f8a9a9))
* **frontend:** Ask before leaving a changed client ([5bc544a](https://github.com/stefgo/docker-instance-manager/commit/5bc544ab9cddf3278f52d03c17907d9c2e65e1fb))
* **frontend:** Ask before leaving a changed project ([6890d11](https://github.com/stefgo/docker-instance-manager/commit/6890d11df424f6868fe89d7571c31b8939b78c08))
* **frontend:** Ask before leaving a changed webhook ([a853758](https://github.com/stefgo/docker-instance-manager/commit/a8537586c0414b1428d424aaa474c2785d7c648c))
* **frontend:** Ask before leaving unsaved settings ([05e39f5](https://github.com/stefgo/docker-instance-manager/commit/05e39f5941cea7fd43d1f0cbdab8b7209c70c015))
* **frontend:** Check a user at the field before sending ([d4f3c6a](https://github.com/stefgo/docker-instance-manager/commit/d4f3c6aa073fe9eb9b589a55e4f0b917b3e1230b))
* **frontend:** Check every response and show the server's reason for a refusal ([fd2913a](https://github.com/stefgo/docker-instance-manager/commit/fd2913a8e3c2b77e5d6c2afa2a817da58316cfc9))
* **frontend:** Drop the monospace font from the cron badge ([161c22b](https://github.com/stefgo/docker-instance-manager/commit/161c22bfb01500f5649fcffd15550637e009291b))
* **frontend:** Format dates in the browser's locale ([958f680](https://github.com/stefgo/docker-instance-manager/commit/958f6808f3fff62c4c886ec8a49395811b172db3))
* **frontend:** Keep a pushed list over the answer that was under way ([9ca791f](https://github.com/stefgo/docker-instance-manager/commit/9ca791f9f1dadf53d8cc4fe1ed5b1678e3301a31))
* **frontend:** Limit the row click in a project's lists to container rows ([f5f89e6](https://github.com/stefgo/docker-instance-manager/commit/f5f89e62e680f4fcb12c48c1e085a396ff0992e7))
* **frontend:** Name every update status and the check button ([9e92bef](https://github.com/stefgo/docker-instance-manager/commit/9e92bef7ad79e8f2534c3e5a9342bc7f97d7005c))
* **frontend:** Read an untagged image the same way in every list ([a779c8f](https://github.com/stefgo/docker-instance-manager/commit/a779c8f156aa47f4b5279abfff0f6b02550a8370))
* **frontend:** Say on the page of an offline client why it is empty ([7d9afe7](https://github.com/stefgo/docker-instance-manager/commit/7d9afe778e2afe82fef12bbea9cd094833119783))
* **frontend:** Show a project's container count in the primary text colour ([3d3e2c9](https://github.com/stefgo/docker-instance-manager/commit/3d3e2c912d1cd2c18093c954214e27be2a465645))
* **frontend:** Show the creation date of an image instead of 1970 ([d8ad82e](https://github.com/stefgo/docker-instance-manager/commit/d8ad82e6f838ac825aaf301d17576aae870ee824))
* **frontend:** Show the digest of a project image in the row's font ([7265af5](https://github.com/stefgo/docker-instance-manager/commit/7265af538b9420a5d6f5742ba07eb8b43ebba8f5))
* **frontend:** Tell an empty list from a search without a hit ([938e837](https://github.com/stefgo/docker-instance-manager/commit/938e837abbd76a282f3207e166675416024a4e93))
* Ship the font instead of loading it from Google ([2195603](https://github.com/stefgo/docker-instance-manager/commit/2195603074f7468a34fb6dc869699d28a9a0d52d))


### Features

* **frontend:** Act on several images at once from the images header ([2d1f8e2](https://github.com/stefgo/docker-instance-manager/commit/2d1f8e2a2a6448a637f2cf7a38f6d21a45e90f7c))
* **frontend:** Filter the container list by state and update status ([e44978d](https://github.com/stefgo/docker-instance-manager/commit/e44978d1dab78f59c3177fcdb18c744dad16b5a9))
* **frontend:** Focus the search of the open list with the slash key ([80153f9](https://github.com/stefgo/docker-instance-manager/commit/80153f99e92ce585dfecd81ad5e34631e38caeaa))
* **frontend:** Fold the lifecycle events of a container into one activity row ([88f73a3](https://github.com/stefgo/docker-instance-manager/commit/88f73a36f435c455ee4273dba2b7064d0dd00ca7))
* **frontend:** Keep the selection's actions next to the check in the containers header ([2a7e968](https://github.com/stefgo/docker-instance-manager/commit/2a7e968e55542c4d9024655ff03a26a3bd3b13f1))
* **frontend:** Link the chips of an activity row and label its filters ([ffddddf](https://github.com/stefgo/docker-instance-manager/commit/ffddddfdc6e5860793cdf577da4b79e741493b33))
* **frontend:** Make the trees, the activity list and the navigation fit a phone ([47000a6](https://github.com/stefgo/docker-instance-manager/commit/47000a6afb05c4bc575f1ddde35f81a23e11e44d))
* **frontend:** Name on the overview what needs attention ([f867c6c](https://github.com/stefgo/docker-instance-manager/commit/f867c6c2e2c6fc6056c71a985f73c138642d707a))
* **frontend:** Name the open page in the browser tab ([4871e74](https://github.com/stefgo/docker-instance-manager/commit/4871e74f53cb9b3edd68e4cb1682855959f701cf))
* **frontend:** Open a container's instance from a project's client and image lists ([3c52699](https://github.com/stefgo/docker-instance-manager/commit/3c526994c1ad02b734c219911a4965e8c77967cf))
* **frontend:** Open on an overview of the fleet ([a2ebe58](https://github.com/stefgo/docker-instance-manager/commit/a2ebe5893aefe71d0bf2d6b6bd26a431a1752048))
* **frontend:** Reduce the overview to its four count cards ([f7a1cdd](https://github.com/stefgo/docker-instance-manager/commit/f7a1cdd9eda591be8fed6e07e1cf13acb63e063d))
* **frontend:** Select several containers and act on them at once ([a192150](https://github.com/stefgo/docker-instance-manager/commit/a19215068875e3e4d8dca833de4a30c578f94eaf))
* **frontend:** Show a banner when the connection to the server is lost ([febe61d](https://github.com/stefgo/docker-instance-manager/commit/febe61d9880b6aa5bf7f7de0831b8bd48ee73052))
* **frontend:** Show a breadcrumb as the heading of every page below a list ([b42fe00](https://github.com/stefgo/docker-instance-manager/commit/b42fe009f11d3dcc72cf11de48f6511ad34e620d))
* **frontend:** Show relative times and offer Restart across all hosts ([5349859](https://github.com/stefgo/docker-instance-manager/commit/5349859b0a296d3315ddc9b4cb482544193e8b8b))
* **frontend:** Show repeated activity rows as one row with a count ([ef944dd](https://github.com/stefgo/docker-instance-manager/commit/ef944dd04209e36e0197f37611a62d2f766be018))
* **frontend:** Show the online status as a badge and use one badge size ([d7438a3](https://github.com/stefgo/docker-instance-manager/commit/d7438a3c521c0d8ba3ad6ffd2ce27fc27e1119d6))
* **frontend:** Show version, capabilities and last auto-update in the client table ([d768c1a](https://github.com/stefgo/docker-instance-manager/commit/d768c1a2f6af7b1daa74fb5eb1bc6c29279028ed))
* **webhooks:** Add a truncate filter to the body template ([c5b2c8a](https://github.com/stefgo/docker-instance-manager/commit/c5b2c8a958b8ed0d86c2a61e748e82ff5d3fee23))

# [1.6.0](https://github.com/stefgo/docker-instance-manager/compare/v1.5.0...v1.6.0) (2026-10-03)


### Bug Fixes

* **agent:** Check arbitrary server URLs only during registration ([c4d7162](https://github.com/stefgo/docker-instance-manager/commit/c4d716284085e4449a23ebc7ad5ebf915bd15cc5))
* **auth:** End a user's sessions when the user changes or is deleted ([af0afb9](https://github.com/stefgo/docker-instance-manager/commit/af0afb977173c454cb09735637eb22ca21c4b6c1))
* **deps:** Update fastify to 5.12.5 ([8a3f0d0](https://github.com/stefgo/docker-instance-manager/commit/8a3f0d002d15428f70c61f1709f34529a088381a))
* **docker:** Run the server process as an unprivileged user ([5172d80](https://github.com/stefgo/docker-instance-manager/commit/5172d8071cb73d2d886622b62f3c6ed594442600))
* **image-update:** Do not follow registry redirects to private addresses ([b64ba84](https://github.com/stefgo/docker-instance-manager/commit/b64ba8463ba18d1668401096c873aeb23e6f6111))
* **security:** Store agent tokens protected ([df6140a](https://github.com/stefgo/docker-instance-manager/commit/df6140ac0906368db1dc4d2d1423e289e2700be7))
* **security:** Trust forwarding headers only from configured proxies ([3b3b56d](https://github.com/stefgo/docker-instance-manager/commit/3b3b56df68b0615fe2e9479dbe80bcaba4ac9fac))


### Features

* **activity:** Show the event kind as a badge in the activity log ([0f40814](https://github.com/stefgo/docker-instance-manager/commit/0f408146ed667f72661378a98dfdea79a8cc2634))
* **config:** Warn about unknown keys in config.yaml at startup ([1990910](https://github.com/stefgo/docker-instance-manager/commit/1990910ad6c9b4bdcee92533c7e8d9f859160bf5))
* **webhooks:** Report activity events to external services with a JSON template ([e526b3a](https://github.com/stefgo/docker-instance-manager/commit/e526b3adb1fd1c81706fefd0be8ae082b6fd5aae))


### BREAKING CHANGES

* **security:** X-Forwarded-* headers are ignored unless the peer is
listed in security.trusted_proxies or DIM_TRUSTED_PROXIES. Installations
behind a reverse proxy must list it; otherwise every request appears to
come from the proxy, new clients are bound to the proxy's address, and
the session cookies lose their Secure flag behind a TLS-terminating one.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

# [1.5.0](https://github.com/stefgo/docker-instance-manager/compare/v1.4.0...v1.5.0) (2026-09-30)


### Bug Fixes

* **activity:** Let the agent report the outcome of an action ([dd35e2a](https://github.com/stefgo/docker-instance-manager/commit/dd35e2a906150dafdb679c234e621e92bae2ce05))
* **client:** Defer the agent's self-update until no other work is running ([0244df1](https://github.com/stefgo/docker-instance-manager/commit/0244df18d534a6343b07d2ec8a3968cab5628d7f))
* **client:** drop stale activity events before sending ([97e65f1](https://github.com/stefgo/docker-instance-manager/commit/97e65f1663fa41f9e58e95b4dfd469463b6269c8))
* **dependencies:** update @stefgo/react-ui-components to version 4.3.1 ([5efbfb1](https://github.com/stefgo/docker-instance-manager/commit/5efbfb1c4b43e91528f88982b6cae7004cab3498))


### Features

* **client:** Roll the agent back when its self-update fails ([8a074ba](https://github.com/stefgo/docker-instance-manager/commit/8a074bae6ecdb8dc8f59379bac341c6c38b8a363))

# [1.4.0](https://github.com/stefgo/docker-instance-manager/compare/v1.3.0...v1.4.0) (2026-09-26)


### Bug Fixes

* **clients:** Drop the client ID from the client list ([ea80f62](https://github.com/stefgo/docker-instance-manager/commit/ea80f6263defae6ac6a20025a6ccc23446e4ceb1))
* **clients:** Move the client ID from the editor header into the form ([72b145d](https://github.com/stefgo/docker-instance-manager/commit/72b145da7e08767fac915abc9e2667ae1a3e17f2))
* **containers:** Left-align the auto-update source in container tables ([8abc0f2](https://github.com/stefgo/docker-instance-manager/commit/8abc0f2b1ff6bf3239d2ce4a48c0ee2d9ce4e33b))
* **images:** Compare the age of image update checks as a timestamp ([f6ed6d8](https://github.com/stefgo/docker-instance-manager/commit/f6ed6d80c305119ac70e2f070f411424c3a14622))
* **projects:** Left-align the containers column in project tables ([b84f626](https://github.com/stefgo/docker-instance-manager/commit/b84f6264fb4dbd3454f0e0ee62a4f4aa6fd370c3))
* **projects:** Show IDs, images and queries in the regular font ([1038a7b](https://github.com/stefgo/docker-instance-manager/commit/1038a7b99e67879ee3535981a6cf8b6dbe185ed2))
* **scheduler:** Keep the first planned run of a scheduler across restarts ([fa7f5c8](https://github.com/stefgo/docker-instance-manager/commit/fa7f5c8dde64eae45855b6d4e9d7bf50112937d5))
* **tokens:** Compare token expiry as a timestamp, not as text ([7f50269](https://github.com/stefgo/docker-instance-manager/commit/7f50269ad540690c2719377a9fe197cdf6f6b2bc))


### Features

* **clients:** Show the time zone each agent runs its schedules in ([bdebc2b](https://github.com/stefgo/docker-instance-manager/commit/bdebc2b23f5a3fe2ff4c4fa475c5a2eb8accf453))

# [1.3.0](https://github.com/stefgo/docker-instance-manager/compare/v1.2.0...v1.3.0) (2026-09-26)


### Bug Fixes

* **activity:** Name the container a requested action is aimed at ([c9e893f](https://github.com/stefgo/docker-instance-manager/commit/c9e893fcfb84e2738c4cd26b7a3690e4251fbab8))
* **client:** Correlate image pull events with the action that pulled them ([613acbf](https://github.com/stefgo/docker-instance-manager/commit/613acbf16dbe01f544197f4c45573725370cb40e))
* **client:** Group the first health status after a start with its action ([d961390](https://github.com/stefgo/docker-instance-manager/commit/d961390f169eeff3fe5178720c1fec8101b54190))
* **deps:** Update @stefgo/react-ui-components to 4.1.1 ([71c34a9](https://github.com/stefgo/docker-instance-manager/commit/71c34a9d90869feabb884d7f41679f62bbfa21f9))
* **deps:** Update @stefgo/react-ui-components to 4.2.0 ([dfbd9e4](https://github.com/stefgo/docker-instance-manager/commit/dfbd9e4d941908da83ba50787c1045be9292fce4))
* **docker:** Let the health checks follow the port and scheme actually served ([8ec3c0a](https://github.com/stefgo/docker-instance-manager/commit/8ec3c0aef2a28e5e9479f70e75a4d16821bebb37))
* **frontend:** Label the update status column "Up-to-date" ([2de41a7](https://github.com/stefgo/docker-instance-manager/commit/2de41a7125874480d4705053528743ad34a676c6))
* **images:** remove unnecessary 'mono' property from digest label ([d2ec532](https://github.com/stefgo/docker-instance-manager/commit/d2ec532df096bae65a8b8463f8aee89f03d0145e))
* **server:** Reload the SPA when a chunk from a previous deploy is gone ([9dd7f25](https://github.com/stefgo/docker-instance-manager/commit/9dd7f2598203c93628475e4e052dd88d497b7b14))
* **update:** Split pull and recreate so updates touch only their containers ([97ab5e2](https://github.com/stefgo/docker-instance-manager/commit/97ab5e28602d6ea03cfe766135f92d1a81d4a552))


### Features

* **activity:** Record the projects an event is about ([9092e8c](https://github.com/stefgo/docker-instance-manager/commit/9092e8c0d24f99d6d5524a14e563b82005b6669f))
* **clients:** Check all containers from the client's container list header ([3e30372](https://github.com/stefgo/docker-instance-manager/commit/3e3037243615d67422ebd4ff75d6cacc462ee709))
* **clients:** Check and pull image updates from the client's image list ([3327535](https://github.com/stefgo/docker-instance-manager/commit/33275353cde632cd0a1ee615e3db9979e3197633))
* **clients:** Check and pull updates from the client's container list ([1bf4ea2](https://github.com/stefgo/docker-instance-manager/commit/1bf4ea252cae850fb25c1d1ffe87b25449eb51d4))
* **clients:** Drop the ports column from the client's container list ([cb3c697](https://github.com/stefgo/docker-instance-manager/commit/cb3c6971ada8c0a80fec871a032f747c3093d73f))
* **clients:** Open a page for one image from the client's image list ([0ebb3f0](https://github.com/stefgo/docker-instance-manager/commit/0ebb3f0a84ec714a5c3c8b15a4e4f0d96f5187a2))
* **clients:** Open the container instance page from the client's container list ([a8ae8fa](https://github.com/stefgo/docker-instance-manager/commit/a8ae8fafb671a19900a8efeacb6d4be281642f1a))
* **clients:** Prune a host's unused images from the client's image list ([d8ebd24](https://github.com/stefgo/docker-instance-manager/commit/d8ebd241064e8d72d60d8d13c0ad20aea0016f7e))
* **clients:** Show the host's activity in the container and image tabs ([f63a8ba](https://github.com/stefgo/docker-instance-manager/commit/f63a8ba4999f7242996e77d7c384c0d45bcf87e2))
* **containers:** add container instance overview and related functionality ([dbb0adc](https://github.com/stefgo/docker-instance-manager/commit/dbb0adc12001c79a11db730f92e9c063aba09c22))
* **containers:** Add header actions and activity to the container page ([f0a3009](https://github.com/stefgo/docker-instance-manager/commit/f0a3009e4e662c73bf78cc462cf7bec449e6b7a1))
* **containers:** Show the enrolling project as an icon and its name ([44f41d2](https://github.com/stefgo/docker-instance-manager/commit/44f41d29e001ebf8cf7d0633e9c55cfbae95431d))
* **containers:** Show the image an update would bring in a group of its own ([bce2894](https://github.com/stefgo/docker-instance-manager/commit/bce289472b68ba0b78b47ecf3f89c07862bde023))
* **images:** Group the image page's details like the container instance page ([d8c6dee](https://github.com/stefgo/docker-instance-manager/commit/d8c6dee9912101cf29656795e91f9f68136ec475))
* **images:** Open a page for one image reference on one client from the image list ([7f1b482](https://github.com/stefgo/docker-instance-manager/commit/7f1b48210815b9bc2b138fceb855b3fa5dab15e8))
* **images:** Open the container instance page from the image's container list ([ee1d109](https://github.com/stefgo/docker-instance-manager/commit/ee1d109114300d2591c4ebbf934d0406b6d70efa))
* **images:** Prune the images the filtered list shows ([5692a52](https://github.com/stefgo/docker-instance-manager/commit/5692a52d919c995a5abf05020821f7cec86c3329))
* **images:** Pull and recreate an image from the image page's image list ([b8fbfea](https://github.com/stefgo/docker-instance-manager/commit/b8fbfea36e7cf3cafa9a86843bb0eec9ad2bdda6))
* **images:** Show the activity of an image on its page ([8e3ff97](https://github.com/stefgo/docker-instance-manager/commit/8e3ff97ad1b1963981568eb7a4882fefc81b9f3a))
* **projects:** Drop the Compose project name from queries and events ([2cabc2b](https://github.com/stefgo/docker-instance-manager/commit/2cabc2bea03f5ea9ca030056a2a85ac1f3ce6fb3))
* **projects:** Pull and recreate a whole project with a choice of scope ([ca4e0ce](https://github.com/stefgo/docker-instance-manager/commit/ca4e0ced34eaf6398b9081d325d413e98980c686))
* **projects:** Show the project's activity on its page ([7303a07](https://github.com/stefgo/docker-instance-manager/commit/7303a07f7d06a9d088f41253cbcaeaf3377c15bc))


### BREAKING CHANGES

* **projects:** A stored query with a container.composeProject criterion no
longer parses. The server reads it as an empty query, so the project matches
no container until its query is set again. The discovered field is gone from
GET /api/v1/projects and PROJECTS_UPDATE.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

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
