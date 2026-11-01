import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppSettings } from '../types/trip';

type Props = { visible: boolean; initial: AppSettings; onClose: () => void; onSave: (settings: AppSettings) => void; onExportJson: () => void; onExportCsv: () => void; onExportKmz: () => void; onImportFile: () => void };

export function SettingsModal({ visible, initial, onClose, onSave, onExportJson, onExportCsv, onExportKmz, onImportFile }: Props) {
  const [settings, setSettings] = useState(initial);
  useEffect(() => { if (visible) setSettings(initial); }, [initial, visible]);
  const update = (key: keyof AppSettings, value: string) => setSettings({ ...settings, [key]: value });
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}><View style={styles.card}><ScrollView keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>설정</Text><Text style={styles.help}>웹 앱에서 사용하던 연결 설정을 이 기기에서 저장합니다.</Text>
    <Text style={styles.label}>링크 분석 프록시 주소</Text><TextInput value={settings.linkImportEndpoint} onChangeText={(value) => update('linkImportEndpoint', value)} placeholder="https://.../?url=" placeholderTextColor="#777" autoCapitalize="none" style={styles.input} />
    <Text style={styles.label}>Google Maps API 키</Text><TextInput value={settings.googleMapsApiKey} onChangeText={(value) => update('googleMapsApiKey', value)} placeholder="AIza..." placeholderTextColor="#777" secureTextEntry style={styles.input} />
    <Text style={styles.label}>Naver Maps API 키</Text><TextInput value={settings.naverMapsApiKey} onChangeText={(value) => update('naverMapsApiKey', value)} placeholder="NCP API Key ID" placeholderTextColor="#777" secureTextEntry style={styles.input} />
    <Text style={styles.label}>Google My Maps URL</Text><TextInput value={settings.googleMyMapsUrl} onChangeText={(value) => update('googleMyMapsUrl', value)} placeholder="https://www.google.com/maps/d/..." placeholderTextColor="#777" autoCapitalize="none" style={styles.input} />
    <Text style={styles.label}>Gemini API 키 (선택)</Text><TextInput value={settings.geminiApiKey} onChangeText={(value) => update('geminiApiKey', value)} placeholder="AIza..." placeholderTextColor="#777" secureTextEntry style={styles.input} />
    <Text style={styles.label}>OpenRouter API 키 (선택)</Text><TextInput value={settings.openRouterApiKey} onChangeText={(value) => update('openRouterApiKey', value)} placeholder="sk-or-v1-..." placeholderTextColor="#777" secureTextEntry style={styles.input} />
    <Text style={styles.label}>Groq API 키 (선택)</Text><TextInput value={settings.groqApiKey} onChangeText={(value) => update('groqApiKey', value)} placeholder="gsk_..." placeholderTextColor="#777" secureTextEntry style={styles.input} />
    <Text style={styles.label}>OpenAI API 키 (선택)</Text><TextInput value={settings.openAiApiKey} onChangeText={(value) => update('openAiApiKey', value)} placeholder="sk-..." placeholderTextColor="#777" secureTextEntry style={styles.input} />
    <Text style={styles.label}>여행 데이터 백업·복원</Text>
    <View style={styles.fileActions}><Pressable onPress={onExportJson} style={styles.fileButton}><Text style={styles.fileText}>JSON 백업</Text></Pressable><Pressable onPress={onImportFile} style={styles.fileButton}><Text style={styles.fileText}>파일 가져오기</Text></Pressable></View>
    <View style={styles.fileActions}><Pressable onPress={onExportCsv} style={styles.fileButton}><Text style={styles.fileText}>CSV 공유</Text></Pressable><Pressable onPress={onExportKmz} style={styles.fileButton}><Text style={styles.fileText}>KMZ 공유</Text></Pressable></View>
    <View style={styles.actions}><Pressable onPress={onClose} style={styles.cancel}><Text style={styles.cancelText}>취소</Text></Pressable><Pressable onPress={() => { onSave(settings); onClose(); }} style={styles.save}><Text style={styles.saveText}>저장</Text></Pressable></View>
  </ScrollView></View></KeyboardAvoidingView></Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.72)' }, card: { maxHeight: '90%', backgroundColor: '#202125', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' }, help: { color: '#999', fontSize: 12, marginTop: 6, marginBottom: 18 }, label: { color: '#c7c9d0', fontSize: 12, fontWeight: '700', marginTop: 12, marginBottom: 7 }, input: { backgroundColor: '#2a2c31', borderColor: 'rgba(255,255,255,.08)', borderWidth: 1, borderRadius: 14, color: '#fff', padding: 14 },
  fileActions: { flexDirection: 'row', gap: 8, marginTop: 8 }, fileButton: { flex: 1, backgroundColor: '#303238', borderRadius: 12, alignItems: 'center', padding: 12 }, fileText: { color: '#ddd', fontWeight: '700', fontSize: 12 }, actions: { flexDirection: 'row', gap: 10, marginTop: 22 }, cancel: { flex: 1, backgroundColor: '#303238', borderRadius: 999, alignItems: 'center', padding: 15 }, save: { flex: 1, backgroundColor: '#3b82f6', borderRadius: 999, alignItems: 'center', padding: 15 }, cancelText: { color: '#fff' }, saveText: { color: '#fff', fontWeight: '800' },
});
