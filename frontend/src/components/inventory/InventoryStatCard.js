import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from 'react-native';

const VARIANT_COLORS = {
  teal: { border: '#0F766E', dot: '#0F766E', bg: '#F0FDFA' },
  amber: { border: '#D97706', dot: '#D97706', bg: '#FFFBEB' },
  blue: { border: '#2563EB', dot: '#2563EB', bg: '#EFF6FF' },
  red: { border: '#DC2626', dot: '#DC2626', bg: '#FEF2F2' },
  orange: { border: '#EA580C', dot: '#EA580C', bg: '#FFF7ED' },
  default: { border: '#0F766E', dot: '#0F766E', bg: '#F0FDFA' },
};

export default function InventoryStatCard({
  label,
  title,
  value,
  subtext,
  trend,
  variant = 'teal',
  onPress,
}) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const colors = VARIANT_COLORS[variant] || VARIANT_COLORS.teal;
  const displayLabel = label || title || '';
  const displaySubtext = subtext || trend || '';

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.cardContainer,
        isMobile && styles.cardContainerMobile,
        { borderLeftColor: colors.border },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${displayLabel}: ${value}`}
    >
      {/* Card Header with Label and Status Dot */}
      <View style={styles.cardHeader}>
        <Text style={styles.cardLabel} numberOfLines={1}>
          {displayLabel}
        </Text>
        <View style={[styles.statusDot, { backgroundColor: colors.dot }]} />
      </View>

      {/* Main KPI Value */}
      <Text style={styles.cardValue}>{value}</Text>

      {/* Subtext */}
      {displaySubtext ? <Text style={styles.cardSubtext}>{displaySubtext}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    flex: 1,
    minWidth: 200,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
    paddingVertical: 18,
    paddingHorizontal: 20,
    cursor: 'pointer',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)',
      },
      default: {
        elevation: 1,
      },
    }),
  },
  cardContainerMobile: {
    minWidth: '47%',
    maxWidth: '48.5%',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderLeftWidth: 3.5,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 6,
  },
  cardValue: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  cardSubtext: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#94A3B8',
  },
});
