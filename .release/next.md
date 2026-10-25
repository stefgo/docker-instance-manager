<!--
The hand-written part of the next release: what is new, why it matters, and
what an upgrade needs. It is placed above the list of commits in the GitHub
release and in CHANGELOG.md.

Write below this comment. Use "###" for headings -- "##" is the level of the
version itself. A release with nothing written here is refused. A beta from
dev keeps the text; the stable release from main empties this file again.

Nothing inside an HTML comment is published.
-->

### Select projects for an update check

The project list now has checkboxes, as the container list does. With projects picked,
"Check for updates" asks the registries about their images alone; without a pick it
checks every project the list shows, as before. The selection stays after a check.

### Rows of cards fit beside the sidebar

The cards on the overview and the tab cards on the client, project and image pages now
take as many columns as there is room for beside the sidebar, not as the window is wide.
With the sidebar open, the overview's five cards were too narrow for their labels; they now
go three and two, and five across once there is room. A card is never left alone on a row,
and on a narrow screen the cards stack.
