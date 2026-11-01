import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = { visible: boolean; value: string; onClose: () => void; onSelect: (value: string) => void };
const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return new Date();
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function DatePickerModal({ visible, value, onClose, onSelect }: Props) {
  const initial = parseDate(value);
  const [month, setMonth] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  useEffect(() => {
    if (visible) {
      const next = parseDate(value);
      setMonth(new Date(next.getFullYear(), next.getMonth(), 1));
    }
  }, [value, visible]);

  const days = useMemo(() => {
    const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array(firstDay).fill(null), ...Array.from({ length: count }, (_, index) => index + 1)];
  }, [month]);
  const selected = value || formatDate(initial);
  const selectDay = (day: number) => {
    onSelect(formatDate(new Date(month.getFullYear(), month.getMonth(), day)));
    onClose();
  };
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={styles.card}>
      <View style={styles.header}><Pressable onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><Text style={styles.arrow}>‹</Text></Pressable><Text style={styles.month}>{month.getFullYear()}년 {month.getMonth() + 1}월</Text><Pressable onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><Text style={styles.arrow}>›</Text></Pressable></View>
      <View style={styles.week}>{dayLabels.map((label) => <Text key={label} style={styles.weekLabel}>{label}</Text>)}</View>
      <View style={styles.grid}>{days.map((day, index) => day === null ? <View key={`empty-${index}`} style={styles.day} /> : <Pressable key={day} onPress={() => selectDay(day)} style={[styles.day, formatDate(new Date(month.getFullYear(), month.getMonth(), day)) === selected && styles.selected]}><Text style={[styles.dayText, formatDate(new Date(month.getFullYear(), month.getMonth(), day)) === selected && styles.selectedText]}>{day}</Text></Pressable>)}</View>
      <Pressable onPress={onClose} style={styles.cancel}><Text style={styles.cancelText}>취소</Text></Pressable>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 22, backgroundColor: 'rgba(0,0,0,.72)' },
  card: { backgroundColor: '#202125', borderColor: 'rgba(255,255,255,.1)', borderWidth: 1, borderRadius: 24, padding: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  month: { color: '#fff', fontSize: 18, fontWeight: '800' }, arrow: { color: '#fff', fontSize: 36, lineHeight: 36, paddingHorizontal: 10 },
  week: { flexDirection: 'row', marginBottom: 8 }, weekLabel: { flex: 1, color: '#9297a3', textAlign: 'center', fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' }, day: { width: '14.285%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  selected: { backgroundColor: '#3b82f6' }, dayText: { color: '#fff', fontSize: 14 }, selectedText: { fontWeight: '800' },
  cancel: { backgroundColor: '#2b2d32', borderRadius: 999, alignItems: 'center', padding: 14, marginTop: 16 }, cancelText: { color: '#fff', fontWeight: '700' },
});
