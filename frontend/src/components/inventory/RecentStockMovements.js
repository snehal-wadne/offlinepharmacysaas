import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from 'react-native';

const TYPE_CONFIG = {
  Purchase: {
    bgColor: '#EAF2EE',
    textColor: '#4F8A72',
    label: 'Purchase',
  },
  Sale: {
    bgColor: '#E8D5DD',
    textColor: '#B9829A',
    label: 'Sale',
  },
  Adjustment: {
    bgColor: '#E8D5DD',
    textColor: '#B9829A',
    label: 'Adjustment',
  },
  Transfer: {
    bgColor: '#E8D5DD',
    textColor: '#A66D86',
    label: 'Transfer',
  },
  Return: {
    bgColor: '#F7F0E5',
    textColor: '#C49752',
    label: 'Return',
  },
};

const STATUS_CONFIG = {
  Completed: {
    bgColor: '#EAF2EE',
    textColor: '#4F8A72',
    label: 'Completed',
  },
  Approved: {
    bgColor: '#EAF2EE',
    textColor: '#4F8A72',
    label: 'Approved',
  },
  'In Transit': {
    bgColor: '#E8D5DD',
    textColor: '#A66D86',
    label: 'In Transit',
  },
  Pending: {
    bgColor: '#F7F0E5',
    textColor: '#C49752',
    label: 'Pending',
  },
  Cancelled: {
    bgColor: '#F7EDEE',
    textColor: '#B85C64',
    label: 'Cancelled',
  },
};

export default function RecentStockMovements({
  movements = [],
  onViewAll,
  onMovementPress,
}) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const movementList = Array.isArray(movements) ? movements : [];

  return (
    <View style={styles.cardContainer}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Recent Stock Movements</Text>
        <Pressable
          onPress={onViewAll}
          style={styles.viewAllLink}
          accessibilityRole="button"
          accessibilityLabel="View all recent stock movements"
        >
          <Text style={styles.viewAllText}>View All</Text>
        </Pressable>
      </View>

      {/* Content Container */}
      <View style={[styles.tableContainer, isMobile && styles.mobileCardsContainer]}>
        {movementList.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No recent stock movements recorded</Text>
          </View>
        ) : isMobile ? (
          // Mobile Movement KPI Cards
          movementList.map((mov, index) => {
            const qtyStr = String(mov.quantity || '');
            const isPositive = qtyStr.startsWith('+');
            const isNegative = qtyStr.startsWith('-');
            const typeConf = TYPE_CONFIG[mov.type] || TYPE_CONFIG.Purchase;
            const statusConf = STATUS_CONFIG[mov.status] || STATUS_CONFIG.Completed;

            return (
              <Pressable
                key={mov.id || index}
                onPress={() => onMovementPress && onMovementPress(mov)}
                style={styles.mobileCard}
              >
                <View style={styles.mobileCardHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={[styles.badge, { backgroundColor: typeConf.bgColor }]}>
                      <Text style={[styles.badgeText, { color: typeConf.textColor }]}>
                        {typeConf.label}
                      </Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: statusConf.bgColor }]}>
                      <Text style={[styles.badgeText, { color: statusConf.textColor }]}>
                        {statusConf.label}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.mobileDateText}>{mov.date || '-'}</Text>
                </View>

                <Text style={styles.mobileItemName} numberOfLines={2}>
                  {mov.item || '-'}
                </Text>

                <View style={styles.mobileCardFooter}>
                  <View style={styles.mobileRefPill}>
                    <Text style={styles.mobileRefLabel}>Ref:</Text>
                    <Text style={styles.mobileRefValue}>{mov.reference || '-'}</Text>
                  </View>
                  <View style={[
                    styles.mobileQtyPill,
                    isPositive ? styles.qtyPillPositive : isNegative ? styles.qtyPillNegative : styles.qtyPillNeutral
                  ]}>
                    <Text style={[
                      styles.mobileQtyText,
                      isPositive ? styles.qtyPositive : isNegative ? styles.qtyNegative : styles.qtyNeutral
                    ]}>
                      {mov.quantity || '0'}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })
        ) : (
          // Desktop Table View
          <>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.thCell, styles.colDate]}>Date</Text>
              <Text style={[styles.thCell, styles.colType]}>Type</Text>
              <Text style={[styles.thCell, styles.colItem]}>Item</Text>
              <Text style={[styles.thCell, styles.colQty]}>Quantity</Text>
              <Text style={[styles.thCell, styles.colRef]}>Reference</Text>
              <Text style={[styles.thCell, styles.colStatus]}>Status</Text>
            </View>

            {movementList.map((mov, index) => {
              const qtyStr = String(mov.quantity || '');
              const isPositive = qtyStr.startsWith('+');
              const isNegative = qtyStr.startsWith('-');
              const typeConf = TYPE_CONFIG[mov.type] || TYPE_CONFIG.Purchase;
              const statusConf = STATUS_CONFIG[mov.status] || STATUS_CONFIG.Completed;

              return (
                <Pressable
                  key={mov.id || index}
                  onPress={() => onMovementPress && onMovementPress(mov)}
                  style={[
                    styles.tableRow,
                    index % 2 === 1 && styles.tableRowAlt,
                  ]}
                >
                  <Text style={[styles.tdCell, styles.colDate, styles.dateText]}>
                    {mov.date || '-'}
                  </Text>
                  <View style={[styles.colType, styles.badgeWrapper]}>
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: typeConf.bgColor },
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          { color: typeConf.textColor },
                        ]}
                      >
                        {typeConf.label}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={[styles.tdCell, styles.colItem, styles.itemText]}
                    numberOfLines={1}
                  >
                    {mov.item || '-'}
                  </Text>
                  <Text
                    style={[
                      styles.tdCell,
                      styles.colQty,
                      styles.qtyText,
                      isPositive && styles.qtyPositive,
                      isNegative && styles.qtyNegative,
                    ]}
                  >
                    {mov.quantity || '0'}
                  </Text>
                  <Text style={[styles.tdCell, styles.colRef, styles.refText]}>
                    {mov.reference || '-'}
                  </Text>
                  <View style={[styles.colStatus, styles.badgeWrapper]}>
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: statusConf.bgColor },
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          { color: statusConf.textColor },
                        ]}
                      >
                        {statusConf.label}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5DFE4',
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)',
      },
      default: {
        elevation: 1,
      },
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5DFE4',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#28242B',
  },
  viewAllLink: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    cursor: 'pointer',
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B9829A',
  },
  tableContainer: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5DFE4',
  },
  thCell: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#77717A',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F8F5F7',
    cursor: 'pointer',
  },
  tableRowAlt: {
    backgroundColor: '#F8F5F7',
  },
  tdCell: {
    fontSize: 13,
  },
  colDate: {
    flex: 1.2,
  },
  colType: {
    flex: 1.2,
  },
  colItem: {
    flex: 2,
  },
  colQty: {
    flex: 1,
    textAlign: 'center',
  },
  colRef: {
    flex: 1.2,
    textAlign: 'center',
  },
  colStatus: {
    flex: 1.2,
    alignItems: 'center',
  },
  dateText: {
    color: '#77717A',
    fontWeight: '500',
  },
  itemText: {
    color: '#28242B',
    fontWeight: '600',
  },
  qtyText: {
    fontWeight: '700',
  },
  qtyPositive: {
    color: '#4F8A72',
  },
  qtyNegative: {
    color: '#B85C64',
  },
  refText: {
    color: '#77717A',
    fontWeight: '500',
  },
  badgeWrapper: {
    alignItems: 'flex-start',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  emptyContainer: {
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  emptyText: {
    fontSize: 13,
    color: '#77717A',
    fontStyle: 'italic',
  },
  mobileCardsContainer: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  mobileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5DFE4',
    padding: 12,
    marginBottom: 8,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
      },
      default: {
        elevation: 1,
      },
    }),
  },
  mobileCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  mobileDateText: {
    fontSize: 11.5,
    color: '#77717A',
    fontWeight: '500',
  },
  mobileItemName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#28242B',
    marginBottom: 10,
  },
  mobileCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F8F5F7',
  },
  mobileRefPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  mobileRefLabel: {
    fontSize: 11,
    color: '#77717A',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  mobileRefValue: {
    fontSize: 12,
    color: '#77717A',
    fontWeight: '600',
  },
  mobileQtyPill: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 6,
  },
  qtyPillPositive: {
    backgroundColor: '#EAF2EE',
  },
  qtyPillNegative: {
    backgroundColor: '#F7EDEE',
  },
  qtyPillNeutral: {
    backgroundColor: '#F8F5F7',
  },
  mobileQtyText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  qtyNeutral: {
    color: '#77717A',
  },
});
