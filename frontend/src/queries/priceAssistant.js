import { useMutation } from "@tanstack/react-query";
import { api } from "../services/api";

export function usePriceAssistantMutation() {
  return useMutation({
    mutationFn: async ({ question }) => {
      const response = await api.post("/prices/assistant", { question });
      return response.data;
    },
  });
}
