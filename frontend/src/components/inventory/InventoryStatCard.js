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
  teal: { border: '#B9829A', dot: '#B9829A', bg: '#E8D5DD' },
  amber: { border: '#C49752', dot: '#C49752', bg: '#F7F0E5' },
  blue: { border: '#B9829A', dot: '#B9829A', bg: '#E8D5DD' },
  red: { border: '#B85C64', dot: '#B85C64', bg: '#F7EDEE' },
  orange: { border: '#C49752', dot: '#C49752', bg: '#F7F0E5' },
  green: { border: '#4F8A72', dot: '#4F8A72', bg: '#EAF2EE' },
  default: { border: '#B9829A', dot: '#B9829A', bg: '#E8D5DD' },
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
    borderColor: '#E5DFE4',
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
    borderColor: '#B9829A',
    borderWidth: 2,
    backgroundColor: '#E8D5DD',
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
    color: '#77717A',
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
    color: '#28242B',
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
    color: '#77717A',
  },
  cardSubtextMobile: {
    fontSize: 9.5,
    lineHeight: 13,
  },
});
