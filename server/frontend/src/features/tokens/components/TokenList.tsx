import { Key, Trash2, Plus } from "lucide-react";
import { Token } from "@dim/shared";
import { formatDate } from "../../../utils";
import { usePagination } from "../../../hooks/usePagination";
import { DataTable, DataTableDef } from "@stefgo/react-ui-components";
import { DataAction } from "@stefgo/react-ui-components";
import { DataCard } from "@stefgo/react-ui-components";

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
  const { currentItems: currentTokens } = usePagination(tokens, 10);

  const columns: DataTableDef<Token>[] = [
    {
      tableHeader: "Token",
      tableItemRender: (t) => (
        <span
          className={`font-mono text-sm text-text-primary dark:text-text-primary-dark ${t.usedAt || new Date(t.expiresAt) < new Date() ? "line-through opacity-60" : ""}`}
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
        if (t.usedAt)
          return (
            <span className="text-xs bg-border text-text-muted dark:text-text-muted-dark dark:bg-card-dark px-2 py-0.5 rounded">
              Used
            </span>
          );
        if (new Date(t.expiresAt) < new Date())
          return (
            <span className="text-xs bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-500 px-2 py-0.5 rounded">
              Expired
            </span>
          );
        return (
          <span className="text-xs bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-500 px-2 py-0.5 rounded">
            Active
          </span>
        );
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
    <DataCard
      title={
        <>
          <Key size={18} className="text-text-muted dark:text-text-muted-dark" /> Client Tokens
        </>
      }
      action={
        <button
          onClick={generateToken}
          className="px-3 py-1 bg-primary text-white text-xs rounded hover:bg-primary-hover"
        >
          <Plus size={12} className="inline mr-1" />
          Generate New Token
        </button>
      }
      noPadding
    >
      <DataTable
        data={currentTokens}
        itemDef={columns}
        keyField="token"
        emptyMessage="No tokens generated"
        containerClassName="rounded-b-xl border-0 shadow-none"
      />
    </DataCard>
  );
};
