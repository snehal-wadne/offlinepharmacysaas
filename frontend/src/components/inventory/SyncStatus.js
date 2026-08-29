import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const STATUS_CONFIG = {
  online: {
    label: 'Online',
    dotColor: '#16A34A',
    textColor: '#15803D',
    bgColor: '#DCFCE7',
    borderColor: '#BBF7D0',
    icon: '●',
  },
  offline: {
    label: 'Offline',
    dotColor: '#DC2626',
    textColor: '#B91C1C',
    bgColor: '#FEE2E2',
    borderColor: '#FECACA',
    icon: '●',
  },
  syncing: {
    label: 'Syncing...',
    dotColor: '#2563EB',
    textColor: '#1D4ED8',
    bgColor: '#DBEAFE',
    borderColor: '#BFDBFE',
    icon: '↻',
  },
  sync_pending: {
    label: 'Sync Pending',
    dotColor: '#D97706',
    textColor: '#B45309',
    bgColor: '#FEF3C7',
    borderColor: '#FDE68A',
    icon: '⚠',
  },
  sync_failed: {
    label: 'Sync Failed',
    dotColor: '#DC2626',
    textColor: '#B91C1C',
    bgColor: '#FEE2E2',
    borderColor: '#FECACA',
    icon: '✕',
  },
  synced: {
    label: 'Synced',
    dotColor: '#16A34A',
    textColor: '#15803D',
    bgColor: '#DCFCE7',
    borderColor: '#BBF7D0',
    icon: '✓',
  },
};

export default function SyncStatus({ status = 'online', pendingCount = 0 }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.online;
  const displayLabel = status === 'sync_pending' && pendingCount > 0 
    ? `${pendingCount} pending` 
    : config.label;

  return (
    <View style={[styles.container, { backgroundColor: config.bgColor, borderColor: config.borderColor }]}>
      <Text style={[styles.dot, { color: config.dotColor }]}>{config.icon}</Text>
      <Text style={[styles.label, { color: config.textColor }]}>{displayLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  dot: {
    fontSize: 10,
    marginRight: 6,
    fontWeight: '700',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
});
