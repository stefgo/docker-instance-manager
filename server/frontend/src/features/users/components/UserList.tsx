import { Plus, Trash2, Edit2, User, Key, Globe } from "lucide-react";
import { formatDate } from "../../../utils";
import { DataTable, DataTableDef } from "@stefgo/react-ui-components";
import { DataAction } from "@stefgo/react-ui-components";
import { DataCard } from "@stefgo/react-ui-components";

export interface UserData {
  id: number;
  username: string;
  auth_methods?: string;
  created_at: string;
}

interface UserListProps {
  users: UserData[];
  isLoading: boolean;
  onEditUser: (user: UserData) => void;
  onDeleteUser: (user: UserData) => void;
  onCreateUser: () => void;
}

export const UserList = ({
  users,
  isLoading,
  onEditUser,
  onDeleteUser,
  onCreateUser,
}: UserListProps) => {
  const renderAuthBadges = (methodsStr?: string) => {
    const methods = methodsStr ? methodsStr.split(",") : ["local"];
    return (
      <div className="flex gap-1">
        {methods.includes("local") && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-hover text-text-primary dark:bg-card-dark dark:text-text-muted border border-border dark:border-border-dark">
            <Key size={10} /> Local
          </span>
        )}
        {methods.includes("oidc") && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-100 dark:border-blue-900/50">
            <Globe size={10} /> OIDC
          </span>
        )}
      </div>
    );
  };

  const columns: DataTableDef<UserData>[] = [
    {
      tableHeader: "User",
      tableCellClassName: "font-medium text-text-primary",
      accessorKey: "username",
      sortable: true,
    },
    {
      tableHeader: "Auth",
      tableItemRender: (user) => renderAuthBadges(user.auth_methods),
    },
    {
      tableHeader: "Created At",
      tableCellClassName: "text-sm text-text-muted",
      sortable: true,
      sortValue: (user) => user.created_at,
      tableItemRender: (user) => formatDate(user.created_at),
    },
    {
      tableHeader: "Actions",
      tableHeaderClassName: "text-center",
      tableCellClassName: "text-right text-sm font-medium",
      tableItemRender: (user) => (
        <DataAction
          rowId={user.id}
          actions={[
            {
              icon: Edit2,
              onClick: () => onEditUser(user),
              color: "blue",
              tooltip: "Edit User",
            },
          ]}
          menuEntries={[
            {
              label: "Delete User",
              icon: Trash2,
              onClick: () => onDeleteUser(user),
              variant: "danger",
              disabled: users.length <= 1,
              disabledTitle: "Cannot delete the last user",
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
          <User size={18} className="text-text-muted dark:text-text-muted-dark" /> Users
        </>
      }
      action={
        <button
          onClick={onCreateUser}
          className="px-3 py-1 text-white text-xs rounded transition-colors bg-primary hover:bg-primary-hover"
        >
          <Plus size={12} className="inline mr-1" /> New User
        </button>
      }
      noPadding
    >
      <DataTable
        data={users}
        itemDef={columns}
        defaultSort={{ colIndex: 0, direction: 'asc' }}
        keyField="id"
        isLoading={isLoading}
        loadingMessage="Loading users..."
        emptyMessage="No users found"
        containerClassName="rounded-b-xl border-0 shadow-none"
      />
    </DataCard>
  );
};
