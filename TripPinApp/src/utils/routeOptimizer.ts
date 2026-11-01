import { TripItem } from '../types/trip';

export function distKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radius = 6371;
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(a));
}

export function buildOrderedRoutePoints(items: TripItem[]) {
  const grouped = new Map<number, TripItem[]>();
  items.filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng)).forEach((item) => {
    const day = item.day > 0 ? item.day : 99;
    grouped.set(day, [...(grouped.get(day) ?? []), item]);
  });
  const ordered: TripItem[] = [];
  [...grouped.keys()].sort((a, b) => a - b).forEach((day) => {
    const remaining = grouped.get(day) ?? [];
    while (remaining.length) {
      if (!ordered.length || ordered[ordered.length - 1].day !== day) ordered.push(remaining.shift() as TripItem);
      else {
        const previous = ordered[ordered.length - 1];
        let nearestIndex = 0;
        let nearestDistance = Infinity;
        remaining.forEach((item, index) => {
          const distance = distKm(previous.lat as number, previous.lng as number, item.lat as number, item.lng as number);
          if (distance < nearestDistance) { nearestDistance = distance; nearestIndex = index; }
        });
        ordered.push(remaining.splice(nearestIndex, 1)[0]);
      }
    }
  });
  return ordered;
}
