import { useState } from "react";
import { ArrowDown, ArrowUp, Copy, Plus, X } from "lucide-react";
import {
    PROJECT_QUERY_FIELDS,
    ProjectQuery,
    ProjectQueryCategory,
    ProjectQueryCriterion,
    ProjectQueryField,
    ProjectQueryJoin,
    categoryOf,
    hasWildcard,
    imagePatternHasTag,
} from "@dim/shared";
import { Button, Input, Select, cn, FOCUS_RING } from "@stefgo/react-ui-components";
import {
    CATEGORY_LABELS,
    FIELDS_BY_CATEGORY,
    FIELD_PLACEHOLDERS,
    OPERATOR_CHOICES,
    OperatorChoice,
    applyOperatorChoice,
    describe,
    newCriterion,
    newCriterionId,
    operatorChoiceOf,
} from "../query";

interface QueryBuilderProps {
    query: ProjectQuery;
    onChange: (query: ProjectQuery) => void;
    /** Known values per attribute, offered while typing. */
    suggestions: Record<ProjectQueryField, string[]>;
    /** How many containers each criterion matches on its own, by criterion id. */
    hitCounts: Map<string, number>;
}

const CATEGORY_OPTIONS = (Object.keys(CATEGORY_LABELS) as ProjectQueryCategory[]).map((c) => ({
    value: c,
    label: CATEGORY_LABELS[c],
}));

// The controls of a row are styled like the search pill and level filter above the
// notifications, so a criterion reads as one row of filters rather than a form.
const PILL_SELECT = "py-1 pl-3 pr-9 rounded-full border-border bg-app-bg text-sm";
const PILL_INPUT = "py-1 px-3 rounded-full bg-app-bg text-sm";

const JOINS: { value: ProjectQueryJoin; label: string }[] = [
    { value: "and", label: "AND" },
    { value: "or", label: "OR" },
];

/** A two-way switch for AND / OR: one click, and the current value is always visible. */
const JoinToggle = ({
    value,
    onChange,
    index,
}: {
    value: ProjectQueryJoin;
    onChange: (join: ProjectQueryJoin) => void;
    index: number;
}) => (
    <div
        role="radiogroup"
        aria-label={`How criterion ${index + 1} joins the ones before it`}
        className="inline-flex rounded-full border border-border bg-app-bg overflow-hidden text-xs font-bold"
    >
        {JOINS.map((j) => (
            <button
                key={j.value}
                type="button"
                role="radio"
                aria-checked={value === j.value}
                onClick={() => onChange(j.value)}
                className={cn(
                    "px-2.5 py-1 transition-colors",
                    value === j.value ? "bg-primary text-white" : "text-text-muted hover:bg-hover",
                    FOCUS_RING,
                )}
            >
                {j.label}
            </button>
        ))}
    </div>
);

const IconButton = ({
    icon: Icon,
    label,
    onClick,
    disabled,
}: {
    icon: typeof X;
    label: string;
    onClick: () => void;
    disabled?: boolean;
}) => (
    <button
        type="button"
        aria-label={label}
        title={label}
        onClick={onClick}
        disabled={disabled}
        className={cn(
            "p-1.5 rounded text-text-muted hover:bg-hover hover:text-text-primary disabled:opacity-30 disabled:pointer-events-none",
            FOCUS_RING,
        )}
    >
        <Icon size={14} />
    </button>
);

/**
 * Edits a project query as a list of criteria, one row each. Every row reads as a sentence
 * -- "AND Container name matches nextcloud-*" -- and the whole query is repeated below as
 * the expression it is evaluated as, bracketed where AND and OR mix, because the order of
 * the rows is all that decides how they combine.
 */
export const QueryBuilder = ({ query, onChange, suggestions, hitCounts }: QueryBuilderProps) => {
    // Criteria whose value field has been left once. A missing value is marked only then,
    // so a new row does not start out red.
    const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
    const touch = (id: string) => {
        if (!touched.has(id)) setTouched(new Set(touched).add(id));
    };
    const update = (index: number, next: ProjectQueryCriterion) =>
        onChange(query.map((c, i) => (i === index ? next : c)));

    const move = (index: number, delta: number) => {
        const next = [...query];
        const [item] = next.splice(index, 1);
        next.splice(index + delta, 0, item);
        onChange(next);
    };

    const remove = (index: number) => onChange(query.filter((_, i) => i !== index));

    const duplicate = (index: number) => {
        const next = [...query];
        next.splice(index + 1, 0, { ...query[index], id: newCriterionId() });
        onChange(next);
    };

    const add = () => {
        // A new row starts where the last one left off: most queries narrow one category.
        const last = query[query.length - 1];
        onChange([...query, newCriterion({ field: last?.field ?? "container.composeProject", join: "and" })]);
    };

    const setCategory = (index: number, category: ProjectQueryCategory) => {
        const c = query[index];
        if (categoryOf(c.field) === category) return;
        update(index, { ...c, field: FIELDS_BY_CATEGORY[category][0].field });
    };

    // Typing a wildcard switches to pattern matching and removing it switches back, so the
    // operator never contradicts the value. Negation is kept either way.
    const setValue = (index: number, value: string) => {
        const c = query[index];
        const wildcard = hasWildcard(value);
        const op = wildcard ? "wildcard" : c.op === "wildcard" && hasWildcard(c.value) ? "equals" : c.op;
        update(index, { ...c, value, op });
    };

    const complete = query.filter((c) => c.value.trim());

    return (
        <div className="space-y-3">
            {/* One frame around all criteria, the rows divided by lines inside it. */}
            <ol className="rounded-lg border border-border bg-card divide-y divide-border">
                {query.map((c, index) => {
                    const category = categoryOf(c.field);
                    const listId = `query-suggestions-${c.id}`;
                    const hits = hitCounts.get(c.id);
                    const missing = touched.has(c.id) && !c.value.trim();
                    return (
                        <li key={c.id} className="p-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="w-6 text-xs font-bold text-text-muted tabular-nums">
                                    #{index + 1}
                                </span>
                                <div className="w-[5.5rem] shrink-0">
                                    {index === 0 ? (
                                        <span className="text-xs font-bold uppercase text-text-muted">Where</span>
                                    ) : (
                                        <JoinToggle
                                            value={c.join}
                                            index={index}
                                            onChange={(join) => update(index, { ...c, join })}
                                        />
                                    )}
                                </div>
                                <Select
                                    aria-label="Category"
                                    value={category}
                                    options={CATEGORY_OPTIONS}
                                    onChange={(e) => setCategory(index, e.target.value as ProjectQueryCategory)}
                                    className="w-32 shrink-0"
                                    classNames={{ select: PILL_SELECT }}
                                    fullWidth={false}
                                />
                                <Select
                                    aria-label="Attribute"
                                    value={c.field}
                                    options={FIELDS_BY_CATEGORY[category].map((f) => ({ value: f.field, label: f.label }))}
                                    onChange={(e) => {
                                        const field = e.target.value as ProjectQueryField;
                                        if (PROJECT_QUERY_FIELDS.includes(field)) update(index, { ...c, field });
                                    }}
                                    className="w-44 shrink-0"
                                    classNames={{ select: PILL_SELECT }}
                                    fullWidth={false}
                                />
                                <Select
                                    aria-label="Operator"
                                    value={operatorChoiceOf(c)}
                                    options={OPERATOR_CHOICES}
                                    onChange={(e) => update(index, applyOperatorChoice(c, e.target.value as OperatorChoice))}
                                    className="w-40 shrink-0"
                                    classNames={{ select: PILL_SELECT }}
                                    fullWidth={false}
                                />
                                <div className="relative min-w-[12rem] flex-1">
                                    <Input
                                        aria-label="Value"
                                        value={c.value}
                                        list={listId}
                                        placeholder={FIELD_PLACEHOLDERS[c.field]}
                                        onChange={(e) => setValue(index, e.target.value)}
                                        onBlur={() => touch(c.id)}
                                        // No `error` text here: it would render below the field in the flow
                                        // and push it out of line with the selects. The message below is
                                        // positioned instead, over the hint line, which stays empty then.
                                        aria-invalid={missing || undefined}
                                        aria-describedby={missing ? `query-error-${c.id}` : `query-hint-${c.id}`}
                                        classNames={{
                                            // See .no-list-button: hides the arrow browsers add for a datalist.
                                            input: cn(
                                                PILL_INPUT,
                                                "no-list-button",
                                                missing ? "border-error" : "border-border",
                                            ),
                                        }}
                                        fullWidth
                                    />
                                    {missing && (
                                        <span
                                            id={`query-error-${c.id}`}
                                            className="absolute left-3 top-full mt-1 text-xs leading-4 text-error whitespace-nowrap"
                                        >
                                            Enter a value
                                        </span>
                                    )}
                                    <datalist id={listId}>
                                        {suggestions[c.field].map((s) => (
                                            <option key={s} value={s} />
                                        ))}
                                    </datalist>
                                </div>
                                <div className="flex items-center gap-0.5">
                                    <IconButton icon={ArrowUp} label="Move up" onClick={() => move(index, -1)} disabled={index === 0} />
                                    <IconButton
                                        icon={ArrowDown}
                                        label="Move down"
                                        onClick={() => move(index, 1)}
                                        disabled={index === query.length - 1}
                                    />
                                    <IconButton icon={Copy} label="Duplicate" onClick={() => duplicate(index)} />
                                    <IconButton
                                        icon={X}
                                        label="Remove"
                                        onClick={() => remove(index)}
                                        disabled={query.length === 1}
                                    />
                                </div>
                            </div>
                            <div id={`query-hint-${c.id}`} className="mt-1 pl-8 text-xs leading-4 text-text-muted">
                                {missing ? (
                                    "\u00a0"
                                ) : c.value.trim() && hits !== undefined ? (
                                    <>
                                        On its own: <span className={hits === 0 ? "text-warning" : undefined}>{hits} container(s)</span>
                                        {c.op === "wildcard" && " · * any characters, ? one character"}
                                        {c.field === "image.name" && !imagePatternHasTag(c.value) && " · without a tag, every tag matches"}
                                    </>
                                ) : c.op === "wildcard" ? (
                                    "* stands for any characters, ? for exactly one"
                                ) : (
                                    "Pick a value from the suggestions or type one; * and ? switch to pattern matching"
                                )}
                            </div>
                        </li>
                    );
                })}
            </ol>

            <Button type="button" variant="secondary" size="sm" icon={Plus} onClick={add}>
                Add criterion
            </Button>

            {complete.length > 1 && (
                <div className="rounded-lg bg-hover/50 px-3 py-2 text-xs">
                    <span className="font-bold uppercase text-text-muted">Evaluated as </span>
                    <span className="font-mono break-words">{describe(complete)}</span>
                    <div className="mt-1 text-text-muted">
                        Criteria are combined strictly in order, from top to bottom — AND does not bind stronger than OR.
                    </div>
                </div>
            )}
        </div>
    );
};
