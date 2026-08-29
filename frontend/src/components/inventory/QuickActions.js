import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';

const ACTIONS = [
  { id: 'stock-adjustment', label: 'New Stock Adjustment', type: 'primary' },
  { id: 'stock-transfer', label: 'Initiate Stock Transfer', type: 'secondary' },
  { id: 'receive-stock', label: 'Receive Goods Shipment', type: 'secondary' },
  { id: 'create-stocktake', label: 'View Inventory Reports', type: 'secondary' },
];

export default function QuickActions({ onAction }) {
  return (
    <View style={styles.cardContainer}>
      <Text style={styles.cardTitle}>Quick Actions</Text>
      <View style={styles.actionList}>
        {ACTIONS.map((action) => {
          const isPrimary = action.type === 'primary';
          return (
            <Pressable
              key={action.id}
              onPress={() => onAction && onAction(action.id, action.label)}
              style={({ pressed, hovered }) => [
                styles.actionBtn,
                isPrimary ? styles.actionBtnPrimary : styles.actionBtnSecondary,
                (pressed || hovered) &&
                  (isPrimary
                    ? styles.actionBtnPrimaryHovered
                    : styles.actionBtnSecondaryHovered),
              ]}
              accessibilityRole="button"
              accessibilityLabel={action.label}
            >
              <Text
                style={[
                  styles.actionText,
                  isPrimary
                    ? styles.actionTextPrimary
                    : styles.actionTextSecondary,
                ]}
              >
                {action.label}
              </Text>
              <Text
                style={[
                  styles.arrowIcon,
                  isPrimary ? styles.actionTextPrimary : styles.actionTextSecondary,
                ]}
              >
                →
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)',
      },
      default: {
        elevation: 1,
      },
    }),
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 16,
  },
  actionList: {
    gap: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    cursor: 'pointer',
  },
  actionBtnPrimary: {
    backgroundColor: '#0F766E',
  },
  actionBtnPrimaryHovered: {
    backgroundColor: '#0D9488',
  },
  actionBtnSecondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  actionBtnSecondaryHovered: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
  },
  actionText: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  actionTextPrimary: {
    color: '#FFFFFF',
  },
  actionTextSecondary: {
    color: '#334155',
  },
  arrowIcon: {
    fontSize: 14,
    fontWeight: '700',
  },
});
