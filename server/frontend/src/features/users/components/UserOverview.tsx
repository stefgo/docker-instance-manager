import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { userListOptions, useUsers } from "../../../queries/users";
import { QueryError } from "../../../components/QueryError";
import { UserDialog } from "./UserDialog";
import { UserList, UserData } from "./UserList";
import { useConfirm } from "@stefgo/react-ui-components";
import { describeDeleteUser, describeLastUser } from "../confirmations";

const NO_USERS: UserData[] = [];

export const UserOverview = () => {
    const queryClient = useQueryClient();
    // `isPending` only for the first load: a reload after a change keeps the rows showing.
    const { data: users = NO_USERS, isPending, error } = useUsers();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<UserData | null>(null);
    const { confirm, alert } = useConfirm();

    /** Reads the list again after a change. */
    const fetchUsers = () => queryClient.invalidateQueries({ queryKey: userListOptions.queryKey });

    const handleCreateUser = () => {
        setEditingUser(null);
        setIsDialogOpen(true);
    };

    const handleEditUser = (user: UserData) => {
        setEditingUser(user);
        setIsDialogOpen(true);
    };

    /**
     * The list already disables the entry for the last user, so this branch is the second
     * net -- it catches a list that has gone stale, which is exactly when the click gets
     * through. The server refuses the same case in UserController.delete; asking here
     * means the operator reads why instead of an error after the fact.
     */
    const requestDeleteUser = (user: UserData) => {
        // A notice rather than a mode of the delete dialog: the two say different things,
        // and this one must not be able to reach the request at all.
        if (users.length <= 1) {
            alert(describeLastUser(user.username));
            return;
        }
        // A refused delete keeps the dialog open, with the server's reason in it.
        confirm({
            ...describeDeleteUser(user.username),
            onConfirm: async () => {
                await api.delete(`/api/v1/users/${user.id}`, { fallback: "Failed to delete user" });
                fetchUsers();
            },
        });
    };

    const handleSaveUser = async (data: {
        username: string;
        password?: string;
        auth_methods?: string;
    }) => {
        const options = { fallback: "Failed to save user" };
        if (editingUser) await api.put(`/api/v1/users/${editingUser.id}`, data, undefined, options);
        else await api.post("/api/v1/users", data, undefined, options);

        fetchUsers();
    };

    // Instead of the list: an empty one below a toast said there were no users.
    if (error) return <QueryError title="Could not load the users" error={error} />;

    return (
        <div className="space-y-6">
            <UserList
                users={users}
                isLoading={isPending}
                onCreateUser={handleCreateUser}
                onEditUser={handleEditUser}
                onDeleteUser={requestDeleteUser}
            />

            <UserDialog
                isOpen={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
                onSave={handleSaveUser}
                editingUser={editingUser}
            />
        </div>
    );
};
