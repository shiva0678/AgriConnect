import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";

export const wastageAlertKeys = {
  farmer: (farmerId) => ["wastage-alerts", "farmer", farmerId],
};

export function useWastageAlertsQuery(farmerId) {
  return useQuery({
    queryKey: wastageAlertKeys.farmer(farmerId),
    queryFn: async () => {
      const response = await api.get("/farmer/wastage-alerts");
      return response.data;
    },
    enabled: Boolean(farmerId),
    staleTime: 1000 * 60,
  });
}
