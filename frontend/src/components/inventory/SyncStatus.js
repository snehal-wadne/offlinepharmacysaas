import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const STATUS_CONFIG = {
  online: {
    label: 'Online',
    dotColor: '#4F8A72',
    textColor: '#4F8A72',
    bgColor: '#EAF2EE',
    borderColor: '#EAF2EE',
    icon: '●',
  },
  offline: {
    label: 'Offline',
    dotColor: '#B85C64',
    textColor: '#B85C64',
    bgColor: '#F7EDEE',
    borderColor: '#F7EDEE',
    icon: '●',
  },
  syncing: {
    label: 'Syncing...',
    dotColor: '#B9829A',
    textColor: '#A66D86',
    bgColor: '#E8D5DD',
    borderColor: '#E8D5DD',
    icon: '↻',
  },
  sync_pending: {
    label: 'Sync Pending',
    dotColor: '#C49752',
    textColor: '#C49752',
    bgColor: '#F7F0E5',
    borderColor: '#F7F0E5',
    icon: '⚠',
  },
  sync_failed: {
    label: 'Sync Failed',
    dotColor: '#B85C64',
    textColor: '#B85C64',
    bgColor: '#F7EDEE',
    borderColor: '#F7EDEE',
    icon: '✕',
  },
  synced: {
    label: 'Synced',
    dotColor: '#4F8A72',
    textColor: '#4F8A72',
    bgColor: '#EAF2EE',
    borderColor: '#EAF2EE',
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
