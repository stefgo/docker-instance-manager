import { useState, useEffect } from "react";
import { apiFetch } from "../../../lib/apiFetch";
import { UserDialog } from "./UserDialog";
import { UserList, UserData } from "./UserList";
import { ConfirmDialog } from "../../../components/ConfirmDialog";

export const UserOverview = () => {
    const [users, setUsers] = useState<UserData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<UserData | null>(null);
    // The user itself, so the dialog names the account it is about.
    const [pendingDelete, setPendingDelete] = useState<UserData | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    // Set instead of pendingDelete when the account is the only one left. A separate state
    // rather than a mode of the delete dialog: the two say different things, and this one
    // must not be able to reach the request at all.
    const [blockedLastUser, setBlockedLastUser] = useState<UserData | null>(null);
    /** Bumped to load the list again after a change; the effect below is the only loader. */
    const [reloadCount, setReloadCount] = useState(0);

    // The effect only ever lowers isLoading: the first load starts with it set, and a
    // reload raises it in fetchUsers, outside the effect. A response that arrives after
    // the next reload has started is dropped, so an older list cannot overwrite a newer one.
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const res = await apiFetch("/api/v1/users");
                if (res.ok) {
                    const list = await res.json();
                    if (!cancelled) setUsers(list);
                }
            } catch (e) {
                console.error(e);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [reloadCount]);

    const fetchUsers = () => {
        setIsLoading(true);
        setReloadCount((n) => n + 1);
    };

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
        if (users.length <= 1) {
            setBlockedLastUser(user);
            return;
        }
        setPendingDelete(user);
    };

    const confirmDeleteUser = async () => {
        if (!pendingDelete) return;
        setIsDeleting(true);
        try {
            const res = await apiFetch(`/api/v1/users/${pendingDelete.id}`, {
                method: "DELETE",
            });
            if (res.ok) {
                setPendingDelete(null);
                fetchUsers();
            } else {
                const data = await res.json();
                alert("Failed to delete user: " + (data.error || "Unknown error"));
            }
        } catch (e) {
            console.error(e);
            alert("Error deleting user");
        } finally {
            setIsDeleting(false);
        }
    };

    const handleSaveUser = async (data: {
        username: string;
        password?: string;
        auth_methods?: string;
    }) => {
        const url = editingUser
            ? `/api/v1/users/${editingUser.id}`
            : "/api/v1/users";
        const method = editingUser ? "PUT" : "POST";

        const res = await apiFetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });

        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || "Failed to save user");
        }

        fetchUsers();
    };

    return (
        <div className="space-y-6">
            <UserList
                users={users}
                isLoading={isLoading}
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

            {/*
              * Deliberately no "loses access immediately": the API checks only the JWT's
              * signature and expiry, not whether the account still exists, so a session
              * the account already holds keeps working until it expires.
              */}
            <ConfirmDialog
                isOpen={!!pendingDelete}
                onClose={() => setPendingDelete(null)}
                onConfirm={confirmDeleteUser}
                title={`Delete user "${pendingDelete?.username}"?`}
                description="The account can no longer sign in. A session it has already opened stays valid until it expires. Nothing else is removed with it -- clients, containers and notifications belong to the installation, not to a user."
                confirmLabel="Delete user"
                variant="danger"
                isConfirming={isDeleting}
            />

            {/*
              * Nothing is deleted here: both buttons close. The dialog exists to say why the
              * delete does not happen, in the place where the operator asked for it.
              */}
            <ConfirmDialog
                isOpen={!!blockedLastUser}
                onClose={() => setBlockedLastUser(null)}
                onConfirm={() => setBlockedLastUser(null)}
                title="Cannot delete the last user"
                description={`"${blockedLastUser?.username}" is the only account left. Deleting it would lock everyone out of this interface, so the server refuses it. Create a second user first.`}
                confirmLabel="OK"
            />
        </div>
    );
};
