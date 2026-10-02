import { ZONES } from "@/config/zones";
import { SERVICE_AREA } from "@/config/pricing";
import { departmentOf, haversineKm } from "@/lib/geo";
import type { Place } from "@/lib/types";

export function zoneOf(place: Pick<Place, "lat" | "lon" | "postcode" | "citycode">): string | null {
  for (const z of ZONES) {
    if (z.center && z.radiusKm && haversineKm(place, z.center) <= z.radiusKm) return z.id;
  }
  for (const z of ZONES) {
    if (z.center) continue;
    if (z.bounds && haversineKm(place, z.bounds) > z.bounds.maxKm) continue;
    if (place.citycode && z.citycodes?.includes(place.citycode)) return z.id;
    if (place.postcode && z.postcodePrefixes?.some((p) => place.postcode!.startsWith(p))) return z.id;
  }
  return null;
}

export function isInServiceArea(place: Pick<Place, "postcode">) {
  const dep = departmentOf(place.postcode);
  return !!dep && SERVICE_AREA.departments.includes(dep);
}
