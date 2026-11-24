import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminUserApi } from "../services/adminUserApi";

export const adminUserKeys = {
  all: ["admin-user-management"],
  lists: () => [...adminUserKeys.all, "list"],
  list: (params) => [...adminUserKeys.lists(), params],
  details: () => [...adminUserKeys.all, "detail"],
  detail: (userId) => [...adminUserKeys.details(), userId],
  activity: (userId) => [...adminUserKeys.all, "activity", userId],
};

export function useAdminUsersQuery(params) {
  return useQuery({
    queryKey: adminUserKeys.list(params),
    queryFn: ({ signal }) => adminUserApi.listUsers(params, { signal }),
  });
}

export function useAdminUserQuery(userId) {
  return useQuery({
    queryKey: adminUserKeys.detail(userId),
    queryFn: ({ signal }) => adminUserApi.getUser(userId, { signal }),
    enabled: Boolean(userId),
  });
}

export function useAdminUserActivityQuery(userId) {
  return useQuery({
    queryKey: adminUserKeys.activity(userId),
    queryFn: ({ signal }) => adminUserApi.getUserActivity(userId, { signal }),
    enabled: Boolean(userId),
  });
}

function useAdminUserMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({
      queryKey: adminUserKeys.all,
    }),
  });
}

export function useSuspendAdminUserMutation(userId) {
  return useAdminUserMutation((reason) => adminUserApi.suspendUser(userId, reason));
}

export function useReactivateAdminUserMutation(userId) {
  return useAdminUserMutation(() => adminUserApi.reactivateUser(userId));
}
