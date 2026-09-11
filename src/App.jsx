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

import { createOrder, getOrder, listOrders, subscribeOrder, subscribeOrders } from "./ordersApi";
const routeViews = { "/login": "login", "/admin": "admin-dashboard", "/admin/commandes-livraison": "delivery-orders", "/admin/commandes-emporter": "pickup-orders", "/admin/livreurs": "driver-management", "/admin/utilisateurs": "user-management", "/snack": "snack-delivery", "/livreur": "driver" };

const photo = (id) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=82`;
const categories = [
  ["Salades", "salades"],
  ["Pâtes", "pates"],
  ["Pizzas", "pizzas"],
  ["Pasticcios", "pasticcios"],
  ["Tapas", "tapas"],
  ["Wraps", "wraps"],
  ["Grillades", "grillades"],
  ["Plats", "plats"],
  ["Burgers", "burgers"],
  ["Sandwichs Classiques", "sandwichs-classiques"],
  ["Tacos Classiques", "tacos-classiques"],
  ["Mini Tacos Étudiants", "mini-tacos"],
  ["Tacos Spéciaux", "tacos-speciaux"],
  ["Sandwichs Spéciaux", "sandwichs-speciaux"],
  ["Bowls", "bowls"],
  ["Jus", "jus"],
  ["Supplément Jus", "supplement-jus"],
  ["Desserts", "desserts"],
  ["Suppléments", "supplements"],
  ["Boissons", "boissons"],].map(([label, id]) => ({ label, id }));

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
const extrasByCategory = {
  "wraps": [
    { name: "Frite", price: 10 },
    { name: "Wrap gratiné", price: 10 },
  ],
  "burgers": [{ name: "Frite", price: 10 }],
  "sandwichs-classiques": [{ name: "Frite", price: 10 }],
  "tacos-classiques": [
    { name: "Frite", price: 10 },
    { name: "Tacos gratiné", price: 10 },
  ],
  "mini-tacos": [
    { name: "Frite", price: 10 },
    { name: "Tacos gratiné", price: 10 },
  ],
  "tacos-speciaux": [{ name: "Frite", price: 10 }],
};
const pastaVariants = ["Penne", "Spaghetti", "Tagliatelle"];
const accompaniments = [
  "Pâte sauce champignon",
  "Pâte sauce blanche",
  "Riz",
  "Légumes sautés",
  "Frites",
  "Potatoes",
];
const rawProducts = [
  ["Marocaine", "salades", 25, "Laitue, tomate, oignon, poivron, olives noires, concombre, thon.", "/products/salades/marocaine.png"],
  ["Niçoise", "salades", 30, "Laitue, concombre, carotte, betterave, pomme de terre, tomate, maïs, thon, oeuf.", "/products/salades/nicoise.png"],
  ["Mexicaine", "salades", 35, "Tomate cerise, poivron, riz, maïs, fromage, thon, oeuf.", "/products/salades/mexicaine.png"],
  ["César", "salades", 45, "Laitue romaine, crouton, parmesan, tomate cerise, poulet grillée.", "/products/salades/cesar.png"],
  ["Hanaa Food", "salades", 55, "Tomate cerise, fruit de saison, salade vert, fromage, avocat, thon, surimi, calamar, crevette.", "/products/salades/hanaa-food.png"],
  ["Poulet Champignon", "pates", 40, "Sauce blanche ou brune, fromage, champignon, poulet, ail.", images.pasta, pastaVariants],
  ["Carbonara", "pates", 40, "Sauce blanche, parmesan, champignon, dinde fumée, ail.", images.pasta, pastaVariants],
  ["Bolognaise", "pates", 45, "Sauce tomate, basilic, parmesan, viande hachée, ail.", images.pasta, pastaVariants],
  ["Quatre Fromage", "pates", 45, "Sauce blanche, mozzarella, parmesan, fromage rouge et bleu.", images.pasta, pastaVariants],
  ["Hanaa Food", "pates", 50, "Sauce blanche, basilic, champignon, parmesan, poulet, dinde fumée, ail.", images.pasta, pastaVariants],
  ["Fruit de Mer", "pates", 65, "Sauce blanche ou sauce tomate, basilic, parmesan, crevette, sepia, ail.", images.pasta, pastaVariants],
  ["Margherita", "pizzas", 25, "Pizza Margherita.", images.pizza, {"Medium": 25, "Sénior": 40}],
  ["Végétarienne", "pizzas", 30, "Pizza Végétarienne.", images.pizza, {"Medium": 30, "Sénior": 45}],
  ["Hot Dog", "pizzas", 25, "Pizza Hot Dog.", images.pizza, {"Medium": 25, "Sénior": 45}],
  ["Thon", "pizzas", 30, "Pizza Thon.", images.pizza, {"Medium": 30, "Sénior": 50}],
  ["Charcuterie", "pizzas", 30, "Pizza Charcuterie.", images.pizza, {"Medium": 30, "Sénior": 50}],
  ["Poulet", "pizzas", 30, "Pizza Poulet.", images.pizza, {"Medium": 30, "Sénior": 60}],
  ["Viande Hachée", "pizzas", 35, "Pizza Viande Hachée.", images.pizza, {"Medium": 35, "Sénior": 60}],
  ["Suprême", "pizzas", 35, "Pizza Suprême.", images.pizza, {"Medium": 35, "Sénior": 60}],
  ["Pepperoni", "pizzas", 30, "Pizza Pepperoni.", images.pizza, {"Medium": 30, "Sénior": 60}],
  ["Quatre Fromage", "pizzas", 35, "Pizza Quatre Fromage.", images.pizza, {"Medium": 35, "Sénior": 60}],
  ["Quatre Saisons", "pizzas", 35, "Pizza Quatre Saisons.", images.pizza, {"Medium": 35, "Sénior": 60}],
  ["Napolitaine", "pizzas", 35, "Pizza Napolitaine.", images.pizza, {"Medium": 35, "Sénior": 60}],
  ["Calzon", "pizzas", 30, "Pizza Calzon.", images.pizza, {"Medium": 30, "Sénior": 45}],
  ["Fruits de Mer", "pizzas", 35, "Pizza Fruits de Mer.", images.pizza, {"Medium": 35, "Sénior": 60}],
  ["Hot Dog", "pasticcios", 30, "Pasticcio Hot Dog.", "/products/pasticcios/hot-dog.png"],
  ["Charcuterie", "pasticcios", 35, "Pasticcio Charcuterie.", "/products/pasticcios/charcuterie.png"],
  ["Poulet", "pasticcios", 35, "Pasticcio Poulet.", "/products/pasticcios/poulet.png"],
  ["Viande Hachée", "pasticcios", 35, "Pasticcio Viande Hachée.", "/products/pasticcios/viande-hachee.png"],
  ["Mixte", "pasticcios", 40, "Pasticcio Mixte.", "/products/pasticcios/mixte.png"],
  ["Hanaa Food", "pasticcios", 45, "Pasticcio Hanaa Food.", "/products/pasticcios/hanaa-food.png"],
  ["Nuggets", "tapas", 15, "Nuggets croustillants.", "/products/tapas/nuggets.png", { "4 pièces": 15, "8 pièces": 25 }],
  ["Oignon Rings", "tapas", 15, "Oignon Rings croustillants.", "/products/tapas/onion-rings.png", {"4 pièces": 15, "8 pièces": 25}],
  ["Stick Mozza", "tapas", 20, "Sticks mozzarella croustillants.", "/products/tapas/stick-mozza.png", { "4 pièces": 20, "8 pièces": 35 }],
  ["Wings", "tapas", 20, "Chicken wings croustillantes.", "/products/tapas/wings.png", { "4 pièces": 20, "8 pièces": 35 }],
  ["Fries Cheese", "tapas", 20, "Frites avec fromage.", "/products/tapas/fries-cheese.png"],
  ["Chicken Louisiane", "wraps", 35, "Crudité, tenders, sauce Big Mac, sauce fromagère.", "/products/wraps/chicken-louisiane.png"],
  ["Chicken Onions", "wraps", 45, "Crudité, tenders, onion crispy rings, sauce Magic Onion, sauce fromagère, sauce cheddar.", "/products/wraps/chicken-onions.png"],
  ["Eldorado", "wraps", 65, "Viande hachée, œuf, rösti, jambon de dinde, cheddar, salade, tomate, sauce fromagère.", "/products/wraps/eldorado.png"],
  ["Diablo", "wraps", 65, "Tenders, steak de viande hachée, nuggets fromage, salade, tomate, fromage mix, sauce cheddar et fromagère.", "/products/wraps/diablo.png"],
  ["Sovereign", "wraps", 70, "Tenders, nuggets, steak de viande hachée, jambon de dinde, salade, escalope de poulet, fromage mix, tomate, sauce cheddar et fromagère.", "/products/wraps/sovereign.png"],
  ["Brochettes Poulet", "grillades", 50, "Brochettes de poulet grillées.", "/products/grillades/brochettes-poulet.png"],
  ["Brochettes Viande Hachée", "grillades", 60, "Brochettes de viande hachée grillées.", "/products/grillades/brochettes-viande-hachee.png"],
  ["Brochettes Mixte", "grillades", 65, "Brochettes mixtes grillées.", "/products/grillades/brochettes-mixte.png"],
  ["Chicken Eco", "plats", 35, "Poulet pané avec accompagnements au choix.", "/products/plats/chicken-eco-v2.png"],
  ["Chicken Hanaa Food", "plats", 50, "Poulet croustillant Hanaa Food avec accompagnements au choix.", "/products/plats/chicken-hanaa-food-v2.png"],
  ["Chicken Tandoori", "plats", 60, "Poulet tandoori grillé avec accompagnements au choix.", "/products/plats/chicken-tandoori-v2.png"],
  ["Poulet Parmigiana", "plats", 60, "Poulet parmigiana gratiné avec accompagnements au choix.", "/products/plats/poulet-parmigiana-v2.png"],
  ["Emincé de Poulet", "plats", 60, "Émincé de poulet crémeux avec accompagnements au choix.", "/products/plats/emince-de-poulet-v2.png"],
  ["Escalope de Poulet Milanaise", "plats", 60, "Escalope de poulet milanaise avec accompagnements au choix.", "/products/plats/escalope-milanaise-v2.png"],
  ["Cordon Bleu", "plats", 60, "Cordon bleu croustillant avec accompagnements au choix.", "/products/plats/cordon-bleu-v2.png"],
  ["Plat Fitnesse", "plats", 60, "Assiette healthy avec accompagnements au choix.", "/products/plats/plat-fitnesse-v2.png"],
  ["Mini Cheese", "burgers", 20, "Steak Hachée, cheddar, ketchup, cornichons, oignons.", "/products/burgers/mini-cheese.png"],
  ["Cheese Burger", "burgers", 30, "Steak Hachée, cheddar, salade, tomate, oignons, sce burger.", "/products/burgers/cheese-burger.png"],
  ["Chicken", "burgers", 30, "Filet de poulet panée, salade, tomate, mayonnaise.", "/products/burgers/chicken.png"],
  ["Cheese Omelette", "burgers", 35, "Steak Hachée, omelette, cheddar, ketchup, mayonnaise, oignons.", "/products/burgers/cheese-omelette.png"],
  ["Crispy Chicken", "burgers", 40, "Poulet croustillant, salade, sce épicée.", "/products/burgers/crispy-chicken.png"],
  ["Fish", "burgers", 40, "Filet de poisson pané, salade, sce tartare.", "/products/burgers/fish.png"],
  ["Chicken Rosti", "burgers", 40, "Poulet pané, rosti, cheddar, salade, sce burger.", "/products/burgers/chicken-rosti.png"],
  ["Big Mac", "burgers", 45, "Double Steak, cheddar, salade, cornichons, sce spéciale.", "/products/burgers/big-mac.png"],
  ["Boeuf Rosti", "burgers", 45, "Steak Hachée, rosti, cheddar, salade, sce burger.", "/products/burgers/boeuf-rosti.png"],
  ["Double Chicken", "burgers", 45, "Double poulet pané, cheddar, salade, sce burger.", "/products/burgers/double-chicken.png"],
  ["Texas", "burgers", 50, "Steak Hachée, bacon, cheddar, oignons rings, sce BBQ.", "/products/burgers/texas.png"],
  ["Le King", "burgers", 50, "Steak Hachée, bacon, cheddar, oignons, salade, sce spéciale.", "/products/burgers/le-king.png"],
  ["L'Empereur du Chicken", "burgers", 75, "Filet de poulet mariné, maïs doux, oignons caramélisés, laitue, fromage, avocat, guacamole, mozzarella chunk.", images.burgers],
  ["Big Flame", "burgers", 75, "Steaks de bœuf smashé, salami halal grillé, escalopes de poulet crunchy, oignons rouges caramélisés, sce flame et sce BBQ.", images.burgers],
  ["Imperial Stack", "burgers", 90, "Steaks de v. hachée, salami halal grillé, escalopes de poulet crunchy, œuf au plat, oignons caramélisés, légumes frais de saison, sce cheddar fumée.", images.burgers],
  ["The Emperor", "burgers", 90, "Double steak smashé, salami halal grillé, filet crispy géant, triple cheddar fondu, légumes frais de saison, oignons rings caramélisés, sce impériale premium.", images.burgers],
  ["Thon", "sandwichs-classiques", 20, "", "/products/sandwichs-classiques/thon.png"],
  ["Nuggets", "sandwichs-classiques", 25, "", "/products/sandwichs-classiques/nuggets.png"],
  ["Poulet", "sandwichs-classiques", 25, "", "/products/sandwichs-classiques/poulet.png"],
  ["Viande Hachée", "sandwichs-classiques", 30, "", "/products/sandwichs-classiques/viande-hachee.png"],
  ["Mixte", "sandwichs-classiques", 30, "", "/products/sandwichs-classiques/mixte.png"],
  ["Canibal", "sandwichs-speciaux", 80, "Cordon bleu croustillant, poulet croustillant aux corn flakes, Steak V.H, poulet à la crème et champignons, galette pomme de terre.", images.wraps],
  ["Psychopat", "sandwichs-speciaux", 80, "Chicken moza pané, mozzarella sticks, nuggets camenbert, nuggets jalapenos cheddar, chicken rings.", images.wraps],
  ["Boeuf Titanesque", "sandwichs-speciaux", 65, "Boeuf grillé, Cheddar, Fromage de chèvre, Miel, Laitue, Tomate.", images.wraps],
  ["Poulet Titanesque", "sandwichs-speciaux", 60, "Poulet grillé, Cheddar, Fromage de chèvre, Miel, Laitue, Tomate.", images.wraps],
  ["Le Best", "sandwichs-speciaux", 60, "Steak V.H, Escalope de Poulet.", images.wraps],
  ["Escabri", "sandwichs-speciaux", 60, "Escalope de Poulet, Fromage blanc.", images.wraps],
  ["Zinger", "sandwichs-speciaux", 60, "Steak V.H, Tenders, Escalope de Poulet.", images.wraps],
  ["Phénomène", "sandwichs-speciaux", 45, "Poulet, Cordon bleu.", images.wraps],
  ["Buffalo", "sandwichs-speciaux", 45, "Steak V.H, Œuf, Dinde Fumée.", images.wraps],
  ["Quatro", "sandwichs-speciaux", 45, "Steak V.H, Œuf.", images.wraps],
  ["Le Blindé", "sandwichs-speciaux", 45, "Steak V.H, Cordon bleu.", images.wraps],
  ["Triple Steak", "sandwichs-speciaux", 45, "Steak V.H, Dinde fumée.", images.wraps],
  ["Radical", "sandwichs-speciaux", 45, "Steak V.H, Poulet mariné.", images.wraps],
  ["Escalope du Chef", "sandwichs-speciaux", 40, "Poulet, Champignon, sce emmental.", images.wraps],
  ["Steak Hachée", "sandwichs-speciaux", 40, "Steak V.H.", images.wraps],
  ["Méga Fish", "sandwichs-speciaux", 40, "Poisson crispy.", images.wraps],
  ["Mexicain", "sandwichs-speciaux", 40, "Cuisse de Dinde, Poivron & oignon.", images.wraps],
  ["Méga Chicken", "sandwichs-speciaux", 40, "Poulet crispy.", images.wraps],
  ["Chicken Mixte", "sandwichs-speciaux", 45, "Épices tandoori et curry.", images.wraps],
  ["Chicken Jaune", "sandwichs-speciaux", 40, "Épices curry.", images.wraps],
  ["Chicken Rouge", "sandwichs-speciaux", 40, "Épices tandoori.", images.wraps],
  ["Chicken Blanc", "sandwichs-speciaux", 40, "Crème fraiche.", images.wraps],
  ["Hot Mixte", "sandwichs-speciaux", 35, "Steak Hachée, Hot dog.", images.wraps],
  ["Cordon Bleu", "sandwichs-speciaux", 35, "", images.wraps],
  ["Poulet", "tacos-classiques", 30, "Tacos poulet.", "/products/tacos-classiques/poulet.png", { M: 30, L: 40, XL: 50 }],
  ["Nuggets", "tacos-classiques", 30, "Tacos nuggets.", "/products/tacos-classiques/nuggets.png", { M: 30, L: 40, XL: 50 }],
  ["Cordon Bleu", "tacos-classiques", 30, "Tacos cordon bleu.", "/products/tacos-classiques/cordon-bleu.png", { M: 30, L: 40, XL: 55 }],
  ["Viande Hachée", "tacos-classiques", 35, "Tacos viande hachée.", "/products/tacos-classiques/viande-hachee.png", { M: 35, L: 45, XL: 55 }],
  ["Mixte", "tacos-classiques", 40, "Tacos mixte.", "/products/tacos-classiques/mixte.png", { M: 40, L: 50, XL: 65 }],
  ["Hanaa Food", "tacos-classiques", 40, "Tacos signature Hanaa Food.", "/products/tacos-classiques/hanaa-food.png", { M: 40, L: 50, XL: 65 }],
  ["Géant", "tacos-classiques", 30, "Tacos géant.", "/products/tacos-classiques/geant.png", { M: 30, L: 40, XL: 55 }],
  ["Poulet", "mini-tacos", 25, "Mini tacos étudiant poulet.", "/products/mini-tacos/mini-poulet.png"],
  ["Viande Hachée", "mini-tacos", 30, "Mini tacos étudiant viande hachée.", "/products/mini-tacos/mini-viande-hachee.png"],
  ["Mixte", "mini-tacos", 35, "Mini tacos étudiant mixte.", "/products/mini-tacos/mini-mixte.png"],
  ["Chicken Cheesy Curry", "tacos-speciaux", 60, "Poulet mariné curry, Nuggets, Sauce Fromagère, Frite. Gratinée 3 Fromages.", images.tacos],
  ["Le BBR", "tacos-speciaux", 60, "Cordon Bleu, Viande Hachée, Jambon de Dinde, Onion Crispy, Sce Fromagère, Frite, Sce au choix. Gratinée Gouda.", images.tacos],
  ["O'Capik", "tacos-speciaux", 60, "Nuggets fromage, Poulet curry, V. Hachée, Sce Fromagère, Frite, Sce piquante. Gratinée Cheddar.", images.tacos],
  ["El Gringo", "tacos-speciaux", 60, "Poulet, Tenders, Nuggets, Sce Chili Tai, Onion Crispy, Sce Fromagère, Frite. Gratinée Cheddar Mexicain.", images.tacos],
  ["Le Suisse", "tacos-speciaux", 60, "Escalope de poulet, Tenders, Jambon de Dinde, Sce Fromagère, Frite, Onion Crispy. Gratinée Gruyère tranche de Poulet.", images.tacos],
  ["So' Raclette", "tacos-speciaux", 60, "Balls Raclette, V. Hachée, Frite, Sce Sweet Onions, Sce Fromagère.", images.tacos],
  ["Double Chicken", "tacos-speciaux", 65, "Nuggets, tenders, Cheddar, oignons caramélisés, sce algérienne.", images.tacos],
  ["O'Crost!", "tacos-speciaux", 65, "Galette pomme de terre, V. Hachée, oignons caramélisés, sce barbecue.", images.tacos],
  ["Le Gourmand", "tacos-speciaux", 75, "V. Hachée, Dinde fumée, Camembert, Sce miel moutarde, oignons caramélisés.", images.tacos],
  ["La Zomba X", "tacos-speciaux", 90, "Steak mozza, V. Hachée, Pepperoni, Galette pomme de terre, doritos croustillant, Nuggets jalapenos cheese.", images.tacos],
  ["Chicken Riz", "bowls", 50, "Chicken Crispy, Onion Crispy, Riz, Sauce Cheddar, Sauce Fromagère.", images.bowls],
  ["Fondon", "bowls", 60, "Poulet, Chicken crispy, Frite, Onion rings, Onion Crispy, Sce Cheddar, Sce Fromagère.", images.bowls],
  ["New-York", "bowls", 60, "Jambon de Dinde, Onion Crispy, Tenders, Nuggets, Sce Cheddar, Frite, Sce Fromagère.", images.bowls],
  ["Mix Match", "bowls", 60, "Nuggets fromage, Jambon de Dinde, Poulet, V. Hachée, Onion Crispy, Frite, Sce Cheddar, Sce Fromagère.", images.bowls],
  ["Veggie", "bowls", 60, "Cordon Bleu, Jambon de Dinde, Onion Crispy, Chicken crispy, Frite, Sce Cheddar, Sce Fromagère.", images.bowls],
  ["Le Sort Bowl", "bowls", 90, "Escalope de poulet, Camembert pané, Nuggets, Frite, Onion Crispy, Sce emmental aux champignons, Sce Cheddar, Sce Fromagère.", images.bowls],
  ["Matrice Bowl", "bowls", 90, "Poulet mariné du chef, Jambon de dinde, Nuggets, Frite, Mozza sticks, Onion Caramélisés, Jalapenos, Sce Cheddar, Sce Fromagère.", images.bowls],
  ["Détox", "jus", 12, "", "/products/jus/detox.png"],
  ["Orange", "jus", 15, "", "/products/jus/orange.png"],
  ["Banane", "jus", 15, "", "/products/jus/banane.png"],
  ["Pomme", "jus", 15, "", "/products/jus/pomme.png"],
  ["Papaye", "jus", 20, "", "/products/jus/papaye.png"],
  ["Fraise", "jus", 20, "", "/products/jus/fraise.png"],
  ["Ananas", "jus", 20, "", "/products/jus/ananas.png"],
  ["Mangue", "jus", 20, "", "/products/jus/mangue.png"],
  ["Panaché", "jus", 20, "", "/products/jus/panache.png"],
  ["Exotique", "jus", 20, "", "/products/jus/exotique.png"],
  ["Avocat", "jus", 20, "", "/products/jus/avocat.png"],
  ["Avocat Fruit Sec", "jus", 25, "", "/products/jus/avocat-fruit-sec.png"],
  ["Avocat Oreo", "jus", 25, "", "/products/jus/avocat-oreo.png"],
  ["Avocat Kit Kat", "jus", 25, "", "/products/jus/avocat-kit-kat.png"],
  ["Protéine", "jus", 35, "", "/products/jus/proteine.png"],
  ["Whey", "supplement-jus", 15, "Supplément jus.", "/products/supplement-jus/whey.png"],
  ["Mass Tech", "supplement-jus", 15, "Supplément jus.", "/products/supplement-jus/mass-tech.png"],
  ["Fruits sec", "supplement-jus", 15, "Supplément jus.", "/products/supplement-jus/fruits-sec.png"],
  ["Flocon d'Avoine", "supplement-jus", 15, "Supplément jus.", "/products/supplement-jus/flocon-avoine.png"],
  ["Salade Fruit", "desserts", 20, "", images.dessert],
  ["Panna Cotta", "desserts", 15, "Dessert Hanaa Food.", "/products/desserts/panna-cotta.png"],
  ["Tiramisu", "desserts", 20, "Dessert Hanaa Food.", "/products/desserts/tiramisu.png"],
  ["Cheese Cake", "desserts", 20, "Dessert Hanaa Food.", "/products/desserts/cheesecake.png"],
  ["Pain maison", "supplements", 3, "Supplément Hanaa Food.", "/products/supplements/pain-maison.png"],
  ["Sauce", "supplements", 3, "Supplément Hanaa Food.", "/products/supplements/sauce.png"],
  ["Fromage", "supplements", 3, "Supplément Hanaa Food.", "/products/supplements/fromage.png"],
  ["Mozzarella", "supplements", 5, "Supplément Hanaa Food.", "/products/supplements/mozzarella.png"],
  ["Champignon frais", "supplements", 8, "Supplément Hanaa Food.", "/products/supplements/champignon-frais.png"],
  ["Frite", "supplements", 10, "Supplément Hanaa Food.", "/products/supplements/frites.png"],
  ["Potatoes Maison", "supplements", 15, "Quartiers de pommes de terre assaisonnés.", "/products/supplements/potatoes-maison.png"],
  ["Légumes sautés", "supplements", 15, "Supplément Hanaa Food.", "/products/supplements/legumes-sautes.png"],
  ["Sauce champignon", "supplements", 15, "Supplément Hanaa Food.", "/products/supplements/sauce-champignon.png"],
  ["Brochette poulet", "supplements", 15, "Supplément Hanaa Food.", "/products/supplements/brochette-poulet.png"],
  ["Brochette V. Hachée", "supplements", 20, "Supplément Hanaa Food.", "/products/supplements/brochette-viande-hachee.png"],
  ["Poulet", "supplements", 15, "Supplément Hanaa Food.", "/products/supplements/poulet.png"],
  ["Pâte", "supplements", 15, "Supplément Hanaa Food.", "/products/supplements/pate.png"],
  ["Risotto", "supplements", 20, "Supplément Hanaa Food.", "/products/supplements/risotto.png"],
  ["Gouda / Edam", "supplements", 10, "Supplément Hanaa Food.", "/products/supplements/gouda-edam.png"],
  ["Soda 25 cl Coca/Fanta/Sprite", "boissons", 6, "Boisson.", "/products/boissons/soda-25cl.jpg"],
  ["Soda 25 cl Hawai/Poms", "boissons", 8, "Boisson.", "/products/boissons/hawai-poms.jpg"],
  ["Soda 33 cl", "boissons", 10, "Boisson.", "/products/boissons/soda-33cl.jpg"],
  ["Soda 1 L", "boissons", 12, "Boisson.", "/products/boissons/soda-1l.jpg"],
  ["Eau", "boissons", 5, "Boisson.", "/products/boissons/sidi-ali-user.png"],
  ["Oulmes Eau", "boissons", 6, "Oulmès 50cl.", "/products/boissons/oulmes-eau-single.png"],
  ["Soda d'Oulmes", "boissons", 10, "Oulmès Tropical.", "/products/boissons/oulmes-soda-user.png"],
];

const productImageMap = {
  "boissons|Eau": "/products/boissons/sidi-ali-user.png",
  "boissons|Oulmes Eau": "/products/boissons/oulmes-eau-single.png",
  "boissons|Soda 1 L": "/products/boissons/soda-1l.jpg",
  "boissons|Soda 25 cl Coca/Fanta/Sprite": "/products/boissons/soda-25cl.jpg",
  "boissons|Soda 25 cl Hawai/Poms": "/products/boissons/hawai-poms.jpg",
  "boissons|Soda 33 cl": "/products/boissons/soda-33cl.jpg",
  "bowls|Chicken Riz": "/products/bowls-chicken-riz.jpg",
  "bowls|Fondon": "/products/bowls-fondon.jpg",
  "bowls|Le Sort Bowl": "/products/bowls-le-sort-bowl.jpg",
  "bowls|Matrice Bowl": "/products/bowls-matrice-bowl.jpg",
  "bowls|Mix Match": "/products/bowls-mix-match.jpg",
  "bowls|New-York": "/products/bowls-new-york.jpg",
  "bowls|Veggie": "/products/bowls-veggie.jpg",
  "burgers|Big Flame": "/products/burgers-big-flame.jpg",
  "burgers|Big Mac": "/products/burgers/big-mac.png",
  "burgers|Boeuf Rosti": "/products/burgers/boeuf-rosti.png",
  "burgers|Cheese Burger": "/products/burgers/cheese-burger.png",
  "burgers|Cheese Omelette": "/products/burgers/cheese-omelette.png",
  "burgers|Chicken": "/products/burgers/chicken.png",
  "burgers|Chicken Rosti": "/products/burgers/chicken-rosti.png",
  "burgers|Crispy Chicken": "/products/burgers/crispy-chicken.png",
  "burgers|Double Chicken": "/products/burgers/double-chicken.png",
  "burgers|Fish": "/products/burgers/fish.png",
  "burgers|Imperial Stack": "/products/burgers-imperial-stack.jpg",
  "burgers|L'Empereur du Chicken": "/products/burgers-empereur-du-chicken.jpg",
  "burgers|Le King": "/products/burgers/le-king.png",
  "burgers|Mini Cheese": "/products/burgers/mini-cheese.png",
  "burgers|Texas": "/products/burgers/texas.png",
  "burgers|The Emperor": "/products/burgers-the-emperor.jpg",
  "desserts|Cheese Cake": "/products/desserts/cheesecake.png",
  "desserts|Panna Cotta": "/products/desserts/panna-cotta.png",
  "desserts|Salade Fruit": "/products/dessert-salade-fruit.jpg",
  "desserts|Tiramisu": "/products/desserts/tiramisu.png",
  "grillades|Brochettes Mixte": "/products/grillades/brochettes-mixte.png",
  "grillades|Brochettes Poulet": "/products/grillades/brochettes-poulet.png",
  "grillades|Brochettes V. Hachée": "/products/grillades/brochettes-viande-hachee.png",
  "jus|Ananas": "/products/jus/ananas.png",
  "jus|Avocat": "/products/jus/avocat.png",
  "jus|Avocat Fruit Sec": "/products/jus/avocat-fruit-sec.png",
  "jus|Avocat Kit Kat": "/products/jus/avocat-kit-kat.png",
  "jus|Avocat Oreo": "/products/jus/avocat-oreo.png",
  "jus|Banane": "/products/jus/banane.png",
  "jus|Détox": "/products/jus/detox.png",
  "jus|Exotique": "/products/jus/exotique.png",
  "jus|Fraise": "/products/jus/fraise.png",
  "jus|Mangue": "/products/jus/mangue.png",
  "jus|Orange": "/products/jus/orange.png",
  "jus|Panaché": "/products/jus/panache.png",
  "jus|Papaye": "/products/jus/papaye.png",
  "jus|Pomme": "/products/jus/pomme.png",
  "jus|Protéine": "/products/jus/proteine.png",
  "mini-tacos|Mixte": "/products/mini-tacos/mini-mixte.png",
  "mini-tacos|Poulet": "/products/mini-tacos/mini-poulet.png",
  "mini-tacos|Viande Hachée": "/products/mini-tacos/mini-viande-hachee.png",
  "pasticcios|Charcuterie": "/products/pasticcios/charcuterie.png",
  "pasticcios|Hanaa Food": "/products/pasticcios/hanaa-food.png",
  "pasticcios|Hot Dog": "/products/pasticcios/hot-dog.png",
  "pasticcios|Mixte": "/products/pasticcios/mixte.png",
  "pasticcios|Poulet": "/products/pasticcios/poulet.png",
  "pasticcios|Viande Hachée": "/products/pasticcios/viande-hachee.png",
  "pates|Bolognaise": "/products/pates-bolognaise.jpg",
  "pates|Carbonara": "/products/pates-carbonara.jpg",
  "pates|Fruit de Mer": "/products/pates-fruit-de-mer.jpg",
  "pates|Hanaa Food": "/products/pates-hanaa-food.jpg",
  "pates|Poulet Champignon": "/products/pates-poulet-champignon.jpg",
  "pates|Quatre Fromage": "/products/pates-quatre-fromage.jpg",
  "pizzas|Calzon": "/products/pizza-calzone.jpg",
  "pizzas|Charcuterie": "/products/pizza-charcuterie.jpg",
  "pizzas|Fruits de Mer": "/products/pizza-fruits-de-mer.jpg",
  "pizzas|Hot Dog": "/products/pizza-hot-dog.jpg",
  "pizzas|Margherita": "/products/pizza-margherita.jpg",
  "pizzas|Napolitaine": "/products/pizza-napolitaine.jpg",
  "pizzas|Pepperoni": "/products/pizza-pepperoni.jpg",
  "pizzas|Poulet": "/products/pizza-poulet.jpg",
  "pizzas|Quatre Fromage": "/products/pizza-quatre-fromages.jpg",
  "pizzas|Quatre Saisons": "/products/pizza-quatre-saisons.jpg",
  "pizzas|Suprême": "/products/pizza-supreme.jpg",
  "pizzas|Thon": "/products/pizza-thon.jpg",
  "pizzas|Viande Hachée": "/products/pizza-viande-hachee.jpg",
  "pizzas|Végétarienne": "/products/pizza-vegetarienne.jpg",
  "plats|Chicken Eco": "/products/plats/chicken-eco-v2.png",
  "plats|Chicken Hanaa Food": "/products/plats/chicken-hanaa-food-v2.png",
  "plats|Chicken Tandoori": "/products/plats/chicken-tandoori-v2.png",
  "plats|Cordon Bleu": "/products/plats/cordon-bleu-v2.png",
  "plats|Escalope de Poulet Milanaise": "/products/plats/escalope-milanaise-v2.png",
  "plats|Plat Fitnesse": "/products/plats/plat-fitnesse-v2.png",
  "plats|Poulet Parmigiana": "/products/plats/poulet-parmigiana-v2.png",
  "plats|Émincé de Poulet": "/products/plats/emince-de-poulet.png",
  "salades|César": "/products/salades/cesar.png",
  "salades|Hanaa Food": "/products/salades/hanaa-food.png",
  "salades|Marocaine": "/products/salades/marocaine.png",
  "salades|Mexicaine": "/products/salades/mexicaine.png",
  "salades|Niçoise": "/products/salades/nicoise.png",
  "sandwichs-classiques|Mixte": "/products/sandwichs-classiques/mixte.png",
  "sandwichs-classiques|Nuggets": "/products/sandwichs-classiques/nuggets.png",
  "sandwichs-classiques|Poulet": "/products/sandwichs-classiques/poulet.png",
  "sandwichs-classiques|Thon": "/products/sandwichs-classiques/thon.png",
  "sandwichs-classiques|Viande Hachée": "/products/sandwichs-classiques/viande-hachee.png",
  "sandwichs-speciaux|Boeuf Titanesque": "/products/sandwichs-speciaux-boeuf-titanesque.jpg",
  "sandwichs-speciaux|Buffalo": "/products/sandwichs-speciaux-buffalo.jpg",
  "sandwichs-speciaux|Canibal": "/products/sandwichs-speciaux-canibal.jpg",
  "sandwichs-speciaux|Chicken Blanc": "/products/sandwichs-speciaux-chicken-blanc.jpg",
  "sandwichs-speciaux|Chicken Jaune": "/products/sandwichs-speciaux-chicken-jaune.jpg",
  "sandwichs-speciaux|Chicken Mixte": "/products/sandwichs-speciaux-chicken-mixte.jpg",
  "sandwichs-speciaux|Chicken Rouge": "/products/sandwichs-speciaux-chicken-rouge.jpg",
  "sandwichs-speciaux|Cordon Bleu": "/products/sandwichs-speciaux-cordon-bleu.jpg",
  "sandwichs-speciaux|Escabri": "/products/sandwichs-speciaux-escabri.jpg",
  "sandwichs-speciaux|Escalope du Chef": "/products/sandwichs-speciaux-escalope-du-chef.jpg",
  "sandwichs-speciaux|Hot Mixte": "/products/sandwichs-speciaux-hot-mixte.jpg",
  "sandwichs-speciaux|Le Best": "/products/sandwichs-speciaux-le-best.jpg",
  "sandwichs-speciaux|Le Blindé": "/products/sandwichs-speciaux-le-blinde.jpg",
  "sandwichs-speciaux|Mexicain": "/products/sandwichs-speciaux-mexicain.jpg",
  "sandwichs-speciaux|Méga Chicken": "/products/sandwichs-speciaux-mega-chicken.jpg",
  "sandwichs-speciaux|Méga Fish": "/products/sandwichs-speciaux-mega-fish.jpg",
  "sandwichs-speciaux|Phénomène": "/products/sandwichs-speciaux-phenomene.jpg",
  "sandwichs-speciaux|Poulet Titanesque": "/products/sandwichs-speciaux-poulet-titanesque.jpg",
  "sandwichs-speciaux|Psychopat": "/products/sandwichs-speciaux-psychopat.jpg",
  "sandwichs-speciaux|Quatro": "/products/sandwichs-speciaux-quatro.jpg",
  "sandwichs-speciaux|Radical": "/products/sandwichs-speciaux-radical.jpg",
  "sandwichs-speciaux|Steak Hachée": "/products/sandwichs-speciaux-steak-hachee.jpg",
  "sandwichs-speciaux|Triple Steak": "/products/sandwichs-speciaux-triple-steak.jpg",
  "sandwichs-speciaux|Zinger": "/products/sandwichs-speciaux-zinger.jpg",
  "supplement-jus|Flocon d'Avoine": "/products/supplement-jus/flocon-avoine.png",
  "supplement-jus|Fruits Sec": "/products/supp-jus-fruits-secs.jpg",
  "supplement-jus|Scoop Protein Mass": "/products/supp-jus-proteine.jpg",
  "supplement-jus|Scoop Protein Weight": "/products/supp-jus-proteine.jpg",
  "supplements|Brochette Poulet": "/products/supplements/brochette-poulet.png",
  "supplements|Brochette V. Hachée": "/products/supplements/brochette-viande-hachee.png",
  "supplements|Champignon Frais": "/products/supplements/champignon-frais.png",
  "supplements|Chicken": "/products/supplements/poulet.png",
  "supplements|Frite": "/products/supplements/frites.png",
  "supplements|Fromage": "/products/supplements/fromage.png",
  "supplements|Légumes Sautés": "/products/supplements/legumes-sautes.png",
  "supplements|Mozzarella": "/products/supplements/mozzarella.png",
  "supplements|Pain Maison": "/products/supplements/pain-maison.png",
  "supplements|Pâte": "/products/supplements/pate.png",
  "supplements|Risotto": "/products/supplements/risotto.png",
  "supplements|Sauce": "/products/supplements/sauce.png",
  "supplements|Sauce Champignon": "/products/supplements/sauce-champignon.png",
  "tacos-classiques|Cordon Bleu": "/products/tacos-classiques/cordon-bleu.png",
  "tacos-classiques|Géant": "/products/tacos-classiques/geant.png",
  "tacos-classiques|Hanaa Food": "/products/tacos-classiques/hanaa-food.png",
  "tacos-classiques|Mixte": "/products/tacos-classiques/mixte.png",
  "tacos-classiques|Nuggets": "/products/tacos-classiques/nuggets.png",
  "tacos-classiques|Poulet": "/products/tacos-classiques/poulet.png",
  "tacos-classiques|Viande Hachée": "/products/tacos-classiques/viande-hachee.png",
  "tacos-speciaux|Chicken Cheesy Curry": "/products/tacos-speciaux-chicken-cheesy-curry.jpg",
  "tacos-speciaux|Double Chicken": "/products/tacos-speciaux-double-chicken.jpg",
  "tacos-speciaux|El Gringo": "/products/tacos-speciaux-el-gringo.jpg",
  "tacos-speciaux|La Zomba X": "/products/tacos-speciaux-la-zomba-x.jpg",
  "tacos-speciaux|Le BBR": "/products/tacos-speciaux-le-bbr.jpg",
  "tacos-speciaux|Le Gourmand": "/products/tacos-speciaux-le-gourmand.jpg",
  "tacos-speciaux|Le Suisse": "/products/tacos-speciaux-le-suisse.jpg",
  "tacos-speciaux|O'Capik": "/products/tacos-speciaux-o-capyk.jpg",
  "tacos-speciaux|O'Crost!": "/products/tacos-speciaux-o-crost.jpg",
  "tacos-speciaux|So' Raclette": "/products/tacos-speciaux-so-raclette.jpg",
  "wraps|Chicken Louisiane": "/products/wraps/chicken-louisiane.png",
  "wraps|Chicken Onions": "/products/wraps/chicken-onions.png",
  "wraps|Diablo": "/products/wraps/diablo.png",
  "wraps|Eldorado": "/products/wraps/eldorado.png",
  "wraps|Sovereign": "/products/wraps/sovereign.png",
  "jus|Detox": "/products/jus/detox.png",
  "jus|Proteine": "/products/jus/proteine.png",
  "supplement-jus|Whey": "/products/supplement-jus/whey.png",
  "supplement-jus|Mass Tech": "/products/supplement-jus/mass-tech.png",
  "supplement-jus|Fruits sec": "/products/supplement-jus/fruits-sec.png",
  "supplement-jus|Flocon d’Avoine": "/products/supplement-jus/flocon-avoine.png",
  "desserts|Salade de fruits": "/products/desserts/salade-fruits.png",
  "desserts|Cheesecake": "/products/desserts/cheesecake.png",
  "desserts|Gâteau au fromage": "/products/desserts/cheesecake.png",
  "supplements|Pain maison": "/products/supplements/pain-maison.png",
  "supplements|Champignon frais": "/products/supplements/champignon-frais.png",
  "supplements|Frites": "/products/supplements/frites.png",
  "supplements|Légumes sautés": "/products/supplements/legumes-sautes.png",
  "supplements|Sauce champignon": "/products/supplements/sauce-champignon.png",
  "supplements|Brochette poulet": "/products/supplements/brochette-poulet.png",
  "supplements|Brochette V. Hachee": "/products/supplements/brochette-viande-hachee.png",
  "supplements|Poulet": "/products/supplements/poulet.png",
  "supplements|Pate": "/products/supplements/pate.png",
  "supplements|Crâne": "/products/supplements/pate.png",
  "supplements|Crane": "/products/supplements/pate.png",
  "supplements|Gouda / Edam": "/products/supplements/gouda-edam.png",
  "supplements|Gouda/Edam": "/products/supplements/gouda-edam.png",
  "supplements|Gouda /Edam": "/products/supplements/gouda-edam.png",
  "boissons|Soda 25 cl Hawai/Pom's": "/products/boissons/hawai-poms.jpg",
  "boissons|Soda 1L": "/products/boissons/soda-1l.jpg",
  "boissons|Oulmès Eau": "/products/boissons/oulmes-eau-single.png",
  "boissons|Schweppes": "/products/boissons/schweppes-user.png",
  "boissons|Soda d'Oulmes": "/products/boissons/oulmes-soda-user.png",
  "supplements|Potatoes Maison": "/products/supplements/potatoes-maison.png",
};

const products = rawProducts.map((item, index) => {
  const categoryId = item[1];
  const isMealWithSides = categoryId === "plats" || categoryId === "grillades";
  const productExtras = isMealWithSides
    ? accompaniments.map((name) => ({ name, price: 0 }))
    : extrasByCategory[categoryId] || [];
  return {
    id: index + 1,
    name: item[0],
    categoryId,
    subcategoryId: categoryId,
    price: item[2],
    description: item[3],
  image:
    productImageMap[`${item[1]}|${item[0]}`] ||
    (String(item[4] || "").startsWith("/") ||
    String(item[4] || "").startsWith("http")
      ? item[4]
      : photo(item[4])),
    variants: Array.isArray(item[5])
      ? { type: "pasta", choices: item[5] }
      : item[5] || {},
    extras: productExtras,
    maxExtras: isMealWithSides ? 2 : 99,
    requiredExtras: isMealWithSides ? 2 : 0,
  };
});
const sauceCategories = new Set([
  "sandwichs-classiques",
  "sandwichs-speciaux",
  "tacos-classiques",
  "mini-tacos",
  "tacos-speciaux",
  "wraps",
]);

const sauceOptions = [
  "Blanche",
  "Algérienne",
  "Andalouse",
  "Samouraï",
  "Barbecue",
  "Ketchup",
  "Mayonnaise",
  "Harissa",
  "Fromagère",
];

const requiresSauce = (product) =>
  Boolean(product && sauceCategories.has(product.categoryId));

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
  const [category, setCategory] = useState("salades");
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
  const [order, setOrder] = useState(null);

  useEffect(() => {
    if (!order?.id) return undefined;

    try {
      return subscribeOrder(order.id, (updatedOrder) => {
        setOrder(updatedOrder);
      });
    } catch (error) {
      console.error("Order realtime subscription failed:", error);
      return undefined;
    }
  }, [order?.id]);

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
    const sauce = options.sauce || "";
    const price =
      (options.variantPrice || product.price) +
      chosen.reduce((sum, item) => sum + item.price, 0);
    const key = `${product.id}-${options.variant || ""}-${sauce}-${chosen.map((item) => item.name).join("-")}`;
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
              sauce,
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
  const place = async (details) => {
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
    try {
      const savedOrder = await createOrder(next);
      setOrder(savedOrder);
    } catch (error) {
      console.error("Supabase order create failed:", error);
      window.alert("Commande ma tsajlatch. T2akked mn Supabase w internet.");
      return;
    }
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
        <span>Delicious Food · Livraison à domicile : 05 21 43 11 03</span>
        <span>@hanaafood_california · Hanaa Food California · hanaa food.ma</span>
        <span>Bd Amgala, N°189 · Hay Al Osra, Ain Chock · Casablanca - Maroc</span>
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
      <button className="product-image" data-category={product.categoryId} onClick={onDetails}>
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
  const needsMainSauce = [
    "tacos-classiques",
    "mini-tacos",
    "sandwichs-classiques",
  ].includes(product.categoryId);
  const mainSauceOptions = [
    "Sauce blanche",
    "Sauce fromagère",
    "Sauce algérienne",
    "Sauce andalouse",
    "Sauce samouraï",
    "Sauce barbecue",
  ];
  const [mainSauces, setMainSauces] = useState([]);
  const mainSauceValid = !needsMainSauce || mainSauces.length >= 1;
  const toggleMainSauce = (name) =>
    setMainSauces((current) => {
      if (current.includes(name)) {
        return current.filter((item) => item !== name);
      }
      if (current.length >= 2) {
        return current;
      }
      return [...current, name];
    });
  const isClassicTacos =
    product.categoryId === "tacos-classiques" ||
    product.categoryId === "mini-tacos";
  const tacoSauces = [
    "Sauce blanche",
    "Sauce fromagère",
    "Sauce algérienne",
    "Sauce andalouse",
    "Sauce samouraï",
    "Sauce barbecue",
  ];
  const [chosen, setChosen] = useState([]);
  const selectedTacoSauce =
    chosen.find((item) => item?.isTacoSauce)?.name || "";
  const tacoSauceValid = !isClassicTacos || Boolean(selectedTacoSauce);
  const chooseTacoSauce = (name) =>
    setChosen((current) => [
      { name, price: 0, isTacoSauce: true },
      ...current.filter((item) => !item?.isTacoSauce),
    ]);
  const [quantity, setQuantity] = useState(1);
  const [pastaSauce, setPastaSauce] = useState(product.name === "Bolognaise" ? "Sauce tomate" : "Sauce blanche");
  const variantPrice =
    product.variants.type === "pasta"
      ? product.price
      : product.variants[variant] || product.price;
  const total =
    (variantPrice + chosen.reduce((sum, item) => sum + item.price, 0)) *
    quantity;
  const extras = product.extras || [];
  const isPlateWithSides =
    product.categoryId === "plats" || product.categoryId === "grillades";
  const maxExtras = isPlateWithSides
    ? 2
    : Number.isFinite(product.maxExtras)
      ? product.maxExtras
      : 99;
  const requiredExtras = isPlateWithSides
    ? 2
    : Number.isFinite(product.requiredExtras)
      ? product.requiredExtras
      : 0;
  const extrasValid = chosen.length >= requiredExtras;
  const toggle = (extra) =>
    setChosen((current) =>
      current.some((item) => item.name === extra.name)
        ? current.filter((item) => item.name !== extra.name)
        : current.length < maxExtras
          ? [...current, extra]
          : current,
    );
  const variantLabel =
    product.variants.type === "pasta"
      ? "Choisis tes pâtes"
      : product.categoryId === "tapas"
        ? "Choisis la portion"
        : "Choisis ta taille";
  const extrasLabel =
    product.categoryId === "plats" || product.categoryId === "grillades"
      ? `Choisis 2 accompagnements (${chosen.length}/2)`
      : "Options du menu";
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <div className="product-modal">
        <button className="close" onClick={close}>×</button>
        <img src={product.image} alt={product.name} />
        <div className="modal-content">
          <span className="eyebrow">{product.categoryId}</span>
          <h2>{product.name}</h2>
          {product.description && <p>{product.description}</p>}
          {needsMainSauce && (
            <div className="option-group main-sauce-first">
              <label>Choisis jusqu’à 2 sauces</label>
              <div className="size-options">
                {mainSauceOptions.map((item) => (
                  <button
                    type="button"
                    className={mainSauces.includes(item) ? "active" : ""}
                    key={item}
                    onClick={() => toggleMainSauce(item)}
                  >
                    {item}
                    <small>Inclus</small>
                  </button>
                ))}
              </div>
            </div>
          )}
          {choices.length > 0 && (
            <div className="option-group">
              <label>{variantLabel}</label>
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
          {product.variants.type === "pasta" && (
            <div className="option-group">
              <label>Choisis ta sauce</label>
              <div className="size-options">
                {(product.name === "Bolognaise" ? ["Sauce tomate"] : ["Sauce blanche", "Sauce champignon"]).map((item) => (
                  <button
                    className={pastaSauce === item ? "active" : ""}
                    key={item}
                    onClick={() => setPastaSauce(item)}
                  >
                    {item}
                    <small>Inclus</small>
                  </button>
                ))}
              </div>
            </div>
          )}
          {(extras.length > 0 || isPlateWithSides) && (
            <div className="option-group">
              <label>{extrasLabel}</label>
              <div className="extra-list">
                {extras.map((extra) => (
                  <button
                    className={chosen.some((item) => item.name === extra.name) ? "selected" : ""}
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
          )}
          <div className="modal-footer">
            <div className="quantity">
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button>
              <b>{quantity}</b>
              <button onClick={() => setQuantity(quantity + 1)}>+</button>
            </div>
            <button
              className="primary-action"
              disabled={!extrasValid || !mainSauceValid}
              onClick={() =>
                extrasValid && add(product, {
                  variant,
                  variantPrice,
                  extras:
                    needsMainSauce && mainSauces.length
                      ? [
                          ...mainSauces.map((name) => ({ name, price: 0 })),
                          ...chosen.filter((item) => !item?.isTacoSauce),
                        ]
                      : (product.variants.type === "pasta"
                      ? [...chosen, { name: pastaSauce, price: 0 }]
                      : chosen),
                  quantity,
                })
              }
            >
              {extrasValid ? "Ajouter" : "Choisis 2 accompagnements"} <b>{total} DH</b>
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
                    {item.sauce && `Sauce: ${item.sauce} · `}
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
    if (!order?.id) return undefined;
    let active = true;

    void getOrder(order.id)
      .then((latest) => {
        if (active && latest) setCurrentOrder(latest);
      })
      .catch((error) => console.error("Tracking Supabase load failed:", error));

    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeOrder(order.id, (latest) => {
        if (active && latest) setCurrentOrder(latest);
      });
    } catch (error) {
      console.error("Tracking Supabase realtime failed:", error);
    }

    return () => {
      active = false;
      unsubscribe();
    };
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
  const [savedOrders, setSavedOrders] = useState(() => (order ? [order] : []));

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const latest = await listOrders();
        if (active) setSavedOrders(latest);
      } catch (error) {
        console.error("Orders Supabase load failed:", error);
      }
    };

    void load();

    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeOrders(() => void load());
    } catch (error) {
      console.error("Orders Supabase realtime failed:", error);
    }

    return () => {
      active = false;
      unsubscribe();
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
