<!--
The hand-written part of the next release: what is new, why it matters, and
what an upgrade needs. It is placed above the list of commits in the GitHub
release and in CHANGELOG.md.

Write below this comment. Use "###" for headings -- "##" is the level of the
version itself. A release with nothing written here is refused. A beta from
dev keeps the text; the stable release from main empties this file again.

Nothing inside an HTML comment is published.
-->

### Fixed

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

### Upgrading

- **Update the server before the agents.** The decision whether an exit was asked for moved
  from the agent to the server; a new agent on an old server would report the stops of DIM's
  own actions as warnings until the server follows.
- The self-update **to** this release is still carried out by the previous agent, so its
  outcome appears as a row of its own one last time.
