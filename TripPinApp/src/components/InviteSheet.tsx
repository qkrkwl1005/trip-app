import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView, useBottomSheetModal } from '@gorhom/bottom-sheet';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { TripData, RoomMember } from '../types/trip';

type Props = {
  roomId: string;
  members: Record<string, RoomMember>;
  trip: TripData;
  onCopied: () => void;
  openSignal?: number;
};

export function InviteSheet({ roomId, members, trip, onCopied, openSignal = 0 }: Props) {
  const ref = useRef<BottomSheetModal>(null);
  const [query, setQuery] = useState('');
  const snapPoints = useMemo(() => ['62%'], []);
  const inviteUrl = roomId ? `https://qkrkwl1005.github.io/trip-app/?room=${encodeURIComponent(roomId)}` : '';
  const filtered = Object.entries(members).filter(([, member]) =>
    `${member.name} ${member.email ?? ''}`.toLowerCase().includes(query.toLowerCase()),
  );
  const open = () => ref.current?.present();
  useEffect(() => { if (openSignal > 0) open(); }, [openSignal]);
  const close = () => ref.current?.dismiss();
  const copy = async () => {
    if (!inviteUrl) return;
    await Clipboard.setStringAsync(inviteUrl);
    onCopied();
  };

  return (
    <>
      <Pressable onPress={open} style={styles.openButton}><Text style={styles.openText}>친구 초대</Text></Pressable>
      <BottomSheetModal
        ref={ref}
        snapPoints={snapPoints}
        enablePanDownToClose
        backgroundStyle={styles.sheet}
        handleIndicatorStyle={styles.handle}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
      >
        <BottomSheetView style={styles.content}>
          <View style={styles.header}>
            <View><Text style={styles.title}>친구 초대</Text><Text style={styles.subtitle}>{trip.title || '여행'}을 함께 만들어 보세요</Text></View>
            <Pressable onPress={close} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable>
          </View>
          <TextInput value={query} onChangeText={setQuery} placeholder="이름 또는 이메일로 찾기" placeholderTextColor="#777" style={styles.input} />
          <View style={styles.members}>
            {query ? filtered.map(([uid, member]) => <View key={uid} style={styles.member}><Text style={styles.memberName}>{member.name}</Text><Text style={styles.memberEmail}>{member.email || uid}</Text></View>) : <Text style={styles.hint}>초대 링크를 친구에게 보내면 방에 참여할 수 있어요.</Text>}
          </View>
          <View style={styles.linkCard}><Text style={styles.label}>공유 방 초대 링크</Text><Text numberOfLines={2} style={styles.link}>{inviteUrl || '먼저 공유 방을 만들어 주세요.'}</Text><Pressable disabled={!inviteUrl} onPress={copy} style={[styles.copy, !inviteUrl && styles.disabled]}><Text style={styles.copyText}>🔗 초대 링크 공유</Text></Pressable></View>
        </BottomSheetView>
      </BottomSheetModal>
    </>
  );
}

const styles = StyleSheet.create({
  openButton: { borderRadius: 18, backgroundColor: '#3b82f6', paddingHorizontal: 14, paddingVertical: 9 },
  openText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  sheet: { backgroundColor: '#171717', borderRadius: 16 },
  handle: { width: 42, backgroundColor: '#555' },
  content: { padding: 20, gap: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { color: '#fff', fontSize: 22, fontWeight: '800' },
  subtitle: { color: '#999', fontSize: 12, marginTop: 5 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#292929', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#ddd', fontSize: 22, lineHeight: 24 },
  input: { borderRadius: 13, backgroundColor: '#242424', color: '#fff', paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
  members: { minHeight: 65, gap: 8 },
  member: { backgroundColor: '#222', borderRadius: 12, padding: 11 },
  memberName: { color: '#fff', fontWeight: '700' },
  memberEmail: { color: '#999', fontSize: 12, marginTop: 2 },
  hint: { color: '#999', fontSize: 13, lineHeight: 20 },
  linkCard: { backgroundColor: '#202020', borderRadius: 14, padding: 14 },
  label: { color: '#aaa', fontSize: 12 },
  link: { color: '#ddd', fontSize: 12, marginTop: 7 },
  copy: { backgroundColor: '#3b82f6', borderRadius: 12, alignItems: 'center', paddingVertical: 13, marginTop: 12 },
  disabled: { opacity: 0.45 },
  copyText: { color: '#fff', fontWeight: '800' },
});
