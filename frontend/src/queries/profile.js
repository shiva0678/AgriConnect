import { useQuery } from "@tanstack/react-query";
import { buyerProfile } from "../data/buyerMockData";
import { farmerProfile } from "../data/farmerMockData";
import { api } from "../services/api";

export const profileKeys = {
  buyer: ["profile", "buyer"],
  farmer: ["profile", "farmer"],
};

export function useBuyerProfileQuery() {
  return useQuery({
    queryKey: profileKeys.buyer,
    queryFn: async () => {
      const response = await api.get("/profile/buyer");
      return response.data;
    },
    initialData: buyerProfile,
    staleTime: 1000 * 60 * 5,
  });
}

export function useFarmerProfileQuery() {
  return useQuery({
    queryKey: profileKeys.farmer,
    queryFn: async () => {
      const response = await api.get("/profile/farmer");
      return response.data;
    },
    initialData: farmerProfile,
    staleTime: 1000 * 60 * 5,
  });
}
