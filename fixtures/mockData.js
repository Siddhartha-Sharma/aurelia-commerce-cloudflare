const baseProducts = [
  {
    id: "JWL-1001",
    name: "22K Classic Gold Necklace",
    category: "Necklaces",
    type: "Gold",
    purity: "22K",
    grossWeight: 24.82,
    netWeight: 23.14,
    makingCharge: 12500,
    wastagePercent: 8,
    price: 178450,
    stock: 2,
    hallmark: "916",
    sku: "NK-22K-001",
    image: "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=900&q=80",
    featured: true
  },
  {
    id: "JWL-1002",
    name: "Diamond Solitaire Ring",
    category: "Rings",
    type: "Diamond",
    purity: "18K",
    grossWeight: 4.15,
    netWeight: 3.78,
    makingCharge: 6500,
    wastagePercent: 0,
    price: 89500,
    stock: 4,
    hallmark: "750",
    sku: "RG-DIA-004",
    image: "https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=900&q=80",
    featured: true
  },
  {
    id: "JWL-1003",
    name: "Gold Jhumka Earrings",
    category: "Earrings",
    type: "Gold",
    purity: "22K",
    grossWeight: 8.65,
    netWeight: 8.10,
    makingCharge: 4200,
    wastagePercent: 7,
    price: 62800,
    stock: 6,
    hallmark: "916",
    sku: "ER-JHK-022",
    image: "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=900&q=80",
    featured: true
  },
  {
    id: "JWL-1004",
    name: "Diamond Tennis Bracelet",
    category: "Bracelets",
    type: "Diamond",
    purity: "18K",
    grossWeight: 12.2,
    netWeight: 10.9,
    makingCharge: 9800,
    wastagePercent: 0,
    price: 145000,
    stock: 3,
    hallmark: "750",
    sku: "BR-TEN-008",
    image: "https://images.unsplash.com/photo-1611652022419-a9419f74343d?auto=format&fit=crop&w=900&q=80",
    featured: false
  },
  {
    id: "JWL-1005",
    name: "Men's Gold Chain",
    category: "Chains",
    type: "Gold",
    purity: "22K",
    grossWeight: 18.3,
    netWeight: 17.85,
    makingCharge: 7000,
    wastagePercent: 6,
    price: 129900,
    stock: 5,
    hallmark: "916",
    sku: "CH-MEN-017",
    image: "https://images.unsplash.com/photo-1599459183200-59c7687a0278?auto=format&fit=crop&w=900&q=80",
    featured: false
  },
  {
    id: "JWL-1006",
    name: "Pearl Gold Pendant",
    category: "Pendants",
    type: "Gold",
    purity: "22K",
    grossWeight: 5.1,
    netWeight: 4.66,
    makingCharge: 3100,
    wastagePercent: 5,
    price: 38900,
    stock: 8,
    hallmark: "916",
    sku: "PD-PRL-011",
    image: "https://images.unsplash.com/photo-1617038260897-41a1f14a8ca0?auto=format&fit=crop&w=900&q=80",
    featured: false
  }
];

// Assortment is tuned for Indian shoppers: lighter daily wear and entry budgets,
// silver 925 options, 18K diamond designs, and selected 22K wedding pieces.
const additionalProductSpecs = [
  ["Necklaces","Lightweight 22K Daily Wear Necklace","Gold","22K",4.2,62000],
  ["Necklaces","22K Temple Lakshmi Haar","Gold","22K",18.5,248000],
  ["Necklaces","18K Diamond Floral Necklace","Diamond","18K",8.0,125000],
  ["Necklaces","925 Silver Oxidised Hasli","Silver","925",32,4200],
  ["Necklaces","22K Gold Mangalsutra Necklace","Gold","22K",6.1,89500],
  ["Necklaces","18K Everyday Diamond Necklace","Diamond","18K",4.8,78500],
  ["Necklaces","925 Silver CZ Layered Necklace","Silver","925",24,3600],
  ["Necklaces","22K Antique Bridal Choker","Gold","22K",14.8,198000],
  ["Necklaces","18K Diamond Rosecut Choker","Diamond","18K",12.4,286000],

  ["Rings","22K Gold Daily Wear Band","Gold","22K",2.1,31800],
  ["Rings","18K Diamond Halo Ring","Diamond","18K",3.4,76500],
  ["Rings","925 Silver Adjustable Floral Ring","Silver","925",4.2,1250],
  ["Rings","22K Traditional Signet Ring","Gold","22K",4.5,67200],
  ["Rings","18K Diamond Couple Band","Diamond","18K",5.2,112000],
  ["Rings","925 Silver Men’s Oxidised Ring","Silver","925",8.5,1850],
  ["Rings","14K Petite Diamond Stack Ring","Diamond","14K",1.8,28900],
  ["Rings","22K Floral Gold Cocktail Ring","Gold","22K",5.8,84200],
  ["Rings","925 Silver Kids’ Nazariya Ring","Silver","925",2.8,850],

  ["Earrings","22K Gold Daily Wear Studs","Gold","22K",1.8,27800],
  ["Earrings","22K Antique Chandbali Earrings","Gold","22K",11.2,154000],
  ["Earrings","18K Diamond Solitaire Tops","Diamond","18K",2.0,45800],
  ["Earrings","925 Silver Oxidised Jhumkas","Silver","925",18,2650],
  ["Earrings","22K Floral Drop Earrings","Gold","22K",5.4,78500],
  ["Earrings","18K Diamond Huggie Hoops","Diamond","18K",2.9,62800],
  ["Earrings","925 Silver CZ Everyday Hoops","Silver","925",7.5,1750],
  ["Earrings","18K Diamond Chandbali Earrings","Diamond","18K",7.8,172000],
  ["Earrings","22K Lightweight Bali Earrings","Gold","22K",3.1,46800],

  ["Bracelets","22K Gold Everyday Bracelet","Gold","22K",5.2,76500],
  ["Bracelets","18K Diamond Line Bracelet","Diamond","18K",7.6,158000],
  ["Bracelets","925 Silver Men’s Curb Bracelet","Silver","925",22,3950],
  ["Bracelets","22K Gold Kids’ Bracelet","Gold","22K",3.4,51200],
  ["Bracelets","18K Diamond Floral Bracelet","Diamond","18K",5.8,128000],
  ["Bracelets","925 Silver CZ Tennis Bracelet","Silver","925",16,3200],
  ["Bracelets","22K Antique Gold Bracelet","Gold","22K",10.5,149000],
  ["Bracelets","14K Petite Diamond Station Bracelet","Diamond","14K",2.8,47500],
  ["Bracelets","925 Silver Charm Bracelet","Silver","925",14,2850],

  ["Chains","22K Gold Rolo Chain","Gold","22K",7.5,109000],
  ["Chains","22K Gold Men’s Rope Chain","Gold","22K",15.2,218000],
  ["Chains","925 Silver Men’s Curb Chain","Silver","925",28,4950],
  ["Chains","18K Diamond-Cut Link Chain","Diamond","18K",8.4,118000],
  ["Chains","22K Gold Baby Chain","Gold","22K",3.2,48500],
  ["Chains","925 Silver Unisex Box Chain","Silver","925",12,2250],
  ["Chains","18K Diamond Station Chain","Diamond","18K",5.5,98500],
  ["Chains","22K Gold Singapore Chain","Gold","22K",6.4,94800],
  ["Chains","925 Silver Oxidised Tribal Chain","Silver","925",35,5200],

  ["Pendants","22K Gold Om Pendant","Gold","22K",2.4,36500],
  ["Pendants","22K Lakshmi Coin Pendant","Gold","22K",5.8,83500],
  ["Pendants","18K Diamond Solitaire Pendant","Diamond","18K",1.7,39800],
  ["Pendants","925 Silver Initial Pendant","Silver","925",5.5,1450],
  ["Pendants","18K Diamond Mangalsutra Pendant","Diamond","18K",3.2,72800],
  ["Pendants","925 Silver Ganesha Pendant","Silver","925",9.5,1950],
  ["Pendants","22K Gold Peacock Pendant","Gold","22K",4.1,62500],
  ["Pendants","14K Petite Diamond Heart Pendant","Diamond","14K",1.5,26500],
  ["Pendants","925 Silver Navratna Pendant","Silver","925",8.2,2350],

  ["Bangles","22K Gold Daily Wear Kada","Gold","22K",8.5,124000],
  ["Bangles","22K Antique Bridal Bangles Pair","Gold","22K",24,348000],
  ["Bangles","925 Silver Oxidised Kada","Silver","925",32,5450],
  ["Bangles","18K Diamond Flex Bangle","Diamond","18K",12.5,268000],
  ["Bangles","22K Gold Kids’ Kada","Gold","22K",4.2,63500],
  ["Bangles","925 Silver CZ Bangles Pair","Silver","925",26,4850],
  ["Bangles","18K Diamond Accent Bangle","Diamond","18K",8.3,178000],
  ["Bangles","22K Lightweight Gold Bangles Pair","Gold","22K",12.2,178000],
  ["Bangles","925 Silver Floral Kada","Silver","925",21,3850],
  ["Bangles","22K Temple-Style Bridal Kada","Gold","22K",18,265000]
];

const categoryImages = {
  Necklaces: ["photo-1599643478518-a784e5dc4c8f", "photo-1617038260897-41a1f14a8ca0", "photo-1611652022419-a9419f74343d"],
  Rings: ["photo-1605100804763-247f67b3557e", "photo-1603561596112-0a132b757442", "photo-1596944924616-7b38e7cfac36"],
  Earrings: ["photo-1535632066927-ab7c9ab60908", "photo-1630019852942-f89202989a59", "photo-1617038220319-276d3cfab638"],
  Bracelets: ["photo-1611652022419-a9419f74343d", "photo-1611591437281-460bfbe1220a", "photo-1603561596112-0a132b757442"],
  Chains: ["photo-1599459183200-59c7687a0278", "photo-1617038260897-41a1f14a8ca0", "photo-1599643478518-a784e5dc4c8f"],
  Pendants: ["photo-1617038260897-41a1f14a8ca0", "photo-1599643478518-a784e5dc4c8f", "photo-1611652022419-a9419f74343d"],
  Bangles: ["photo-1611652022419-a9419f74343d", "photo-1611591437281-460bfbe1220a", "photo-1535632066927-ab7c9ab60908"]
};
const skuPrefixes = { Necklaces: "NK", Rings: "RG", Earrings: "ER", Bracelets: "BR", Chains: "CH", Pendants: "PD", Bangles: "BG" };

const additionalProducts = additionalProductSpecs.map(([category, name, type, purity, netWeight, price], index) => {
  const localIndex = additionalProductSpecs.slice(0, index).filter((item) => item[0] === category).length;
  const hallmark = purity === "925" ? "925" : purity === "22K" ? "916" : purity === "18K" ? "750" : "585";
  const image = categoryImages[category][localIndex % categoryImages[category].length];
  return {
    id: `JWL-${String(2001 + index).padStart(4, "0")}`,
    name,
    category,
    type,
    purity,
    grossWeight: Number((netWeight * (type === "Gold" ? 1.08 : 1.04)).toFixed(2)),
    netWeight,
    makingCharge: Math.round(price * (type === "Silver" ? 0.12 : 0.07)),
    wastagePercent: type === "Gold" ? 5 : 0,
    price,
    stock: 2 + (index % 7),
    hallmark,
    sku: `${skuPrefixes[category]}-${purity.replace("K", "")}-${String(localIndex + 1).padStart(3, "0")}`,
    image: `https://images.unsplash.com/${image}?auto=format&fit=crop&w=900&q=80`,
    featured: localIndex < 2
  };
});

export const products = [...baseProducts, ...additionalProducts];

export const initialCustomers = [
  { id: "CUS-001", name: "Rahul Kumar", phone: "9876543210", city: "Hyderabad", purchases: 7, spend: 384500 },
  { id: "CUS-002", name: "Priya Sharma", phone: "9988776655", city: "Secunderabad", purchases: 4, spend: 210800 },
  { id: "CUS-003", name: "Amit Verma", phone: "9123456780", city: "Hyderabad", purchases: 2, spend: 98000 }
];

export const initialOrders = [
  {
    id: "ORD-20260925-001",
    customer: "Rahul Kumar",
    channel: "ONLINE",
    status: "CONFIRMED",
    payment: "PAID",
    total: 89500,
    createdAt: "2026-09-25 11:20",
    items: [{ productId: "JWL-1002", name: "Diamond Solitaire Ring", qty: 1, price: 89500 }]
  },
  {
    id: "POS-20260925-014",
    customer: "Walk-in Customer",
    channel: "POS",
    status: "COMPLETED",
    payment: "UPI",
    total: 62800,
    createdAt: "2026-09-25 12:10",
    items: [{ productId: "JWL-1003", name: "Gold Jhumka Earrings", qty: 1, price: 62800 }]
  }
];

export const goldRates = {
  "24K": 12850,
  "22K": 11780,
  "18K": 9638
};

export const categories = ["All", "Necklaces", "Rings", "Earrings", "Bracelets", "Chains", "Pendants", "Bangles"];
