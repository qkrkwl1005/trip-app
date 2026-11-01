import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { TripData } from '../types/trip';
import { DatePickerModal } from './DatePickerModal';

type Props = { visible: boolean; initial: TripData; title: string; onClose: () => void; onSave: (trip: TripData) => void };

export function TripSetupModal({ visible, initial, title, onClose, onSave }: Props) {
  const [trip, setTrip] = useState(initial);
  const [dateField, setDateField] = useState<'start' | 'end' | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { if (visible) setTrip(initial); }, [initial, visible]);
  const save = () => {
    if (!trip.title.trim()) return setError('여행 이름을 입력해 주세요.');
    if (!trip.start || !trip.end) return setError('시작일과 종료일을 선택해 주세요.');
    if (trip.end < trip.start) return setError('종료일은 시작일 이후여야 해요.');
    onSave({ ...trip, title: trip.title.trim() });
    onClose();
  };
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}><View style={styles.card}><ScrollView keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{title}</Text>
      <TextInput value={trip.title} onChangeText={(titleValue) => setTrip({ ...trip, title: titleValue })} placeholder="여행 이름" placeholderTextColor="#777" style={styles.input} />
      <Pressable onPress={() => setDateField('start')} style={styles.dateInput}><Text style={trip.start ? styles.dateValue : styles.placeholder}>{trip.start || '시작일 선택'}</Text></Pressable>
      <Pressable onPress={() => setDateField('end')} style={styles.dateInput}><Text style={trip.end ? styles.dateValue : styles.placeholder}>{trip.end || '종료일 선택'}</Text></Pressable>
      {!!error && <Text style={styles.error}>{error}</Text>}<View style={styles.actions}><Pressable onPress={onClose} style={styles.cancel}><Text style={styles.cancelText}>취소</Text></Pressable><Pressable onPress={save} style={styles.save}><Text style={styles.saveText}>저장</Text></Pressable></View>
    </ScrollView></View><DatePickerModal visible={dateField !== null} value={dateField === 'start' ? trip.start : trip.end} onClose={() => setDateField(null)} onSelect={(date) => { if (dateField === 'start') setTrip({ ...trip, start: date }); if (dateField === 'end') setTrip({ ...trip, end: date }); }} /></KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.65)' },
  card: { backgroundColor: '#191919', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 11 },
  title: { color: '#fff', fontSize: 20, fontWeight: '800' }, input: { backgroundColor: '#252525', borderRadius: 12, color: '#fff', padding: 13 }, dateInput: { backgroundColor: '#252525', borderRadius: 12, padding: 16 }, placeholder: { color: '#777' }, dateValue: { color: '#fff', fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 }, cancel: { flex: 1, backgroundColor: '#292929', borderRadius: 12, padding: 13, alignItems: 'center' },
  save: { flex: 1, backgroundColor: '#3b82f6', borderRadius: 12, padding: 13, alignItems: 'center' }, cancelText: { color: '#fff' }, saveText: { color: '#fff', fontWeight: '800' }, error: { color: '#f87171', fontSize: 13 },
});
