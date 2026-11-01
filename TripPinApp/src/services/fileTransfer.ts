import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';
import { AppSettings, TripData, TripItem, TripItemCategory } from '../types/trip';

type Backup = { version: 2; exportedAt: string; trip: TripData; items: TripItem[]; settings?: AppSettings };

const categoryFrom = (value: string): TripItemCategory => {
  const normalized = value.trim().toUpperCase();
  return normalized === 'CAFE' || normalized === 'FOOD' || normalized === 'SHOP' ? normalized : 'PLACE';
};

const numberOrNull = (value: string) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const escapeCsv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

function normalizeImportedItem(value: Partial<TripItem> & Record<string, unknown>, index: number): TripItem {
  const rawCategory = String(value.category ?? '').toUpperCase();
  const source = value.sourceUrl ?? value.url ?? value.vid;
  const image = value.imageUrl ?? value.img;
  return {
    id: String(value.id ?? `import_${Date.now()}_${index}`),
    name: String(value.name ?? value.localName ?? value.title ?? '저장된 장소'),
    address: String(value.address ?? ''),
    category: categoryFrom(rawCategory),
    lat: numberOrNull(String(value.lat ?? value.latitude ?? '')),
    lng: numberOrNull(String(value.lng ?? value.longitude ?? '')),
    day: Math.max(0, Number(value.day) || 0),
    note: String(value.note ?? value.info ?? ''),
    sourceUrl: source ? String(source) : undefined,
    imageUrl: image ? String(image) : undefined,
    done: Boolean(value.done),
  };
}

function toCsv(items: TripItem[]) {
  const headers = ['id', 'name', 'address', 'category', 'lat', 'lng', 'day', 'note', 'sourceUrl', 'done'];
  return `${headers.join(',')}\n${items.map((item) => [
    item.id, item.name, item.address, item.category, item.lat, item.lng, item.day,
    item.note, item.sourceUrl, item.done ? 'true' : 'false',
  ].map(escapeCsv).join(',')).join('\n')}`;
}

function parseCsv(text: string): TripItem[] {
  const rows = [...text.matchAll(/(?:^|,)(?:"((?:[^"]|"")*)"|([^",\r\n]*))/g)]
    .map((match) => match[1] !== undefined ? match[1].replace(/""/g, '"') : match[2] ?? '');
  const width = 10;
  const items: TripItem[] = [];
  for (let index = width; index < rows.length; index += width) {
    const row = rows.slice(index, index + width);
    if (row.length < width || !row[1]?.trim()) continue;
    items.push({
      id: row[0] || `import_${Date.now()}_${index}`,
      name: row[1].trim(),
      address: row[2] ?? '',
      category: categoryFrom(row[3] ?? ''),
      lat: numberOrNull(row[4] ?? ''),
      lng: numberOrNull(row[5] ?? ''),
      day: Math.max(0, Number(row[6]) || 0),
      note: row[7] ?? '',
      sourceUrl: row[8] ?? '',
      done: row[9] === 'true',
    });
  }
  return items;
}

function toKml(items: TripItem[]) {
  const placemarks = items.filter((item) => item.lat !== null && item.lng !== null).map((item) =>
    `<Placemark><name>${escapeXml(item.name)}</name><description>${escapeXml(item.address)}</description><Point><coordinates>${item.lng},${item.lat},0</coordinates></Point></Placemark>`,
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>${placemarks}</Document></kml>`;
}

function escapeXml(value: unknown) {
  return String(value ?? '').replace(/[<>&'"]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[character] ?? character));
}

function parseKml(kml: string): TripItem[] {
  return [...kml.matchAll(/<Placemark[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<description>([\s\S]*?)<\/description>[\s\S]*?<coordinates>\s*([-\d.]+),([-\d.]+)/gi)]
    .map((match, index) => ({
      id: `kmz_${Date.now()}_${index}`,
      name: match[1].replace(/<[^>]+>/g, '').trim(),
      address: match[2].replace(/<[^>]+>/g, '').trim(),
      category: 'PLACE' as const,
      lat: Number(match[4]),
      lng: Number(match[3]),
      day: 0,
    }));
}

async function shareFile(uri: string, mimeType: string) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('이 기기에서는 파일 공유를 사용할 수 없습니다.');
  await Sharing.shareAsync(uri, { mimeType, UTI: mimeType });
}

async function writeAndShare(name: string, content: string, mimeType: string) {
  const uri = `${Paths.cache.uri}${name}`;
  await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
  await shareFile(uri, mimeType);
}

export async function exportJsonBackup(trip: TripData, items: TripItem[], settings?: AppSettings) {
  const backup: Backup = { version: 2, exportedAt: new Date().toISOString(), trip, items, settings };
  await writeAndShare(`trip-backup-${Date.now()}.json`, JSON.stringify(backup, null, 2), 'application/json');
}

export async function exportCsv(items: TripItem[]) {
  await writeAndShare(`trip-places-${Date.now()}.csv`, toCsv(items), 'text/csv');
}

export async function exportKmz(items: TripItem[]) {
  const zip = new JSZip();
  zip.file('doc.kml', toKml(items));
  const base64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
  const uri = `${Paths.cache.uri}trip-places-${Date.now()}.kmz`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  await shareFile(uri, 'application/vnd.google-earth.kmz');
}

export async function importPlacesFile(): Promise<{ items: TripItem[]; trip?: TripData; settings?: AppSettings }> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/csv', 'text/*', 'application/vnd.google-earth.kmz', 'application/zip'], copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.[0]) throw new Error('파일 선택이 취소되었습니다.');
  const asset = result.assets[0];
  const extension = asset.name.toLowerCase().split('.').pop();
  if (extension === 'kmz') {
    const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
    const zip = await JSZip.loadAsync(base64, { base64: true });
    const kmlFile = Object.keys(zip.files).find((name) => name.toLowerCase().endsWith('.kml'));
    if (!kmlFile) throw new Error('KMZ 안에서 KML 파일을 찾지 못했습니다.');
    return { items: parseKml(await zip.file(kmlFile)!.async('string')) };
  }
  const text = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
  if (extension === 'csv') return { items: parseCsv(text) };
  const parsed = JSON.parse(text) as Partial<Backup> | TripItem[];
  if (Array.isArray(parsed)) return { items: parsed.map((item, index) => normalizeImportedItem(item as Partial<TripItem> & Record<string, unknown>, index)) };
  if (!Array.isArray(parsed.items)) throw new Error('JSON 백업에 장소 목록이 없습니다.');
  return { items: parsed.items.map((item, index) => normalizeImportedItem(item as Partial<TripItem> & Record<string, unknown>, index)), trip: parsed.trip, settings: parsed.settings };
}
