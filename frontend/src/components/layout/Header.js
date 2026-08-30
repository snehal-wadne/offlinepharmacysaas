import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  Platform,
} from 'react-native';

const BRANCH_OPTIONS = [
  'Main Branch',
  'Downtown Branch',
  'East Clinic',
  'Northside Branch',
  'Central Warehouse',
];

export default function Header({
  currentBranch = 'Main Branch',
  onBranchChange,
  isMultiBranch = true,
  onTogglePharmacyMode,
  syncStatus = 'online',
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleSelectBranch = (branch) => {
    if (onBranchChange) {
      onBranchChange(branch);
    }
    setDropdownOpen(false);
  };

  return (
    <View style={styles.headerContainer}>
      {/* Left: Branch Info (Conditional for Single-Shop vs Multi-Branch) */}
      <View style={styles.leftSection}>
        {isMultiBranch ? (
          // MULTI-BRANCH MODE: Active Branch Switcher Dropdown
          <View style={styles.branchSelectorRow}>
            <Text style={styles.branchLabel}>Branch</Text>
            <Pressable
              onPress={() => setDropdownOpen(true)}
              style={styles.branchButton}
              accessibilityRole="button"
              accessibilityLabel="Select Branch"
            >
              <Text style={styles.branchButtonText}>{currentBranch}</Text>
              <Text style={styles.chevron}>▾</Text>
            </Pressable>
          </View>
        ) : (
          // SINGLE-SHOP MODE: Clean Non-Clickable Store Label
          <View style={styles.singleShopBadge}>
            <View style={styles.singleShopDot} />
            <Text style={styles.singleShopLabel}>Single Store</Text>
          </View>
        )}

        {/* Quick Mode Toggle for Testing / Enterprise Tier Switching */}
        {onTogglePharmacyMode && (
          <Pressable
            onPress={onTogglePharmacyMode}
            style={styles.modeTogglePill}
            accessibilityRole="button"
            accessibilityLabel="Toggle Single/Multi Branch Mode"
          >
            <Text style={styles.modeToggleText}>
              Mode: {isMultiBranch ? 'Multi-Branch' : 'Single-Shop'} ⇄
            </Text>
          </Pressable>
        )}
      </View>

      {/* Right: Sync Status & User Profile */}
      <View style={styles.rightSection}>
        {/* Sync Status Badge */}
        <View style={styles.syncBadge}>
          <View style={styles.syncDot} />
          <Text style={styles.syncText}>Online</Text>
        </View>

        {/* User Profile */}
        <View style={styles.profileContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>IM</Text>
          </View>
          <Text style={styles.userRole}>Inventory Manager</Text>
        </View>
      </View>

      {/* Branch Dropdown Modal (Only relevant in Multi-Branch Mode) */}
      {isMultiBranch && (
        <Modal
          visible={dropdownOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setDropdownOpen(false)}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setDropdownOpen(false)}
          >
            <View style={styles.dropdownCard}>
              <Text style={styles.dropdownTitle}>Select Active Branch</Text>
              {BRANCH_OPTIONS.map((branch) => {
                const isSelected = branch === currentBranch;
                return (
                  <Pressable
                    key={branch}
                    onPress={() => handleSelectBranch(branch)}
                    style={[
                      styles.dropdownItem,
                      isSelected && styles.dropdownItemSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dropdownItemText,
                        isSelected && styles.dropdownItemTextSelected,
                      ]}
                    >
                      {branch}
                    </Text>
                    {isSelected && <Text style={styles.checkmark}>✓</Text>}
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    height: 64,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    zIndex: 10,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  branchSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  branchLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  branchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 14,
    gap: 8,
    cursor: 'pointer',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
      },
    }),
  },
  branchButtonText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  chevron: {
    fontSize: 12,
    color: '#64748B',
  },
  singleShopBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 7,
  },
  singleShopDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0F766E',
  },
  singleShopLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  modeTogglePill: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    cursor: 'pointer',
  },
  modeToggleText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 7,
  },
  syncDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#16A34A',
  },
  syncText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#15803D',
  },
  profileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  userRole: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.3)',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    paddingTop: 68,
    paddingLeft: 28,
  },
  dropdownCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 8,
    minWidth: 230,
    ...Platform.select({
      web: {
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
      },
    }),
  },
  dropdownTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 14,
    cursor: 'pointer',
  },
  dropdownItemSelected: {
    backgroundColor: '#F0FDFA',
  },
  dropdownItemText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
  },
  dropdownItemTextSelected: {
    color: '#0F766E',
    fontWeight: '700',
  },
  checkmark: {
    fontSize: 12,
    color: '#0F766E',
    fontWeight: '700',
  },
});
