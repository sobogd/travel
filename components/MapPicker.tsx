"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleMap, useJsApiLoader, Marker, Autocomplete } from "@react-google-maps/api";
import { X } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { type Airport, cleanCity } from "@/lib/types";

const containerStyle = { width: "100%", height: "100%" };
const FALLBACK = { lat: 48.0, lng: 10.0, zoom: 4 }; // central Europe
const libraries: "places"[] = ["places"];

// Selected airport renders a distinct (emerald) pin; the rest are default red.
const SELECTED_ICON =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24" fill="#10b981" stroke="#fff" stroke-width="1.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="#fff" stroke="none"/></svg>`,
  );

export function MapPicker({
  title,
  selected,
  onSelect,
  onClose,
}: {
  title: string;
  selected: Airport | null;
  onSelect: (a: Airport) => void;
  onClose: () => void;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const { isLoaded } = useJsApiLoader({ id: "google-map-script", googleMapsApiKey: apiKey, libraries });

  const [airports, setAirports] = useState<Airport[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const acRef = useRef<google.maps.places.Autocomplete | null>(null);
  const reqRef = useRef(0); // guards against out-of-order viewport responses

  // Fetch airports inside the current viewport bounds.
  const loadBounds = useCallback(async () => {
    const map = mapRef.current;
    const b = map?.getBounds();
    if (!b) return;
    if ((map?.getZoom() ?? 0) < 4) {
      setAirports([]);
      setHint("Приблизьте карту, чтобы увидеть аэропорты");
      return;
    }
    const sw = b.getSouthWest();
    const ne = b.getNorthEast();
    const bbox = `${sw.lng()},${sw.lat()},${ne.lng()},${ne.lat()}`;
    const id = ++reqRef.current;
    try {
      const res = await apiFetch(`/api/airports?bbox=${encodeURIComponent(bbox)}`);
      if (!res.ok || id !== reqRef.current) return;
      const list: Airport[] = await res.json();
      setAirports(list);
      setHint(list.length >= 300 ? "Показаны не все — приблизьте карту" : null);
    } catch {
      /* ignore */
    }
  }, []);

  const onMapLoad = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map;
      // Set the initial view ONCE here. We must not pass center/zoom as props
      // to <GoogleMap> — those are controlled and would snap the map back to
      // their values on every re-render (each bbox fetch re-renders).
      if (selected?.lat != null && selected?.lon != null) {
        map.setCenter({ lat: selected.lat, lng: selected.lon });
        map.setZoom(8);
      } else {
        map.setCenter({ lat: FALLBACK.lat, lng: FALLBACK.lng });
        map.setZoom(FALLBACK.zoom);
      }
    },
    [selected],
  );

  // Pan to a place picked from the search box (does not select an airport).
  const onPlaceChanged = useCallback(() => {
    const place = acRef.current?.getPlace();
    const loc = place?.geometry?.location;
    if (loc && mapRef.current) {
      mapRef.current.panTo({ lat: loc.lat(), lng: loc.lng() });
      mapRef.current.setZoom(9);
    }
  }, []);

  // Lock body scroll while the full-screen map is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col" style={{ background: "var(--bg)" }}>
      <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold">{title}</div>
          <div className="truncate text-xs" style={{ color: "var(--hint)" }}>
            {selected ? `${selected.code} · ${cleanCity(selected.city) || selected.name}` : "Жми по маркеру аэропорта"}
          </div>
        </div>
        <button onClick={onClose} aria-label="Закрыть" className="rounded-lg p-1.5 transition active:scale-90" style={{ color: "var(--hint)" }}>
          <X size={20} />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        {!apiKey ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm" style={{ color: "var(--hint)" }}>
            Google Maps API key не задан (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY).
          </div>
        ) : !isLoaded ? (
          <div className="flex h-full items-center justify-center text-sm" style={{ color: "var(--hint)" }}>
            Загрузка карты…
          </div>
        ) : (
          <>
            <div className="absolute left-2 right-2 top-2 z-10">
              <Autocomplete onLoad={(a) => (acRef.current = a)} onPlaceChanged={onPlaceChanged}>
                <input
                  type="text"
                  placeholder="Найти место…"
                  className="w-full rounded-md border px-3 py-2 text-sm shadow-sm"
                  style={{ color: "#000", backgroundColor: "#fff" }}
                />
              </Autocomplete>
            </div>
            <GoogleMap
              mapContainerStyle={containerStyle}
              onLoad={onMapLoad}
              onIdle={loadBounds}
              options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: false }}
            >
              {airports.map((a) =>
                a.lat == null || a.lon == null ? null : (
                  <Marker
                    key={a.code}
                    position={{ lat: a.lat, lng: a.lon }}
                    title={`${a.code} · ${cleanCity(a.city) || a.name}`}
                    icon={a.code === selected?.code ? { url: SELECTED_ICON } : undefined}
                    onClick={() => onSelect(a)}
                  />
                ),
              )}
            </GoogleMap>
            {hint && (
              <div
                className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border px-3 py-1.5 text-xs shadow"
                style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--hint)" }}
              >
                {hint}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
