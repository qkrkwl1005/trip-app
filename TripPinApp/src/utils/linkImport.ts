import { TripItem, TripItemCategory } from '../types/trip';

type ImportOptions = {
  endpoint?: string;
  googleMapsApiKey?: string;
  aiProviderKey?: string;
  geminiApiKey?: string;
  openRouterApiKey?: string;
  groqApiKey?: string;
  openAiApiKey?: string;
  hint?: string;
};

type Candidate = {
  name?: unknown;
  title?: unknown;
  address?: unknown;
  lat?: unknown;
  lng?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  note?: unknown;
  imageUrl?: unknown;
  image?: unknown;
  img?: unknown;
  thumbnail?: unknown;
  thumbnailUrl?: unknown;
  thumbnail_url?: unknown;
  thumbnail_src?: unknown;
  videoThumbnail?: unknown;
};

const asNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.text();
  let payload: unknown;
  try { payload = body ? JSON.parse(body) : null; } catch { payload = body; }
  if (!response.ok) throw new Error(`요청 실패 (${response.status})`);
  return payload;
}

function extractCandidates(value: unknown): Candidate[] {
  if (Array.isArray(value)) return value as Candidate[];
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.items)) return record.items as Candidate[];
  if (Array.isArray(record.places)) return record.places as Candidate[];
  if (typeof record.choices === 'object' && Array.isArray(record.choices)) return [];
  return [];
}

function extractJson(text: string): Candidate[] {
  const cleaned = text.replace(/```json?|```/gi, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start >= 0 && end > start) {
    try { return extractCandidates(JSON.parse(cleaned.slice(start, end + 1))); } catch { return []; }
  }
  return [];
}

async function askOpenAiCompatible(key: string, endpoint: string, model: string, prompt: string) {
  const payload = await requestJson(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        { role: 'system', content: 'Return only a JSON array. Each item must have name, address, note.' },
        { role: 'user', content: prompt },
      ],
    }),
  }) as { choices?: Array<{ message?: { content?: string } }> };
  return extractJson(payload.choices?.[0]?.message?.content ?? '');
}

async function askGemini(key: string, prompt: string) {
  const payload = await requestJson(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: `${prompt}\nReturn only a JSON array with name, address, note.` }] }] }),
  }) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return extractJson(payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '');
}

async function askAI(prompt: string, options: ImportOptions = {}) {
  const providers = [
    options.openRouterApiKey || process.env.EXPO_PUBLIC_OPENROUTER_API_KEY ? { key: options.openRouterApiKey || process.env.EXPO_PUBLIC_OPENROUTER_API_KEY, endpoint: 'https://openrouter.ai/api/v1/chat/completions', model: 'openrouter/free' } : null,
    options.groqApiKey || process.env.EXPO_PUBLIC_GROQ_API_KEY ? { key: options.groqApiKey || process.env.EXPO_PUBLIC_GROQ_API_KEY, endpoint: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile' } : null,
    options.openAiApiKey || options.aiProviderKey || process.env.EXPO_PUBLIC_OPENAI_API_KEY ? { key: options.openAiApiKey || options.aiProviderKey || process.env.EXPO_PUBLIC_OPENAI_API_KEY, endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' } : null,
  ].filter((provider): provider is NonNullable<typeof provider> => provider !== null);
  const errors: string[] = [];
  if (options.geminiApiKey || process.env.EXPO_PUBLIC_GEMINI_API_KEY) {
    try {
      const candidates = await askGemini(options.geminiApiKey || process.env.EXPO_PUBLIC_GEMINI_API_KEY || '', prompt);
      if (candidates.length) return candidates;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Gemini provider error');
    }
  }
  for (const provider of providers) {
    try {
      const candidates = await askOpenAiCompatible(provider.key, provider.endpoint, provider.model, prompt);
      if (candidates.length) return candidates;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'AI provider error');
    }
  }
  throw new Error(errors.length ? `AI 링크 분석 실패: ${errors.join(' · ')}` : '사용 가능한 AI 제공자 키가 없습니다.');
}

async function geocode(candidate: Candidate, options: ImportOptions) {
  const address = String(candidate.address ?? '').trim();
  const name = String(candidate.name ?? candidate.title ?? '').trim();
  const query = [name, address, options.hint].filter(Boolean).join(', ');
  if (options.googleMapsApiKey && query) {
    const payload = await requestJson(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${encodeURIComponent(options.googleMapsApiKey)}`) as { results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } }; formatted_address?: string }> };
    const location = payload.results?.[0]?.geometry?.location;
    if (location && Number.isFinite(location.lat) && Number.isFinite(location.lng)) return { lat: asNumber(location.lat), lng: asNumber(location.lng), address: payload.results?.[0]?.formatted_address || address };
  }
  return { lat: asNumber(candidate.lat ?? candidate.latitude), lng: asNumber(candidate.lng ?? candidate.longitude), address };
}

export async function importTripLink(
  url: string,
  category: TripItemCategory = 'PLACE',
  options: ImportOptions = {},
): Promise<TripItem[]> {
  const normalized = url.trim();
  if (!/^https?:\/\//i.test(normalized)) throw new Error('인스타그램 또는 쇼츠 링크를 입력해 주세요.');
  let candidates: Candidate[] = [];
  const endpoint = (options.endpoint ?? process.env.EXPO_PUBLIC_LINK_IMPORT_ENDPOINT ?? '').trim();
  if (endpoint) {
    const payload = await requestJson(endpoint.includes('?') ? `${endpoint}&url=${encodeURIComponent(normalized)}` : `${endpoint}?url=${encodeURIComponent(normalized)}`, { headers: { Accept: 'application/json' } });
    candidates = extractCandidates(payload);
  }
  if (!candidates.length) {
    candidates = await askAI(`다음 여행 링크에서 방문할 만한 장소를 최대 10개 추출하세요.\n링크: ${normalized}\n추가 지역 힌트: ${options.hint ?? ''}`, options);
  }
  if (!candidates.length) throw new Error('링크에서 장소를 찾지 못했어요.');
  const items = await Promise.all(candidates.slice(0, 10).map(async (candidate, index) => {
    const location = await geocode(candidate, options);
    return {
      id: `link_${Date.now()}_${index}`,
      name: String(candidate.name ?? candidate.title ?? '저장된 장소'),
      address: location.address,
      category,
      lat: location.lat,
      lng: location.lng,
      day: 0,
      sourceUrl: normalized,
      note: String(candidate.note ?? ''),
      imageUrl: String(candidate.imageUrl ?? candidate.image ?? candidate.img ?? candidate.thumbnailUrl ?? candidate.thumbnail_url ?? candidate.thumbnail_src ?? candidate.thumbnail ?? candidate.videoThumbnail ?? '') || undefined,
    };
  }));
  return items;
}
