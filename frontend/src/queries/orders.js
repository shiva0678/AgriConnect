import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { buyerOrders } from "../data/buyerMockData";
import { farmerOrders } from "../data/farmerMockData";
import { api } from "../services/api";
import { cropKeys } from "./crops";

export const orderKeys = {
  buyer: ["orders", "buyer"],
  farmer: ["orders", "farmer"],
  detail: (orderId) => ["orders", "detail", orderId],
};

export function useBuyerOrdersQuery() {
  return useQuery({
    queryKey: orderKeys.buyer,
    queryFn: async () => {
      const response = await api.get("/orders");
      return response.data;
    },
    initialData: buyerOrders,
    staleTime: 1000 * 60 * 2,
  });
}

export function useFarmerOrdersQuery() {
  return useQuery({
    queryKey: orderKeys.farmer,
    queryFn: async () => {
      const response = await api.get("/farmer/orders");
      return response.data;
    },
    initialData: farmerOrders,
    staleTime: 1000 * 60 * 2,
  });
}

export function usePlaceOrderMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ cropId, quantity }) => {
      const response = await api.post("/orders", { cropId, quantity });
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: orderKeys.buyer });
      queryClient.invalidateQueries({ queryKey: cropKeys.detail(variables.cropId) });
    },
  });
}
