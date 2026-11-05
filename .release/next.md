<!--
The hand-written part of the next release: what is new, why it matters, and
what an upgrade needs. It is placed above the list of commits in the GitHub
release and in CHANGELOG.md.

Write below this comment. Use "###" for headings -- "##" is the level of the
version itself. A release with nothing written here is refused. A beta from
dev keeps the text; the stable release from main empties this file again.

Nothing inside an HTML comment is published.
-->

### A project for what the others leave

The project editor has a new field next to the project's name: **Rank**. A container that several projects
match goes to the one of the lowest rank; ordinary projects keep rank 0. A project of rank 1
takes only the containers the others leave, so *everything on this host except the other
projects* is now one project instead of a query that cannot be saved. *Rest on docker-01* at
rank 1 and *Everything else* at rank 2 can coexist; only projects of the same rank must not
share a container. This holds for containers started later too. The editor's result says how
many matches a lower rank takes, and the project list has a column for it.
Auto-update of a project above rank 0 needs agents of this release; an older agent leaves such
a project out and updates its containers as if they were in no project.

### Select projects for an update check

The project list now has checkboxes, as the container list does. With projects picked,
"Check for updates" asks the registries about their images alone; without a pick it
checks every project the list shows, as before. The selection stays after a check.

### Prune a host

A client's menu, on the client list and on the client's page, now has **Prune**: after asking,
it runs `docker system prune` on that host -- a notification shows it running and then its
outcome -- and removes stopped containers, unused networks, images without a tag and the
build cache. Volumes and tagged images are kept. It needs an agent of this release; an older
one refuses the action and says so. The menu on the client's
page now reads **Reload Docker**, **Prune Docker**, **Edit Client** and **Re-Register Client**.

A host can also prune itself on a schedule: tick **Auto-Prune** in the client's editor and
enter a cron expression, `0 4 * * *` (daily at 04:00) to begin with. Auto-prune is off on every
host until it is switched on there. The agent runs it in its own time zone, also while the
server is unreachable, and waits for an auto-update that is under way. A prune missed while the
agent was down is not made up. The client list has a new column, **Last Auto-Prune**, and each
run shows up in the activity. Like Prune, it needs an agent of this release.

### Rows of cards fit beside the sidebar

The cards on the overview and the tab cards on the client, project and image pages now
take as many columns as there is room for beside the sidebar, not as the window is wide.
With the sidebar open, the overview's five cards were too narrow for their labels; they now
go three and two, and five across once there is room. A card is never left alone on a row,
and on a narrow screen the cards stack.

### Read the status from elsewhere

`GET /api/v1/status` answers with what the dashboard shows -- the verdict (`healthy`,
`degraded`, `critical`, `unknown`) and every line of **Needs attention** with the dashboard's
text -- for Home Assistant, a monitoring system or a script. Besides a session it
takes a status token that opens this route and nothing else: set `statusToken` in
`config.yaml` or `DIM_STATUS_TOKEN` (`_FILE`), at least 32 characters. Without one
nothing changes. See [Status](https://stefgo.github.io/docker-instance-manager/api/#status).
