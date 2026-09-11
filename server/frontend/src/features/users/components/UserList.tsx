import { Plus, Trash2, Edit2, User, Key, Globe } from "lucide-react";
import { formatDate } from "../../../utils";
import { DataTable, DataTableDef } from "@stefgo/react-ui-components";
import { DataAction } from "@stefgo/react-ui-components";
import { Badge, Button, Card } from "@stefgo/react-ui-components";

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
                    <Badge variant="neutral" size="sm" className="inline-flex items-center gap-1">
                        <Key size={10} /> Local
                    </Badge>
                )}
                {methods.includes("oidc") && (
                    <Badge variant="info" size="sm" className="inline-flex items-center gap-1">
                        <Globe size={10} /> OIDC
                    </Badge>
                )}
            </div>
        );
    };

    const columns: DataTableDef<UserData>[] = [
        {
            tableHeader: "User",
            tableCellClassName: "font-sm text-text-primary",
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
        <Card
            title={
                <>
                    <User size={18} className="text-text-muted" /> Users
                </>
            }
            action={
                <Button size="sm" icon={Plus} onClick={onCreateUser}>
                    New User
                </Button>
            }
            padding="none"
        >
            <DataTable
                data={users}
                itemDef={columns}
                sort={{ defaultValue: [{ colIndex: 0, direction: "asc" }] }}
                keyField="id"
                isLoading={isLoading}
                loadingMessage="Loading users..."
                emptyMessage="No users found"
                className="rounded-b-xl border-0 shadow-none"
            />
        </Card>
    );
};
