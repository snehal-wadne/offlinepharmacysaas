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
  Platform,
} from 'react-native';
import {
  DEFAULT_REGISTER_SESSION,
  MOCK_REGISTER_HISTORY,
} from '../../data/cashierMockData';

export default function CashRegisterScreen({ onNavigate, onShowToast, isMultiBranch = true }) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isCompact = width < 1024;

  // Active Session State
  const [session, setSession] = useState(DEFAULT_REGISTER_SESSION);

  // Form State for "Open Register" (Image 1 & 2)
  const [openingBalanceInput, setOpeningBalanceInput] = useState('2000.00');
  const [openingNote, setOpeningNote] = useState('');

  // Modal 1: Close Register Modal (Image 3)
  const [closeModalVisible, setCloseModalVisible] = useState(false);
  const [countedCashInput, setCountedCashInput] = useState('10400.00');
  const [closingNotes, setClosingNotes] = useState('');

  // Modal 2: View Register History Modal
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [historyList, setHistoryList] = useState(MOCK_REGISTER_HISTORY);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);

  // Modal 3: Petty Cash / Cash Movement Modal (FRS CASH-03)
  const [cashMovementModalVisible, setCashMovementModalVisible] = useState(false);
  const [movementType, setMovementType] = useState('OUT'); // 'IN' | 'OUT'
  const [movementAmount, setMovementAmount] = useState('');
  const [movementReason, setMovementReason] = useState('');

  // Calculate live variance in Close Modal
  const countedNum = parseFloat(countedCashInput) || 0;
  const expectedNum = session.expectedCash;
  const variance = countedNum - expectedNum;

  // Handler: Open Register (Image 1 -> Image 3)
  const handleOpenRegister = () => {
    const balanceNum = parseFloat(openingBalanceInput) || 0;
    if (balanceNum < 0) {
      if (onShowToast) onShowToast('⚠️ Opening balance cannot be negative.');
      return;
    }

    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    setSession((prev) => ({
      ...prev,
      isOpen: true,
      openingBalance: balanceNum,
      cashSales: 8750.0,
      upiSales: 4250.0,
      cardSales: 2800.0,
      creditSales: 1500.0,
      cashRefunds: 350.0,
      totalDiscounts: 420.0,
      expectedCash: balanceNum + 8750.0 - 350.0,
      openedAt: `${dateStr}, ${nowStr}`,
      sessionTime: 'Just started',
      notes: openingNote || 'Opening shift float recorded.',
    }));

    setCountedCashInput((balanceNum + 8750.0 - 350.0).toFixed(2));
    if (onShowToast) {
      onShowToast(`✓ Cash Register opened with float ₹${balanceNum.toFixed(2)} (CASH-01)`);
    }
  };

  // Handler: Close Register (Image 3 Modal Submit)
  const handleCloseRegister = () => {
    const countedVal = parseFloat(countedCashInput) || 0;
    const varVal = countedVal - session.expectedCash;
    let varStatus = 'Balanced';
    if (varVal < -1) varStatus = 'Shortage';
    else if (varVal > 1) varStatus = 'Overage';

    const closedRecord = {
      id: `REG-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      shift: 'Day Shift',
      cashier: session.openedBy,
      openedAt: session.openedAt.split(', ')[1] || '09:00 AM',
      closedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      branch: session.branch,
      openingBalance: session.openingBalance,
      cashSales: session.cashSales,
      cashRefunds: session.cashRefunds,
      expectedCash: session.expectedCash,
      countedCash: countedVal,
      variance: varVal,
      status: varStatus,
      notes: closingNotes || 'Shift closed and drawer reconciled.',
    };

    setHistoryList([closedRecord, ...historyList]);
    setSession((prev) => ({
      ...prev,
      isOpen: false,
    }));
    setCloseModalVisible(false);

    if (onShowToast) {
      onShowToast(
        `✓ Cash Register closed successfully! Variance: ${varVal >= 0 ? '+' : ''}₹${varVal.toFixed(2)} (${varStatus})`
      );
    }
  };

  // Handler: Add Cash Movement (CASH-03)
  const handleAddMovement = () => {
    const amt = parseFloat(movementAmount);
    if (!amt || amt <= 0) {
      if (onShowToast) onShowToast('⚠️ Please enter a valid movement amount.');
      return;
    }
    if (!movementReason.trim()) {
      if (onShowToast) onShowToast('⚠️ Please enter a reason for cash entry/payout.');
      return;
    }

    if (movementType === 'IN') {
      setSession((prev) => ({
        ...prev,
        expectedCash: prev.expectedCash + amt,
      }));
      if (onShowToast) onShowToast(`✓ Added ₹${amt.toFixed(2)} cash into register.`);
    } else {
      setSession((prev) => ({
        ...prev,
        expectedCash: prev.expectedCash - amt,
      }));
      if (onShowToast) onShowToast(`✓ Paid out ₹${amt.toFixed(2)} from register (${movementReason}).`);
    }

    setMovementAmount('');
    setMovementReason('');
    setCashMovementModalVisible(false);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.contentContainer,
        isMobile && styles.contentContainerMobile,
      ]}
      showsVerticalScrollIndicator={true}
    >
      {/* Top Header Row */}
      <View style={[styles.headerRow, isMobile && styles.headerRowMobile]}>
        <View style={styles.headerTitleBox}>
          <Text style={styles.pageTitle}>Cash Register</Text>
          <Text style={styles.pageSubtitle}>
            {session.isOpen
              ? 'Your register is open. You can start taking sales.'
              : 'Open your register to start taking sales.'}
          </Text>
        </View>

        <Pressable
          onPress={() => setHistoryModalVisible(true)}
          style={({ hovered }) => [
            styles.historyBtn,
            hovered && styles.historyBtnHovered,
          ]}
          accessibilityRole="button"
          accessibilityLabel="View Register History"
        >
          <Text style={styles.historyBtnIcon}>🕒</Text>
          <Text style={styles.historyBtnText}>View Register History</Text>
        </Pressable>
      </View>

      {/* ========================================================================= */}
      {/* STATE A: REGISTER IS CLOSED (Matches Images 1 & 2)                        */}
      {/* ========================================================================= */}
      {!session.isOpen && (
        <View style={styles.closedStateWrapper}>
          <View style={[styles.closedCard, isMobile && styles.closedCardMobile]}>
            {/* Center Calculator Icon */}
            <View style={styles.calculatorCircle}>
              <Text style={styles.calculatorIcon}>🧮</Text>
            </View>

            {/* Headline & Subtext */}
            <Text style={styles.closedHeadline}>Register is Closed</Text>
            <Text style={styles.closedSubtext}>
              Open your cash register with an opening balance to begin your shift.
            </Text>

            {/* Field 1: Opening Balance */}
            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>Opening Balance (₹) *</Text>
              <View style={styles.currencyInputRow}>
                <Text style={styles.currencySymbol}>₹</Text>
                <TextInput
                  style={styles.currencyInput}
                  value={openingBalanceInput}
                  onChangeText={setOpeningBalanceInput}
                  placeholder="Enter opening cash in hand"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                />
              </View>
            </View>

            {/* Field 2: Note (Optional) */}
            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>Note (Optional)</Text>
              <TextInput
                style={styles.textAreaInput}
                value={openingNote}
                onChangeText={setOpeningNote}
                placeholder="Enter any note for opening the register..."
                placeholderTextColor="#94A3B8"
                multiline={true}
                numberOfLines={3}
              />
            </View>

            {/* Info / Alert Banner */}
            <View style={styles.infoBanner}>
              <Text style={styles.infoBannerIcon}>ⓘ</Text>
              <Text style={styles.infoBannerText}>
                This amount should be the actual cash in your drawer at the start of your shift.
              </Text>
            </View>

            {/* Primary Action Button */}
            <Pressable
              onPress={handleOpenRegister}
              style={({ hovered }) => [
                styles.openRegisterBtn,
                hovered && styles.openRegisterBtnHovered,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Open Register"
            >
              <Text style={styles.openRegisterBtnIcon}>🔓</Text>
              <Text style={styles.openRegisterBtnText}>Open Register</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ========================================================================= */}
      {/* STATE B: REGISTER IS OPEN (Matches Image 3)                              */}
      {/* ========================================================================= */}
      {session.isOpen && (
        <View style={styles.openStateContainer}>
          {/* Top 2 Status Cards */}
          <View style={[styles.statusCardsRow, isMobile && styles.statusCardsRowMobile]}>
            {/* Card 1: Register Status */}
            <View style={[styles.statusCard, isMobile && styles.statusCardMobile]}>
              <View style={styles.statusCardIconBox}>
                <Text style={styles.statusCardEmoji}>🧺</Text>
              </View>
              <View style={styles.statusCardInfo}>
                <Text style={styles.statusCardLabel}>Register Status</Text>
                <View style={styles.openBadgeRow}>
                  <Text style={styles.openBadgeText}>Open</Text>
                </View>
                <Text style={styles.statusMetaText}>
                  Opened By: <Text style={styles.statusMetaHighlight}>{session.openedBy}</Text>
                </Text>
                <Text style={styles.statusMetaText}>
                  Opened At: {session.openedAt}
                </Text>
              </View>
            </View>

            {/* Card 2: Current Session Time */}
            <View style={[styles.statusCard, isMobile && styles.statusCardMobile]}>
              <View style={[styles.statusCardIconBox, styles.timeIconBox]}>
                <Text style={styles.statusCardEmoji}>⏱️</Text>
              </View>
              <View style={styles.statusCardInfo}>
                <Text style={styles.statusCardLabel}>Current Session Time</Text>
                <Text style={styles.sessionTimeValue}>{session.sessionTime}</Text>
                <View style={styles.lastActivityRow}>
                  <Text style={styles.statusMetaText}>Last Activity: Just now</Text>
                  <View style={styles.liveGreenDot} />
                </View>
                <Text style={styles.statusMetaText}>Session: Active Shift</Text>
              </View>
            </View>
          </View>

          {/* Section: Sales & Payment Summary */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Sales & Payment Summary</Text>
              <View style={styles.quickHeaderActions}>
                <Pressable
                  onPress={() => onNavigate && onNavigate('new-sale')}
                  style={styles.newSaleSmallBtn}
                >
                  <Text style={styles.newSaleSmallBtnText}>+ Start New Sale</Text>
                </Pressable>
                <Pressable
                  onPress={() => setCashMovementModalVisible(true)}
                  style={styles.pettyCashBtn}
                >
                  <Text style={styles.pettyCashBtnText}>± Petty Cash Entry</Text>
                </Pressable>
              </View>
            </View>

            <View style={[styles.summaryPillsRow, isMobile && styles.summaryPillsRowMobile]}>
              {/* Cash Sales Card */}
              <View style={styles.summaryItemCard}>
                <View style={styles.summaryItemHeader}>
                  <Text style={styles.summaryItemIcon}>💵</Text>
                  <Text style={styles.summaryItemLabel}>Cash Sales</Text>
                </View>
                <Text style={styles.summaryItemValue}>₹{session.cashSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
              </View>

              {/* UPI / Digital Sales */}
              <View style={styles.summaryItemCard}>
                <View style={styles.summaryItemHeader}>
                  <Text style={styles.summaryItemIcon}>📱</Text>
                  <Text style={styles.summaryItemLabel}>UPI / QR Sales</Text>
                </View>
                <Text style={styles.summaryItemValue}>₹{session.upiSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
              </View>

              {/* Card Sales */}
              <View style={styles.summaryItemCard}>
                <View style={styles.summaryItemHeader}>
                  <Text style={styles.summaryItemIcon}>💳</Text>
                  <Text style={styles.summaryItemLabel}>Card Sales</Text>
                </View>
                <Text style={styles.summaryItemValue}>₹{session.cardSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
              </View>

              {/* Refunds Badge */}
              <View style={[styles.badgeSummaryCard, styles.refundsCard]}>
                <View style={styles.summaryItemHeader}>
                  <Text style={styles.summaryItemIcon}>🔄</Text>
                  <Text style={[styles.summaryItemLabel, styles.refundsLabel]}>Refunds</Text>
                </View>
                <Text style={styles.refundsValue}>-₹{session.cashRefunds.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
              </View>

              {/* Discounts Badge */}
              <View style={[styles.badgeSummaryCard, styles.discountsCard]}>
                <View style={styles.summaryItemHeader}>
                  <Text style={styles.summaryItemIcon}>🏷️</Text>
                  <Text style={[styles.summaryItemLabel, styles.discountsLabel]}>Discounts</Text>
                </View>
                <Text style={styles.discountsValue}>-₹{session.totalDiscounts.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
              </View>
            </View>
          </View>

          {/* Section: Cash Reconciliation & Close Action */}
          <View style={[styles.reconciliationGrid, isCompact && styles.reconciliationGridCompact]}>
            {/* Left Box: Reconciliation Rows */}
            <View style={styles.reconciliationCard}>
              <Text style={styles.reconciliationTitle}>Cash Reconciliation (For Session)</Text>

              <View style={styles.reconciliationTable}>
                <View style={styles.reconRow}>
                  <Text style={styles.reconLabel}>Opening Balance</Text>
                  <Text style={styles.reconValue}>
                    ₹{session.openingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </Text>
                </View>

                <View style={styles.reconRow}>
                  <Text style={styles.reconLabel}>Cash Sales</Text>
                  <Text style={[styles.reconValue, styles.reconPositive]}>
                    +₹{session.cashSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </Text>
                </View>

                <View style={styles.reconRow}>
                  <Text style={styles.reconLabel}>Cash Refunds</Text>
                  <Text style={[styles.reconValue, styles.reconNegative]}>
                    -₹{session.cashRefunds.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </Text>
                </View>

                <View style={styles.reconDivider} />

                <View style={styles.reconTotalRow}>
                  <Text style={styles.reconTotalLabel}>Expected Cash in Drawer</Text>
                  <Text style={styles.reconTotalValue}>
                    ₹{session.expectedCash.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </Text>
                </View>
              </View>
            </View>

            {/* Right Box: Action to Close Register */}
            <View style={styles.closeActionCard}>
              <View style={styles.closeDrawerIconBox}>
                <Text style={styles.closeDrawerIcon}>🗄️</Text>
              </View>
              <Text style={styles.closeActionHint}>
                Count the cash in drawer at the end of your shift and close the register.
              </Text>
              <Pressable
                onPress={() => {
                  setCountedCashInput(session.expectedCash.toFixed(2));
                  setClosingNotes('');
                  setCloseModalVisible(true);
                }}
                style={({ hovered }) => [
                  styles.closeRegisterPrimaryBtn,
                  hovered && styles.closeRegisterPrimaryBtnHovered,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Close Register"
              >
                <Text style={styles.closeRegisterBtnIcon}>🔒</Text>
                <Text style={styles.closeRegisterBtnText}>Close Register</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: CLOSE REGISTER MODAL (Image 3 Foreground Modal)                  */}
      {/* ========================================================================= */}
      <Modal
        visible={closeModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setCloseModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.closeModalCard, isMobile && styles.closeModalCardMobile]}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Close Register</Text>
                <Text style={styles.modalSubtitle}>Reconcile cash drawer and end session</Text>
              </View>
              <Pressable
                onPress={() => setCloseModalVisible(false)}
                style={styles.modalCloseBtn}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Text style={styles.modalCloseBtnText}>✕</Text>
              </Pressable>
            </View>

            {/* Breakdown Rows */}
            <View style={styles.modalBreakdownSection}>
              <View style={styles.modalBreakdownRow}>
                <Text style={styles.modalBreakdownLabel}>Cash Sales (This Session)</Text>
                <Text style={styles.modalBreakdownValue}>
                  ₹{session.cashSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </Text>
              </View>

              <View style={styles.modalBreakdownRow}>
                <Text style={styles.modalBreakdownLabel}>Cash Refunds (This Session)</Text>
                <Text style={[styles.modalBreakdownValue, styles.modalRefundsText]}>
                  -₹{session.cashRefunds.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </Text>
              </View>

              <View style={styles.modalBreakdownDivider} />

              <View style={styles.modalBreakdownTotalRow}>
                <Text style={styles.modalExpectedLabel}>Expected Cash in Drawer</Text>
                <Text style={styles.modalExpectedValue}>
                  ₹{session.expectedCash.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </Text>
              </View>
            </View>

            {/* Input: Counted Cash in Drawer * */}
            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>Counted Cash in Drawer *</Text>
              <View style={styles.currencyInputRow}>
                <Text style={styles.currencySymbol}>₹</Text>
                <TextInput
                  style={styles.currencyInput}
                  value={countedCashInput}
                  onChangeText={setCountedCashInput}
                  placeholder="Enter counted cash amount"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                  autoFocus={true}
                />
              </View>
            </View>

            {/* Variance Display Box */}
            <View style={styles.varianceBox}>
              <View>
                <Text style={styles.varianceLabel}>Variance</Text>
                <Text style={styles.varianceSubtext}>(Counted Cash - Expected Cash)</Text>
              </View>
              <Text
                style={[
                  styles.varianceValue,
                  variance < -0.01
                    ? styles.varianceShortage
                    : variance > 0.01
                    ? styles.varianceOverage
                    : styles.varianceBalanced,
                ]}
              >
                {variance >= 0 ? '+' : ''}₹{variance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </Text>
            </View>

            {/* Closing Notes */}
            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>Closing Notes (Optional)</Text>
              <TextInput
                style={styles.textAreaInput}
                value={closingNotes}
                onChangeText={setClosingNotes}
                placeholder="Add any note about this closing..."
                placeholderTextColor="#94A3B8"
                multiline={true}
                numberOfLines={3}
              />
            </View>

            {/* Action Footer */}
            <View style={styles.modalFooterRow}>
              <Pressable
                onPress={() => setCloseModalVisible(false)}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleCloseRegister}
                style={({ hovered }) => [
                  styles.confirmCloseBtn,
                  hovered && styles.confirmCloseBtnHovered,
                ]}
              >
                <Text style={styles.confirmCloseBtnText}>Close Register</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 2: VIEW REGISTER HISTORY MODAL                                      */}
      {/* ========================================================================= */}
      <Modal
        visible={historyModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setHistoryModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.historyModalCard, isMobile && styles.historyModalCardMobile]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Register Session History</Text>
                <Text style={styles.modalSubtitle}>Past cash drawer sessions, closures and reconciliations (RPT-12)</Text>
              </View>
              <Pressable
                onPress={() => setHistoryModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Text style={styles.modalCloseBtnText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 450 }}>
              <View style={styles.historyTable}>
                <View style={styles.historyTableHeader}>
                  <Text style={[styles.historyTh, { flex: 1.2 }]}>Session ID / Date</Text>
                  <Text style={[styles.historyTh, { flex: 1 }]}>Cashier</Text>
                  <Text style={[styles.historyTh, { flex: 0.8 }]}>Shift</Text>
                  <Text style={[styles.historyTh, { flex: 1, textAlign: 'right' }]}>Opening Float</Text>
                  <Text style={[styles.historyTh, { flex: 1, textAlign: 'right' }]}>Expected</Text>
                  <Text style={[styles.historyTh, { flex: 1, textAlign: 'right' }]}>Counted</Text>
                  <Text style={[styles.historyTh, { flex: 1, textAlign: 'center' }]}>Variance</Text>
                </View>

                {historyList.map((item) => (
                  <View key={item.id} style={styles.historyTableRow}>
                    <View style={{ flex: 1.2 }}>
                      <Text style={styles.historySessionId}>{item.id}</Text>
                      <Text style={styles.historyDate}>{item.date} • {item.closedAt}</Text>
                    </View>
                    <Text style={[styles.historyTd, { flex: 1 }]}>{item.cashier}</Text>
                    <Text style={[styles.historyTd, { flex: 0.8 }]}>{item.shift}</Text>
                    <Text style={[styles.historyTd, { flex: 1, textAlign: 'right' }]}>
                      ₹{item.openingBalance.toFixed(2)}
                    </Text>
                    <Text style={[styles.historyTd, { flex: 1, textAlign: 'right' }]}>
                      ₹{item.expectedCash.toFixed(2)}
                    </Text>
                    <Text style={[styles.historyTd, { flex: 1, textAlign: 'right', fontWeight: '700' }]}>
                      ₹{item.countedCash.toFixed(2)}
                    </Text>
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <View
                        style={[
                          styles.varianceBadge,
                          item.status === 'Shortage'
                            ? styles.varBadgeShortage
                            : item.status === 'Overage'
                            ? styles.varBadgeOverage
                            : styles.varBadgeBalanced,
                        ]}
                      >
                        <Text
                          style={[
                            styles.varianceBadgeText,
                            item.status === 'Shortage'
                              ? styles.varTextShortage
                              : item.status === 'Overage'
                              ? styles.varTextOverage
                              : styles.varTextBalanced,
                          ]}
                        >
                          {item.variance === 0 ? '✓ Balanced' : `${item.variance > 0 ? '+' : ''}₹${item.variance.toFixed(2)}`}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>

            <View style={styles.historyModalFooter}>
              <Pressable
                onPress={() => setHistoryModalVisible(false)}
                style={styles.confirmCloseBtn}
              >
                <Text style={styles.confirmCloseBtnText}>Close Window</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 3: PETTY CASH / CASH IN/OUT MODAL (FRS CASH-03)                     */}
      {/* ========================================================================= */}
      <Modal
        visible={cashMovementModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setCashMovementModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.closeModalCard, isMobile && styles.closeModalCardMobile]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Petty Cash Movement</Text>
                <Text style={styles.modalSubtitle}>Record cash-in or payout for expenses (CASH-03)</Text>
              </View>
              <Pressable
                onPress={() => setCashMovementModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Text style={styles.modalCloseBtnText}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.movementTypeSelector}>
              <Pressable
                onPress={() => setMovementType('OUT')}
                style={[
                  styles.movementTypeBtn,
                  movementType === 'OUT' && styles.movementTypeBtnActiveOut,
                ]}
              >
                <Text
                  style={[
                    styles.movementTypeBtnText,
                    movementType === 'OUT' && styles.movementTypeBtnTextActive,
                  ]}
                >
                  Cash Payout / Expense
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setMovementType('IN')}
                style={[
                  styles.movementTypeBtn,
                  movementType === 'IN' && styles.movementTypeBtnActiveIn,
                ]}
              >
                <Text
                  style={[
                    styles.movementTypeBtnText,
                    movementType === 'IN' && styles.movementTypeBtnTextActive,
                  ]}
                >
                  Add Cash Float (Cash In)
                </Text>
              </Pressable>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>Amount (₹) *</Text>
              <View style={styles.currencyInputRow}>
                <Text style={styles.currencySymbol}>₹</Text>
                <TextInput
                  style={styles.currencyInput}
                  value={movementAmount}
                  onChangeText={setMovementAmount}
                  placeholder="0.00"
                  keyboardType="numeric"
                  autoFocus={true}
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>Reason / Expense Category *</Text>
              <TextInput
                style={styles.currencyInput}
                value={movementReason}
                onChangeText={setMovementReason}
                placeholder="e.g. Courier charges, Tea/Water expenses, Change float"
              />
            </View>

            <View style={styles.modalFooterRow}>
              <Pressable
                onPress={() => setCashMovementModalVisible(false)}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleAddMovement}
                style={styles.confirmCloseBtn}
              >
                <Text style={styles.confirmCloseBtnText}>Record Movement</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    maxWidth: 1300,
    alignSelf: 'center',
    width: '100%',
  },
  contentContainerMobile: {
    padding: 16,
  },

  // Header Row
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerRowMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 14,
  },
  headerTitleBox: {
    flex: 1,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
    cursor: 'pointer',
  },
  historyBtnHovered: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
  },
  historyBtnIcon: {
    fontSize: 14,
  },
  historyBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },

  // STATE A: REGISTER IS CLOSED (Images 1 & 2)
  closedStateWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  closedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 40,
    width: '100%',
    maxWidth: 720,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
    alignItems: 'center',
  },
  closedCardMobile: {
    padding: 20,
  },
  calculatorCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E6F4EA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  calculatorIcon: {
    fontSize: 28,
  },
  closedHeadline: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  closedSubtext: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 28,
    maxWidth: 480,
    lineHeight: 20,
  },
  formGroup: {
    width: '100%',
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
  },
  currencyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    height: 48,
  },
  currencySymbol: {
    fontSize: 15,
    fontWeight: '700',
    color: '#64748B',
    marginRight: 8,
  },
  currencyInput: {
    flex: 1,
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '600',
    outlineStyle: 'none',
  },
  textAreaInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    padding: 12,
    fontSize: 14,
    color: '#0F172A',
    minHeight: 88,
    textAlignVertical: 'top',
    outlineStyle: 'none',
  },
  infoBanner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 24,
    gap: 10,
  },
  infoBannerIcon: {
    fontSize: 16,
    color: '#059669',
    fontWeight: '800',
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#065F46',
    fontWeight: '500',
    lineHeight: 18,
  },
  openRegisterBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0F5C3E',
    height: 48,
    borderRadius: 8,
    cursor: 'pointer',
    shadowColor: '#0F5C3E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  openRegisterBtnHovered: {
    backgroundColor: '#0A4830',
  },
  openRegisterBtnIcon: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  openRegisterBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // STATE B: REGISTER IS OPEN (Image 3)
  openStateContainer: {
    gap: 24,
  },
  statusCardsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  statusCardsRowMobile: {
    flexDirection: 'column',
  },
  statusCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  statusCardMobile: {
    width: '100%',
  },
  statusCardIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E6F4EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeIconBox: {
    backgroundColor: '#E0F2FE',
  },
  statusCardEmoji: {
    fontSize: 22,
  },
  statusCardInfo: {
    flex: 1,
  },
  statusCardLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  openBadgeRow: {
    alignSelf: 'flex-start',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
  },
  openBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#065F46',
  },
  sessionTimeValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  lastActivityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  statusMetaText: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
  },
  statusMetaHighlight: {
    fontWeight: '700',
    color: '#1E293B',
  },

  // Sales Summary
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  quickHeaderActions: {
    flexDirection: 'row',
    gap: 8,
  },
  newSaleSmallBtn: {
    backgroundColor: '#0F766E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    cursor: 'pointer',
  },
  newSaleSmallBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  pettyCashBtn: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    cursor: 'pointer',
  },
  pettyCashBtnText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
  },
  summaryPillsRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  summaryPillsRowMobile: {
    flexDirection: 'column',
  },
  summaryItemCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
  },
  summaryItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  summaryItemIcon: {
    fontSize: 14,
  },
  summaryItemLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  summaryItemValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  badgeSummaryCard: {
    flex: 1,
    minWidth: 130,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
  },
  refundsCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  refundsLabel: {
    color: '#991B1B',
  },
  refundsValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#B91C1C',
  },
  discountsCard: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  discountsLabel: {
    color: '#92400E',
  },
  discountsValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#B45309',
  },

  // Reconciliation Grid (Bottom)
  reconciliationGrid: {
    flexDirection: 'row',
    gap: 20,
  },
  reconciliationGridCompact: {
    flexDirection: 'column',
  },
  reconciliationCard: {
    flex: 1.4,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  reconciliationTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 16,
  },
  reconciliationTable: {
    gap: 12,
  },
  reconRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reconLabel: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  reconValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  reconPositive: {
    color: '#059669',
  },
  reconNegative: {
    color: '#DC2626',
  },
  reconDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 4,
  },
  reconTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
  },
  reconTotalLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  reconTotalValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F5C3E',
  },

  // Close Action Card (Right)
  closeActionCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  closeDrawerIconBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E6F4EA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  closeDrawerIcon: {
    fontSize: 26,
  },
  closeActionHint: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
    maxWidth: 260,
  },
  closeRegisterPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0F5C3E',
    paddingHorizontal: 24,
    height: 46,
    borderRadius: 8,
    width: '100%',
    cursor: 'pointer',
  },
  closeRegisterPrimaryBtnHovered: {
    backgroundColor: '#0A4830',
  },
  closeRegisterBtnIcon: {
    fontSize: 15,
    color: '#FFFFFF',
  },
  closeRegisterBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // MODALS
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  closeModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 28,
    width: '100%',
    maxWidth: 520,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  closeModalCardMobile: {
    padding: 18,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 6,
    cursor: 'pointer',
  },
  modalCloseBtnText: {
    fontSize: 18,
    color: '#94A3B8',
    fontWeight: '700',
  },
  modalBreakdownSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 20,
    gap: 10,
  },
  modalBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalBreakdownLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  modalBreakdownValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalRefundsText: {
    color: '#DC2626',
  },
  modalBreakdownDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 2,
  },
  modalBreakdownTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  modalExpectedLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalExpectedValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F5C3E',
  },
  varianceBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 14,
    marginBottom: 20,
  },
  varianceLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  varianceSubtext: {
    fontSize: 11,
    color: '#64748B',
  },
  varianceValue: {
    fontSize: 18,
    fontWeight: '900',
  },
  varianceBalanced: {
    color: '#059669',
  },
  varianceShortage: {
    color: '#DC2626',
  },
  varianceOverage: {
    color: '#2563EB',
  },
  modalFooterRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    cursor: 'pointer',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  confirmCloseBtn: {
    backgroundColor: '#0F5C3E',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    cursor: 'pointer',
  },
  confirmCloseBtnHovered: {
    backgroundColor: '#0A4830',
  },
  confirmCloseBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // History Modal
  historyModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 28,
    width: '100%',
    maxWidth: 860,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  historyModalCardMobile: {
    padding: 16,
  },
  historyTable: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  historyTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  historyTh: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
  },
  historyTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  historySessionId: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  historyDate: {
    fontSize: 11,
    color: '#64748B',
  },
  historyTd: {
    fontSize: 13,
    color: '#334155',
  },
  varianceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  varBadgeBalanced: {
    backgroundColor: '#D1FAE5',
  },
  varTextBalanced: {
    color: '#065F46',
    fontWeight: '700',
    fontSize: 12,
  },
  varBadgeShortage: {
    backgroundColor: '#FEE2E2',
  },
  varTextShortage: {
    color: '#991B1B',
    fontWeight: '700',
    fontSize: 12,
  },
  varBadgeOverage: {
    backgroundColor: '#DBEAFE',
  },
  varTextOverage: {
    color: '#1E40AF',
    fontWeight: '700',
    fontSize: 12,
  },
  historyModalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
  },

  // Movement Modal
  movementTypeSelector: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 4,
    marginBottom: 18,
  },
  movementTypeBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
    cursor: 'pointer',
  },
  movementTypeBtnActiveOut: {
    backgroundColor: '#FEE2E2',
  },
  movementTypeBtnActiveIn: {
    backgroundColor: '#D1FAE5',
  },
  movementTypeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  movementTypeBtnTextActive: {
    color: '#0F172A',
    fontWeight: '800',
  },
});
