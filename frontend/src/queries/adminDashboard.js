import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";

const REFRESH_INTERVAL = 60 * 1000;

export const adminDashboardKeys = {
  all: ["admin-dashboard"],
  overview: () => [...adminDashboardKeys.all, "overview"],
  users: (filters) => [...adminDashboardKeys.all, "users", filters],
  crops: (filters) => [...adminDashboardKeys.all, "crops", filters],
  orders: (filters) => [...adminDashboardKeys.all, "orders", filters],
  trends: (filters) => [...adminDashboardKeys.all, "trends", filters],
  activity: (limit) => [...adminDashboardKeys.all, "activity", limit],
};

function analyticsParams(filters = {}) {
  const params = { months: Number(filters.months) || 12 };
  if (filters.fromDate && filters.toDate) {
    params.fromDate = filters.fromDate;
    params.toDate = filters.toDate;
  }
  return params;
}

export function useAdminOverviewQuery() {
  return useQuery({
    queryKey: adminDashboardKeys.overview(),
    queryFn: async ({ signal }) => {
      const response = await api.get("/admin/dashboard/overview", { signal });
      return response.data;
    },
    staleTime: 30 * 1000,
    refetchInterval: REFRESH_INTERVAL,
  });
}

export function useAdminUsersQuery(filters) {
  return useQuery({
    queryKey: adminDashboardKeys.users(filters),
    queryFn: async ({ signal }) => {
      const response = await api.get("/admin/dashboard/users", {
        params: { ...analyticsParams(filters), limit: 6 },
        signal,
      });
      return response.data;
    },
    staleTime: 30 * 1000,
    refetchInterval: REFRESH_INTERVAL,
  });
}

export function useAdminCropsQuery(filters) {
  return useQuery({
    queryKey: adminDashboardKeys.crops(filters),
    queryFn: async ({ signal }) => {
      const response = await api.get("/admin/dashboard/crops", {
        params: analyticsParams(filters),
        signal,
      });
      return response.data;
    },
    staleTime: 30 * 1000,
    refetchInterval: REFRESH_INTERVAL,
  });
}

export function useAdminOrdersQuery(filters) {
  return useQuery({
    queryKey: adminDashboardKeys.orders(filters),
    queryFn: async ({ signal }) => {
      const response = await api.get("/admin/dashboard/orders", {
        params: analyticsParams(filters),
        signal,
      });
      return response.data;
    },
    staleTime: 30 * 1000,
    refetchInterval: REFRESH_INTERVAL,
  });
}

export function useAdminTrendsQuery(filters) {
  return useQuery({
    queryKey: adminDashboardKeys.trends(filters),
    queryFn: async ({ signal }) => {
      const response = await api.get("/admin/dashboard/trends", {
        params: analyticsParams(filters),
        signal,
      });
      return response.data;
    },
    staleTime: 30 * 1000,
    refetchInterval: REFRESH_INTERVAL,
  });
}

export function useAdminRecentActivityQuery(limit = 6) {
  return useQuery({
    queryKey: adminDashboardKeys.activity(limit),
    queryFn: async ({ signal }) => {
      const response = await api.get("/admin/dashboard/recent-activity", {
        params: { limit },
        signal,
      });
      return response.data;
    },
    staleTime: 30 * 1000,
    refetchInterval: REFRESH_INTERVAL,
  });
}
