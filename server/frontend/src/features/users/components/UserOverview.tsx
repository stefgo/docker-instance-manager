import { useState, useEffect } from "react";
import { apiFetch } from "../../../lib/apiFetch";
import { UserDialog } from "./UserDialog";
import { UserList, UserData } from "./UserList";

export const UserOverview = () => {
    const [users, setUsers] = useState<UserData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<UserData | null>(null);
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

    const handleDeleteUser = async (user: UserData) => {
        try {
            const res = await apiFetch(`/api/v1/users/${user.id}`, {
                method: "DELETE",
            });
            if (res.ok) {
                fetchUsers();
            } else {
                const data = await res.json();
                alert("Failed to delete user: " + (data.error || "Unknown error"));
            }
        } catch (e) {
            console.error(e);
            alert("Error deleting user");
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
                onDeleteUser={handleDeleteUser}
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
