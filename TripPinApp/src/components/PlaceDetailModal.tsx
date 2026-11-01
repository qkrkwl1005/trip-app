import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { TripItem } from '../types/trip';

type Props = { visible: boolean; item: TripItem | null; onClose: () => void; onSave: (item: TripItem) => void };

export function PlaceDetailModal({ visible, item, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<TripItem | null>(item);
  useEffect(() => { if (visible) setDraft(item); }, [item, visible]);
  if (!draft) return null;
  const update = (patch: Partial<TripItem>) => setDraft({ ...draft, ...patch });
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}><View style={styles.card}><ScrollView keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>장소 편집</Text>
    <TextInput value={draft.name} onChangeText={(name) => update({ name })} placeholder="장소 이름" placeholderTextColor="#777" style={styles.input} />
    <TextInput value={draft.address} onChangeText={(address) => update({ address })} placeholder="주소" placeholderTextColor="#777" style={styles.input} />
    <TextInput value={draft.sourceUrl ?? ''} onChangeText={(sourceUrl) => update({ sourceUrl })} placeholder="원본 링크 (인스타/쇼츠/지도)" placeholderTextColor="#777" autoCapitalize="none" style={styles.input} />
    <TextInput value={draft.note ?? ''} onChangeText={(note) => update({ note })} placeholder="메모, 가격, 영업시간..." placeholderTextColor="#777" multiline style={[styles.input, styles.multiline]} />
    <TextInput value={String(draft.day || '')} onChangeText={(day) => update({ day: Number(day.replace(/[^0-9]/g, '')) || 1 })} placeholder="Day 번호" placeholderTextColor="#777" keyboardType="number-pad" style={styles.input} />
    <View style={styles.actions}><Pressable onPress={onClose} style={styles.cancel}><Text style={styles.cancelText}>취소</Text></Pressable><Pressable onPress={() => { onSave(draft); onClose(); }} style={styles.save}><Text style={styles.saveText}>저장</Text></Pressable></View>
  </ScrollView></View></KeyboardAvoidingView></Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.65)' }, card: { maxHeight: '85%', backgroundColor: '#191919', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  title: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 12 }, input: { backgroundColor: '#252525', borderRadius: 12, color: '#fff', padding: 13, marginBottom: 10 }, multiline: { minHeight: 90, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 }, cancel: { flex: 1, backgroundColor: '#292929', borderRadius: 12, padding: 13, alignItems: 'center' }, save: { flex: 1, backgroundColor: '#3b82f6', borderRadius: 12, padding: 13, alignItems: 'center' }, cancelText: { color: '#fff' }, saveText: { color: '#fff', fontWeight: '800' },
});
