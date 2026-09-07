import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Modal,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { MOCK_HELD_BILLS } from '../../data/cashierMockData';

export default function HeldBillsScreen({ onNavigate, onShowToast, isMultiBranch = true }) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [heldBills, setHeldBills] = useState(MOCK_HELD_BILLS);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBill, setSelectedBill] = useState(null);

  const filteredBills = heldBills.filter(
    (b) =>
      b.token.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.customerPhone.includes(searchQuery)
  );

  const handleResume = (bill) => {
    if (onShowToast) {
      onShowToast(`✓ Resuming Token ${bill.token} in POS Checkout! (BIL-12)`);
    }
    if (onNavigate) {
      onNavigate('new-sale');
    }
  };

  const handleDiscard = (holdId) => {
    setHeldBills(heldBills.filter((b) => b.holdId !== holdId));
    if (onShowToast) {
      onShowToast('Parked bill discarded.');
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.contentContainer,
        isMobile && styles.contentContainerMobile,
      ]}
    >
      {/* Header */}
      <View style={[styles.headerRow, isMobile && styles.headerRowMobile]}>
        <View>
          <Text style={styles.pageTitle}>Held Bills</Text>
          <Text style={styles.pageSubtitle}>
            Parked carts suspended during checkout (BIL-12). Resume or discard anytime.
          </Text>
        </View>

        <Pressable
          onPress={() => onNavigate && onNavigate('new-sale')}
          style={styles.newSaleBtn}
        >
          <Text style={styles.newSaleBtnText}>+ Go to POS Billing</Text>
        </Pressable>
      </View>

      {/* Search Bar */}
      <View style={styles.searchBarBox}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by Token (e.g. T-108), customer name or phone..."
          placeholderTextColor="#94A3B8"
        />
      </View>

      {/* Held Cards Grid */}
      {filteredBills.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>⏸️</Text>
          <Text style={styles.emptyTitle}>No Parked Bills</Text>
          <Text style={styles.emptySub}>All customer carts have been settled or cleared.</Text>
        </View>
      ) : (
        <View style={styles.cardsGrid}>
          {filteredBills.map((bill) => (
            <View key={bill.holdId} style={styles.billCard}>
              <View style={styles.billCardHeader}>
                <View style={styles.tokenBadge}>
                  <Text style={styles.tokenBadgeText}>{bill.token}</Text>
                </View>
                <Text style={styles.heldTimeText}>Held at {bill.heldAt}</Text>
              </View>

              <Text style={styles.customerName}>{bill.customerName}</Text>
              <Text style={styles.customerPhone}>{bill.customerPhone}</Text>

              <View style={styles.itemsSummaryBox}>
                <Text style={styles.itemsSummaryLabel}>Items ({bill.itemsCount}):</Text>
                <Text style={styles.itemsSummaryText}>{bill.itemsSummary}</Text>
              </View>

              {bill.note ? (
                <View style={styles.noteBox}>
                  <Text style={styles.noteLabel}>Note:</Text>
                  <Text style={styles.noteText}>{bill.note}</Text>
                </View>
              ) : null}

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Grand Total:</Text>
                <Text style={styles.totalValue}>₹{bill.total.toFixed(2)}</Text>
              </View>

              <View style={styles.cardActionsRow}>
                <Pressable
                  onPress={() => handleDiscard(bill.holdId)}
                  style={styles.discardBtn}
                >
                  <Text style={styles.discardBtnText}>Discard</Text>
                </Pressable>

                <Pressable
                  onPress={() => handleResume(bill)}
                  style={styles.resumeBtn}
                >
                  <Text style={styles.resumeBtnText}>▶ Resume in POS</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  contentContainer: {
    padding: 24,
    maxWidth: 1200,
    alignSelf: 'center',
    width: '100%',
  },
  contentContainerMobile: {
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerRowMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 12,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  newSaleBtn: {
    backgroundColor: '#0F766E',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    cursor: 'pointer',
  },
  newSaleBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  searchBarBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 14,
    height: 44,
    marginBottom: 20,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    outlineStyle: 'none',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 40,
    alignItems: 'center',
  },
  emptyEmoji: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptySub: {
    fontSize: 13,
    color: '#64748B',
  },
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  billCard: {
    width: '48%',
    minWidth: 300,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  billCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  tokenBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tokenBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B45309',
  },
  heldTimeText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  customerName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  customerPhone: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 10,
  },
  itemsSummaryBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
  },
  itemsSummaryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 2,
  },
  itemsSummaryText: {
    fontSize: 12,
    color: '#1E293B',
  },
  noteBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 6,
    padding: 8,
    marginBottom: 10,
  },
  noteLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1E40AF',
  },
  noteText: {
    fontSize: 11,
    color: '#1E3A8A',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
    marginBottom: 14,
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F5C3E',
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  discardBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    cursor: 'pointer',
  },
  discardBtnText: {
    color: '#DC2626',
    fontWeight: '700',
    fontSize: 12,
  },
  resumeBtn: {
    flex: 1.5,
    backgroundColor: '#0F5C3E',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    cursor: 'pointer',
  },
  resumeBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
});
