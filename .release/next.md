<!--
The hand-written part of the next release: what is new, why it matters, and
what an upgrade needs. It is placed above the list of commits in the GitHub
release and in CHANGELOG.md.

Write below this comment. Use "###" for headings -- "##" is the level of the
version itself. A release with nothing written here is refused. A beta from
dev keeps the text; the stable release from main empties this file again.

Nothing inside an HTML comment is published.
-->

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
