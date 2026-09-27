import { useQuery } from "@tanstack/react-query";
import { marketplaceCrops } from "../data/buyerMockData";
import {
  cropListings,
  dashboardStats,
  farmerOrders,
} from "../data/farmerMockData";
import { api } from "../services/api";

export const cropKeys = {
  all: ["crops"],
  list: () => ["crops", "list"],
  detail: (cropId) => ["crops", "detail", cropId],
  farmerList: () => ["crops", "farmer"],
  farmerDashboard: () => ["dashboard", "farmer"],
};

export function useMarketplaceCropsQuery() {
  return useQuery({
    queryKey: cropKeys.list(),
    queryFn: async () => {
      const response = await api.get("/crops");
      return response.data;
    },
    initialData: marketplaceCrops,
    staleTime: 1000 * 60 * 3,
  });
}

export function useCropDetailQuery(cropId) {
  return useQuery({
    queryKey: cropKeys.detail(cropId),
    queryFn: async () => {
      const response = await api.get(`/crops/${cropId}`);
      return response.data;
    },
    enabled: Boolean(cropId),
    initialData:
      marketplaceCrops.find((crop) => crop.id === cropId) || marketplaceCrops[0],
    staleTime: 1000 * 60 * 5,
  });
}

export function useFarmerCropListQuery() {
  return useQuery({
    queryKey: cropKeys.farmerList(),
    queryFn: async () => {
      const response = await api.get("/farmer/crops");
      return response.data;
    },
    initialData: cropListings,
    staleTime: 1000 * 60 * 3,
  });
}

export function useFarmerDashboardQuery() {
  return useQuery({
    queryKey: cropKeys.farmerDashboard(),
    queryFn: async () => {
      const response = await api.get("/farmer/dashboard");
      return response.data;
    },
    initialData: {
      stats: dashboardStats,
      recentCrops: cropListings.slice(0, 3),
      recentOrders: farmerOrders.slice(0, 3),
    },
    staleTime: 1000 * 60 * 2,
  });
}
