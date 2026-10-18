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
