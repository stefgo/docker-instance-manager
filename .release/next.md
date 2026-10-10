<!--
The hand-written part of the next release: what is new, why it matters, and
what an upgrade needs. It is placed above the list of commits in the GitHub
release and in CHANGELOG.md.

Write below this comment. Use "###" for headings -- "##" is the level of the
version itself. A release with nothing written here is refused. A beta from
dev keeps the text; the stable release from main empties this file again.

Nothing inside an HTML comment is published.
-->

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

### Reload all clients at once

The client list has a Reload button next to Add Client. It asks every connected client for
its current Docker state and dials every offline client the server connects to. The reload
of a single client has moved out of the row's menu and is now a button in the row itself.

A new column, *Docker State*, shows when each client last reported its state, so a reload
can be seen to have arrived.

### An agent reads its host's state once for a burst of changes

An agent used to read the complete Docker state of its host for every single Docker event.
Starting a stack of ten containers made it read that state some thirty times within seconds,
all at once, and the dashboard could be left showing an older state than the last one. The
agent now reads one state at a time and answers everything that happened meanwhile with a
single further read.

### Upgrading

Nothing has to be done. The webhook templates behave as before; their engine now comes from
a package the stefgo projects share.

The list of containers comes from the agent, so a host reports it once its agent is updated.
A run of an older agent arrives without the list, and a template that loops over it sends
nothing for that run.
