export const farmerProfile = {
  name: "Arjun Mehta",
  location: "Nashik, Maharashtra",
  initials: "AM",
  farm: "Mehta Family Farms",
  phone: "+91 98765 43210",
  email: "arjun@mehtafarms.in",
  memberSince: "March 2026",
};

export const cropListings = [
  { id: "CR-1048", name: "Tomatoes", category: "Vegetables", quantity: "1,200 kg", price: "₹32 / kg", harvestDate: "18 Apr 2026", region: "Nashik", status: "Active", tone: "tomato" },
  { id: "CR-1042", name: "Onions", category: "Vegetables", quantity: "2,400 kg", price: "₹24 / kg", harvestDate: "24 Apr 2026", region: "Nashik", status: "Active", tone: "onion" },
  { id: "CR-1036", name: "Alphonso Mangoes", category: "Fruits", quantity: "800 kg", price: "₹180 / kg", harvestDate: "02 May 2026", region: "Ratnagiri", status: "Pending", tone: "mango" },
  { id: "CR-1029", name: "Green Chilli", category: "Vegetables", quantity: "450 kg", price: "₹58 / kg", harvestDate: "09 Apr 2026", region: "Nashik", status: "Sold", tone: "chilli" },
];

export const farmerOrders = [
  { id: "ORD-7824", buyer: "FreshCart Organics", crop: "Tomatoes", quantity: "300 kg", amount: "₹9,600", date: "12 Apr 2026", status: "Confirmed", initials: "FO" },
  { id: "ORD-7818", buyer: "Harvest Table Co.", crop: "Onions", quantity: "500 kg", amount: "₹12,000", date: "10 Apr 2026", status: "Shipped", initials: "HT" },
  { id: "ORD-7802", buyer: "Green Basket Market", crop: "Green Chilli", quantity: "150 kg", amount: "₹8,700", date: "07 Apr 2026", status: "Delivered", initials: "GB" },
  { id: "ORD-7795", buyer: "Sahyadri Foods", crop: "Tomatoes", quantity: "200 kg", amount: "₹6,400", date: "05 Apr 2026", status: "Pending", initials: "SF" },
];

export const dashboardStats = [
  { label: "Total crops", value: "12", detail: "+3 this month", icon: "◒", tone: "green" },
  { label: "Active listings", value: "08", detail: "Across 4 categories", icon: "↗", tone: "gold" },
  { label: "Open orders", value: "06", detail: "2 need your attention", icon: "◷", tone: "blue" },
  { label: "Total revenue", value: "₹84.6k", detail: "+18.4% this month", icon: "₹", tone: "rose" },
];