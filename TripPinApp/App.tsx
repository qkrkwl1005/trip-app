import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { GoogleAuthProvider, User, onAuthStateChanged, signInWithCredential } from 'firebase/auth';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { auth, googleWebClientId } from './firebaseConfig';
import { DetailModal } from './src/components/DetailModal';
import { DayFilterPill } from './src/components/DayFilterPill';
import { InviteSheet } from './src/components/InviteSheet';
import { LinkImportCard } from './src/components/LinkImportCard';
import { TripHeader } from './src/components/TripHeader';
import { subscribeToRoom, updateRoom } from './src/services/roomService';
import { TripData, TripDetail, TripItem, TripRoom } from './src/types/trip';
import { buildOrderedRoutePoints } from './src/utils/routeOptimizer';

WebBrowser.maybeCompleteAuthSession();

const defaultTrip: TripData = { title: '', start: '', end: '', flights: [], stays: [], notes: [] };
const fallbackRegion: Region = { latitude: 34.668, longitude: 135.501, latitudeDelta: 0.12, longitudeDelta: 0.12 };

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [roomId, setRoomId] = useState('');
  const [room, setRoom] = useState<TripRoom | null>(null);
  const [roomInput, setRoomInput] = useState('');
  const [selectedDay, setSelectedDay] = useState(0);
  const [detailKind, setDetailKind] = useState<'flights' | 'stays' | 'notes' | null>(null);
  const [notice, setNotice] = useState('');
  const [inviteSignal, setInviteSignal] = useState(0);
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: googleWebClientId,
    scopes: ['openid', 'profile', 'email'],
  });

  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => {
    if (!roomId) return undefined;
    return subscribeToRoom(roomId, setRoom, (error) => setNotice(error.message));
  }, [roomId]);
  useEffect(() => {
    if (response?.type === 'success' && response.params.id_token) {
      signInWithCredential(auth, GoogleAuthProvider.credential(response.params.id_token)).catch((error) => setNotice(error.message));
    }
  }, [response]);

  const trip = room?.trip ?? defaultTrip;
  const dayCount = useMemo(() => {
    if (!trip.start || !trip.end) return 7;
    return Math.max(1, Math.min(31, Math.floor((new Date(trip.end).getTime() - new Date(trip.start).getTime()) / 86400000) + 1));
  }, [trip.end, trip.start]);
  const visibleItems = useMemo(() => (room?.items ?? []).filter((item) => selectedDay === 0 || item.day === selectedDay), [room?.items, selectedDay]);
  const route = useMemo(() => buildOrderedRoutePoints(visibleItems), [visibleItems]);
  const mapRegion = route[0]?.lat && route[0]?.lng ? { latitude: route[0].lat, longitude: route[0].lng, latitudeDelta: 0.12, longitudeDelta: 0.12 } : fallbackRegion;

  const notify = (message: string) => { setNotice(message); setTimeout(() => setNotice(''), 2600); };
  const updateItems = async (items: TripItem[]) => {
    if (!room || !roomId) return;
    try { await updateRoom(roomId, room.revision, { items }); }
    catch (error) { notify(error instanceof Error ? error.message : '저장에 실패했어요.'); }
  };
  const addImportedItems = (imported: TripItem[]) => updateItems([...(room?.items ?? []), ...imported]);
  const saveDetail = (detail: TripDetail) => {
    if (!room || !detailKind) return;
    updateRoom(roomId, room.revision, { trip: { ...trip, [detailKind]: [...trip[detailKind], detail] } });
  };
  const login = async () => {
    if (!googleWebClientId || googleWebClientId === 'replace-me') {
      return notify('Google Web Client ID가 설정되지 않았어요.');
    }
    if (!request) return notify('Google 로그인을 준비 중이에요.');
    try {
      const result = await promptAsync();
      if (result.type === 'error') notify(`Google 로그인 실패: ${result.error?.message ?? 'OAuth 요청을 확인해 주세요.'}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Google 로그인에 실패했어요.');
    }
  };
  const joinRoom = () => { if (roomInput.trim()) setRoomId(roomInput.trim()); };

  if (!user) return <GestureHandlerRootView style={styles.root}><SafeAreaView style={styles.center}><MaterialCommunityIcons name="map-marker-radius-outline" size={54} color="#3b82f6" /><Text style={styles.logoTitle}>트립핀</Text><Text style={styles.muted}>친구와 여행 장소를 지도에 모아보세요.</Text><Pressable onPress={login} style={styles.primary}><Text style={styles.primaryText}>Google로 시작하기</Text></Pressable><Text style={styles.small}>Expo Go에서 테스트하려면 Google OAuth에 trippin 리디렉션 설정이 필요합니다.</Text></SafeAreaView></GestureHandlerRootView>;
  if (!room) return <GestureHandlerRootView style={styles.root}><SafeAreaView style={styles.center}><Text style={styles.logoTitle}>여행 방 참여</Text><Text style={styles.muted}>기존 웹 앱의 공유 방 코드를 입력하세요.</Text><TextInput value={roomInput} onChangeText={setRoomInput} placeholder="공유 방 코드" placeholderTextColor="#777" style={styles.roomInput} autoCapitalize="none" /><Pressable onPress={joinRoom} style={styles.primary}><Text style={styles.primaryText}>방 열기</Text></Pressable>{!!notice && <Text style={styles.error}>{notice}</Text>}</SafeAreaView></GestureHandlerRootView>;

  return <GestureHandlerRootView style={styles.root}><BottomSheetModalProvider><SafeAreaView style={styles.root}><View style={styles.header}><View style={styles.headerRow}><TripHeader trip={trip} onInvite={() => setInviteSignal((value) => value + 1)} onEdit={() => Alert.alert('여행 정보', '여행 정보 편집 화면은 다음 단계에서 연결할 수 있습니다.')} /><InviteSheet roomId={roomId} members={room.members} trip={trip} openSignal={inviteSignal} onCopied={() => notify('초대 링크가 복사되었습니다')} /></View></View><MapView provider={PROVIDER_GOOGLE} style={styles.map} initialRegion={mapRegion} region={mapRegion} userInterfaceStyle="dark"><Polyline coordinates={route.flatMap((item) => item.lat && item.lng ? [{ latitude: item.lat, longitude: item.lng }] : [])} strokeColor="#3b82f6" strokeWidth={3} />{visibleItems.filter((item) => item.lat && item.lng).map((item) => <Marker key={item.id} coordinate={{ latitude: item.lat as number, longitude: item.lng as number }} title={item.name} description={item.address} />)}</MapView><View style={styles.content}><DayFilterPill count={dayCount} selectedDay={selectedDay} onChange={setSelectedDay} /><LinkImportCard onImported={addImportedItems} /><FlatList data={visibleItems} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} renderItem={({ item }) => <View style={styles.item}><View style={styles.itemIcon}><MaterialCommunityIcons name="map-marker-outline" size={20} color="#60a5fa" /></View><View style={styles.itemBody}><Text style={styles.itemTitle}>{item.name}</Text><Text style={styles.itemAddress}>{item.address || '주소를 찾는 중'}</Text><Text style={styles.itemDay}>{item.day ? `Day ${item.day}` : '일정 미배정'}</Text></View><Pressable onPress={() => updateItems((room.items ?? []).filter((candidate) => candidate.id !== item.id))}><MaterialCommunityIcons name="delete-outline" size={20} color="#888" /></Pressable></View>} /></View><View style={styles.quickActions}><Pressable onPress={() => setDetailKind('flights')} style={styles.quick}><Text style={styles.quickText}>✈️ 항공편</Text></Pressable><Pressable onPress={() => setDetailKind('stays')} style={styles.quick}><Text style={styles.quickText}>🏨 숙소</Text></Pressable><Pressable onPress={() => setDetailKind('notes')} style={styles.quick}><Text style={styles.quickText}>📝 메모</Text></Pressable></View>{!!notice && <View style={styles.toast}><Text style={styles.toastText}>{notice}</Text></View>}<DetailModal visible={detailKind !== null} title={detailKind === 'flights' ? '항공편' : detailKind === 'stays' ? '숙소' : '메모'} onClose={() => setDetailKind(null)} onSave={saveDetail} /></SafeAreaView></BottomSheetModalProvider></GestureHandlerRootView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#121212' }, center: { flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  logoTitle: { color: '#fff', fontSize: 32, fontWeight: '900' }, muted: { color: '#aaa', textAlign: 'center' }, small: { color: '#777', fontSize: 11, textAlign: 'center', lineHeight: 17, marginTop: 8 },
  primary: { backgroundColor: '#3b82f6', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28, marginTop: 10 }, primaryText: { color: '#fff', fontWeight: '800' },
  roomInput: { width: '100%', maxWidth: 340, backgroundColor: '#242424', borderRadius: 12, color: '#fff', padding: 14, fontSize: 15 },
  header: { backgroundColor: '#121212', paddingBottom: 8 }, headerRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingRight: 20 }, map: { height: '34%', minHeight: 230 }, content: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  list: { gap: 8, paddingVertical: 8, paddingBottom: 70 }, item: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#1d1d1d', borderRadius: 14, padding: 11 }, itemIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#263b5d', alignItems: 'center', justifyContent: 'center' }, itemBody: { flex: 1 }, itemTitle: { color: '#fff', fontWeight: '800' }, itemAddress: { color: '#999', fontSize: 12, marginTop: 3 }, itemDay: { color: '#60a5fa', fontSize: 11, marginTop: 3 },
  quickActions: { position: 'absolute', right: 16, bottom: 14, flexDirection: 'row', gap: 6 }, quick: { backgroundColor: '#242424', borderRadius: 16, paddingHorizontal: 11, paddingVertical: 9 }, quickText: { color: '#eee', fontSize: 11, fontWeight: '700' }, toast: { position: 'absolute', bottom: 70, alignSelf: 'center', backgroundColor: '#303030', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 11 }, toastText: { color: '#fff', fontWeight: '700' }, error: { color: '#f87171', fontSize: 12, textAlign: 'center' },
});
