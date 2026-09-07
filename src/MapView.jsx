import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const defaultCenter = [31.63, -8.0];

function markerIcon(color) {
  return L.divIcon({
    className: "map-marker-wrapper",
    html: `<span class="map-marker" style="--marker-color:${color}"></span>`,
    iconSize: [28, 36],
    iconAnchor: [14, 36]
  });
}

export default function MapView({ branches, customerLocation, selectedBranch, route, mode }) {
  const mapElement = useRef(null);
  const mapRef = useRef(null);
  const branchLayer = useRef(null);
  const routeLayer = useRef(null);
  const customerMarker = useRef(null);

  useEffect(() => {
    if (!mapElement.current || mapRef.current) return undefined;
    const map = L.map(mapElement.current, { zoomControl: false, scrollWheelZoom: false }).setView(defaultCenter, 11);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors", maxZoom: 19 }).addTo(map);
    mapRef.current = map;
    branchLayer.current = L.layerGroup().addTo(map);
    return () => { map.stop(); map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !branchLayer.current) return;
    branchLayer.current.clearLayers();
    branches.filter((branch) => Number.isFinite(Number(branch.latitude)) && Number.isFinite(Number(branch.longitude))).forEach((branch) => {
      const marker = L.marker([Number(branch.latitude), Number(branch.longitude)], { icon: markerIcon(branch.id === selectedBranch?.id ? "#e53935" : "#191919") });
      marker.bindPopup(`<b>${branch.name}</b><br>${branch.address}`);
      marker.addTo(branchLayer.current);
    });
    if (customerMarker.current) customerMarker.current.remove();
    if (customerLocation) {
      customerMarker.current = L.marker([customerLocation.latitude, customerLocation.longitude], { icon: markerIcon("#1976d2") })
        .bindPopup("<b>Votre position</b>")
        .addTo(map);
    }
    const points = branches.filter((branch) => Number.isFinite(Number(branch.latitude)) && Number.isFinite(Number(branch.longitude))).map((branch) => [Number(branch.latitude), Number(branch.longitude)]);
    if (customerLocation) points.push([customerLocation.latitude, customerLocation.longitude]);
    if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 14 });
  }, [branches, customerLocation, selectedBranch]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    routeLayer.current?.remove();
    routeLayer.current = null;
    if (!selectedBranch || !customerLocation || !route?.geometry) return;
    routeLayer.current = L.geoJSON(route.geometry, { style: { color: "#e53935", weight: 5, opacity: 0.85 } }).addTo(map);
    map.fitBounds(routeLayer.current.getBounds(), { padding: [30, 30], maxZoom: 15 });
  }, [customerLocation, route, selectedBranch]);

  return <div className="map-shell"><div className="map-toolbar"><b>{mode === "pickup" ? "Retrait en restaurant" : selectedBranch ? `${selectedBranch.name} → Votre adresse` : "Choisissez votre adresse"}</b><span>{branches.some((branch) => Number.isFinite(Number(branch.latitude))) ? "Carte OpenStreetMap" : "Coordonnées des restaurants à renseigner dans Admin"}</span></div><div className="map-canvas" ref={mapElement} /></div>;
}
