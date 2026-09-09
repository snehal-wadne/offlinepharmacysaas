import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';

export function SkeletonBox({ width, height, borderRadius = 6, style }) {
  const opacityAnim = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacityAnim, {
          toValue: 0.85,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0.35,
          duration: 750,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacityAnim]);

  return (
    <Animated.View
      style={[
        styles.skeletonBase,
        {
          width: width !== undefined ? width : '100%',
          height: height !== undefined ? height : 16,
          borderRadius,
          opacity: opacityAnim,
        },
        style,
      ]}
    />
  );
}

/**
 * Skeleton KPI Card placeholder
 */
export function SkeletonKpiCard({ style }) {
  return (
    <View style={[styles.kpiCard, style]}>
      <View style={styles.kpiHeaderRow}>
        <SkeletonBox width={100} height={14} borderRadius={4} />
        <SkeletonBox width={32} height={32} borderRadius={8} />
      </View>
      <SkeletonBox width={70} height={28} borderRadius={6} style={{ marginTop: 12, marginBottom: 8 }} />
      <SkeletonBox width={130} height={12} borderRadius={4} />
    </View>
  );
}

/**
 * Skeleton Table Row placeholder
 */
export function SkeletonTableRow({ columns = 7, style }) {
  return (
    <View style={[styles.tableRow, style]}>
      {Array.from({ length: columns }).map((_, idx) => (
        <View key={idx} style={{ flex: 1, paddingHorizontal: 8 }}>
          <SkeletonBox
            width={idx === 0 ? '75%' : idx === columns - 1 ? '50%' : '85%'}
            height={16}
            borderRadius={4}
          />
        </View>
      ))}
    </View>
  );
}

/**
 * Skeleton Mobile Detail Card placeholder
 */
export function SkeletonItemCard({ style }) {
  return (
    <View style={[styles.itemCard, style]}>
      {/* Top Header */}
      <View style={styles.itemCardHeader}>
        <View style={{ flex: 1 }}>
          <SkeletonBox width="60%" height={16} borderRadius={4} style={{ marginBottom: 6 }} />
          <SkeletonBox width="40%" height={12} borderRadius={4} />
        </View>
        <SkeletonBox width={70} height={24} borderRadius={12} />
      </View>

      {/* Grid of 4 attributes */}
      <View style={styles.itemCardGrid}>
        <View style={styles.gridCol}>
          <SkeletonBox width={45} height={10} borderRadius={3} style={{ marginBottom: 4 }} />
          <SkeletonBox width={70} height={14} borderRadius={4} />
        </View>
        <View style={styles.gridCol}>
          <SkeletonBox width={45} height={10} borderRadius={3} style={{ marginBottom: 4 }} />
          <SkeletonBox width={65} height={14} borderRadius={4} />
        </View>
        <View style={styles.gridCol}>
          <SkeletonBox width={50} height={10} borderRadius={3} style={{ marginBottom: 4 }} />
          <SkeletonBox width={60} height={14} borderRadius={4} />
        </View>
        <View style={styles.gridCol}>
          <SkeletonBox width={50} height={10} borderRadius={3} style={{ marginBottom: 4 }} />
          <SkeletonBox width={75} height={14} borderRadius={4} />
        </View>
      </View>

      {/* Footer Action */}
      <View style={styles.itemCardFooter}>
        <SkeletonBox width={85} height={28} borderRadius={6} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  skeletonBase: {
    backgroundColor: '#E2E8F0',
  },
  kpiCard: {
    flex: 1,
    flexGrow: 1,
    flexShrink: 0,
    minWidth: 140,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  kpiHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  itemCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemCardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F8FAFC',
    marginBottom: 10,
  },
  gridCol: {
    width: '45%',
  },
  itemCardFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
});
