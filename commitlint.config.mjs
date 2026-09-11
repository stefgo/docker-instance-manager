export default {
    extends: ["@commitlint/config-conventional"],
    plugins: [
        {
            rules: {
                // Conventional Commits allows two spellings of a breaking change:
                // `feat!:` and the `BREAKING CHANGE:` footer. Only the footer is
                // allowed here.
                //
                // The Angular preset that semantic-release reads commits with has
                // the headerPattern /^(\w*)(?:\((.*)\))?: (.*)$/ -- without `!`. A
                // `feat!: ...` falls through it, is read as typeless and releases
                // nothing. Nothing releases this repository yet (that arrives with
                // the release model), but the rule is set now so the history does
                // not have to be written two ways.
                //
                // Second reason: once releases are automated, a breaking change
                // raises the minor position, as in proxmox-backup-client-manager.
                // A `!` tells every reader "major" and would claim something false.
                "no-breaking-bang": ({ header }) => [
                    !/^[a-z]+(\([^)]*\))?!:/.test(header ?? ""),
                    'The "!" is not used here. Use a "BREAKING CHANGE:" footer instead.',
                ],
            },
        },
    ],
    rules: {
        // Commit messages are English (see CLAUDE.md). The default rule forbids
        // sentence-case and would reject the natural form of an English subject
        // ("fix: Validate the settings before saving them"). The type is what
        // matters for a release, not the capitalisation behind it.
        "subject-case": [0],

        "no-breaking-bang": [2, "always"],
    },
};
