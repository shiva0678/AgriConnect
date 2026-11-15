import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";

export const priceKeys = {
  history: (filters) => ["prices", "history", filters],
  analytics: (filters) => ["prices", "analytics", filters],
};

export function buildPriceQueryParams(filters) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => {
      if (value === undefined || value === null) return false;
      return typeof value !== "string" || value.trim() !== "";
    }),
  );
}

export function usePriceHistoryQuery(filters) {
  return useQuery({
    queryKey: priceKeys.history(filters),
    queryFn: async () => {
      const response = await api.get("/prices", {
        params: buildPriceQueryParams(filters),
      });
      return response.data;
    },
    staleTime: 1000 * 60 * 2,
  });
}

export function usePriceAnalyticsQuery(filters) {
  return useQuery({
    queryKey: priceKeys.analytics(filters),
    queryFn: async () => {
      const response = await api.get("/prices/analytics", {
        params: buildPriceQueryParams(filters),
      });
      return response.data;
    },
    staleTime: 1000 * 60 * 2,
  });
}
