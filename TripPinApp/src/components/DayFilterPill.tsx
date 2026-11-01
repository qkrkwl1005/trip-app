import { ScrollView, StyleSheet, Text, Pressable } from 'react-native';

type Props = {
  count: number;
  selectedDay: number;
  onChange: (day: number) => void;
};

export function DayFilterPill({ count, selectedDay, onChange }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.container}>
      {[0, ...Array.from({ length: count }, (_, index) => index + 1)].map((day) => (
        <Pressable key={day} onPress={() => onChange(day)} style={[styles.pill, selectedDay === day && styles.active]}>
          <Text style={[styles.text, selectedDay === day && styles.activeText]}>
            {day === 0 ? '전체' : `Day ${day}`}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8, paddingVertical: 4 },
  pill: { paddingHorizontal: 15, paddingVertical: 9, borderRadius: 999, backgroundColor: '#242424' },
  active: { backgroundColor: '#3b82f6' },
  text: { color: '#b8b8b8', fontWeight: '700', fontSize: 12 },
  activeText: { color: '#fff' },
});
