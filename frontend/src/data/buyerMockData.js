export const buyerProfile = {
  name: "Maya Sharma",
  initials: "MS",
  company: "Harvest Table Co.",
  location: "Pune, Maharashtra",
  phone: "+91 98220 16420",
  email: "maya@harvesttable.co",
  memberSince: "February 2026",
};

export const marketplaceCrops = [
  { id: "CR-1048", name: "Tomatoes", category: "Vegetables", region: "Nashik, Maharashtra", shortRegion: "Nashik", quantity: "1,200 kg", quantityValue: 1200, price: "₹32", priceValue: 32, harvestDate: "18 Apr 2026", farmer: "Arjun Mehta", farm: "Mehta Family Farms", farmerInitials: "AM", tone: "tomato", description: "Firm, sun-ripened tomatoes grown in the red soil of Nashik. Harvested at the right moment for a clean journey from field to kitchen." },
  { id: "CR-1042", name: "Red Onions", category: "Vegetables", region: "Nashik, Maharashtra", shortRegion: "Nashik", quantity: "2,400 kg", quantityValue: 2400, price: "₹24", priceValue: 24, harvestDate: "24 Apr 2026", farmer: "Arjun Mehta", farm: "Mehta Family Farms", farmerInitials: "AM", tone: "onion", description: "A crisp, well-cured red onion with excellent shelf life. Grown with care and ready for dependable wholesale supply." },
  { id: "CR-1036", name: "Alphonso Mangoes", category: "Fruits", region: "Ratnagiri, Maharashtra", shortRegion: "Ratnagiri", quantity: "800 kg", quantityValue: 800, price: "₹180", priceValue: 180, harvestDate: "02 May 2026", farmer: "Nisha Patil", farm: "Konkan Orchard", farmerInitials: "NP", tone: "mango", description: "The golden fruit of the Konkan coast. Aromatic Alphonso mangoes with deep colour and a naturally rich finish." },
  { id: "CR-1029", name: "Green Chilli", category: "Vegetables", region: "Nashik, Maharashtra", shortRegion: "Nashik", quantity: "450 kg", quantityValue: 450, price: "₹58", priceValue: 58, harvestDate: "09 Apr 2026", farmer: "Arjun Mehta", farm: "Mehta Family Farms", farmerInitials: "AM", tone: "chilli", description: "Bright, lively green chillies with a balanced heat. Picked fresh for buyers who care about consistency in every batch." },
  { id: "CR-1018", name: "Pearl Millet", category: "Grains", region: "Ahmednagar, Maharashtra", shortRegion: "Ahmednagar", quantity: "3,000 kg", quantityValue: 3000, price: "₹41", priceValue: 41, harvestDate: "15 May 2026", farmer: "Vikram Jadhav", farm: "Jadhav Agro", farmerInitials: "VJ", tone: "millet", description: "Nutty, nourishing pearl millet from a small family farm in Ahmednagar. Available for bulk and repeat orders." },
  { id: "CR-1007", name: "Turmeric", category: "Spices", region: "Satara, Maharashtra", shortRegion: "Satara", quantity: "650 kg", quantityValue: 650, price: "₹92", priceValue: 92, harvestDate: "28 Apr 2026", farmer: "Leela More", farm: "More Fields", farmerInitials: "LM", tone: "turmeric", description: "Sun-dried turmeric with a vivid colour and warm, earthy aroma. Carefully sorted and packed at source." },
];

export const buyerOrders = [
  { id: "ORD-7825", crop: "Tomatoes", farmer: "Mehta Family Farms", quantity: "300 kg", amount: "₹9,600", date: "12 Apr 2026", status: "Confirmed", initials: "AM", tone: "tomato" },
  { id: "ORD-7808", crop: "Alphonso Mangoes", farmer: "Konkan Orchard", quantity: "100 kg", amount: "₹18,000", date: "08 Apr 2026", status: "Shipped", initials: "NP", tone: "mango" },
  { id: "ORD-7792", crop: "Green Chilli", farmer: "Mehta Family Farms", quantity: "150 kg", amount: "₹8,700", date: "03 Apr 2026", status: "Delivered", initials: "AM", tone: "chilli" },
  { id: "ORD-7780", crop: "Pearl Millet", farmer: "Jadhav Agro", quantity: "500 kg", amount: "₹20,500", date: "29 Mar 2026", status: "Pending", initials: "VJ", tone: "millet" },
];