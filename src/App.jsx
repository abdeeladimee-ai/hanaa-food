/* eslint-disable no-irregular-whitespace, no-unused-vars */
import { useEffect, useMemo, useState } from "react";
import "./App.css";
import MapView from "./MapView";
import RoleWorkflow from "./RoleWorkflow";
import AdminDashboard from "./pages/AdminDashboard";
import DeliveryOrders from "./pages/DeliveryOrders";
import PickupOrders from "./pages/PickupOrders";
import DriverDashboard from "./pages/DriverDashboard";
import AdminDirectory from "./pages/AdminDirectory";
import Login from "./pages/Login";
import { authorizedPath, getSession, homePathForRole } from "./auth";

const routeViews = { "/login": "login", "/admin": "admin-dashboard", "/admin/commandes-livraison": "delivery-orders", "/admin/commandes-emporter": "pickup-orders", "/admin/livreurs": "driver-management", "/admin/utilisateurs": "user-management", "/snack": "snack-delivery", "/livreur": "driver" };

const photo = (id) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=82`;
const categories = [
  ["Menus", "menus"],
  ["Tacos Classiques", "tacos-classiques"],
  ["Mini Tacos Étudiants", "mini-tacos"],
  ["Tacos Spéciaux", "tacos-speciaux"],
  ["Wraps", "wraps"],
  ["Sandwichs Classiques", "sandwichs-classiques"],
  ["Sandwichs Spéciaux", "sandwichs-speciaux"],
  ["Bowls", "bowls"],
  ["Burgers", "burgers"],
  ["Pizzas", "pizzas"],
  ["Tapas", "tapas"],
  ["Salades", "salades"],
  ["Pâtes", "pates"],
  ["Pasticcios", "pasticcios"],
  ["Plats", "plats"],
  ["Grillades", "grillades"],
  ["Jus", "jus"],
  ["Supplément Jus", "supplement-jus"],
  ["Desserts", "desserts"],
  ["Suppléments", "supplements"],
  ["Boissons", "boissons"],
].map(([label, id]) => ({ label, id }));

const defaultBranches = [
  {
    id: "tadart",
    name: "Hanaa Food Tadart",
    address: "Tadart",
    latitude: 33.533533,
    longitude: -7.616479,
    phone: "",
    isOpen: true,
    deliveryEnabled: true,
    pickupEnabled: true,
    deliveryRadiusKm: 10,
    deliveryZones: [
      { maxKm: 2, fee: 10 },
      { maxKm: 4, fee: 15 },
      { maxKm: 6, fee: 20 },
      { maxKm: 8, fee: 25 },
      { maxKm: 10, fee: 30 },
    ],
    deliveryPricingSettings: {
      baseFee: 10,
      pricePerKm: 2,
      minimumFee: 10,
      maximumDistanceKm: 10,
      freeDeliveryThreshold: 150,
    },
  },
  {
    id: "amgala",
    name: "Hanaa Food Amgala",
    address: "Amgala",
    latitude: 33.544571852751574,
    longitude: -7.5862466958914645,
    phone: "",
    isOpen: true,
    deliveryEnabled: true,
    pickupEnabled: true,
    deliveryRadiusKm: 10,
    deliveryZones: [
      { maxKm: 2, fee: 10 },
      { maxKm: 4, fee: 15 },
      { maxKm: 6, fee: 20 },
      { maxKm: 8, fee: 25 },
      { maxKm: 10, fee: 30 },
    ],
    deliveryPricingSettings: {
      baseFee: 10,
      pricePerKm: 2,
      minimumFee: 10,
      maximumDistanceKm: 10,
      freeDeliveryThreshold: 150,
    },
  },
  {
    id: "rue-baghdad",
    name: "Hanaa Food Rue Baghdad",
    address: "Rue Baghdad",
    latitude: 33.54931724246645,
    longitude: -7.594107720391539,
    phone: "",
    isOpen: true,
    deliveryEnabled: true,
    pickupEnabled: true,
    deliveryRadiusKm: 10,
    deliveryZones: [
      { maxKm: 2, fee: 10 },
      { maxKm: 4, fee: 15 },
      { maxKm: 6, fee: 20 },
      { maxKm: 8, fee: 25 },
      { maxKm: 10, fee: 30 },
    ],
    deliveryPricingSettings: {
      baseFee: 10,
      pricePerKm: 2,
      minimumFee: 10,
      maximumDistanceKm: 10,
      freeDeliveryThreshold: 150,
    },
  },
];
const storedBranches =
  typeof window !== "undefined" ? localStorage.getItem("hanaa-branches") : null;

const branches = (() => {
  if (!storedBranches) return defaultBranches;

  try {
    const savedBranches = JSON.parse(storedBranches);

    if (!Array.isArray(savedBranches) || !savedBranches.length) {
      return defaultBranches;
    }

    return savedBranches
      .map((savedBranch) => {
        const fallback = defaultBranches.find(
          (item) => item.id === savedBranch?.id,
        );

        if (!fallback) return null;

        return {
          ...fallback,
          ...savedBranch,
          latitude: fallback.latitude,
          longitude: fallback.longitude,
          deliveryZones:
            Array.isArray(savedBranch.deliveryZones) &&
            savedBranch.deliveryZones.length
              ? savedBranch.deliveryZones
              : fallback.deliveryZones,
          deliveryPricingSettings: {
            ...fallback.deliveryPricingSettings,
            ...(savedBranch.deliveryPricingSettings || {}),
          },
        };
      })
      .filter(Boolean);
  } catch {
    return defaultBranches;
  }
})();

const routingEndpoint = "https://router.project-osrm.org/route/v1/driving";
async function geocodePlace(query) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query + ", Morocco")}`,
  );
  if (!response.ok) throw new Error("geocoding-failed");
  const results = await response.json();
  return results[0]
    ? {
        latitude: Number(results[0].lat),
        longitude: Number(results[0].lon),
        formattedAddress: results[0].display_name,
      }
    : null;
}
async function routeBetween(origin, destination) {
  if (!origin || !destination) return null;
  const response = await fetch(
    `${routingEndpoint}/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson`,
  );
  if (!response.ok) throw new Error("routing-failed");
  const data = await response.json();
  const route = data.routes?.[0];
  return route
    ? {
        distanceMeters: Math.round(route.distance),
        distanceKm: route.distance / 1000,
        durationMinutes: Math.max(1, Math.round(route.duration / 60)),
        estimatedTravelTime: Math.max(1, Math.round(route.duration / 60)),
        geometry: route.geometry,
      }
    : null;
}
const images = {
  menus: "photo-1521305916504-4a1121188589",
  tacos: "photo-1565299585323-38d6b0865b47",
  wraps: "photo-1626700051175-6818013e1d4f",
  bowls: "photo-1547592180-85f173990554",
  burgers: "photo-1568901346375-23c9450c58cd",
  salads: "photo-1512621776951-a57141f2eefd",
  pasta: "photo-1473093295043-cdd812d0e601",
  plated: "photo-1547592180-85f173990554",
  grill: "photo-1544025162-d76694265947",
  juice: "photo-1600271886742-f049cd451bba",
  dessert: "photo-1606313564200-e75d5e30476c",
  drink: "photo-1622483767028-3f66f32aef97",
  pizza: "photo-1579751626657-72bc17010498",
  tapas: "photo-1541592106381-b31e9677c0e5",
};
const extras = [
  { name: "Frites", price: 10 },
  { name: "Soda", price: 6 },
  { name: "Sauce", price: 3 },
  { name: "Fromage", price: 3 },
  { name: "Mozzarella", price: 5 },
  { name: "Champignon frais", price: 8 },
  { name: "Potatoes", price: 12 },
];
const pastaVariants = ["Penne", "Spaghetti", "Tagliatelle"];
const accompaniments = [
  "Pâtes sauce champignon",
  "Pâtes sauce blanche",
  "Riz",
  "Légumes sautés",
  "Frites",
  "Potatoes",
];
const rawProducts = [
  ["Menu Solo", "menus", 50, "Pizza N°24 (margherita, bolognaise, thon ou quatre fromage) + Cheese burger + Boisson 25 cl.", images.menus],
  ["Menu Duo", "menus", 95, "Pizza N°29 (margherita, bolognaise, thon ou quatre fromage) + 2 Cheese burgers + Boisson 1 L.", images.menus],
  ["Menu Crunchy", "menus", 95, "Plat Chicken + Tacos + Burger + Frites.", images.menus],
  ["Menu Quatro", "menus", 120, "Pizza N°29 (margherita, bolognaise, thon ou quatre fromage) + 4 Cheese burgers + Boisson 1 L.", images.menus],
  ["Menu Sekhawa", "menus", 125, "Pizza bolognaise + Plat Chicken + Tacos + Burger + Nuggets.", images.menus],

  ["Poulet", "tacos-classiques", 30, "Tacos poulet.", images.tacos, { M: 30, L: 40, XL: 50 }],
  ["Viande Hachée", "tacos-classiques", 35, "Tacos viande hachée.", images.tacos, { M: 35, L: 45, XL: 55 }],
  ["Nuggets", "tacos-classiques", 30, "Tacos nuggets.", images.tacos, { M: 30, L: 40, XL: 50 }],
  ["Cordon Bleu", "tacos-classiques", 30, "Tacos cordon bleu.", images.tacos, { M: 30, L: 40, XL: 55 }],
  ["Hanaa Food", "tacos-classiques", 40, "Tacos signature Hanaa Food.", images.tacos, { M: 40, L: 50, XL: 65 }],
  ["Mixte", "tacos-classiques", 40, "Tacos mixte.", images.tacos, { M: 40, L: 50, XL: 65 }],
  ["Géant", "tacos-classiques", 40, "Tacos géant.", images.tacos, { M: 40, L: 50, XL: 65 }],

  ["Poulet", "mini-tacos", 25, "Mini tacos étudiant poulet.", images.tacos],
  ["Viande Hachée", "mini-tacos", 30, "Mini tacos étudiant viande hachée.", images.tacos],
  ["Mixte", "mini-tacos", 35, "Mini tacos étudiant mixte.", images.tacos],

  ["Chicken Cheesy Curry", "tacos-speciaux", 60, "Poulet mariné curry, nuggets, sauce fromagère, frite. Gratiné 3 fromages.", images.tacos],
  ["Le BBR", "tacos-speciaux", 60, "Cordon bleu, viande hachée, jambon de dinde, oignon crispy, sauce fromagère, frite, sauce au choix. Gratiné Gouda.", images.tacos],
  ["O'Capyk", "tacos-speciaux", 60, "Nuggets fromage, poulet curry, viande hachée, sauce fromagère, frite, sauce piquante. Gratiné cheddar.", images.tacos],
  ["El Gringo", "tacos-speciaux", 60, "Poulet, tenders, nuggets, sauce Chili Tai, oignon crispy, sauce fromagère, frite. Gratiné cheddar mexicain.", images.tacos],
  ["Le Suisse", "tacos-speciaux", 60, "Escalope de poulet, jambon de dinde, tenders, sauce fromagère, frite, oignon crispy. Gratiné gruyère.", images.tacos],
  ["So' Raclette", "tacos-speciaux", 60, "Balls raclette, viande hachée, sauce sweet, onions, sauce fromagère, frite. Gratiné 2 fromages et charcuterie.", images.tacos],

  ["Chicken Louisiane", "wraps", 35, "Crudité, tenders, sauce Big Mac, sauce fromagère.", images.wraps],
  ["Chicken Onions", "wraps", 40, "Crudité, tenders, sauce Big Mac, sauce fromagère.", images.wraps],
  ["El Dorado", "wraps", 65, "Viande hachée, œuf, rösti, jambon de dinde, cheddar, salade, tomate, sauce fromagère.", images.wraps],
  ["Diablo", "wraps", 65, "Tenders, steak de viande hachée, nuggets fromage, salade, tomate, fromage mix, sauce cheddar et fromagère.", images.wraps],
  ["Sovereign", "wraps", 70, "Nuggets, jambon de dinde, escalope de poulet, steak de viande hachée, tenders, fromage mix, salade, tomate, sauce cheddar et fromagère.", images.wraps],

  ["Thon", "sandwichs-classiques", 20, "Sandwich classique thon.", images.wraps],
  ["Nuggets", "sandwichs-classiques", 25, "Sandwich classique nuggets.", images.wraps],
  ["Poulet", "sandwichs-classiques", 25, "Sandwich classique poulet.", images.wraps],
  ["Viande Hachée", "sandwichs-classiques", 30, "Sandwich classique viande hachée.", images.wraps],
  ["Mixte", "sandwichs-classiques", 30, "Sandwich classique mixte.", images.wraps],

  ["Le Best", "sandwichs-speciaux", 60, "Steak V.H + escalope de poulet.", images.wraps],
  ["Escabri", "sandwichs-speciaux", 60, "Escalope de poulet + fromage blanc.", images.wraps],
  ["Zinger", "sandwichs-speciaux", 60, "Steak V.H + tenders + escalope de poulet.", images.wraps],
  ["Phénomène", "sandwichs-speciaux", 45, "Poulet + cordon bleu.", images.wraps],
  ["Quatro", "sandwichs-speciaux", 45, "Steak haché + œuf.", images.wraps],
  ["Le Blindé", "sandwichs-speciaux", 45, "Steak V.H + cordon bleu.", images.wraps],
  ["Triple Steak", "sandwichs-speciaux", 45, "Steak V.H + dinde fumée.", images.wraps],
  ["Radical", "sandwichs-speciaux", 45, "Steak V.H + poulet mariné.", images.wraps],
  ["Buffalo", "sandwichs-speciaux", 45, "Steak V.H + œuf + dinde fumée.", images.wraps],
  ["Escalope du Chef", "sandwichs-speciaux", 40, "Poulet + champignon + sauce emmental.", images.wraps],
  ["Steak Hachée", "sandwichs-speciaux", 40, "Steak haché.", images.wraps],
  ["Méga Fish", "sandwichs-speciaux", 40, "Poisson crispy.", images.wraps],
  ["Méga Chicken", "sandwichs-speciaux", 40, "Poulet crispy.", images.wraps],
  ["Chicken Mixte", "sandwichs-speciaux", 45, "Épices tandoori et curry.", images.wraps],
  ["Chicken Jaune", "sandwichs-speciaux", 40, "Épices curry.", images.wraps],
  ["Chicken Blanc", "sandwichs-speciaux", 40, "Crème fraîche.", images.wraps],
  ["Chicken Rouge", "sandwichs-speciaux", 40, "Épices tandoori.", images.wraps],
  ["Mexicain", "sandwichs-speciaux", 40, "Cuisse de dinde, poivron et oignon.", images.wraps],
  ["Hot Mixte", "sandwichs-speciaux", 35, "Steak haché + hot dog.", images.wraps],
  ["Cordon Bleu", "sandwichs-speciaux", 35, "Cordon bleu.", images.wraps],

  ["Fondon", "bowls", 60, "Poulet, chicken crispy, onion rings, oignon crispy, sauce cheddar, frite, sauce fromagère.", images.bowls],
  ["New-York", "bowls", 60, "Tenders, jambon de dinde, nuggets, oignon crispy, sauce cheddar, frite, sauce fromagère.", images.bowls],
  ["Chicken Riz", "bowls", 50, "Chicken crispy, riz, sauce cheddar, sauce fromagère, oignon crispy.", images.bowls],
  ["Mix Match", "bowls", 60, "Nuggets fromage, jambon de dinde, viande hachée, poulet, oignon crispy, sauce cheddar, frite, sauce fromagère.", images.bowls],
  ["Veggie", "bowls", 60, "Bowl veggie Hanaa Food.", images.bowls],

  ["Mini Cheese", "burgers", 20, "Mini cheese burger.", images.burgers],
  ["Cheese Burger", "burgers", 30, "Cheese burger.", images.burgers],
  ["Chicken", "burgers", 30, "Burger chicken.", images.burgers],
  ["Cheese Omelette", "burgers", 35, "Burger cheese omelette.", images.burgers],
  ["Crispy Chicken", "burgers", 40, "Burger crispy chicken.", images.burgers],
  ["Fish", "burgers", 40, "Burger fish.", images.burgers],
  ["Chicken Rosti", "burgers", 40, "Burger chicken rösti.", images.burgers],
  ["Big Mac", "burgers", 45, "Burger Big Mac.", images.burgers],
  ["Boeuf Rosti", "burgers", 45, "Burger bœuf rösti.", images.burgers],
  ["Double Chicken", "burgers", 45, "Burger double chicken.", images.burgers],
  ["Texas", "burgers", 50, "Burger Texas.", images.burgers],
  ["Le King", "burgers", 50, "Burger Le King.", images.burgers],

  ["Marocaine", "salades", 25, "Laitue, tomate, oignon, poivron, olives noires, concombre, thon.", images.salads],
  ["Niçoise", "salades", 30, "Laitue, concombre, carotte, betterave, pomme de terre, tomate, maïs, thon, œuf.", images.salads],
  ["Mexicaine", "salades", 35, "Tomate cerise, poivron, riz, fromage, maïs, thon, œuf.", images.salads],
  ["César", "salades", 40, "Laitue romaine, croûton, parmesan, tomate cerise, poulet grillé.", images.salads],
  ["Hanaa Food", "salades", 55, "Tomate cerise, salade verte, fromage, avocat, fruit de saison, thon, surimi, calamar, crevette.", images.salads],

  ["Poulet Champignon", "pates", 35, "Sauce blanche ou brune, fromage, champignon, poulet, ail.", images.pasta, pastaVariants],
  ["Carbonara", "pates", 35, "Sauce blanche, parmesan, champignon, dinde fumée, ail.", images.pasta, pastaVariants],
  ["Quatre Fromage", "pates", 40, "Sauce blanche, mozzarella, parmesan, fromage rouge, fromage bleu.", images.pasta, pastaVariants],
  ["Bolognaise", "pates", 40, "Sauce tomate, parmesan, basilic, viande hachée, ail.", images.pasta, pastaVariants],
  ["Hanaa Food", "pates", 45, "Sauce blanche, basilic, champignon, parmesan, poulet, dinde fumée, ail.", images.pasta, pastaVariants],
  ["Fruit de Mer", "pates", 50, "Sauce blanche ou sauce tomate, basilic, parmesan, crevette, seiche, ail.", images.pasta, pastaVariants],
  ["Lasagne", "pates", 45, "Sauce béchamel, basilic, viande hachée.", images.pasta],

  ["Hot Dog", "pasticcios", 30, "Pasticcio hot dog.", images.plated],
  ["Charcuterie", "pasticcios", 35, "Pasticcio charcuterie.", images.plated],
  ["Poulet", "pasticcios", 35, "Pasticcio poulet.", images.plated],
  ["Viande Hachée", "pasticcios", 35, "Pasticcio viande hachée.", images.plated],
  ["Mixte", "pasticcios", 40, "Pasticcio mixte.", images.plated],
  ["Hanaa Food", "pasticcios", 45, "Pasticcio Hanaa Food.", images.plated],

  ["Chicken Eco", "plats", 35, "Plat Chicken Eco. Servi avec deux accompagnements au choix.", images.plated],
  ["Chicken Hanaa Food", "plats", 50, "Plat Chicken Hanaa Food. Servi avec deux accompagnements au choix.", images.plated],
  ["Chicken Tandoori", "plats", 60, "Plat Chicken Tandoori. Servi avec deux accompagnements au choix.", images.plated],
  ["Poulet Parmigiana", "plats", 60, "Poulet Parmigiana. Servi avec deux accompagnements au choix.", images.plated],
  ["Émincé de Poulet", "plats", 60, "Émincé de poulet. Servi avec deux accompagnements au choix.", images.plated],
  ["Escalope de Poulet Milanaise", "plats", 60, "Escalope de poulet milanaise. Servie avec deux accompagnements au choix.", images.plated],
  ["Cordon Bleu", "plats", 60, "Cordon bleu. Servi avec deux accompagnements au choix.", images.plated],
  ["Suprême de Poulet", "plats", 60, "Suprême de poulet. Servi avec deux accompagnements au choix.", images.plated],
  ["Plat Fitness", "plats", 60, "Plat fitness. Servi avec deux accompagnements au choix.", images.plated],

  ["Brochettes Poulet", "grillades", 50, "Brochettes poulet. Servies avec deux accompagnements au choix.", images.grill],
  ["Brochettes Viande Hachée", "grillades", 60, "Brochettes viande hachée. Servies avec deux accompagnements au choix.", images.grill],
  ["Brochettes Mixte", "grillades", 65, "Brochettes mixtes. Servies avec deux accompagnements au choix.", images.grill],


  ["Hot Dog", "pizzas", 25, "Pizza Hot Dog.", images.pizza],
  ["Margharita", "pizzas", 25, "Pizza Margharita.", images.pizza],
  ["Poulet", "pizzas", 30, "Pizza Poulet.", images.pizza],
  ["Thon", "pizzas", 30, "Pizza Thon.", images.pizza],
  ["Charcuterie", "pizzas", 30, "Pizza Charcuterie.", images.pizza],
  ["Pepperoni", "pizzas", 30, "Pizza Pepperoni.", images.pizza],
  ["Quatre Fromage", "pizzas", 35, "Pizza Quatre Fromage.", images.pizza],
  ["Quatre Saisons", "pizzas", 35, "Pizza Quatre Saisons.", images.pizza],
  ["Suprême", "pizzas", 35, "Pizza Suprême.", images.pizza],
  ["Viande Hachée", "pizzas", 35, "Pizza Viande Hachée.", images.pizza],
  ["Calzon", "pizzas", 35, "Pizza Calzon.", images.pizza],

  ["Nuggets", "tapas", 15, "Tapas nuggets.", images.tapas],
  ["Oignon rings", "tapas", 15, "Tapas oignon rings.", images.tapas],
  ["Stick mozza", "tapas", 20, "Tapas stick mozzarella.", images.tapas],

  ["Détox", "jus", 12, "Jus détox.", images.juice],
  ["Orange", "jus", 15, "Jus d'orange.", images.juice],
  ["Banane", "jus", 15, "Jus banane.", images.juice],
  ["Pomme", "jus", 15, "Jus pomme.", images.juice],
  ["Papaye", "jus", 20, "Jus papaye.", images.juice],
  ["Fraise", "jus", 20, "Jus fraise.", images.juice],
  ["Ananas", "jus", 20, "Jus ananas.", images.juice],
  ["Mangue", "jus", 20, "Jus mangue.", images.juice],
  ["Panaché", "jus", 20, "Jus panaché.", images.juice],
  ["Exotique", "jus", 20, "Jus exotique.", images.juice],
  ["Avocat", "jus", 20, "Jus avocat.", images.juice],
  ["Avocat fruit sec", "jus", 25, "Jus avocat avec fruits secs.", images.juice],
  ["Avocat Oreo", "jus", 25, "Jus avocat Oreo.", images.juice],
  ["Avocat Kit Kat", "jus", 25, "Jus avocat Kit Kat.", images.juice],
  ["Protéine", "jus", 35, "Jus protéiné.", images.juice],

  ["Scoop Protein Weight", "supplement-jus", 15, "Supplément jus.", images.juice],
  ["Scoop Protein Mass", "supplement-jus", 15, "Supplément jus.", images.juice],
  ["Fruits sec", "supplement-jus", 10, "Supplément fruits secs.", images.juice],
  ["Flocon d'avoine", "supplement-jus", 5, "Supplément flocons d'avoine.", images.juice],

  ["Salade de fruit", "desserts", 20, "Salade de fruits.", images.dessert],
  ["Tiramisu", "desserts", 20, "Tiramisu.", images.dessert],
  ["Panna Cotta", "desserts", 15, "Panna cotta.", images.dessert],
  ["Cheese Cake", "desserts", 20, "Cheesecake.", images.dessert],

  ["Pain maison", "supplements", 3, "Supplément pain maison.", images.plated],
  ["Sauce", "supplements", 3, "Supplément sauce.", images.plated],
  ["Fromage", "supplements", 3, "Supplément fromage.", images.plated],
  ["Mozzarella", "supplements", 5, "Supplément mozzarella.", images.plated],
  ["Champignon frais", "supplements", 8, "Supplément champignon frais.", images.plated],
  ["Frite", "supplements", 10, "Supplément frites.", images.plated],
  ["Potatoes", "supplements", 12, "Supplément potatoes.", images.plated],
  ["Légumes sautés", "supplements", 15, "Supplément légumes sautés.", images.plated],
  ["Pâte", "supplements", 25, "Supplément pâtes.", images.plated],
  ["Risotto", "supplements", 25, "Supplément risotto.", images.plated],
  ["Sauce champignon", "supplements", 10, "Supplément sauce champignon.", images.plated],
  ["Brochette poulet", "supplements", 10, "Supplément brochette poulet.", images.grill],
  ["Brochette V. Hachée", "supplements", 10, "Supplément brochette viande hachée.", images.grill],
  ["Brochette merguez", "supplements", 10, "Supplément brochette merguez.", images.grill],
  ["Chicken", "supplements", 10, "Supplément chicken.", images.plated],

  ["Soda 25 cl Coca/Fanta/Sprite", "boissons", 6, "Soda 25 cl.", images.drink],
  ["Soda 25 cl Hawai/Poms", "boissons", 8, "Soda 25 cl.", images.drink],
  ["Soda 33 cl", "boissons", 10, "Soda 33 cl.", images.drink],
  ["Soda 1 L", "boissons", 12, "Soda 1 litre.", images.drink],
  ["Eau", "boissons", 5, "Eau.", images.drink],
  ["Énergie Oasis", "boissons", 18, "Boisson énergie Oasis.", images.drink],
  ["Oulmes Eau", "boissons", 6, "Oulmes eau.", images.drink],
  ["Oulmes Soda", "boissons", 10, "Oulmes soda.", images.drink],
];

const productImageMap = {
  "menus|Menu Solo": "/products/menus-menu-solo.jpg",
  "menus|Menu Duo": "/products/menus-menu-duo.jpg",
  "menus|Menu Crunchy": "/products/menus-menu-crunchy.jpg",
  "menus|Menu Quatro": "/products/menus-menu-quatro.jpg",
  "menus|Menu Sekhawa": "/products/menus-menu-sekhawa.jpg",
  "tacos-speciaux|Chicken Cheesy Curry": "/products/tacos-speciaux-chicken-cheesy-curry.jpg",
  "tacos-speciaux|Le BBR": "/products/tacos-speciaux-le-bbr.jpg",
  "tacos-speciaux|O'Capyk": "/products/tacos-speciaux-o-capyk.jpg",
  "tacos-speciaux|El Gringo": "/products/tacos-speciaux-el-gringo.jpg",
  "tacos-speciaux|Le Suisse": "/products/tacos-speciaux-le-suisse.jpg",
  "tacos-speciaux|So' Raclette": "/products/tacos-speciaux-so-raclette.jpg",
  "wraps|Chicken Louisiane": "/products/wraps-chicken-louisiane.jpg",
  "wraps|Chicken Onions": "/products/wraps-chicken-onions.jpg",
  "wraps|El Dorado": "/products/wraps-el-dorado.jpg",
  "wraps|Diablo": "/products/wraps-diablo.jpg",
  "wraps|Sovereign": "/products/wraps-sovereign.jpg",
  "sandwichs-classiques|Thon": "/products/sandwichs-classiques-thon.jpg",
  "sandwichs-classiques|Nuggets": "/products/sandwichs-classiques-nuggets.jpg",
  "sandwichs-classiques|Poulet": "/products/sandwichs-classiques-poulet.jpg",
  "sandwichs-classiques|Viande Hachée": "/products/sandwichs-classiques-viande-hachee.jpg",
  "sandwichs-classiques|Mixte": "/products/sandwichs-classiques-mixte.jpg",
  "sandwichs-speciaux|Le Best": "/products/sandwichs-speciaux-le-best.jpg",
  "sandwichs-speciaux|Escabri": "/products/sandwichs-speciaux-escabri.jpg",
  "sandwichs-speciaux|Zinger": "/products/sandwichs-speciaux-zinger.jpg",
  "sandwichs-speciaux|Phénomène": "/products/sandwichs-speciaux-phenomene.jpg",
  "sandwichs-speciaux|Quatro": "/products/sandwichs-speciaux-quatro.jpg",
  "sandwichs-speciaux|Le Blindé": "/products/sandwichs-speciaux-le-blinde.jpg",
  "sandwichs-speciaux|Triple Steak": "/products/sandwichs-speciaux-triple-steak.jpg",
  "sandwichs-speciaux|Radical": "/products/sandwichs-speciaux-radical.jpg",
  "sandwichs-speciaux|Buffalo": "/products/sandwichs-speciaux-buffalo.jpg",
  "sandwichs-speciaux|Escalope du Chef": "/products/sandwichs-speciaux-escalope-du-chef.jpg",
  "sandwichs-speciaux|Steak Hachée": "/products/sandwichs-speciaux-steak-hachee.jpg",
  "sandwichs-speciaux|Méga Fish": "/products/sandwichs-speciaux-mega-fish.jpg",
  "sandwichs-speciaux|Méga Chicken": "/products/sandwichs-speciaux-mega-chicken.jpg",
  "sandwichs-speciaux|Chicken Mixte": "/products/sandwichs-speciaux-chicken-mixte.jpg",
  "sandwichs-speciaux|Chicken Jaune": "/products/sandwichs-speciaux-chicken-jaune.jpg",
  "sandwichs-speciaux|Chicken Blanc": "/products/sandwichs-speciaux-chicken-blanc.jpg",
  "sandwichs-speciaux|Chicken Rouge": "/products/sandwichs-speciaux-chicken-rouge.jpg",
  "sandwichs-speciaux|Mexicain": "/products/sandwichs-speciaux-mexicain.jpg",
  "sandwichs-speciaux|Hot Mixte": "/products/sandwichs-speciaux-hot-mixte.jpg",
  "sandwichs-speciaux|Cordon Bleu": "/products/sandwichs-speciaux-cordon-bleu.jpg",
  "tacos-classiques|Poulet": "/products/tacos-classiques-poulet.jpg",
  "tacos-classiques|Viande Hachée": "/products/tacos-classiques-viande-hachee.jpg",
  "tacos-classiques|Nuggets": "/products/tacos-classiques-nuggets.jpg",
  "tacos-classiques|Cordon Bleu": "/products/tacos-classiques-cordon-bleu.jpg",
  "tacos-classiques|Hanaa Food": "/products/tacos-classiques-hanaa-food.jpg",
  "tacos-classiques|Mixte": "/products/tacos-classiques-mixte.jpg",
  "tacos-classiques|Géant": "/products/tacos-classiques-geant.jpg",
  "mini-tacos|Poulet": "/products/tacos-classiques-poulet.jpg",
  "mini-tacos|Viande Hachée": "/products/tacos-classiques-viande-hachee.jpg",
  "mini-tacos|Mixte": "/products/tacos-classiques-mixte.jpg",
  "bowls|Fondon": "/products/bowls-fondon.jpg",
  "bowls|New-York": "/products/bowls-new-york.jpg",
  "bowls|Chicken Riz": "/products/bowls-chicken-riz.jpg",
  "bowls|Mix Match": "/products/bowls-mix-match.jpg",
  "bowls|Veggie": "/products/bowls-veggie.jpg",
  "burgers|Mini Cheese": "/products/burgers-mini-cheese.jpg",
  "burgers|Cheese Burger": "/products/burgers-cheese-burger.jpg",
  "burgers|Chicken": "/products/burgers-chicken.jpg",
  "burgers|Cheese Omelette": "/products/burgers-cheese-omelette.jpg",
  "burgers|Crispy Chicken": "/products/burgers-crispy-chicken.jpg",
  "burgers|Fish": "/products/burgers-fish.jpg",
  "burgers|Chicken Rosti": "/products/burgers-chicken-rosti.jpg",
  "burgers|Big Mac": "/products/burgers-big-mac.jpg",
  "burgers|Boeuf Rosti": "/products/burgers-boeuf-rosti.jpg",
  "burgers|Double Chicken": "/products/burgers-double-chicken.jpg",
  "burgers|Texas": "/products/burgers-texas.jpg",
  "burgers|Le King": "/products/burgers-le-king.jpg",
  "salades|Marocaine": "/products/salades-marocaine.jpg",
  "salades|Niçoise": "/products/salades-nicoise.jpg",
  "salades|Mexicaine": "/products/salades-mexicaine.jpg",
  "salades|César": "/products/salades-cesar.jpg",
  "salades|Hanaa Food": "/products/salades-hanaa-food.jpg",
  "pates|Poulet Champignon": "/products/pates-poulet-champignon.jpg",
  "pates|Carbonara": "/products/pates-carbonara.jpg",
  "pates|Quatre Fromage": "/products/pates-quatre-fromage.jpg",
  "pates|Bolognaise": "/products/pates-bolognaise.jpg",
  "pates|Hanaa Food": "/products/pates-hanaa-food.jpg",
  "pates|Fruit de Mer": "/products/pates-fruit-de-mer.jpg",
  "pates|Lasagne": "/products/pates-lasagne.jpg",
  "pasticcios|Hot Dog": "/products/pasticcio-menu.jpg",
  "pasticcios|Charcuterie": "/products/pasticcio-menu.jpg",
  "pasticcios|Poulet": "/products/pasticcio-menu.jpg",
  "pasticcios|Viande Hachée": "/products/pasticcio-menu.jpg",
  "pasticcios|Mixte": "/products/pasticcio-menu.jpg",
  "pasticcios|Hanaa Food": "/products/pasticcio-menu.jpg",
  "plats|Chicken Eco": "/products/plats-chicken-eco.jpg",
  "plats|Chicken Hanaa Food": "/products/plats-chicken-hanaa-food.jpg",
  "plats|Chicken Tandoori": "/products/plats-chicken-tandoori.jpg",
  "plats|Poulet Parmigiana": "/products/plats-poulet-parmigiana.jpg",
  "plats|Émincé de Poulet": "/products/plats-emince-de-poulet.jpg",
  "plats|Escalope de Poulet Milanaise": "/products/plats-escalope-de-poulet-milanaise.jpg",
  "plats|Cordon Bleu": "/products/plats-cordon-bleu.jpg",
  "plats|Suprême de Poulet": "/products/plats-supreme-de-poulet.jpg",
  "plats|Plat Fitness": "/products/plats-plat-fitness.jpg",
  "grillades|Brochettes Poulet": "/products/grillades-brochettes-poulet.jpg",
  "grillades|Brochettes Viande Hachée": "/products/grillades-brochettes-viande-hachee.jpg",
  "grillades|Brochettes Mixte": "/products/grillades-brochettes-mixte.jpg",
  "jus|Détox": "/products/jus-verres-colores.jpg",
  "jus|Orange": "/products/jus-verres-colores.jpg",
  "jus|Banane": "/products/jus-fruits-colores.jpg",
  "jus|Pomme": "/products/jus-verres-colores.jpg",
  "jus|Papaye": "/products/jus-verres-colores.jpg",
  "jus|Fraise": "/products/jus-verres-colores.jpg",
  "jus|Ananas": "/products/jus-verres-colores.jpg",
  "jus|Mangue": "/products/jus-verres-colores.jpg",
  "jus|Panaché": "/products/jus-verres-colores.jpg",
  "jus|Exotique": "/products/jus-verres-colores.jpg",
  "jus|Avocat": "/products/jus-avocat-fitness.jpg",
  "jus|Avocat fruit sec": "/products/jus-avocat-fitness.jpg",
  "jus|Avocat Oreo": "/products/jus-avocat-fitness.jpg",
  "jus|Avocat Kit Kat": "/products/jus-avocat-fitness.jpg",
  "jus|Protéine": "/products/jus-avocat-fitness.jpg",
  "supplement-jus|Scoop Protein Weight": "/products/supp-jus-proteine.jpg",
  "supplement-jus|Scoop Protein Mass": "/products/supp-jus-proteine.jpg",
  "supplement-jus|Fruits sec": "/products/supp-jus-fruits-secs.jpg",
  "supplement-jus|Flocon d'avoine": "/products/supp-jus-avoine.jpg",
  "desserts|Salade de fruit": "/products/dessert-salade-fruit.jpg",
  "desserts|Tiramisu": "/products/dessert-tiramisu.jpg",
  "desserts|Panna Cotta": "/products/dessert-panna-cotta.jpg",
  "desserts|Cheese Cake": "/products/dessert-cheesecake.jpg",
  "supplements|Pain maison": "/products/supp-pain-fromage.jpg",
  "supplements|Sauce": "/products/supp-sauce-garniture.jpg",
  "supplements|Fromage": "/products/supp-pain-fromage.jpg",
  "supplements|Mozzarella": "/products/supp-pain-fromage.jpg",
  "supplements|Champignon frais": "/products/supp-sauce-garniture.jpg",
  "supplements|Frite": "/products/supp-sauce-garniture.jpg",
  "supplements|Potatoes": "/products/supp-sauce-garniture.jpg",
  "supplements|Légumes sautés": "/products/supp-sauce-garniture.jpg",
  "supplements|Pâte": "/products/supp-sauce-garniture.jpg",
  "supplements|Risotto": "/products/supp-sauce-garniture.jpg",
  "supplements|Sauce champignon": "/products/supp-sauce-garniture.jpg",
  "supplements|Chicken": "/products/supp-sauce-garniture.jpg",
  "supplements|Brochette poulet": "/products/supp-brochettes.jpg",
  "supplements|Brochette V. Hachée": "/products/supp-brochettes.jpg",
  "supplements|Brochette merguez": "/products/supp-brochettes.jpg",
  "boissons|Soda 25 cl Coca/Fanta/Sprite": "/products/boisson-canettes.jpg",
  "boissons|Soda 25 cl Hawai/Poms": "/products/boisson-canettes.jpg",
  "boissons|Soda 33 cl": "/products/boisson-canettes.jpg",
  "boissons|Soda 1 L": "/products/boisson-bouteilles.jpg",
  "boissons|Eau": "/products/boisson-bouteilles.jpg",
  "boissons|Énergie Oasis": "/products/boisson-canettes.jpg",
  "boissons|Oulmes Eau": "/products/boisson-oulmes.jpg",
  "boissons|Oulmes Soda": "/products/boisson-oulmes.jpg"
};

const products = rawProducts.map((item, index) => ({
  id: index + 1,
  name: item[0],
  categoryId: item[1],
  subcategoryId: item[1],
  price: item[2],
  description: item[3],
  image: productImageMap[`${item[1]}|${item[0]}`] || photo(item[4]),
  variants: Array.isArray(item[5])
    ? { type: "pasta", choices: item[5] }
    : item[5] || {},
  extras:
    item[1] === "plats" || item[1] === "grillades" ? accompaniments : extras,
}));
const phoneIsValid = (value) =>
  /^(0[67]\d{8}|\+212[67]\d{8})$/.test(value.replace(/[ .-]/g, ""));
function feeFor(branch, distance, subtotal) {
  if (!branch || distance === null) return 0;
  if (subtotal >= branch.deliveryPricingSettings.freeDeliveryThreshold)
    return 0;
  const zone = branch.deliveryZones?.find((item) => distance <= item.maxKm);
  return zone ? zone.fee : 0;
}

function App() {
  const [session, setSession] = useState(getSession);
  const [mode, setMode] = useState(
    () => localStorage.getItem("hanaa-mode") || "delivery",
  );
  const [cart, setCart] = useState(() =>
    JSON.parse(localStorage.getItem("hanaa-cart") || "[]"),
  );
  const [view, setView] = useState(() => routeViews[authorizedPath(window.location.pathname, getSession())] || "home");
  const navigate = (path, replace = false) => { const safePath = authorizedPath(path, session); window.history[replace ? "replaceState" : "pushState"]({}, "", safePath); setView(routeViews[safePath] || "home"); };
  useEffect(() => { const syncPath = () => navigate(window.location.pathname, true); window.addEventListener("popstate", syncPath); return () => window.removeEventListener("popstate", syncPath); });
  useEffect(() => { const safePath = authorizedPath(window.location.pathname, session); if (safePath !== window.location.pathname) { window.history.replaceState({}, "", safePath); queueMicrotask(() => setView(routeViews[safePath] || "home")); } }, [session]);
  const [category, setCategory] = useState("menus");
  const [query, setQuery] = useState("");
  const [address, setAddress] = useState("");
  const [customerLocation, setCustomerLocation] = useState(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressError, setAddressError] = useState("");
  const branchesReady = true;
  const [branchError, setBranchError] = useState("");
  const [, setBranchRetry] = useState(0);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [deliveryRoutes, setDeliveryRoutes] = useState([]);
  const [deliveryBranchId, setDeliveryBranchId] = useState("");
  const [pickupBranchId, setPickupBranchId] = useState("");
  const [modal, setModal] = useState(null);
  const [order, setOrder] = useState(() =>
    JSON.parse(localStorage.getItem("hanaa-order") || "null"),
  );
  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("hanaa-favorites") || "[]");
      return Array.isArray(saved) ? saved.map(Number).filter(Number.isFinite) : [];
    } catch {
      return [];
    }
  });
  const toggleFavorite = (productId) => {
    const id = Number(productId);
    setFavorites((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };
  useEffect(
    () => localStorage.setItem("hanaa-cart", JSON.stringify(cart)),
    [cart],
  );
  useEffect(() => localStorage.setItem("hanaa-mode", mode), [mode]);
  useEffect(
    () => localStorage.setItem("hanaa-favorites", JSON.stringify(favorites)),
    [favorites],
  );
  useEffect(() => {
    if (!customerLocation || !branchesReady) return undefined;
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) {
        setRouteLoading(false);
        setRouteError("Impossible de calculer la distance. Réessayez.");
      }
    }, 10000);
    queueMicrotask(() => {
      if (!cancelled) {
        setRouteLoading(true);
        setRouteError("");
      }
    });
    const loadRoutes = async () => {
      const results = await Promise.all(
        branches
          .filter(
            (item) =>
              item.isOpen &&
              (mode === "pickup" ? item.pickupEnabled : item.deliveryEnabled) &&
              Number.isFinite(Number(item.latitude)) &&
              Number.isFinite(Number(item.longitude)),
          )
          .map(async (item) => {
            try {
              const route = await routeBetween(
                {
                  latitude: Number(item.latitude),
                  longitude: Number(item.longitude),
                },
                customerLocation,
              );
              return route ? { branchId: item.id, ...route } : null;
            } catch {
              return null;
            }
          }),
      );
      if (!cancelled) {
        clearTimeout(timeout);
        const valid = results
          .filter(Boolean)
          .sort((first, second) => first.distanceKm - second.distanceKm);
        setDeliveryRoutes(valid);
        setRouteLoading(false);
        if (!valid.length)
          setRouteError("Impossible de calculer la distance. Réessayez.");
      }
    };
    loadRoutes();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [customerLocation, mode, branchesReady]);
  const confirmAddress = async () => {
    const typedAddress = address.trim();
    if (!typedAddress) {
      setAddressError(
        "Adresse introuvable. Vérifiez votre adresse ou utilisez votre position actuelle.",
      );
      return;
    }
    setAddressLoading(true);
    setAddressError("");
    setDeliveryRoutes([]);
    setDeliveryBranchId("");
    try {
      const result = await geocodePlace(typedAddress);
      if (!result) {
        setCustomerLocation(null);
        setAddressError(
          "Adresse introuvable. Vérifiez votre adresse ou utilisez votre position actuelle.",
        );
        return;
      }
      setCustomerLocation({
        latitude: result.latitude,
        longitude: result.longitude,
      });
      setAddress(result.formattedAddress || typedAddress);
    } catch {
      setCustomerLocation(null);
      setAddressError(
        "Adresse introuvable. Vérifiez votre adresse ou utilisez votre position actuelle.",
      );
    } finally {
      setAddressLoading(false);
    }
  };
  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setAddressError(
        "La géolocalisation n'est pas disponible sur cet appareil.",
      );
      return;
    }
    setAddressLoading(true);
    setAddressError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCustomerLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setAddress("Position actuelle");
        setAddressLoading(false);
      },
      () => {
        setAddressLoading(false);
        setAddressError("Impossible d'obtenir votre position actuelle.");
      },
    );
  };
  const branch =
    mode === "pickup"
      ? branches.find((item) => item.id === pickupBranchId)
      : branches.find((item) => item.id === deliveryBranchId);
  const selectedRoute = deliveryRoutes.find(
    (item) => item.branchId === branch?.id,
  );
  const distanceKm = selectedRoute?.distanceKm ?? null;
  const subtotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const deliveryFee =
    mode === "delivery" ? feeFor(branch, distanceKm, subtotal) : 0;
  const total = subtotal + deliveryFee;
  const shown = useMemo(() => {
    const normalizeSearch = (value = "") =>
      String(value)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

    const needle = normalizeSearch(query);

    return products.filter((item) => {
      if (!needle) return item.categoryId === category;

      const categoryLabel =
        categories.find((entry) => entry.id === item.categoryId)?.label || "";

      const haystack = normalizeSearch(
        `${item.name} ${item.description || ""} ${item.categoryId} ${categoryLabel}`,
      );

      return haystack.includes(needle);
    });
  }, [category, query]);
  const add = (product, options = {}) => {
    const chosen = options.extras || [];
    const price =
      (options.variantPrice || product.price) +
      chosen.reduce((sum, item) => sum + item.price, 0);
    const key = `${product.id}-${options.variant || ""}-${chosen.map((item) => item.name).join("-")}`;
    setCart((current) => {
      const found = current.find((item) => item.key === key);
      return found
        ? current.map((item) =>
            item.key === key
              ? { ...item, quantity: item.quantity + (options.quantity || 1) }
              : item,
          )
        : [
            ...current,
            {
              key,
              productId: product.id,
              name: product.name,
              size: options.variant || "",
              extras: chosen,
              price,
              quantity: options.quantity || 1,
              image: product.image,
            },
          ];
    });
    setModal(null);
  };
  const change = (key, amount) =>
    setCart((current) =>
      current
        .map((item) =>
          item.key === key
            ? { ...item, quantity: item.quantity + amount }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  const place = (details) => {
    const next = {
      id: `HF${Math.floor(1000 + Math.random() * 8999)}`,
      customerName: details.name,
      customerPhone: details.phone,
      orderType: mode,
      branchId: branch?.id || "",
      branchName: branch?.name || "",
      deliveryAddress: details.address || "",
      customerLatitude: customerLocation?.latitude ?? null,
      customerLongitude: customerLocation?.longitude ?? null,
      distanceKm,
      estimatedTravelTime: selectedRoute?.durationMinutes ?? null,
      deliveryFee,
      paymentMethod: details.payment === "cash" ? "Espèces" : "Carte",
      subtotal,
      total,
      status: 0,
      items: cart,
      statusLabel: mode === "delivery" ? "NOUVELLE" : "NOUVELLE COMMANDE",
      statusHistory: [{ status: mode === "delivery" ? "NOUVELLE" : "NOUVELLE COMMANDE", at: new Date().toISOString() }],
      createdAt: new Date().toISOString(),
    };
    setOrder(next);
    localStorage.setItem("hanaa-order", JSON.stringify(next));
    const orders = JSON.parse(localStorage.getItem("hanaa-orders") || "[]");
    localStorage.setItem("hanaa-orders", JSON.stringify([next, ...orders.filter((item) => item.id !== next.id)]));
    setCart([]);
    setView("tracking");
  };
  return (
    <div className="app">
      {view === "login" && <Login onSuccess={(nextSession) => { const path = homePathForRole(nextSession.role); setSession(nextSession); window.history.replaceState({}, "", path); setView(routeViews[path]); }} />}
      {view === "admin-dashboard" && <AdminDashboard onNavigate={navigate} onHome={() => navigate("/")} />}
      {view === "delivery-orders" && <DeliveryOrders role="admin" session={session} onHome={() => navigate("/admin")} />}
      {view === "pickup-orders" && <PickupOrders role="admin" session={session} onHome={() => navigate("/admin")} />}
      {view === "driver" && <DriverDashboard session={session} onHome={() => navigate("/")} />}
      {view === "driver-management" && <AdminDirectory type="drivers" onNavigate={navigate} onHome={() => navigate("/admin")} />}
      {view === "user-management" && <AdminDirectory type="users" onNavigate={navigate} onHome={() => navigate("/admin")} />}
      {view === "snack-delivery" && <DeliveryOrders role="snack" session={session} onHome={() => navigate("/")} />}
      {["login", "admin-dashboard", "delivery-orders", "pickup-orders", "driver", "driver-management", "user-management", "snack-delivery"].includes(view) ? null : <>
      <header className="navbar">
        <button
          className="brand"
          onClick={() => setView("home")}
          style={{ display: "flex", alignItems: "center", padding: 0 }}
          aria-label="Hanaa Food"
        >
          <img
            src="/hanaa-logo.png"
            alt="Hanaa Food"
            style={{
              width: 64,
              height: 64,
              objectFit: "contain",
              display: "block",
              borderRadius: 12,
              background: "#fff",
              flexShrink: 0,
            }}
          />
        </button>
        <button className="address-pill" onClick={() => setView("home")}>
          <span>⌖</span>
          <small>
            {mode === "pickup" ? "Retrait" : "Livrer à"}
            <strong>
              {mode === "pickup"
                ? branch?.name || "Choisir un restaurant"
                : address || "Choisir une adresse"}
            </strong>
          </small>
          <i>⌄</i>
        </button>
        <nav>
          <button onClick={() => setView("orders")}>Commandes</button>
          <button onClick={() => setView("account")}>Mon compte</button>
          <button className="nav-cart" onClick={() => setView("cart")}>
            Panier <b>{cart.reduce((sum, item) => sum + item.quantity, 0)}</b>
          </button>
        </nav>
      </header>
      {view === "home" && (
        <>
          <Home
            mode={mode}
            setMode={(next) => {
              setMode(next);
              if (next === "delivery") setPickupBranchId("");
            }}
            address={address}
            setAddress={setAddress}
            onConfirmAddress={confirmAddress}
            onUseCurrentLocation={useCurrentLocation}
            addressLoading={addressLoading}
            addressError={addressError}
            pickupBranchId={pickupBranchId}
            setPickupBranchId={setPickupBranchId}
            query={query}
            setQuery={setQuery}
            category={category}
            setCategory={setCategory}
            shown={shown}
            setModal={setModal}
            favorites={favorites}
            toggleFavorite={toggleFavorite}
          />
          <MapView
            branches={branches}
            customerLocation={customerLocation}
            selectedBranch={branch}
            route={selectedRoute}
            mode={mode}
          />
          <BranchPicker
            branchesReady={branchesReady}
            branchError={branchError}
            onRetryBranches={() => setBranchRetry((value) => value + 1)}
            mode={mode}
            address={address}
            setAddress={setAddress}
            customerLocation={customerLocation}
            setCustomerLocation={setCustomerLocation}
            routes={deliveryRoutes}
            routeLoading={routeLoading}
            routeError={routeError}
            onRetry={() =>
              customerLocation && setCustomerLocation({ ...customerLocation })
            }
            selectedId={deliveryBranchId}
            setSelectedId={setDeliveryBranchId}
            pickupBranchId={pickupBranchId}
            setPickupBranchId={setPickupBranchId}
          />
        </>
      )}
      {view === "cart" && (
        <Cart
          cart={cart}
          subtotal={subtotal}
          fee={deliveryFee}
          total={total}
          mode={mode}
          branch={branch}
          distance={distanceKm}
          change={change}
          onBack={() => setView("home")}
          onCheckout={() => setView("checkout")}
        />
      )}
      {view === "checkout" && (
        <Checkout
          mode={mode}
          address={address}
          branch={branch}
          fee={deliveryFee}
          total={total}
          onBack={() => setView("cart")}
          onPlace={place}
        />
      )}
      {view === "tracking" && (
        <Tracking order={order} onHome={() => setView("home")} />
      )}
      {view === "orders" && (
        <Orders
          order={order}
          onHome={() => setView("home")}
          onTrack={(selectedOrder) => {
            setOrder(selectedOrder);
            localStorage.setItem(
              "hanaa-order",
              JSON.stringify(selectedOrder),
            );
            setView("tracking");
          }}
          onReorder={(selectedOrder) => {
            if (selectedOrder) {
              setCart(selectedOrder.items || []);
              setView("cart");
            }
          }}
        />
      )}
      {view === "account" && (
        <Account
          onHome={() => setView("home")}
          onOrders={() => setView("orders")}
          onFavorites={() => setView("favorites")}
          onProfile={() => setView("profile")}
        />
      )}
      {view === "favorites" && (
        <Favorites
          favoriteIds={favorites}
          onHome={() => setView("account")}
          onOpen={(product) => setModal(product)}
          onToggleFavorite={toggleFavorite}
        />
      )}
      {view === "profile" && (
        <ClientProfile onHome={() => setView("account")} />
      )}
      {modal && (
        <ProductModal product={modal} add={add} close={() => setModal(null)} />
      )}
      {cart.length > 0 && view === "home" && (
        <button className="floating-cart" onClick={() => setView("cart")}>
          🛒 Voir le panier <b>• {total} DH</b>
          <i>→</i>
        </button>
      )}
      <footer>
        <strong style={{ display: "flex", alignItems: "center" }}>
          <img
            src="/hanaa-logo.png"
            alt="Hanaa Food"
            style={{ width: 76, height: 76, objectFit: "contain" }}
          />
        </strong>
        <span>Le goût livré avec attention.</span>
        <span>© 2026 Hanaa Food</span>
      </footer>
      <div className="mobile-nav">
        <button onClick={() => setView("home")}>
          ⌂<small>Accueil</small>
        </button>
        <button
          onClick={() => document.querySelector(".search-box input")?.focus()}
        >
          ⌕<small>Recherche</small>
        </button>
        <button onClick={() => setView("orders")}>
          ▣<small>Commandes</small>
        </button>
        <button onClick={() => setView("account")}>
          ♙<small>Profil</small>
        </button>
      </div>
      </>}
    </div>
  );
}
function Home({
  mode,
  setMode,
  address,
  setAddress,
  onConfirmAddress,
  onUseCurrentLocation,
  addressLoading,
  addressError,
  pickupBranchId,
  setPickupBranchId,
  branch,
  query,
  setQuery,
  category,
  setCategory,
  shown,
  add,
  setModal,
  favorites,
  toggleFavorite,
}) {
  return (
    <main>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span>●</span> Ouvert aujourd'hui jusqu'à 23h
          </div>
          <h1>
            Tout ce que tu veux,
            <br />
            <em>livré chez toi.</em>
          </h1>
          <p>
            Les recettes généreuses de Hanaa Food, préparées à la commande et
            livrées avec soin.
          </p>
          <div className="mode-switch">
            <button
              className={mode === "delivery" ? "active" : ""}
              onClick={() => setMode("delivery")}
            >
              ⌁ Livraison
            </button>
            <button
              className={mode === "pickup" ? "active" : ""}
              onClick={() => setMode("pickup")}
            >
              ▣ À emporter
            </button>
          </div>
          {mode === "delivery" ? (
            <div className="address-form">
              <span>⌖</span>
              <input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="Entre ton adresse de livraison"
              />
              <button disabled={addressLoading} onClick={onConfirmAddress}>
                {addressLoading
                  ? "Recherche de votre adresse..."
                  : "Utiliser l’adresse"}
              </button>
              <button
                type="button"
                disabled={addressLoading}
                onClick={onUseCurrentLocation}
              >
                Utiliser ma position actuelle
              </button>
              {addressError && (
                <small className="field-error">{addressError}</small>
              )}
            </div>
          ) : (
            <div className="pickup-message">
              <p>Choisissez votre restaurant sur la carte et dans les résultats ci-dessous.</p>
            </div>
          )}
          <div className="hero-note">
            ✓ Livraison offerte dès 150 DH　✓ Paiement à la livraison
          </div>
        </div>
        <div
          className="hero-art"
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexWrap: "wrap",
            gap: 16,
            minHeight: 340,
            overflow: "hidden",
            boxSizing: "border-box",
            background: "#fff",
            padding: "30px 26px",
          }}
        >
          <img
            src="/hanaa-logo.png"
            alt="Logo Hanaa Food"
            style={{
              position: "static",
              inset: "auto",
              display: "block",
              flex: "1 1 240px",
              width: "clamp(250px, 68%, 360px)",
              maxWidth: 360,
              minWidth: 0,
              height: "auto",
              objectFit: "contain",
              borderRadius: 0,
              boxShadow: "none",
              background: "transparent",
            }}
          />

          <div
            style={{
              position: "static",
              flex: "0 0 112px",
              width: 112,
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "14px 10px",
              borderRadius: 18,
              background: "#fff6f6",
              border: "1px solid #f0d6d8",
              boxShadow: "0 10px 28px rgba(215, 25, 32, 0.08)",
              color: "#D71920",
              fontWeight: 900,
              lineHeight: 1,
            }}
          >
            <span style={{ fontSize: 25, whiteSpace: "nowrap" }}>★ 4.9</span>
            <small
              style={{
                marginTop: 8,
                color: "#7b6466",
                fontSize: 10,
                fontWeight: 800,
                lineHeight: 1.25,
                textAlign: "center",
              }}
            >
              sur nos commandes
            </small>
          </div>
        </div>
      </section>
      <section className="menu-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">À LA CARTE</span>
            <h2>Qu'est-ce qui te ferait plaisir ?</h2>
          </div>
          <div className="search-box">
            <span>⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un plat..."
            />
          </div>
        </div>
        <div className="categories">
          {categories.map((item) => (
            <button
              className={item.id === category ? "active" : ""}
              key={item.id}
              onClick={() => {
                setCategory(item.id);
                setQuery("");
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="product-heading">
          <h3>
            {query.trim()
              ? `Résultats pour “${query.trim()}”`
              : categories.find((item) => item.id === category)?.label}
          </h3>
          <span>{shown.length} propositions</span>
        </div>
        <div className="product-grid">
          {shown.length ? (
            shown.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onAdd={() => setModal(product)}
                onDetails={() => setModal(product)}
                favorite={favorites.includes(product.id)}
                onToggleFavorite={() => toggleFavorite(product.id)}
              />
            ))
          ) : (
            <div className="empty-category">
              <b>Bientôt dans la carte</b>
              <span>Cette catégorie arrive très vite chez Hanaa Food.</span>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
function ProductCard({
  product,
  onAdd,
  onDetails,
  favorite = false,
  onToggleFavorite,
}) {
  return (
    <article className="product-card" style={{ position: "relative" }}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggleFavorite?.();
        }}
        aria-label={favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
        title={favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
        style={{
          position: "absolute",
          zIndex: 5,
          top: 12,
          right: 12,
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: "1px solid #f0d6d8",
          background: "#fff",
          color: favorite ? "#D71920" : "#5f5556",
          fontSize: 22,
          lineHeight: 1,
          cursor: "pointer",
          boxShadow: "0 5px 16px rgba(0,0,0,.08)",
        }}
      >
        {favorite ? "♥" : "♡"}
      </button>
      <button className="product-image" onClick={onDetails}>
        <img src={product.image} alt={product.name} />
        <span>{product.categoryId}</span>
      </button>
      <div className="product-info">
        <button className="product-name" onClick={onDetails}>
          <h4>{product.name}</h4>
          <p>{product.description}</p>
        </button>
        <div className="product-bottom">
          <strong>
            {product.price} DH
            {Object.keys(product.variants).length > 0 && (
              <small> à partir de</small>
            )}
          </strong>
          <button className="add-button" onClick={onAdd}>
            Ajouter <b>+</b>
          </button>
        </div>
      </div>
    </article>
  );
}
function ProductModal({ product, close, add }) {
  const choices =
    product.variants.type === "pasta"
      ? product.variants.choices
      : Object.keys(product.variants);
  const [variant, setVariant] = useState(choices[0] || "");
  const [chosen, setChosen] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const variantPrice =
    product.variants.type === "pasta"
      ? product.price
      : product.variants[variant] || product.price;
  const total =
    (variantPrice + chosen.reduce((sum, item) => sum + item.price, 0)) *
    quantity;
  const toggle = (extra) =>
    setChosen((current) =>
      current.some((item) => item.name === extra.name)
        ? current.filter((item) => item.name !== extra.name)
        : current.length <
            (product.categoryId === "plats" ||
            product.categoryId === "grillades"
              ? 2
              : 99)
          ? [...current, extra]
          : current,
    );
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <div className="product-modal">
        <button className="close" onClick={close}>
          ×
        </button>
        <img src={product.image} alt="" />
        <div className="modal-content">
          <span className="eyebrow">{product.categoryId}</span>
          <h2>{product.name}</h2>
          <p>{product.description}</p>
          {choices.length > 0 && (
            <div className="option-group">
              <label>
                {product.variants.type === "pasta"
                  ? "Choisis tes pâtes"
                  : "Choisis ta taille"}
              </label>
              <div className="size-options">
                {choices.map((item) => (
                  <button
                    className={variant === item ? "active" : ""}
                    key={item}
                    onClick={() => setVariant(item)}
                  >
                    {item}
                    <small>
                      {product.variants.type === "pasta"
                        ? "Inclus"
                        : `${product.variants[item]} DH`}
                    </small>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="option-group">
            <label>
              {product.categoryId === "plats" ||
              product.categoryId === "grillades"
                ? "Choisis 2 accompagnements maximum"
                : "Un petit supplément ?"}
            </label>
            <div className="extra-list">
              {(product.categoryId === "plats" ||
              product.categoryId === "grillades"
                ? accompaniments.map((name) => ({ name, price: 0 }))
                : extras
              ).map((extra) => (
                <button
                  className={
                    chosen.some((item) => item.name === extra.name)
                      ? "selected"
                      : ""
                  }
                  key={extra.name}
                  onClick={() => toggle(extra)}
                >
                  <span>+</span>
                  {extra.name}
                  <b>{extra.price ? `+${extra.price} DH` : "Inclus"}</b>
                </button>
              ))}
            </div>
          </div>
          <div className="modal-footer">
            <div className="quantity">
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))}>
                −
              </button>
              <b>{quantity}</b>
              <button onClick={() => setQuantity(quantity + 1)}>+</button>
            </div>
            <button
              className="primary-action"
              onClick={() =>
                add(product, {
                  variant,
                  variantPrice,
                  extras: chosen,
                  quantity,
                })
              }
            >
              Ajouter <b>{total} DH</b>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
function Cart({
  cart,
  subtotal,
  fee,
  total,
  mode,
  branch,
  distance,
  change,
  onBack,
  onCheckout,
}) {
  return (
    <main className="simple-page">
      <button className="back-link" onClick={onBack}>
        ← Continuer mes achats
      </button>
      <div className="page-title">
        <div>
          <span className="eyebrow">TA COMMANDE</span>
          <h1>Ton panier</h1>
        </div>
        <span className="order-mode">
          {mode === "delivery"
            ? "⌁ Livraison"
            : `▣ ${branch?.name || "Choisir un restaurant"}`}
        </span>
      </div>
      {cart.length ? (
        <div className="cart-layout">
          <section className="cart-items">
            {cart.map((item) => (
              <div className="cart-item" key={item.key}>
                <img src={item.image} alt="" />
                <div className="cart-item-info">
                  <h3>{item.name}</h3>
                  <span>
                    {item.size && `${item.size} · `}
                    {item.extras.length
                      ? item.extras.map((extra) => extra.name).join(", ")
                      : "Sans supplément"}
                  </span>
                  <strong>{item.price} DH</strong>
                </div>
                <div className="quantity compact">
                  <button onClick={() => change(item.key, -1)}>−</button>
                  <b>{item.quantity}</b>
                  <button onClick={() => change(item.key, 1)}>+</button>
                </div>
              </div>
            ))}
          </section>
          <aside className="summary">
            <h2>Résumé</h2>
            {branch && (
              <p className="branch-summary">
                Préparée par <b>{branch.name}</b>
                {distance && <span>Distance : {formatDistance(distance)}</span>}
              </p>
            )}
            <div>
              <span>Sous-total</span>
              <b>{subtotal} DH</b>
            </div>
            <div>
              <span>Frais de livraison</span>
              <b>{fee ? `${fee} DH` : "Offerts"}</b>
            </div>
            <hr />
            <div className="grand-total">
              <span>Total</span>
              <b>{total} DH</b>
            </div>
            <button className="primary-action full" onClick={onCheckout}>
              Commander <span>→</span>
            </button>
          </aside>
        </div>
      ) : (
        <div className="empty-state">
          <h2>Ton panier est vide</h2>
          <p>Ajoute un plat pour commencer ta commande.</p>
          <button className="primary-action" onClick={onBack}>
            Voir la carte
          </button>
        </div>
      )}
    </main>
  );
}
function Checkout({
  mode,
  address,
  branch,
  subtotal,
  fee,
  total,
  onBack,
  onPlace,
}) {
  const [data, setData] = useState(() => {
    let profile = {};
    try {
      profile = JSON.parse(localStorage.getItem("hanaa-client-profile") || "{}");
    } catch {
      profile = {};
    }
    return {
      name: profile.name || "",
      phone: profile.phone || "",
      address,
      neighborhood: "",
      apartment: "",
      notes: "",
      payment: "cash",
    };
  });
  const update = (key, value) =>
    setData((current) => ({ ...current, [key]: value }));
  const valid =
    data.name &&
    phoneIsValid(data.phone) &&
    Boolean(branch) &&
    (mode === "pickup" || Boolean(data.address));
  return (
    <main className="simple-page">
      <button className="back-link" onClick={onBack}>
        ← Retour au panier
      </button>
      <div className="page-title">
        <div>
          <span className="eyebrow">DERNIÈRE ÉTAPE</span>
          <h1>Finaliser la commande</h1>
        </div>
        <b className="checkout-total">{total} DH</b>
      </div>
      <form
        className="checkout-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid)
            onPlace({
              ...data,
              address: mode === "pickup" ? "" : data.address,
            });
        }}
      >
        <h2>Tes coordonnées</h2>
        <div className="form-grid">
          <label>
            Nom
            <input
              required
              value={data.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder="Ton nom"
            />
          </label>
          <label>
            Téléphone
            <input
              required
              value={data.phone}
              onChange={(event) => update("phone", event.target.value)}
              placeholder="06XXXXXXXX ou +2126XXXXXXXX"
            />
            <small
              className={
                data.phone && !phoneIsValid(data.phone)
                  ? "field-error"
                  : "field-help"
              }
            >
              Format marocain requis
            </small>
          </label>
          {mode === "delivery" && (
            <>
              <label className="wide">
                Adresse
                <input
                  required
                  value={data.address}
                  onChange={(event) => update("address", event.target.value)}
                  placeholder="Rue et numéro"
                />
              </label>
              <label>
                Quartier
                <input
                  value={data.neighborhood}
                  onChange={(event) =>
                    update("neighborhood", event.target.value)
                  }
                  placeholder="Ton quartier"
                />
              </label>
              <label>
                Immeuble / appartement
                <input
                  value={data.apartment}
                  onChange={(event) => update("apartment", event.target.value)}
                  placeholder="Optionnel"
                />
              </label>
              <label className="wide">
                Note de livraison
                <textarea
                  value={data.notes}
                  onChange={(event) => update("notes", event.target.value)}
                  placeholder="Code, étage, indications..."
                />
              </label>
            </>
          )}
        </div>
        <h2>
          {mode === "pickup"
            ? `Récupération chez ${branch?.name || "Hanaa Food"}`
            : `Votre commande sera préparée par : ${branch?.name || "Hanaa Food"}`}
        </h2>
        <p className="checkout-delivery">
          {mode === "pickup"
            ? "Frais de livraison : 0 DH"
            : `Frais de livraison : ${fee} DH`}
        </p>
        <h2>Paiement</h2>
        <label className="payment-option">
          <input
            type="radio"
            checked={data.payment === "cash"}
            onChange={() => update("payment", "cash")}
          />{" "}
          Paiement à la livraison <span>Recommandé</span>
        </label>
        <label className="payment-option">
          <input
            type="radio"
            checked={data.payment === "online"}
            onChange={() => update("payment", "online")}
          />{" "}
          Paiement en ligne <span>Bientôt disponible</span>
        </label>
        <button className="primary-action full" disabled={!valid}>
          Confirmer la commande <span>→</span>
        </button>
      </form>
    </main>
  );
}
function Tracking({ order, onHome }) {
  const [currentOrder, setCurrentOrder] = useState(order);
  const statuses = currentOrder?.orderType === "pickup"
    ? ["NOUVELLE COMMANDE", "VALIDÉE PAR LE SNACK", "EN PRÉPARATION", "PRÊTE", "RÉCUPÉRÉE"]
    : ["NOUVELLE", "ACCEPTÉE PAR LE CAISSIER", "PRISE PAR LE LIVREUR", "EN LIVRAISON", "LIVRÉE"];
  useEffect(() => {
    const sync = () => {
      const orders = JSON.parse(localStorage.getItem("hanaa-orders") || "[]");
      const latest = orders.find((item) => item.id === order?.id);
      if (latest) setCurrentOrder(latest);
    };
    window.addEventListener("storage", sync);
    const timer = setInterval(sync, 1000);
    return () => { window.removeEventListener("storage", sync); clearInterval(timer); };
  }, [order?.id]);
  const cancelledStatuses = ["REFUSÉE", "REFUSÉE PAR LE SNACK", "ANNULÉE", "ANNULÉE PAR LE SNACK"];
  const isCancelled = cancelledStatuses.includes(currentOrder?.statusLabel);
  const progress = Math.max(0, statuses.indexOf(currentOrder?.statusLabel || statuses[0]));
  return (
    <main className="tracking-page">
      <div className="confirmation">
        <div className="success-mark">{isCancelled ? "✕" : "✓"}</div>
        <span className="eyebrow">
          {isCancelled ? "MISE À JOUR DE TA COMMANDE" : "MERCI POUR TA CONFIANCE"}
        </span>
        <h1>{isCancelled ? "Commande annulée" : "Commande confirmée"}</h1>
        <p>
          Commande <b>#{currentOrder?.id}</b> · {currentOrder?.branchName}
        </p>
      </div>

      <section className="tracking-card">
        {isCancelled ? (
          <div
            style={{
              border: "1px solid #efc7ca",
              background: "#fff4f4",
              borderRadius: "16px",
              padding: "22px",
              textAlign: "center",
            }}
          >
            <span className="eyebrow">COMMANDE ANNULÉE</span>
            <h2 style={{ margin: "8px 0" }}>❌ Commande annulée par le snack</h2>
            <p style={{ margin: 0 }}>
              Le snack ne pourra pas préparer cette commande.
            </p>

            {currentOrder?.refusalReason && (
              <p style={{ margin: "12px 0 0", fontWeight: 800 }}>
                Raison : {currentOrder.refusalReason}
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="tracking-header">
              <div>
                <span className="eyebrow">SUIVI EN DIRECT</span>
                <h2>On s'occupe de tout</h2>
              </div>
              <span className="live-dot">● En cours</span>
            </div>

            <div className="timeline">
              {statuses.map((status, index) => (
                <div
                  className={`timeline-step ${index <= progress ? "done" : ""}`}
                  key={status}
                >
                  <span>{index < progress ? "✓" : index + 1}</span>
                  <div>
                    <b>{status}</b>
                    {index === progress && (
                      <small>Statut mis à jour par l'équipe Hanaa Food.</small>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
      <button className="back-link centered" onClick={onHome}>
        ← Retour à la carte
      </button>
    </main>
  );
}
function Orders({ order, onHome, onReorder, onTrack }) {
  const [savedOrders, setSavedOrders] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("hanaa-orders") || "[]");
      return Array.isArray(stored) && stored.length
        ? stored
        : order
          ? [order]
          : [];
    } catch {
      return order ? [order] : [];
    }
  });

  useEffect(() => {
    const sync = () => {
      try {
        const stored = JSON.parse(
          localStorage.getItem("hanaa-orders") || "[]",
        );
        setSavedOrders(Array.isArray(stored) ? stored : []);
      } catch {
        setSavedOrders([]);
      }
    };

    sync();
    window.addEventListener("storage", sync);
    const timer = setInterval(sync, 1000);

    return () => {
      window.removeEventListener("storage", sync);
      clearInterval(timer);
    };
  }, []);

  const cancelledStatuses = [
    "REFUSÉE",
    "REFUSÉE PAR LE SNACK",
    "ANNULÉE",
    "ANNULÉE PAR LE SNACK",
  ];

  return (
    <main className="simple-page narrow">
      <button className="back-link" onClick={onHome}>
        ← Accueil
      </button>

      <div className="page-title">
        <div>
          <span className="eyebrow">ESPACE CLIENT</span>
          <h1>Mes commandes</h1>
        </div>
      </div>

      {savedOrders.length ? (
        savedOrders.map((item) => {
          const isCancelled = cancelledStatuses.includes(item.statusLabel);

          return (
            <article className="order-history" key={item.id}>
              <div>
                <b>#{item.id}</b>

                <small>
                  {item.branchName} ·{" "}
                  {item.orderType === "delivery"
                    ? "Livraison"
                    : "À emporter"}
                </small>

                <strong>
                  Statut:{" "}
                  {isCancelled
                    ? "ANNULÉE PAR LE SNACK"
                    : item.statusLabel || "NOUVELLE"}
                </strong>
              </div>

              <strong>{item.total} DH</strong>

              {item.orderType === "delivery" &&
                item.statusLabel !== "LIVRÉE" && (
                  <button
                    className="primary-action"
                    onClick={() => onTrack(item)}
                  >
                    SUIVRE MA COMMANDE
                  </button>
                )}

              {isCancelled && (
                <p className="field-error">
                  ❌ Commande annulée par le snack
                  {item.refusalReason
                    ? ` : ${item.refusalReason}`
                    : ""}
                </p>
              )}

              <button
                className="primary-action"
                onClick={() => onReorder(item)}
              >
                Commander à nouveau
              </button>
            </article>
          );
        })
      ) : (
        <div className="empty-state">
          <h2>Aucune commande pour le moment</h2>
          <button className="primary-action" onClick={onHome}>
            Découvrir la carte
          </button>
        </div>
      )}
    </main>
  );
}

function Account({ onHome, onOrders, onFavorites, onProfile }) {
  return (
    <main className="simple-page narrow">
      <button className="back-link" onClick={onHome}>
        ← Accueil
      </button>
      <div className="profile-head">
        <div className="profile-avatar" style={{ overflow: "hidden", background: "#fff" }}>
          <img
            src="/hanaa-logo.png"
            alt="Hanaa Food"
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        </div>
        <div>
          <span className="eyebrow">MON ESPACE</span>
          <h1>Bienvenue chez Hanaa</h1>
          <p>Gère tes commandes et tes informations.</p>
        </div>
      </div>
      <div className="account-list">
        <button onClick={onOrders}>
          ▣　Mes commandes <b>→</b>
        </button>
        <button>
          ⌖　Mes adresses <b>→</b>
        </button>
        <button onClick={onFavorites}>
          ♡　Mes favoris <b>→</b>
        </button>
        <button onClick={onProfile}>
          ♙　Mon profil <b>→</b>
        </button>
      </div>
    </main>
  );
}

function Favorites({ favoriteIds, onHome, onOpen, onToggleFavorite }) {
  const favoriteProducts = products.filter((product) =>
    favoriteIds.includes(product.id),
  );

  return (
    <main className="simple-page">
      <button className="back-link" onClick={onHome}>
        ← Mon compte
      </button>
      <div className="page-title">
        <div>
          <span className="eyebrow">MON ESPACE</span>
          <h1>Mes favoris</h1>
          <p>Retrouve rapidement les plats que tu aimes.</p>
        </div>
      </div>

      {favoriteProducts.length ? (
        <div className="product-grid">
          {favoriteProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onAdd={() => onOpen(product)}
              onDetails={() => onOpen(product)}
              favorite
              onToggleFavorite={() => onToggleFavorite(product.id)}
            />
          ))}
        </div>
      ) : (
        <div className="empty-category" style={{ marginTop: 24 }}>
          <b>Aucun favori pour le moment</b>
          <span>Appuie sur ♡ sur un plat pour le garder ici.</span>
        </div>
      )}
    </main>
  );
}

function ClientProfile({ onHome }) {
  const [form, setForm] = useState(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("hanaa-client-profile") || "{}",
      );
      return { name: saved.name || "", phone: saved.phone || "" };
    } catch {
      return { name: "", phone: "" };
    }
  });
  const [message, setMessage] = useState("");

  const save = (event) => {
    event.preventDefault();
    if (!form.name.trim() || !phoneIsValid(form.phone)) return;
    const clean = { name: form.name.trim(), phone: form.phone.trim() };
    localStorage.setItem("hanaa-client-profile", JSON.stringify(clean));
    setForm(clean);
    setMessage("✅ Profil enregistré");
  };

  return (
    <main className="simple-page narrow">
      <button className="back-link" onClick={onHome}>
        ← Mon compte
      </button>
      <div className="page-title">
        <div>
          <span className="eyebrow">MON ESPACE</span>
          <h1>Mon profil</h1>
          <p>Ces informations seront utilisées pour tes prochaines commandes.</p>
        </div>
      </div>

      <form className="checkout-form" onSubmit={save}>
        <div className="form-grid">
          <label className="wide">
            Nom
            <input
              required
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Ton nom"
            />
          </label>
          <label className="wide">
            Téléphone
            <input
              required
              value={form.phone}
              onChange={(event) =>
                setForm((current) => ({ ...current, phone: event.target.value }))
              }
              placeholder="06XXXXXXXX ou +2126XXXXXXXX"
            />
            {form.phone && !phoneIsValid(form.phone) && (
              <small className="field-error">Format marocain requis</small>
            )}
          </label>
        </div>
        <button
          className="primary-action full"
          type="submit"
          disabled={!form.name.trim() || !phoneIsValid(form.phone)}
        >
          Enregistrer mon profil
        </button>
        {message && (
          <p style={{ color: "#D71920", fontWeight: 800, marginTop: 14 }}>
            {message}
          </p>
        )}
      </form>
    </main>
  );
}
function Admin({ order, onHome }) {
  const [branchFilter, setBranchFilter] = useState("all");
  const [settings, setSettings] = useState(branches);
  const update = (id, key, value) =>
    setSettings((current) =>
      current.map((branch) =>
        branch.id === id ? { ...branch, [key]: value } : branch,
      ),
    );
  useEffect(() => {
    localStorage.setItem("hanaa-branches", JSON.stringify(settings));
    branches.splice(0, branches.length, ...settings);
  }, [settings]);
  const visibleOrder =
    !order || branchFilter === "all" || order.branchId === branchFilter
      ? order
      : null;
  return (
    <main className="simple-page">
      <button className="back-link" onClick={onHome}>
        ← Accueil
      </button>
      <div className="page-title">
        <div>
          <span className="eyebrow">HANAA FOOD · ADMIN</span>
          <h1>Branches & commandes</h1>
        </div>
      </div>
      <div className="admin-stats">
        {settings.map((branch) => (
          <div key={branch.id}>
            <b>{branch.isOpen ? "Ouvert" : "Fermé"}</b>
            <span>{branch.name}</span>
          </div>
        ))}
      </div>
      <section className="admin-orders">
        <h2>Filtrer les commandes</h2>
        <div className="categories">
          {[
            ["all", "Toutes"],
            ...settings.map((branch) => [branch.id, branch.name]),
          ].map(([id, label]) => (
            <button
              className={branchFilter === id ? "active" : ""}
              key={id}
              onClick={() => setBranchFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {visibleOrder ? (
          <p>
            Commande <b>#{visibleOrder.id}</b> · {visibleOrder.branchName} ·{" "}
            {visibleOrder.total} DH
          </p>
        ) : (
          <p className="muted">Aucune commande pour cette branche.</p>
        )}
      </section>
      <section className="admin-orders">
        <h2>Paramètres des branches</h2>
        {settings.map((branch) => (
          <div className="admin-order" key={branch.id}>
            <div>
              <b>{branch.name}</b>
              <span>{branch.address || "Adresse à renseigner"}</span>
              <input
                aria-label={`Adresse ${branch.name}`}
                value={branch.address}
                placeholder="Adresse exacte"
                onChange={(event) =>
                  update(branch.id, "address", event.target.value)
                }
              />
              <input
                aria-label={`Latitude ${branch.name}`}
                value={branch.latitude ?? ""}
                placeholder="Latitude"
                onChange={(event) =>
                  update(
                    branch.id,
                    "latitude",
                    event.target.value ? Number(event.target.value) : null,
                  )
                }
              />
              <input
                aria-label={`Longitude ${branch.name}`}
                value={branch.longitude ?? ""}
                placeholder="Longitude"
                onChange={(event) =>
                  update(
                    branch.id,
                    "longitude",
                    event.target.value ? Number(event.target.value) : null,
                  )
                }
              />
              <small>
                {branch.deliveryPricingSettings.baseFee} DH de base ·{" "}
                {branch.deliveryPricingSettings.pricePerKm} DH/km · rayon{" "}
                {branch.deliveryPricingSettings.maximumDistanceKm} km
              </small>
              <div className="zone-editor">
                {(branch.deliveryZones || []).map((zone, index) => (
                  <label key={`${branch.id}-${index}`}>
                    Jusqu'à {index === (branch.deliveryZones || []).length - 1 ? "" : "distance"}
                    <input aria-label={`Distance zone ${index + 1} ${branch.name}`} type="number" min="0" step="0.1" value={zone.maxKm} onChange={(event) => update(branch.id, "deliveryZones", branch.deliveryZones.map((item, zoneIndex) => zoneIndex === index ? { ...item, maxKm: Number(event.target.value) } : item))} /> km ·
                    <input aria-label={`Prix zone ${index + 1} ${branch.name}`} type="number" min="0" step="1" value={zone.fee} onChange={(event) => update(branch.id, "deliveryZones", branch.deliveryZones.map((item, zoneIndex) => zoneIndex === index ? { ...item, fee: Number(event.target.value) } : item))} /> DH
                  </label>
                ))}
              </div>
            </div>
            <div className="admin-actions">
              <button
                onClick={() => update(branch.id, "isOpen", !branch.isOpen)}
              >
                {branch.isOpen ? "Fermer" : "Ouvrir"}
              </button>
              <button
                onClick={() =>
                  update(branch.id, "deliveryEnabled", !branch.deliveryEnabled)
                }
              >
                {branch.deliveryEnabled
                  ? "Désactiver livraison"
                  : "Activer livraison"}
              </button>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
function formatDistance(distanceKm) {
  if (distanceKm === null || distanceKm === undefined)
    return "Distance indisponible";
  return distanceKm < 1
    ? `${Math.round(distanceKm * 1000)} m`
    : `${distanceKm.toFixed(1)} km`;
}
function BranchPicker({
  branchesReady,
  branchError,
  onRetryBranches,
  mode,
  address,
  customerLocation,
  onUseCurrentLocation,
  addressLoading,
  routes,
  routeLoading,
  routeError,
  onRetry,
  selectedId,
  setSelectedId,
  pickupBranchId,
  setPickupBranchId,
}) {
  const nearestId = routes[0]?.branchId;
  if (mode === "delivery")
    return (
      <section className="branch-picker delivery-branches">
        <div className="branch-picker-heading">
          <b>Choisissez votre restaurant</b>
          <span>
            {routeLoading
              ? "Calcul des distances..."
              : routeError ||
                (routes.length
                  ? "Adresse confirmée · distances par itinéraire routier"
                  : address
                    ? "Adresse confirmée"
                    : "Entrez une adresse ou utilisez votre position")}
          </span>
        </div>
        <div className="branch-location-actions">
          <button disabled={addressLoading} onClick={onUseCurrentLocation}>
            Utiliser ma position actuelle
          </button>
        </div>
        {branchError && (
          <>
            <p className="field-error">{branchError}</p>
            <button className="retry-route" onClick={onRetryBranches}>
              Réessayer
            </button>
          </>
        )}
        {!branchesReady && !branchError && (
          <p className="field-help">Les coordonnées des restaurants sont à renseigner dans Admin.</p>
        )}
        {routeError && (
          <button className="retry-route" onClick={onRetry}>
            Réessayer
          </button>
        )}
        <div className="branch-cards">
          {branches.map((branch) => {
            const route = routes.find((item) => item.branchId === branch.id);
            const eligible =
              route &&
              route.distanceKm <=
                branch.deliveryPricingSettings.maximumDistanceKm;
            return (
              <button
                className={`${selectedId === branch.id ? "selected" : ""} ${nearestId === branch.id ? "recommended" : ""}`}
                key={branch.id}
                disabled={!eligible}
                onClick={() => setSelectedId(branch.id)}
              >
                <b>{branch.name}</b>
                <span>{branch.address}</span>
                <small>
                  {!branch.latitude || !branch.longitude
                    ? "Localisation du restaurant à configurer"
                    : route
                      ? `⌖ ${formatDistance(route.distanceKm)} · ⏱ ${route.durationMinutes || route.estimatedTravelTime} min`
                      : "Itinéraire indisponible"}
                </small>
                <small>
                  {eligible
                    ? `🛵 Livraison ${feeFor(branch, route.distanceKm, 0)} DH`
                    : "Hors zone de livraison"}
                </small>
                {nearestId === branch.id && <em>✓ Le plus proche</em>}
                <strong>
                  {selectedId === branch.id
                    ? "Restaurant choisi"
                    : "Choisir ce restaurant"}
                </strong>
              </button>
            );
          })}
        </div>
        {routeError && (
          <button className="retry-route" onClick={onRetry}>
            Réessayer
          </button>
        )}
        {address &&
          routes.length > 0 &&
          !routes.some(
            (item) =>
              item.distanceKm <=
              branches.find((branch) => branch.id === item.branchId)
                .deliveryPricingSettings.maximumDistanceKm,
          ) && (
            <p className="field-error">
              Cette adresse est actuellement hors de notre zone de livraison.
            </p>
          )}
      </section>
    );
  return (
    <section className="branch-picker pickup-branches">
      <div className="branch-location-actions">
        <button disabled={addressLoading} onClick={onUseCurrentLocation}>Utiliser ma position actuelle</button>
      </div>
      <div className="branch-picker-heading">
        <b>Choisissez où récupérer votre commande</b>
        <span>
          {customerLocation
            ? "La branche la plus proche est recommandée"
            : "Sélectionnez une branche"}
        </span>
      </div>
      <div className="branch-cards">
        {branches.map((branch) => (
          <button
            className={`${pickupBranchId === branch.id ? "selected" : ""} ${nearestId === branch.id ? "recommended" : ""}`}
            key={branch.id}
            disabled={!branch.isOpen || !branch.pickupEnabled}
            onClick={() => setPickupBranchId(branch.id)}
          >
            <b>{branch.name}</b>
            <span>{branch.address}</span>
            <small>{!branch.isOpen ? "Fermé" : routes.find((item) => item.branchId === branch.id) ? `⌖ ${formatDistance(routes.find((item) => item.branchId === branch.id).distanceKm)} · ⏱ ${routes.find((item) => item.branchId === branch.id).durationMinutes} min` : "Distance indisponible"}</small>
            {nearestId === branch.id && <em>✓ Le plus proche · Recommandé</em>}
            <strong>
              {pickupBranchId === branch.id
                ? "Restaurant choisi"
                : "Choisir ce restaurant"}
            </strong>
          </button>
        ))}
      </div>
    </section>
  );
}
export default App;
