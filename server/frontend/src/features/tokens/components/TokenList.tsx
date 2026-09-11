import { Key, Trash2, Plus } from "lucide-react";
import { Token } from "@dim/shared";
import { formatDate } from "../../../utils";
import { DataTable, DataTableDef } from "@stefgo/react-ui-components";
import { DataAction } from "@stefgo/react-ui-components";
import { Badge, Button, Card } from "@stefgo/react-ui-components";

interface TokenListProps {
    tokens: Token[];
    deleteToken: (token: string) => void;
    generateToken: () => void;
}

export const TokenList = ({
    tokens,
    deleteToken,
    generateToken,
}: TokenListProps) => {
    const columns: DataTableDef<Token>[] = [
        {
            tableHeader: "Token",
            tableItemRender: (t) => (
                <span
                    className={`font-mono text-sm text-text-primary ${t.usedAt || new Date(t.expiresAt) < new Date() ? "line-through opacity-60" : ""}`}
                >
                    {t.token}
                </span>
            ),
        },
        {
            tableHeader: "Expires / Used",
            tableCellClassName: "text-sm text-text-muted",
            sortable: true,
            sortValue: (t) => t.usedAt ?? t.expiresAt,
            tableItemRender: (t) => {
                if (t.usedAt) return <>Used: {formatDate(t.usedAt)}</>;
                if (new Date(t.expiresAt) < new Date())
                    return <>Expired: {formatDate(t.expiresAt)}</>;
                return <>Expires: {formatDate(t.expiresAt)}</>;
            },
        },
        {
            tableHeader: "Status",
            sortable: true,
            sortValue: (t) => t.usedAt ? 2 : new Date(t.expiresAt) < new Date() ? 1 : 0,
            tableItemRender: (t) => {
                if (t.usedAt) return <Badge variant="neutral" size="sm">Used</Badge>;
                if (new Date(t.expiresAt) < new Date())
                    return <Badge variant="error" size="sm">Expired</Badge>;
                return <Badge variant="success" size="sm">Active</Badge>;
            },
        },
        {
            tableHeader: "Actions",
            tableHeaderClassName: "text-right",
            tableCellClassName: "text-right text-sm font-medium",
            tableItemRender: (t) => (
                <DataAction
                    rowId={t.token}
                    menuEntries={[
                        {
                            label: "Delete Token",
                            icon: Trash2,
                            onClick: () => deleteToken(t.token),
                            variant: "danger",
                        },
                    ]}
                />
            ),
        },
    ];

    return (
        <Card
            title={
                <>
                    <Key size={18} className="text-text-muted" /> Client Tokens
                </>
            }
            action={
                <Button size="sm" icon={Plus} onClick={generateToken}>
                    Generate New Token
                </Button>
            }
            padding="none"
        >
            <DataTable
                data={tokens}
                itemDef={columns}
                sort={{ defaultValue: [{ colIndex: 1, direction: "asc" }] }}
                keyField="token"
                emptyMessage="No tokens generated"
                className="rounded-b-xl border-0 shadow-none"
                // The list used to show the first ten tokens and draw no page controls, so
                // every further token was out of reach.
                pagination={{ defaultValue: { pageSize: 10 }, hideOnSinglePage: true }}
            />
        </Card>
    );
};
