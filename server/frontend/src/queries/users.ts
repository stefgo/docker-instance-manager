import { queryOptions, useQuery } from "@tanstack/react-query";
import { UserListSchema } from "@dim/shared";
import { api } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";

export const userListOptions = queryOptions({
    queryKey: queryKeys.users.list(),
    queryFn: () => api.get("/api/v1/users", UserListSchema, { fallback: "Failed to load users" }),
});

export function useUsers() {
    return useQuery(userListOptions);
}
