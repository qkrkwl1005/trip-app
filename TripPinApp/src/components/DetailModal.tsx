import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { TripDetail } from '../types/trip';

type Props = { visible: boolean; title: string; onClose: () => void; onSave: (detail: TripDetail) => void };

export function DetailModal({ visible, title, onClose, onSave }: Props) {
  const [name, setName] = useState('');
  const [meta, setMeta] = useState('');
  const [note, setNote] = useState('');
  const save = () => {
    if (!name.trim()) return;
    onSave({ id: `detail_${Date.now()}`, title: name.trim(), meta: meta.trim(), note: note.trim() });
    setName(''); setMeta(''); setNote(''); onClose();
  };
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}><View style={styles.card}><Text style={styles.title}>{title} 추가</Text><TextInput value={name} onChangeText={setName} placeholder="이름" placeholderTextColor="#777" style={styles.input} /><TextInput value={meta} onChangeText={setMeta} placeholder="시간 또는 주소" placeholderTextColor="#777" style={styles.input} /><TextInput value={note} onChangeText={setNote} placeholder="메모 (선택)" placeholderTextColor="#777" style={styles.input} /><View style={styles.actions}><Pressable onPress={onClose} style={styles.cancel}><Text style={styles.cancelText}>취소</Text></Pressable><Pressable onPress={save} style={styles.save}><Text style={styles.saveText}>저장</Text></Pressable></View></View></KeyboardAvoidingView></Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.65)' },
  card: { backgroundColor: '#191919', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 11 },
  title: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 5 },
  input: { backgroundColor: '#252525', borderRadius: 12, color: '#fff', padding: 13, fontSize: 15 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  cancel: { flex: 1, backgroundColor: '#292929', borderRadius: 12, padding: 13, alignItems: 'center' },
  save: { flex: 1, backgroundColor: '#3b82f6', borderRadius: 12, padding: 13, alignItems: 'center' },
  cancelText: { color: '#fff', fontWeight: '700' }, saveText: { color: '#fff', fontWeight: '800' },
});
