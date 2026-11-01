import { TripItem, TripItemCategory } from '../types/trip';

const endpoint = process.env.EXPO_PUBLIC_LINK_IMPORT_ENDPOINT?.trim();

export async function importTripLink(
  url: string,
  category: TripItemCategory = 'PLACE',
): Promise<TripItem[]> {
  const normalized = url.trim();
  if (!/^https?:\/\//i.test(normalized)) {
    throw new Error('인스타그램 또는 쇼츠 링크를 입력해 주세요.');
  }
  if (!endpoint) {
    throw new Error(
      '링크 분석 프록시 주소가 아직 설정되지 않았어요. .env의 EXPO_PUBLIC_LINK_IMPORT_ENDPOINT를 기존 프록시 주소로 설정해 주세요.',
    );
  }

  const response = await fetch(endpoint.includes('?') ? `${endpoint}&url=${encodeURIComponent(normalized)}` : `${endpoint}?url=${encodeURIComponent(normalized)}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`링크 분석 실패 (${response.status})`);
  const payload = await response.json();
  const candidates = Array.isArray(payload) ? payload : payload.items ?? payload.places;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('링크에서 장소를 찾지 못했어요.');
  }

  return candidates.slice(0, 10).map((candidate: Record<string, unknown>, index: number) => ({
    id: `link_${Date.now()}_${index}`,
    name: String(candidate.name ?? candidate.title ?? '저장된 장소'),
    address: String(candidate.address ?? ''),
    category,
    lat: Number.isFinite(Number(candidate.lat)) ? Number(candidate.lat) : null,
    lng: Number.isFinite(Number(candidate.lng)) ? Number(candidate.lng) : null,
    day: 0,
    sourceUrl: normalized,
    note: String(candidate.note ?? ''),
  }));
}
