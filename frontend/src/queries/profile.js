import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";

export const profileKeys = {
  buyer: ["profile", "buyer"],
  farmer: ["profile", "farmer"],
};

export function useBuyerProfileQuery() {
  return useQuery({
    queryKey: profileKeys.buyer,
    queryFn: async () => {
      const response = await api.get("/auth/me");
      return response.data.user;
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useFarmerProfileQuery() {
  return useQuery({
    queryKey: profileKeys.farmer,
    queryFn: async () => {
      const response = await api.get("/auth/me");
      return response.data.user;
    },
    staleTime: 1000 * 60 * 5,
  });
}
