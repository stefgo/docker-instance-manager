import { useState, useEffect } from "react";
import { useAuth } from "../../auth/AuthContext";
import { UserDialog } from "./UserDialog";
import { UserList, UserData } from "./UserList";

export const UserOverview = () => {
  const { token } = useAuth();
  const [users, setUsers] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);

  useEffect(() => {
    fetchUsers();
  }, [token]);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/v1/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setUsers(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
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
      const res = await fetch(`/api/v1/users/${user.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
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

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
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
