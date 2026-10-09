import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../services/api";
import { cropKeys, mapOrder } from "./crops";

export const orderKeys = {
  all: ["orders"],
  buyer: (buyerId) => ["orders", "buyer", buyerId],
  farmer: (farmerId) => ["orders", "farmer", farmerId],
  detail: (orderId) => ["orders", "detail", orderId],
};

export function useBuyerOrdersQuery(buyerId) {
  return useQuery({
    queryKey: orderKeys.buyer(buyerId),
    queryFn: async () => {
      const response = await api.get("/orders", { params: { limit: 50 } });
      return (response.data.orders || []).map((order) => mapOrder(order, "buyer"));
    },
    enabled: Boolean(buyerId),
    staleTime: 1000 * 60 * 2,
  });
}

export function useFarmerOrdersQuery(farmerId) {
  return useQuery({
    queryKey: orderKeys.farmer(farmerId),
    queryFn: async () => {
      const response = await api.get("/farmer/orders", { params: { limit: 50 } });
      return (response.data.orders || []).map((order) => mapOrder(order, "farmer"));
    },
    enabled: Boolean(farmerId),
    staleTime: 1000 * 60 * 2,
  });
}

export function usePlaceOrderMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ cropId, quantity }) => {
      const response = await api.post("/orders", { cropId, quantity });
      return response.data.order;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: orderKeys.all });
      queryClient.invalidateQueries({ queryKey: cropKeys.detail(variables.cropId) });
      queryClient.invalidateQueries({ queryKey: cropKeys.list() });
      queryClient.invalidateQueries({ queryKey: ["crops", "farmer"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "farmer"] });
    },
  });
}

export function useUpdateFarmerOrderStatusMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, status }) => {
      const response = await api.patch(`/orders/${orderId}/status`, { status });
      return response.data.order;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orderKeys.all });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "farmer"] });
    },
  });
}
