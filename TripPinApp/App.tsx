import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { GoogleAuthProvider, User, onAuthStateChanged, signInWithCredential } from 'firebase/auth';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Image, KeyboardAvoidingView, Linking, Platform, Pressable, RefreshControl, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { auth, googleIosClientId, googleIosUrlScheme, googleWebClientId } from './firebaseConfig';
import { DetailModal } from './src/components/DetailModal';
import { DayFilterPill } from './src/components/DayFilterPill';
import { InviteSheet } from './src/components/InviteSheet';
import { LinkImportCard } from './src/components/LinkImportCard';
import { PlaceDetailModal } from './src/components/PlaceDetailModal';
import { TripHeader } from './src/components/TripHeader';
import { TripSetupModal } from './src/components/TripSetupModal';
import { SettingsModal } from './src/components/SettingsModal';
import { createRoom, fetchRoom, flushOfflineQueue, joinRoom as joinSharedRoom, resolvePendingConflict, subscribeToRoom, updateRoom } from './src/services/roomService';
import { AppSettings, TripData, TripDetail, TripItem, TripItemCategory, TripRoom } from './src/types/trip';
import { buildOrderedRoutePoints } from './src/utils/routeOptimizer';
import { exportCsv, exportJsonBackup, exportKmz, importPlacesFile } from './src/services/fileTransfer';

WebBrowser.maybeCompleteAuthSession();

const emptyTrip: TripData = { title: '', start: '', end: '', flights: [], stays: [], notes: [] };
const fallbackRegion: Region = { latitude: 34.668, longitude: 135.501, latitudeDelta: 0.12, longitudeDelta: 0.12 };
const defaultSettings: AppSettings = { linkImportEndpoint: process.env.EXPO_PUBLIC_LINK_IMPORT_ENDPOINT ?? '', googleMapsApiKey: '', naverMapsApiKey: '', googleMyMapsUrl: '', aiProviderKey: '', geminiApiKey: process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '', openRouterApiKey: process.env.EXPO_PUBLIC_OPENROUTER_API_KEY ?? '', groqApiKey: process.env.EXPO_PUBLIC_GROQ_API_KEY ?? '', openAiApiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '' };

function getPreviewImage(item: TripItem) {
  if (item.imageUrl) return item.imageUrl;
  const source = item.sourceUrl ?? '';
  const match = source.match(/(?:youtu\.be\/|youtube\.com\/(?:shorts\/|watch\?v=))([^?&#/]+)/i);
  return match?.[1] ? `https://i.ytimg.com/vi/${match[1]}/hqdefault.jpg` : undefined;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [roomId, setRoomId] = useState('');
  const [room, setRoom] = useState<TripRoom | null>(null);
  const [roomInput, setRoomInput] = useState('');
  const [roomLoading, setRoomLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [selectedDay, setSelectedDay] = useState(0);
  const [search, setSearch] = useState('');
  const [setupMode, setSetupMode] = useState<'create' | 'edit' | null>(null);
  const [detailKind, setDetailKind] = useState<'flights' | 'stays' | 'notes' | null>(null);
  const [editingItem, setEditingItem] = useState<TripItem | null>(null);
  const [inviteSignal, setInviteSignal] = useState(0);
  const [darkMode, setDarkMode] = useState(true);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [conflictShown, setConflictShown] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'categories'>('home');
  const [categoryFilter, setCategoryFilter] = useState<TripItemCategory | 'ALL'>('ALL');
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: googleWebClientId,
    iosClientId: googleIosClientId,
    scopes: ['openid', 'profile', 'email'],
  }, { native: googleIosUrlScheme ? `${googleIosUrlScheme}:/oauthredirect` : undefined });

  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => {
    AsyncStorage.getItem('trippin-dark-mode').then((value) => {
      if (value !== null) setDarkMode(value === 'true');
    }).catch(() => undefined);
  }, []);
  useEffect(() => {
    AsyncStorage.getItem('trippin-settings').then((value) => {
      if (value) {
        setSettings({ ...defaultSettings, ...(JSON.parse(value) as Partial<AppSettings>) });
        return;
      }
      Promise.all([
        AsyncStorage.getItem('TRIP_CF_PROXY'),
        AsyncStorage.getItem('TRIP_WORKER_URL'),
        AsyncStorage.getItem('TRAVEL_GMAP_KEY'),
        AsyncStorage.getItem('TRAVEL_NAVER_KEY'),
        AsyncStorage.getItem('TRIP_MYMAPS_URL'),
        AsyncStorage.getItem('TRAVEL_GEMINI_KEY'),
        AsyncStorage.getItem('TRIP_AI_CFG'),
      ]).then(([proxy, worker, googleMaps, naverMaps, myMaps, gemini, aiConfig]) => {
        let ai: Record<string, { key?: string }> = {};
        try { ai = aiConfig ? JSON.parse(aiConfig) as Record<string, { key?: string }> : {}; } catch { ai = {}; }
        const migrated = {
          ...defaultSettings,
          linkImportEndpoint: proxy || worker || defaultSettings.linkImportEndpoint,
          googleMapsApiKey: googleMaps || '',
          naverMapsApiKey: naverMaps || '',
          googleMyMapsUrl: myMaps || '',
          geminiApiKey: gemini || ai.gemini?.key || defaultSettings.geminiApiKey,
          openRouterApiKey: ai.openrouter?.key || defaultSettings.openRouterApiKey,
          groqApiKey: ai.groq?.key || defaultSettings.groqApiKey,
          openAiApiKey: ai.openai?.key || defaultSettings.openAiApiKey,
        };
        if (JSON.stringify(migrated) !== JSON.stringify(defaultSettings)) {
          setSettings(migrated);
          AsyncStorage.setItem('trippin-settings', JSON.stringify(migrated)).catch(() => undefined);
        }
      }).catch(() => undefined);
    }).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (roomId) AsyncStorage.setItem('trippin-room-id', roomId).catch(() => undefined);
  }, [roomId]);
  useEffect(() => {
    if (!roomId) AsyncStorage.getItem('trippin-room-id').then((value) => value && setRoomId(value)).catch(() => undefined);
  }, [roomId]);
  useEffect(() => {
    if (!roomId) return undefined;
    setRoom(null);
    return subscribeToRoom(roomId, setRoom, (error) => {
      setRoom(null);
      setNotice(error.message.includes('permission') ? '이 방을 읽을 권한이 없습니다.' : error.message);
    });
  }, [roomId]);
  useEffect(() => {
    if (!roomId || !room) return;
    AsyncStorage.setItem(`trippin-room-${roomId}`, JSON.stringify(room)).catch(() => undefined);
  }, [room, roomId]);
  useEffect(() => {
    if (!roomId || !user) return undefined;
    const sync = async () => {
      try {
        const result = await flushOfflineQueue(roomId);
        if (result.status === 'conflict' && result.conflict && !conflictShown) {
          setConflictShown(true);
          Alert.alert('변경 충돌', '친구가 같은 장소를 수정했습니다. 어떤 변경을 사용할까요?', [
            { text: '친구 변경', onPress: () => resolvePendingConflict(false).then(() => setConflictShown(false)).catch((error) => notify(error instanceof Error ? error.message : '충돌 해결에 실패했어요.')) },
            { text: '내 변경', onPress: () => resolvePendingConflict(true).then(() => setConflictShown(false)).catch((error) => notify(error instanceof Error ? error.message : '충돌 해결에 실패했어요.')) },
          ], { cancelable: false });
        }
      } catch (error) {
        if (error instanceof Error && !/찾지 못했어요/.test(error.message)) notify(error.message);
      }
    };
    void sync();
    const timer = setInterval(() => { void sync(); }, 15000);
    return () => clearInterval(timer);
  }, [conflictShown, roomId, user]);
  useEffect(() => {
    if (!roomId || room) return;
    AsyncStorage.getItem(`trippin-room-${roomId}`).then((value) => {
      if (value) setRoom(JSON.parse(value) as TripRoom);
    }).catch(() => undefined);
  }, [room, roomId]);
  useEffect(() => {
    if (response?.type === 'success' && response.params.id_token) {
      signInWithCredential(auth, GoogleAuthProvider.credential(response.params.id_token)).catch((error) => setNotice(error.message));
    }
  }, [response]);

  const notify = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(''), 2600);
  };
  const trip = room?.trip ?? emptyTrip;
  const dayCount = useMemo(() => {
    if (!trip.start || !trip.end) return 7;
    return Math.max(1, Math.min(31, Math.floor((new Date(trip.end).getTime() - new Date(trip.start).getTime()) / 86400000) + 1));
  }, [trip.end, trip.start]);
  const visibleItems = useMemo(() => (room?.items ?? []).filter((item) => {
    const query = search.trim().toLowerCase();
    return (activeTab === 'categories' ? (categoryFilter === 'ALL' || item.category === categoryFilter) : true)
      && (selectedDay === 0 || item.day === selectedDay)
      && (!query || `${item.name} ${item.address} ${item.note ?? ''}`.toLowerCase().includes(query));
  }), [activeTab, categoryFilter, room?.items, search, selectedDay]);
  const route = useMemo(() => buildOrderedRoutePoints(visibleItems), [visibleItems]);
  const mapRegion = route[0]?.lat && route[0]?.lng ? { latitude: route[0].lat, longitude: route[0].lng, latitudeDelta: 0.12, longitudeDelta: 0.12 } : fallbackRegion;

  const updateItems = async (items: TripItem[]) => {
    if (!room) return;
    try { await updateRoom(roomId, room.revision, { items }, room.items ?? []); } catch (error) { notify(error instanceof Error ? error.message : '저장에 실패했어요.'); }
  };
  const saveItem = (item: TripItem) => updateItems((room?.items ?? []).map((candidate) => candidate.id === item.id ? item : candidate));
  const toggleDone = (item: TripItem) => updateItems((room?.items ?? []).map((candidate) => candidate.id === item.id ? { ...candidate, done: !candidate.done } : candidate));
  const saveTrip = async (updatedTrip: TripData) => {
    try { if (setupMode === 'create') setRoomId(await createRoom(updatedTrip)); else if (room) await updateRoom(roomId, room.revision, { trip: updatedTrip }); setSetupMode(null); }
    catch (error) { notify(error instanceof Error ? error.message : '여행 저장에 실패했어요.'); }
  };
  const openMyMap = async () => {
    const url = settings.googleMyMapsUrl.trim();
    if (!url) {
      setSettingsVisible(true);
      notify('설정에서 Google My Maps URL을 먼저 입력해 주세요.');
      return;
    }
    try {
      if (await Linking.canOpenURL(url)) await Linking.openURL(url);
      else notify('Google My Maps를 열 수 없습니다.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Google My Maps를 열 수 없습니다.');
    }
  };
  const refreshRoom = async () => {
    if (!roomId) return;
    setRefreshing(true);
    try { setRoom(await fetchRoom(roomId)); notify('최신 데이터로 새로고침했습니다.'); }
    catch (error) { notify(error instanceof Error ? error.message : '새로고침에 실패했어요.'); }
    finally { setRefreshing(false); }
  };
  const saveSettings = (next: AppSettings) => {
    setSettings(next);
    AsyncStorage.setItem('trippin-settings', JSON.stringify(next)).then(() => notify('설정을 저장했습니다.')).catch(() => notify('설정 저장에 실패했어요.'));
  };
  const openSource = async (url: string) => {
    try {
      if (await Linking.canOpenURL(url)) await Linking.openURL(url);
      else notify('원본 링크를 열 수 없습니다.');
    } catch (error) {
      notify(error instanceof Error ? error.message : '원본 링크를 열 수 없습니다.');
    }
  };
  const openSearch = async (item: TripItem) => {
    const query = encodeURIComponent(`${item.name} ${item.address}`.trim());
    await openSource(`https://www.google.com/maps/search/?api=1&query=${query}`);
  };
  const runFileAction = async (action: () => Promise<void>) => {
    try { await action(); } catch (error) { notify(error instanceof Error ? error.message : '파일 작업에 실패했어요.'); }
  };
  const importFile = async () => {
    try {
      const imported = await importPlacesFile();
      const merged = [...(room?.items ?? []), ...imported.items.map((item, index) => ({ ...item, id: room?.items.some((existing) => existing.id === item.id) ? `${item.id}_${Date.now()}_${index}` : item.id }))];
      if (!room) throw new Error('여행 방을 먼저 열어 주세요.');
      await updateRoom(roomId, room.revision, { items: merged, ...(imported.trip ? { trip: imported.trip } : {}) }, room.items);
      if (imported.settings) {
        setSettings({ ...defaultSettings, ...imported.settings });
        await AsyncStorage.setItem('trippin-settings', JSON.stringify({ ...defaultSettings, ...imported.settings }));
      }
      notify(`${imported.items.length}개 장소를 가져왔습니다.`);
    } catch (error) { notify(error instanceof Error ? error.message : '파일 가져오기에 실패했어요.'); }
  };
  const joinRoom = async () => {
    const nextRoomId = roomInput.trim();
    if (!nextRoomId) return notify('방 코드를 입력해 주세요.');
    setRoomLoading(true);
    try {
      const loaded = await joinSharedRoom(nextRoomId);
      setRoomId(nextRoomId);
      setRoom(loaded);
      setNotice('');
    } catch (error) {
      setRoom(null);
      notify(error instanceof Error ? error.message : '방을 불러오지 못했어요.');
    } finally {
      setRoomLoading(false);
    }
  };
  const saveDetail = (detail: TripDetail) => {
    if (!room || !detailKind) return;
    updateRoom(roomId, room.revision, { trip: { ...trip, [detailKind]: [...trip[detailKind], detail] } }).catch((error) => notify(error instanceof Error ? error.message : '저장에 실패했어요.'));
  };
  const login = async () => {
    if (!googleWebClientId || !googleIosClientId || !request) return notify('Google 로그인 설정을 확인해 주세요.');
    try { const result = await promptAsync(); if (result.type === 'error') notify(`Google 로그인 실패: ${result.error?.message ?? 'OAuth 요청을 확인해 주세요.'}`); }
    catch (error) { notify(error instanceof Error ? error.message : 'Google 로그인에 실패했어요.'); }
  };

  if (!user) return <GestureHandlerRootView style={styles.root}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}><SafeAreaView style={styles.center}><MaterialCommunityIcons name="map-marker-radius-outline" size={54} color="#3b82f6" /><Text style={styles.logoTitle}>트립핀</Text><Text style={styles.muted}>친구와 여행 장소를 지도에 모아보세요.</Text><Pressable onPress={login} style={styles.primary}><Text style={styles.primaryText}>Google로 시작하기</Text></Pressable>{!!notice && <Text style={styles.error}>{notice}</Text>}</SafeAreaView></KeyboardAvoidingView></GestureHandlerRootView>;
  if (!room) return <GestureHandlerRootView style={styles.root}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}><SafeAreaView style={styles.center}><Text style={styles.logoTitle}>여행 방 참여</Text><Text style={styles.muted}>방 코드를 입력하거나 새 여행을 만드세요.</Text><TextInput value={roomInput} onChangeText={setRoomInput} placeholder="공유 방 코드" placeholderTextColor="#777" style={styles.roomInput} autoCapitalize="none" returnKeyType="go" onSubmitEditing={joinRoom} /><Pressable disabled={roomLoading} onPress={joinRoom} style={[styles.primary, roomLoading && styles.disabled]}><Text style={styles.primaryText}>{roomLoading ? '불러오는 중…' : '방 열기'}</Text></Pressable><Pressable onPress={() => setSetupMode('create')} style={styles.secondary}><Text style={styles.primaryText}>새 여행 만들기</Text></Pressable>{!!notice && <Text style={styles.error}>{notice}</Text>}<TripSetupModal visible={setupMode === 'create'} initial={emptyTrip} title="새 여행 만들기" onClose={() => setSetupMode(null)} onSave={saveTrip} /></SafeAreaView></KeyboardAvoidingView></GestureHandlerRootView>;

  return <GestureHandlerRootView style={styles.root}><BottomSheetModalProvider><SafeAreaView style={styles.root}>
    <View style={styles.header}><View style={styles.headerRow}><TripHeader trip={trip} onInvite={() => setInviteSignal((value) => value + 1)} onEdit={() => setSetupMode('edit')} /><InviteSheet roomId={roomId} members={room.members} trip={trip} openSignal={inviteSignal} onCopied={() => notify('초대 링크가 복사되었습니다')} /></View><View style={styles.toolbar}><Pressable onPress={openMyMap} style={styles.tool}><Text style={styles.toolText}>🗺️ 내지도</Text></Pressable><Pressable onPress={() => { const next = !darkMode; setDarkMode(next); AsyncStorage.setItem('trippin-dark-mode', String(next)).catch(() => undefined); }} style={styles.tool}><Text style={styles.toolText}>{darkMode ? '☀️ 밝은 테마' : '🌙 어두운 테마'}</Text></Pressable></View></View>
    {activeTab === 'home' && <MapView {...(Platform.OS === 'android' ? { provider: PROVIDER_GOOGLE } : {})} style={styles.map} initialRegion={mapRegion} region={mapRegion} userInterfaceStyle={darkMode ? 'dark' : 'light'}><Polyline coordinates={route.flatMap((item) => item.lat && item.lng ? [{ latitude: item.lat, longitude: item.lng }] : [])} strokeColor="#3b82f6" strokeWidth={3} />{visibleItems.filter((item) => item.lat && item.lng).map((item) => { const preview = getPreviewImage(item); return <Marker key={item.id} coordinate={{ latitude: item.lat as number, longitude: item.lng as number }} title={item.name} description={item.address} pinColor={item.category === 'CAFE' ? '#b7791f' : item.category === 'FOOD' ? '#e53e3e' : item.category === 'SHOP' ? '#9f7aea' : '#3b82f6'} onCalloutPress={() => setEditingItem(item)}>{preview ? <View style={styles.markerPreview}><Image source={{ uri: preview }} style={styles.markerImage} /><Text numberOfLines={1} style={styles.markerText}>{item.name}</Text></View> : undefined}</Marker>; })}</MapView>}
    <FlatList
      style={styles.content}
      data={activeTab === 'categories' ? visibleItems : []}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshRoom} tintColor="#fff" />}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={<View style={styles.listHeader}>
        {activeTab === 'home' ? <LinkImportCard endpoint={settings.linkImportEndpoint} googleMapsApiKey={settings.googleMapsApiKey} aiProviderKey={settings.aiProviderKey} geminiApiKey={settings.geminiApiKey} openRouterApiKey={settings.openRouterApiKey} groqApiKey={settings.groqApiKey} openAiApiKey={settings.openAiApiKey} onImported={(items) => updateItems([...(room.items ?? []), ...items])} /> : <View style={styles.categoryTabs}>
          <Pressable onPress={() => setCategoryFilter('ALL')} style={[styles.categoryTab, categoryFilter === 'ALL' && styles.categoryTabActive]}><Text style={styles.categoryTabText}>전체</Text></Pressable>
          {(['PLACE', 'CAFE', 'FOOD', 'SHOP'] as TripItemCategory[]).map((category) => <Pressable key={category} onPress={() => setCategoryFilter(category)} style={[styles.categoryTab, categoryFilter === category && styles.categoryTabActive]}><Text style={styles.categoryTabText}>{category === 'PLACE' ? '📍 장소' : category === 'CAFE' ? '☕ 카페' : category === 'FOOD' ? '🍙 음식' : '🛍️ 쇼핑'}</Text></Pressable>)}
        </View>}
        <TextInput value={search} onChangeText={setSearch} placeholder="장소, 주소, 메모 검색" placeholderTextColor="#777" style={styles.search} />
        {activeTab === 'categories' && <><DayFilterPill count={dayCount} selectedDay={selectedDay} onChange={setSelectedDay} /><Text style={styles.sectionTitle}>{categoryFilter === 'ALL' ? '전체 장소' : '카테고리별 장소'}</Text></>}
      </View>}
      ListEmptyComponent={activeTab === 'categories' ? <View style={styles.emptyList}><MaterialCommunityIcons name="map-marker-off-outline" size={34} color="#70747e" /><Text style={styles.emptyTitle}>아직 저장된 장소가 없습니다</Text><Text style={styles.emptyText}>릴스·쇼츠 링크를 분석하면 이곳에 장소가 표시됩니다.</Text></View> : undefined}
      ListFooterComponent={activeTab === 'categories' ? <View style={styles.detailActions}><Text style={styles.sectionTitle}>여행 정보 추가</Text><View style={styles.detailActionRow}><Pressable onPress={() => setDetailKind('flights')} style={styles.detailAction}><Text style={styles.quickText}>✈️ 항공편</Text></Pressable><Pressable onPress={() => setDetailKind('stays')} style={styles.detailAction}><Text style={styles.quickText}>🏨 숙소</Text></Pressable><Pressable onPress={() => setDetailKind('notes')} style={styles.detailAction}><Text style={styles.quickText}>📝 메모</Text></Pressable></View></View> : undefined}
      renderItem={({ item }) => { const preview = getPreviewImage(item); return <View style={[styles.item, item.done && styles.doneItem]}>
        <Pressable onPress={() => toggleDone(item)} style={styles.itemIcon}><MaterialCommunityIcons name={item.done ? 'check' : 'map-marker-outline'} size={20} color="#60a5fa" /></Pressable>
        {preview ? <Image source={{ uri: preview }} style={styles.itemImage} /> : <View style={styles.itemImagePlaceholder}><MaterialCommunityIcons name="movie-open-outline" size={24} color="#9f7aea" /><Text style={styles.placeholderText}>릴스</Text></View>}<View style={styles.itemBody}>
          <Pressable onPress={() => setEditingItem(item)}>
            <Text style={[styles.itemTitle, item.done && styles.doneText]}>{item.name}</Text>
          </Pressable>
          <Text style={styles.itemAddress}>{item.address || '주소를 찾는 중'}</Text>
          <Text style={styles.itemDay}>Day {item.day}{item.note ? ` · ${item.note}` : ''}</Text>
          {!!item.note && <Text numberOfLines={2} style={styles.itemNote}>{item.note}</Text>}
          <View style={styles.itemActions}>{!!item.sourceUrl && <Pressable onPress={() => openSource(item.sourceUrl as string)} style={styles.reelButton}><Text style={styles.reelButtonText}>🎬 릴스·쇼츠 ↗</Text></Pressable>}<Pressable onPress={() => openSearch(item)} style={styles.searchButton}><Text style={styles.searchButtonText}>🧭 길찾기</Text></Pressable></View>
        </View>
        <Pressable onPress={() => updateItems((room.items ?? []).filter((candidate) => candidate.id !== item.id))}><MaterialCommunityIcons name="delete-outline" size={20} color="#888" /></Pressable>
      </View>; }}
    />
    <View style={styles.floatingNav}><Pressable onPress={() => setActiveTab('home')} style={[styles.navItem, activeTab === 'home' && styles.navActive]}><MaterialCommunityIcons name="home-variant" size={21} color={activeTab === 'home' ? '#fff' : '#aaa'} /><Text style={activeTab === 'home' ? styles.navActiveText : styles.navText}>홈</Text></Pressable><Pressable onPress={() => setActiveTab('categories')} style={[styles.navItem, activeTab === 'categories' && styles.navActive]}><MaterialCommunityIcons name="format-list-bulleted" size={21} color={activeTab === 'categories' ? '#fff' : '#aaa'} /><Text style={activeTab === 'categories' ? styles.navActiveText : styles.navText}>목록</Text></Pressable><Pressable onPress={() => setInviteSignal((value) => value + 1)} style={styles.navItem}><MaterialCommunityIcons name="account-multiple-outline" size={21} color="#aaa" /><Text style={styles.navText}>친구</Text></Pressable><Pressable onPress={() => setSettingsVisible(true)} style={styles.navItem}><MaterialCommunityIcons name="cog-outline" size={21} color="#aaa" /><Text style={styles.navText}>설정</Text></Pressable></View>
    {!!notice && <View style={styles.toast}><Text style={styles.toastText}>{notice}</Text></View>}<TripSetupModal visible={setupMode !== null} initial={trip} title={setupMode === 'create' ? '새 여행 만들기' : '여행 정보 편집'} onClose={() => setSetupMode(null)} onSave={saveTrip} /><PlaceDetailModal visible={editingItem !== null} item={editingItem} onClose={() => setEditingItem(null)} onSave={saveItem} /><DetailModal visible={detailKind !== null} title={detailKind === 'flights' ? '항공편' : detailKind === 'stays' ? '숙소' : '메모'} onClose={() => setDetailKind(null)} onSave={saveDetail} /><SettingsModal visible={settingsVisible} initial={settings} onClose={() => setSettingsVisible(false)} onSave={saveSettings} onExportJson={() => runFileAction(() => exportJsonBackup(trip, room?.items ?? [], settings))} onExportCsv={() => runFileAction(() => exportCsv(room?.items ?? []))} onExportKmz={() => runFileAction(() => exportKmz(room?.items ?? []))} onImportFile={importFile} />
  </SafeAreaView></BottomSheetModalProvider></GestureHandlerRootView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#101114' }, center: { flex: 1, backgroundColor: '#101114', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }, logoTitle: { color: '#fff', fontSize: 32, fontWeight: '900' }, muted: { color: '#9da1ab', textAlign: 'center' }, primary: { backgroundColor: '#3b82f6', borderRadius: 999, paddingVertical: 16, paddingHorizontal: 28, marginTop: 10 }, secondary: { backgroundColor: '#26282d', borderRadius: 999, paddingVertical: 16, paddingHorizontal: 28 }, disabled: { opacity: 0.5 }, primaryText: { color: '#fff', fontWeight: '800' }, roomInput: { width: '100%', maxWidth: 340, backgroundColor: '#1d1f24', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderRadius: 999, color: '#fff', padding: 16, fontSize: 15 }, header: { backgroundColor: '#101114', paddingBottom: 12 }, headerRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingRight: 20 }, toolbar: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginTop: 8 }, tool: { backgroundColor: '#1d1f24', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 }, toolText: { color: '#ddd', fontSize: 11, fontWeight: '700' }, map: { height: '34%', minHeight: 230 }, markerPreview: { width: 110, backgroundColor: '#202226', borderRadius: 8, overflow: 'hidden' }, markerImage: { width: 110, height: 70 }, markerText: { color: '#fff', fontSize: 10, fontWeight: '700', padding: 5 }, content: { flex: 1, paddingHorizontal: 20, paddingTop: 14 }, listHeader: { gap: 2 }, categoryTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 4 }, categoryTab: { backgroundColor: '#24262c', borderRadius: 999, paddingHorizontal: 13, paddingVertical: 10 }, categoryTabActive: { backgroundColor: '#3b82f6' }, categoryTabText: { color: '#fff', fontSize: 12, fontWeight: '700' }, search: { backgroundColor: '#1d1f24', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderRadius: 999, color: '#fff', padding: 16, marginVertical: 12 }, list: { gap: 12, paddingVertical: 10, paddingBottom: 150 }, sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 14, marginBottom: 2 }, emptyList: { alignItems: 'center', paddingVertical: 34, paddingHorizontal: 20, gap: 8 }, emptyTitle: { color: '#ddd', fontSize: 15, fontWeight: '700' }, emptyText: { color: '#888', fontSize: 12, textAlign: 'center' }, item: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(31,33,39,0.96)', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderRadius: 20, padding: 16 }, doneItem: { opacity: 0.6 }, itemIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#263b5d', alignItems: 'center', justifyContent: 'center' }, itemImage: { width: 86, height: 86, borderRadius: 14, backgroundColor: '#2a2c31' }, itemImagePlaceholder: { width: 86, height: 86, borderRadius: 14, backgroundColor: '#2a2c31', alignItems: 'center', justifyContent: 'center' }, placeholderText: { color: '#c4b5fd', fontSize: 10, fontWeight: '800', marginTop: 3 }, itemBody: { flex: 1, minWidth: 0 }, itemTitle: { color: '#fff', fontWeight: '800', fontSize: 15 }, doneText: { textDecorationLine: 'line-through' }, itemAddress: { color: '#9da1ab', fontSize: 12, marginTop: 6 }, itemDay: { color: '#60a5fa', fontSize: 11, marginTop: 6 }, itemNote: { color: '#fbbf24', fontSize: 12, marginTop: 5 }, itemActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }, reelButton: { backgroundColor: '#c026d3', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 }, reelButtonText: { color: '#fff', fontSize: 11, fontWeight: '800' }, searchButton: { backgroundColor: '#20242b', borderColor: '#3c434d', borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 }, searchButtonText: { color: '#fff', fontSize: 11, fontWeight: '800' }, sourceLink: { color: '#60a5fa', fontSize: 12, fontWeight: '700', marginTop: 8 }, detailActions: { paddingBottom: 20 }, detailActionRow: { flexDirection: 'row', gap: 8, marginTop: 10 }, detailAction: { flex: 1, alignItems: 'center', backgroundColor: '#24262c', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderRadius: 999, paddingVertical: 12 }, quick: { backgroundColor: '#24262c', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 11 }, quickText: { color: '#eee', fontSize: 11, fontWeight: '700' }, floatingNav: { position: 'absolute', left: 20, right: 20, bottom: 18, height: 68, padding: 7, borderRadius: 34, backgroundColor: 'rgba(38,40,47,0.94)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' }, navItem: { minWidth: 66, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', gap: 3 }, navActive: { backgroundColor: '#17191e' }, navText: { color: '#aaa', fontSize: 10 }, navActiveText: { color: '#fff', fontSize: 10, fontWeight: '800' }, toast: { position: 'absolute', bottom: 100, alignSelf: 'center', backgroundColor: '#303238', borderRadius: 34, paddingHorizontal: 18, paddingVertical: 13 }, toastText: { color: '#fff', fontWeight: '700' }, error: { color: '#f87171', fontSize: 12, textAlign: 'center' },
});
