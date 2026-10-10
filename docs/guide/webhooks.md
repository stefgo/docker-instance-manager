# 🪝 Webhooks

DIM can report activity events to external services — a chat channel, a push service, an
incident tool, a script of your own. Each webhook sends a **JSON body you write yourself**,
with placeholders for the data of the event that triggered it.

Webhooks are managed on the **Webhooks** page in the sidebar, under Administration. The API is
described under [Webhooks in the API reference](../api.md#-webhooks).

## When a webhook fires

Every event the server stores for the first time — the same events the
[activity list](activity.md) shows — goes to every enabled webhook whose filters it passes:

- **Minimum level** — `trace`, `info`, `warning` or `error`. The default, `warning`, covers a
  container that exits with an error, turns unhealthy or runs out of memory, a failed action,
  an auto-update run with failures and every other error.
- **Event kinds** — a comma-separated list of patterns, `*` as wildcard: `container.*`,
  `autoupdate.run`. Empty means every kind. The kinds are listed [below](#event-kinds).

An event an agent delivers twice — it reconnects before it saw the acknowledgement — is
stored once and reported once. An event a host kept while it was offline is reported when it
arrives, with `event.occurredAt` still the time it happened. The same holds for an event the
agent caught up on after its connection to Docker broke: the webhook is called late, for a
container that may be running again by then, and `event.occurredAt` says when it happened.

## Delivery

- `POST` (or `PUT`) with `Content-Type: application/json` and the headers you configured.
- Per attempt the configured timeout applies (default 10 s). When nothing answers, or the
  target answers 5xx or 429, the delivery is tried twice more, after 1 s and 5 s.
- Events are sent to one target in the order they arrived.
- The outcome of the last delivery is shown in the list. A failure is logged, but **does not
  create an activity event** — a broken target would otherwise report its own failures to
  itself.
- There is no persistent queue. A server restart during a retry loses that delivery; the
  event itself stays in the activity list.

## Templates

A template is **valid JSON** with `{{…}}` placeholders in its strings. It is filled in on the
parsed JSON, never as text, so a quote or a brace in an event's data cannot break the body.

| Written as | Becomes |
| :--------- | :------ |
| `"{{event.data}}"` — a string that is only one placeholder | The value **with its type**: an object stays an object, a number a number, a missing value `null`. |
| `"Container {{event.subject.containerName}} exited with {{event.data.exitCode}}"` — a placeholder inside text | Text. A missing value is empty, an object is written as JSON. |
| `{{client.name \| default("server")}}` | The fallback when the value is missing, `null` or empty. The fallback is a JSON value (`"text"`, `0`, `null`) or text in single quotes (`'text'`). More [filters](#filters) below. |
| `{ "{{event.kind}}": … }` | Placeholders work in keys too, as text. |

Placeholders also work in the **URL** and in **header values**, always as text.

A path must start with `event`, `client` or `webhook`; anything else is refused when
the webhook is saved, as is a template that is not valid JSON or longer than 64 KiB. The
editor page shows a live preview rendered with a sample event, and **Send Test** delivers that
sample to the target. The sample follows the webhook's event kinds: the first of
`container.died`, `container.oom`, `container.health`, `autoupdate.run`, `action.failed` and
`client.disconnected` one of them matches, `container.died` when none does.

### What a template can read

| Placeholder | Content |
| :---------- | :------ |
| `event.message` | The sentence the dashboard shows, e.g. `Container nextcloud-app exited with code 1` |
| `event.detail` | The dashboard's second line, such as an error or a run's counts; `null` if none |
| `event.kind` | `container.died`, `autoupdate.run`, … |
| `event.level` | `trace`, `info`, `warning` or `error` |
| `event.occurredAt` | When it happened on the host (ISO 8601) |
| `event.receivedAt` | When the server received it |
| `event.source` | `agent` or `server` |
| `event.id` | Unique id of the event |
| `event.correlationId` | Groups events that belong together: the action from the dashboard, the auto-update run; else mostly `null` |
| `event.subject` | What the event is about: `{ containerName, containerId, imageRef, projectIds }`, for a run `{ projectId, projectName }`; single fields as `event.subject.containerName` |
| `event.data` | The facts of the kind, e.g. `{ exitCode }`; single fields as `event.data.exitCode` |
| `event.projects` | The projects the event is about, as `[{ id, name }]` — empty when it is about none |
| `client.name` | Display name, else hostname |
| `client.hostname` | Hostname reported by the agent |
| `client.id` | Client id |
| `webhook.name` | The webhook's own name |

`client` is `null` for an event the server reports about itself (`scheduler.failed`,
`imagecheck.interrupted`); use `default(...)` where that matters. An array element is reached
by its position: `event.projects.0.name`.

`event.projects` is built from `event.subject.projectIds`, which the server enters when it
stores the event (see [Activity](../api.md#-activity)). The **names are looked up at delivery**,
so a renamed project is sent under its new name; a project deleted since has `name: null`.

### Filters

Filters follow the path, separated by `|`, and run left to right. They work everywhere a
placeholder does, URL and headers included.

| Filter | Does |
| :----- | :--- |
| `default(<value>)` | The value when the one before is missing, `null` or empty |
| `join(", ")` | An array as text, its items separated by the given text (`", "` when left out). Objects in it are written as JSON. |
| `map("name")` | From an array of objects, the one field of each: `[{name: "web"}, …]` → `["web", …]` |
| `upper`, `lower` | Text in upper or lower case |
| `truncate(12)` | The first characters of a text, cut without an ellipsis. The number is required and at least 1. |

```text
{{event.projects | map("name") | join(", ")}}         → nextcloud, monitoring
{{event.subject.imageRef | default("–")}}             → nextcloud:31
{{client.name | default("server") | upper}}           → DOCKER-01
{{event.subject.containerId | truncate(12)}}          → 4f2a9c1e7b3d
```

A filter handed a value it cannot work on — `join` on a number, `upper` on an object — passes
it on unchanged. An unknown filter is refused when the webhook is saved, as is a `truncate`
without a whole number.

### Conditions and loops

For what a single placeholder cannot say — a line only when there is an error, one line per
project — a template uses **directives**: JSON objects with a key starting with `$`. They
borrow their names from [JSON-e](https://json-e.js.org/), and like everything else they work
on the parsed JSON, so they cannot break it either.

**`$if`** — takes `then` when the condition holds, else `else`:

```json
{
    "error": { "$if": "event.detail", "then": "{{event.detail}}", "else": "no details" }
}
```

A branch that is left out drops what the directive stands for: the key in an object, the
item in an array (`null` for a whole template). The condition is one of

| Condition | Holds when |
| :-------- | :--------- |
| `path` | the value is there and not `null`, `""`, `false`, `0` or an empty array |
| `!path` | it is not |
| `path == 'unhealthy'`, `path != 'unhealthy'` | the value is, or is not, equal to the one given — as a JSON value (`"unhealthy"`, `137`, `true`, `null`) or text in single quotes. `137` and `'137'` are not equal. |

There is nothing beyond these: no `and`, no `or`, no arithmetic. Two conditions are two
nested `$if`s.

**`$map`** — one item per element of an array, rendered with `each(name)`, in which `name`
is the element; `each(name, index)` adds its position, counted from 0:

```json
{
    "projects": { "$map": "event.projects", "each(p)": { "project": "{{p.name}}", "id": "{{p.id}}" } }
}
```

The path names the array without braces (`"{{event.projects}}"` is accepted too) and may
carry filters. Anything but an array gives `[]`. Loops nest, and an inner one can read the
outer one's name. A name may not be `event`, `client`, `webhook` or one already in use.

**`$join`** — renders what it holds and joins the resulting array into text, separated by
`with` (nothing when left out). That is how a loop becomes a message:

```json
{
    "content": {
        "$join": { "$map": "event.projects", "each(p)": "- {{p.name | default('deleted project')}}" },
        "with": "\n"
    }
}
```

→ `"- nextcloud\n- monitoring"`

- An object holding a directive may hold only that directive's own keys (`then`/`else`,
  `each(…)`, `with`); two directives in one object are refused.
- Directives nest at most 8 deep. A loop only ever runs over an array the event carries,
  so a template always finishes.
- A key that has to reach the target starting with `$if`, `$map` or `$join` is written with a
  second `$`: `"$$if"` is sent as `"$if"`. Other `$` keys, such as `$schema`, are sent as
  written.

## Event kinds

What `event.data` carries per kind. A kind from an agent of another version can appear that
is not listed here; it is sent like any other, with `event.message` falling back to the kind
itself.

| Kind | Level | `event.data` |
| :--- | :---- | :----------- |
| `container.created`, `.started`, `.stopped`, `.removed` | `info` | — |
| `container.died` | `warning`, `info` on exit code 0 | `exitCode` |
| `container.oom` | `error` | — |
| `container.health` | `warning` when `unhealthy`, else `info` | `status` |
| `image.pulled`, `image.removed` | `info` | — (the image is `event.subject.imageRef`) |
| `autoupdate.run` | `error` with failures or an unresolved conflict, else `info` | `eligible`, `pulled`, `updated`, `failed`, `skipped`, `conflicts`, `containers`, … |
| `autoupdate.skipped` | `info` | `delayDays`, `imageCreatedAt`, `source` — the image is younger than the delay |
| `autoupdate.conflict` | `warning`, `error` when the container is excluded | `projectNames`, `fallback` |
| `autoupdate.interrupted`, `autoupdate.refused` | `warning` | — |
| `selfupdate.completed`, `.rolledback`, `.failed` | `info` when completed, else `error` | `fromVersion`, `toVersion`, `error`, `rollbackError` |
| `action.requested`, `.completed`, `.failed`, `.unconfirmed` | `info`, `failed`/`unconfirmed` `warning` | `action`, `error`, `reason` |
| `client.connected`, `client.disconnected` | `trace` | `connectionMode`, `clientName` |
| `client.registered` | `info` | `hostname`, `connectionMode`, `ip` |
| `imagecheck.interrupted` | `warning` | `checked`, `total`, `registry`, `retryAfterSeconds` |
| `scheduler.failed` | `error` | `scheduler`, `error` |

The container events carry `containerName`, `containerId` and `imageRef` in `event.subject`.

`event.data.containers` of an `autoupdate.run` lists the containers the run set out to
recreate — the ones `updated` and `failed` count — as
`[{ containerName, imageRef, result, error }]`. `result` is `updated` or `failed`; `error` is
there only for a failed one, and says whether the pull or the recreate went wrong. A container
the run held back or found current is not in the list. An agent older than this field sends no
list, and a loop over it renders nothing.

## Examples

**Slack / Mattermost incoming webhook**

```json
{
    "text": ":rotating_light: *{{client.name | default(\"DIM\")}}* — {{event.message}}"
}
```

**Microsoft Teams (workflow webhook)**

```json
{
    "type": "message",
    "attachments": [{
        "contentType": "application/vnd.microsoft.card.adaptive",
        "content": {
            "type": "AdaptiveCard",
            "version": "1.4",
            "body": [
                { "type": "TextBlock", "weight": "Bolder", "text": "{{client.name | default(\"DIM\")}} ({{event.level}})" },
                { "type": "TextBlock", "wrap": true, "text": "{{event.message}}" }
            ]
        }
    }]
}
```

**Gotify** — URL `https://gotify.example.com/message`, header `X-Gotify-Key: <app token>`

```json
{
    "title": "{{client.name | default(\"DIM\")}}: {{event.kind}}",
    "message": "{{event.message}}",
    "priority": 8
}
```

**Container problems** — a container that died, ran out of memory or turned unhealthy, with
its projects. Event kinds `container.died, container.oom, container.health`, minimum level
`warning`:

```json
{
    "text": "{{event.message}}",
    "host": "{{client.name}}",
    "container": "{{event.subject.containerName}}",
    "image": "{{event.subject.imageRef}}",
    "projects": "{{event.projects | map('name') | join(', ') | default('–')}}",
    "exitCode": { "$if": "event.kind == 'container.died'", "then": "{{event.data.exitCode}}" },
    "health": { "$if": "event.kind == 'container.health'", "then": "{{event.data.status}}" }
}
```

**Auto-update runs in [Log Notifier](https://github.com/stefgo/ha-log-notifier)** — one message
per run that changed or failed something. URL
`https://<ha>/api/lognotifier/ingest/<channel token>`, event kind `autoupdate.run`, minimum
level `info` — a successful run is `info`. The template picks the title's icon by level, says
in one sentence how the run ended, lists the updated and the failed containers with their
images — a block each, left out when the run has none — and puts the host, the schedule, the
counts and the event itself into `blocks`. `event.correlationId` is the run's id, the same on
every container event of that run:

```json
{
    "level": "{{event.level}}",
    "title": {
        "$join": [
            { "$if": "event.level == 'error'", "then": "❌", "else": "🔄" },
            " {{client.name}}: {{event.message}}"
        ]
    },
    "content": {
        "$join": [
            "The auto-update of **{{event.subject.projectName | default('the host schedule')}}** on **{{client.name}}** ",
            {
                "$if": "event.data.failed",
                "then": "updated **{{event.data.updated}}** and failed on **{{event.data.failed}}**.",
                "else": "updated **{{event.data.updated}}** without a failure."
            }
        ]
    },
    "blocks": [
        {
            "$if": "event.data.updated",
            "then": {
                "type": "text",
                "text": {
                    "$join": [
                        "✅ **Updated:**",
                        {
                            "$join": {
                                "$map": "event.data.containers",
                                "each(c)": {
                                    "$if": "c.result == 'updated'",
                                    "then": "- **{{c.containerName}}** — `{{c.imageRef}}`"
                                }
                            },
                            "with": "\n"
                        }
                    ],
                    "with": "\n"
                }
            }
        },
        {
            "$if": "event.data.failed",
            "then": {
                "type": "text",
                "text": {
                    "$join": [
                        "❗ **Failed:**",
                        {
                            "$join": {
                                "$map": "event.data.containers",
                                "each(c)": {
                                    "$if": "c.result == 'failed'",
                                    "then": "- **{{c.containerName}}** — `{{c.imageRef}}`: {{c.error}}"
                                }
                            },
                            "with": "\n"
                        }
                    ],
                    "with": "\n"
                }
            }
        },
        {
            "type": "fields",
            "rows": [
                [
                    { "label": "Client", "value": "{{client.name}}" },
                    { "label": "Hostname", "value": "{{client.hostname | default('–')}}" }
                ],
                [
                    { "label": "Schedule", "value": "{{event.subject.projectName | default('Host')}}" },
                    { "label": "Eligible", "value": { "$join": ["{{event.data.eligible}}"] } },
                    { "label": "Images pulled", "value": { "$join": ["{{event.data.pulled}}"] } }
                ],
                [
                    { "label": "Updated", "value": { "$join": ["{{event.data.updated}}"] } },
                    { "label": "Failed", "value": { "$join": ["{{event.data.failed}}"] } },
                    { "label": "Postponed", "value": { "$join": ["{{event.data.skipped}}"] } }
                ],
                [
                    { "label": "Event", "value": "{{event.kind}}" },
                    { "label": "Level", "value": "{{event.level | upper}}" }
                ]
            ]
        },
        {
            "type": "fields",
            "rows": [
                [
                    { "label": "Webhook", "value": "{{webhook.name}}" },
                    { "label": "Event ID", "value": "{{event.id}}" },
                    { "label": "Run", "value": "{{event.correlationId | default('–')}}" }
                ]
            ]
        }
    ],
    "source": "dim",
    "tags": ["dim", "{{event.kind}}", "{{client.name}}"],
    "timestamp": "{{event.occurredAt}}"
}
```

The counts go through `$join`, so they arrive as text; as a lone placeholder each would be
sent as a number.

**[Log Notifier](https://github.com/stefgo/ha-log-notifier) for Home Assistant** — URL
`https://<ha>/api/lognotifier/ingest/<channel token>`, event kinds
`container.health, container.died, container.oom`, minimum level `warning`. Log Notifier reads
DIM's levels as its own and renders `content` and the values in `blocks` as Markdown. The
template picks the title's icon by kind, says in one sentence what happened, explains what
that kind means for the container and puts the error, the host, the container, its projects
and the event itself into `blocks`:

```json
{
    "level": "{{event.level}}",
    "title": {
        "$join": [
            {
                "$if": "event.kind == 'container.oom'",
                "then": "💥",
                "else": { "$if": "event.kind == 'container.died'", "then": "❌", "else": "⚠️" }
            },
            " {{client.name}}: {{event.message}}"
        ]
    },
    "content": {
        "$join": [
            "Container **{{event.subject.containerName}}** on **{{client.name}}** ",
            {
                "$if": "event.kind == 'container.health'",
                "then": "reports the health status **{{event.data.status}}**.",
                "else": {
                    "$if": "event.kind == 'container.oom'",
                    "then": "exceeded its memory limit — the OOM killer stepped in.",
                    "else": {
                        "$if": "event.data.exitCode",
                        "then": "exited with code **{{event.data.exitCode}}**.",
                        "else": "exited without Docker naming an exit code."
                    }
                }
            }
        ]
    },
    "blocks": [
        {
            "$if": "event.kind == 'container.health'",
            "then": {
                "type": "text",
                "text": "🩺 **Health check:** The container keeps running, but its health check fails. Docker does not restart it for that."
            },
            "else": {
                "$if": "event.kind == 'container.oom'",
                "then": {
                    "type": "text",
                    "text": "🧠 **Out of memory:** The kernel killed a process of the container. If it was the main process, an event of its own follows with exit code 137."
                },
                "else": {
                    "type": "text",
                    "text": "🛑 **Exited:** The container's main process ended with an exit code other than 0 — a stop that was asked for counts too (137, 143). Whether it starts again is up to its restart policy."
                }
            }
        },
        {
            "$if": "event.detail",
            "then": {
                "type": "text",
                "text": "❗ **Error:** {{event.detail}}"
            }
        },
        {
            "type": "fields",
            "rows": [
                [
                    { "label": "Client", "value": "{{client.name}}" },
                    { "label": "Hostname", "value": "{{client.hostname | default('–')}}" }
                ],
                [
                    { "label": "Container", "value": "{{event.subject.containerName}}" },
                    { "label": "Image", "value": "{{event.subject.imageRef | default('–')}}" }
                ],
                [
                    { "label": "Event", "value": "{{event.kind}}" },
                    { "label": "Level", "value": "{{event.level | upper}}" },
                    {
                        "$if": "event.kind == 'container.health'",
                        "then": { "label": "Health", "value": "{{event.data.status}}" },
                        "else": {
                            "$if": "event.kind == 'container.died'",
                            "then": { "label": "Exit code", "value": { "$join": ["{{event.data.exitCode | default('–')}}"] } }
                        }
                    }
                ],
                [
                    { "label": "Projects", "value": "{{event.projects | map('name') | join(', ') | default('–')}}" },
                    { "label": "Container ID", "value": "{{event.subject.containerId | truncate(12)}}" }
                ]
            ]
        },
        {
            "type": "fields",
            "rows": [
                [
                    { "label": "Webhook", "value": "{{webhook.name}}" },
                    { "label": "Event ID", "value": "{{event.id}}" },
                    { "label": "Operation", "value": "{{event.correlationId | default('–')}}" }
                ]
            ]
        }
    ],
    "source": "dim",
    "tags": ["dim", "{{event.kind}}", "{{client.name}}", "{{event.subject.containerName}}"],
    "timestamp": "{{event.occurredAt}}"
}
```

The exit code goes through `$join`, so it arrives as text like the dash that stands in for a
missing one; as a lone placeholder it would be sent as a number.

**Your own endpoint**, with the complete event

```json
{
    "source": "dim",
    "host": "{{client.hostname}}",
    "event": {
        "id": "{{event.id}}",
        "kind": "{{event.kind}}",
        "level": "{{event.level}}",
        "at": "{{event.occurredAt}}",
        "subject": "{{event.subject}}",
        "projects": "{{event.projects}}",
        "data": "{{event.data}}"
    }
}
```

## Security

- Header values — typically a token — are stored **in the clear** in the server database and
  shown in the editor to every user who can log in. Everyone with a login can manage
  webhooks, just as they can manage everything else.
- The server makes the requests, so it can reach whatever the server can reach, internal
  addresses included. That is intended for targets on the internal network; keep it in mind
  when handing out logins.
- The log names a failing webhook and the reason, never its headers.
