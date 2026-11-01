import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { importTripLink } from '../utils/linkImport';
import { TripItem, TripItemCategory } from '../types/trip';

type Props = { onImported: (items: TripItem[]) => void };

export function LinkImportCard({ onImported }: Props) {
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState<TripItemCategory>('PLACE');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const importLink = async () => {
    setError('');
    setLoading(true);
    try { onImported(await importTripLink(url, category)); setUrl(''); }
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
  card: { backgroundColor: '#1d1d1d', borderRadius: 18, padding: 16, gap: 10 },
  title: { color: '#fff', fontSize: 16, fontWeight: '800' }, subtitle: { color: '#999', fontSize: 12 },
  input: { backgroundColor: '#252525', borderRadius: 12, color: '#fff', padding: 13, fontSize: 14 },
  categories: { flexDirection: 'row', gap: 6 }, category: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, backgroundColor: '#282828' }, categoryActive: { backgroundColor: '#304d7d' }, categoryText: { color: '#ddd', fontSize: 11 },
  button: { backgroundColor: '#3b82f6', borderRadius: 12, alignItems: 'center', padding: 13 }, disabled: { opacity: .45 }, buttonText: { color: '#fff', fontWeight: '800' }, error: { color: '#f87171', fontSize: 12, lineHeight: 18 },
});
