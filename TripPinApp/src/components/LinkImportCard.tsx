import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { importTripLink } from '../utils/linkImport';
import { TripItem, TripItemCategory } from '../types/trip';

type Props = { onImported: (items: TripItem[]) => void; endpoint?: string; googleMapsApiKey?: string; aiProviderKey?: string; geminiApiKey?: string; openRouterApiKey?: string; groqApiKey?: string; openAiApiKey?: string };

export function LinkImportCard({ onImported, endpoint, googleMapsApiKey, aiProviderKey, geminiApiKey, openRouterApiKey, groqApiKey, openAiApiKey }: Props) {
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState<TripItemCategory>('PLACE');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const importLink = async () => {
    setError('');
    setLoading(true);
    try { onImported(await importTripLink(url, category, { endpoint, googleMapsApiKey, aiProviderKey, geminiApiKey, openRouterApiKey, groqApiKey, openAiApiKey })); setUrl(''); }
    catch (caught) { setError(caught instanceof Error ? caught.message : '링크 분석에 실패했어요.'); }
    finally { setLoading(false); }
  };
  return <View style={styles.card}>
    <Text style={styles.title}>릴스·쇼츠에서 장소 가져오기</Text>
    <Text style={styles.subtitle}>링크를 붙여 넣으면 기존 프록시를 통해 장소를 찾습니다.</Text>
    <TextInput value={url} onChangeText={setUrl} placeholder="https://www.instagram.com/reel/..." placeholderTextColor="#777" autoCapitalize="none" style={styles.input} />
    <View style={styles.categories}>{(['PLACE', 'CAFE', 'FOOD', 'SHOP'] as TripItemCategory[]).map((value) => <Pressable key={value} onPress={() => setCategory(value)} style={[styles.category, category === value && styles.categoryActive]}><Text style={styles.categoryText}>{value === 'PLACE' ? '📍 장소' : value === 'CAFE' ? '☕ 카페' : value === 'FOOD' ? '🍙 음식' : '🛍️ 쇼핑'}</Text></Pressable>)}</View>
    <Pressable disabled={loading || !url.trim()} onPress={importLink} style={[styles.button, (!url.trim() || loading) && styles.disabled]}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>분석해서 저장</Text>}</Pressable>
    {!!error && <Text style={styles.error}>{error}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: 'rgba(31,33,39,0.96)', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderRadius: 22, padding: 22, gap: 14 },
  title: { color: '#fff', fontSize: 16, fontWeight: '800' }, subtitle: { color: '#999', fontSize: 12 },
  input: { backgroundColor: '#25272d', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderRadius: 999, color: '#fff', padding: 16, fontSize: 14 },
  categories: { flexDirection: 'row', gap: 8 }, category: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 999, backgroundColor: '#282a30' }, categoryActive: { backgroundColor: '#304d7d' }, categoryText: { color: '#ddd', fontSize: 11 },
  button: { backgroundColor: '#3b82f6', borderRadius: 999, alignItems: 'center', padding: 16 }, disabled: { opacity: .45 }, buttonText: { color: '#fff', fontWeight: '800' }, error: { color: '#f87171', fontSize: 12, lineHeight: 18 },
});
