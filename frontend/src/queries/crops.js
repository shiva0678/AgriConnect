import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../services/api";

export const cropKeys = {
  all: ["crops"],
  list: () => ["crops", "list"],
  detail: (cropId) => ["crops", "detail", cropId],
  farmerList: (farmerId) => ["crops", "farmer", farmerId],
  farmerDashboard: (farmerId) => ["dashboard", "farmer", farmerId],
};

const numberFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
});

function cropTone(name = "") {
  const normalized = name.toLowerCase();
  if (normalized.includes("onion")) return "onion";
  if (normalized.includes("mango")) return "mango";
  if (normalized.includes("chilli") || normalized.includes("chili")) return "chilli";
  if (normalized.includes("millet")) return "millet";
  if (normalized.includes("turmeric")) return "turmeric";
  return "tomato";
}

function cropStatus(status) {
  if (status === "available") return "Active";
  if (status === "sold_out") return "Sold";
  return status ? status[0].toUpperCase() + status.slice(1) : "Unknown";
}

function formatDateOnly(value) {
  let dateParts;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    dateParts = [value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate()];
  } else if (typeof value === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value);
    if (match) {
      dateParts = match.slice(1).map(Number);
    }
  }

  if (!dateParts) return "Not specified";

  const [year, month, day] = dateParts;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return "Not specified";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function mapCrop(crop) {
  const priceValue = Number(crop.price);
  const quantityValue = Number(crop.quantity);
  const location = crop.location || "";

  return {
    ...crop,
    priceValue,
    price: `₹${numberFormatter.format(priceValue)}`,
    quantityValue,
    quantity: `${numberFormatter.format(quantityValue)} ${crop.unit || "kg"}`,
    harvestDate: formatDateOnly(crop.harvest_date),
    region: location,
    shortRegion: location.split(",")[0].trim(),
    status: cropStatus(crop.status),
    tone: cropTone(crop.name),
    farmer: crop.farmer_name || "AgriConnect farmer",
    farm: crop.farm_name || "Local farm",
    farmerInitials: (crop.farmer_name || "AF")
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase(),
    description: crop.description || "Fresh produce, listed directly by its farmer.",
    rawDescription: crop.description || "",
  };
}

function mapOrder(order, role) {
  const status = order.status
    ? order.status[0].toUpperCase() + order.status.slice(1)
    : "Pending";
  const displayName = role === "buyer"
    ? order.farmer_name
    : order.buyer_name;
  const name = displayName || (role === "buyer" ? "Farmer" : "Buyer");
  const createdAt = order.created_at
    ? new Date(order.created_at).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
  const amount = Number(order.total_amount);

  return {
    ...order,
    id: order.id,
    crop: order.crop_name || "Crop",
    farmer: name,
    buyer: name,
    quantity: `${numberFormatter.format(Number(order.quantity))} ${order.unit || "kg"}`,
    amount: `₹${numberFormatter.format(amount)}`,
    amountValue: amount,
    date: createdAt,
    status,
    initials: name
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase(),
    tone: cropTone(order.crop_name),
  };
}

export function useMarketplaceCropsQuery() {
  return useQuery({
    queryKey: cropKeys.list(),
    queryFn: async () => {
      const response = await api.get("/crops", { params: { limit: 50 } });
      return (response.data.crops || []).map(mapCrop);
    },
    staleTime: 1000 * 60 * 3,
  });
}

export function useCropDetailQuery(cropId) {
  return useQuery({
    queryKey: cropKeys.detail(cropId),
    queryFn: async () => {
      const response = await api.get(`/crops/${cropId}`);
      return mapCrop(response.data.crop);
    },
    enabled: Boolean(cropId),
    staleTime: 1000 * 60 * 5,
  });
}

export function useFarmerCropListQuery(farmerId) {
  return useQuery({
    queryKey: cropKeys.farmerList(farmerId),
    queryFn: async () => {
      const response = await api.get("/farmer/crops");
      return (response.data.crops || []).map(mapCrop);
    },
    enabled: Boolean(farmerId),
    staleTime: 1000 * 60 * 3,
  });
}

export function useFarmerDashboardQuery(farmerId) {
  return useQuery({
    queryKey: cropKeys.farmerDashboard(farmerId),
    queryFn: async () => {
      const [cropResponse, orderResponse] = await Promise.all([
        api.get("/farmer/crops"),
        api.get("/farmer/orders", { params: { limit: 50 } }),
      ]);
      const crops = (cropResponse.data.crops || []).map(mapCrop);
      const orders = (orderResponse.data.orders || []).map((order) =>
        mapOrder(order, "farmer"),
      );
      const activeCrops = crops.filter((crop) => crop.status === "Active");
      const openOrders = orders.filter(
        (order) => !["Delivered", "Cancelled"].includes(order.status),
      );
      const deliveredRevenue = orders
        .filter((order) => order.status === "Delivered")
        .reduce((total, order) => total + order.amountValue, 0);
      const categories = new Set(activeCrops.map((crop) => crop.category));

      return {
        stats: [
          {
            label: "Total crops",
            value: String(crops.length),
            detail: "Your listed inventory",
            icon: "◒",
            tone: "green",
          },
          {
            label: "Active listings",
            value: String(activeCrops.length),
            detail: `Across ${categories.size} categories`,
            icon: "↗",
            tone: "gold",
          },
          {
            label: "Open orders",
            value: String(openOrders.length),
            detail: "Pending, confirmed, or shipped",
            icon: "◷",
            tone: "blue",
          },
          {
            label: "Delivered revenue",
            value: `₹${numberFormatter.format(deliveredRevenue)}`,
            detail: "From delivered orders",
            icon: "₹",
            tone: "rose",
          },
        ],
        recentCrops: crops.slice(0, 3),
        recentOrders: orders.slice(0, 3),
      };
    },
    enabled: Boolean(farmerId),
    staleTime: 1000 * 60 * 2,
  });
}

export function useCreateCropMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (crop) => {
      const response = await api.post("/crops", crop);
      return response.data.crop;
    },
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: cropKeys.all }),
      queryClient.invalidateQueries({ queryKey: ["dashboard", "farmer"] }),
    ]),
  });
}

export function useUpdateCropMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ cropId, updates }) => {
      const response = await api.patch(`/crops/${cropId}`, updates);
      return response.data.crop;
    },
    onSuccess: (_, variables) => Promise.all([
      queryClient.invalidateQueries({ queryKey: cropKeys.all }),
      queryClient.invalidateQueries({ queryKey: ["dashboard", "farmer"] }),
      queryClient.invalidateQueries({ queryKey: cropKeys.detail(variables.cropId) }),
    ]),
  });
}

export function useDeleteCropMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (cropId) => {
      await api.delete(`/crops/${cropId}`);
      return cropId;
    },
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: cropKeys.all }),
      queryClient.invalidateQueries({ queryKey: ["dashboard", "farmer"] }),
    ]),
  });
}

export { mapCrop, mapOrder };
