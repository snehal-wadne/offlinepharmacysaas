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
  green: { border: '#16A34A', dot: '#16A34A', bg: '#F0FDF4' },
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
  style,
  isActive,
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
        isActive && styles.activeRing,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${displayLabel}: ${value}`}
    >
      {/* Card Header with Label and Status Dot */}
      <View style={styles.cardHeader}>
        <Text
          style={[styles.cardLabel, isMobile && styles.cardLabelMobile]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {displayLabel}
        </Text>
        <View style={[styles.statusDot, { backgroundColor: colors.dot }]} />
      </View>

      {/* Main KPI Value */}
      <Text
        style={[
          styles.cardValue,
          isMobile && styles.cardValueMobile,
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>

      {/* Subtext */}
      {displaySubtext ? (
        <Text
          style={[styles.cardSubtext, isMobile && styles.cardSubtextMobile]}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {displaySubtext}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    flex: 1,
    minWidth: 160,
    minHeight: 110,
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
    paddingVertical: 14,
    paddingHorizontal: 16,
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
    flexGrow: 1,
    flexShrink: 0,
    minWidth: '47%',
    maxWidth: '48.5%',
    minHeight: 95,
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderLeftWidth: 3.5,
  },
  activeRing: {
    borderColor: '#0F766E',
    borderWidth: 2,
    backgroundColor: '#F0FDFA',
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
  cardLabelMobile: {
    fontSize: 10.5,
    letterSpacing: 0.2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 4,
    flexShrink: 0,
  },
  cardValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
    marginVertical: 2,
  },
  cardValueMobile: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginVertical: 1,
  },
  cardSubtext: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
  },
  cardSubtextMobile: {
    fontSize: 9.5,
    lineHeight: 13,
  },
});
