import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TripData } from '../types/trip';

type Props = {
  trip: TripData;
  onInvite: () => void;
  onEdit: () => void;
};

export function TripHeader({ trip, onInvite, onEdit }: Props) {
  const date = trip.start && trip.end ? `${trip.start} – ${trip.end}` : '여행 기간을 설정해 보세요';
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.titleArea}>
          <Text style={styles.title}>{trip.title || '새로운 여행'}</Text>
          <Text style={styles.date}>{date}</Text>
        </View>
        <View style={styles.actions}>
          <Pressable onPress={onEdit} style={styles.iconButton}>
            <MaterialCommunityIcons name="pencil-outline" size={18} color="#cfcfcf" />
          </Pressable>
          <Pressable onPress={onInvite} style={styles.inviteButton}>
            <MaterialCommunityIcons name="account-plus-outline" size={17} color="#fff" />
            <Text style={styles.inviteText}>초대</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.tags}>
        <Text style={styles.tag}>✈️ 항공편 {trip.flights.length}</Text>
        <Text style={styles.tag}>🏨 숙소 {trip.stays.length}</Text>
        <Text style={styles.tag}>📝 메모 {trip.notes.length}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  titleArea: { flex: 1 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  date: { color: '#979797', fontSize: 12, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 7 },
  iconButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#242424', alignItems: 'center', justifyContent: 'center' },
  inviteButton: { height: 38, borderRadius: 19, paddingHorizontal: 13, backgroundColor: '#3b82f6', flexDirection: 'row', alignItems: 'center', gap: 5 },
  inviteText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  tags: { flexDirection: 'row', gap: 9, marginTop: 20 },
  tag: { color: '#c4c4c4', backgroundColor: '#202226', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9, fontSize: 11 },
});
