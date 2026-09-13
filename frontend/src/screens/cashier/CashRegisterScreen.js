import React, { useState, useEffect } from 'react';
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
import {
  fetchCurrentRegisterSession,
  openRegisterShift,
  closeRegisterShift,
  fetchRegisterHistory,
  recordCashMovement,
  fetchCashMovements,
} from '../../api/cashierApi';
import { SkeletonKpiCard, SkeletonTableRow } from '../../components/common/SkeletonLoader';
import PaginationControls from '../../components/common/PaginationControls';

export default function CashRegisterScreen({ onNavigate, onShowToast, isMultiBranch = true }) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isCompact = width < 1024;

  // Active Session State
  const [session, setSession] = useState({
    ...DEFAULT_REGISTER_SESSION,
    expectedCash: 10780.0, // 2000 (Opening) + 8750 (Cash Sales) - 350 (Cash Refunds) + 500 (Float In) - 120 (Expenses Out)
  });

  // Form State for "Open Register" (Image 1 & 2)
  const [openingBalanceInput, setOpeningBalanceInput] = useState('2000.00');
  const [openingNote, setOpeningNote] = useState('');

  // Modal 1: Close Register Modal (Image 3)
  const [closeModalVisible, setCloseModalVisible] = useState(false);
  const [countedCashInput, setCountedCashInput] = useState('10780.00');
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
  const [movementError, setMovementError] = useState('');
  const [lastAddedMovementId, setLastAddedMovementId] = useState(null);

  // Persistent Petty Cash Movements Log for current session
  const [pettyCashMovements, setPettyCashMovements] = useState([
    {
      id: 'PC-1001',
      type: 'OUT',
      amount: 120.0,
      reason: 'Courier / delivery service charges',
      time: '29 Aug 2026, 09:45 AM',
      cashier: 'Cashier 01',
    },
    {
      id: 'PC-1002',
      type: 'IN',
      amount: 500.0,
      reason: 'Change float coins replenishment',
      time: '29 Aug 2026, 10:15 AM',
      cashier: 'Cashier 01',
    },
  ]);

  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // Load live register session and history from backend PostgreSQL
  useEffect(() => {
    let isMounted = true;
    async function loadRegisterData() {
      try {
        const [currentSession, historyData, movementsData] = await Promise.all([
          fetchCurrentRegisterSession(),
          fetchRegisterHistory(),
          fetchCashMovements(),
        ]);

        if (isMounted) {
          if (currentSession && (currentSession.id || currentSession.status === 'OPEN')) {
            const isOpen = currentSession.status === 'OPEN';
            const openBal = parseFloat(currentSession.openingBalance || 2000.0);
            const expCash = parseFloat(currentSession.expectedCash || currentSession.openingBalance || 2000.0);
            setSession((prev) => ({
              ...prev,
              ...currentSession,
              isOpen,
              sessionId: currentSession.sessionCode || currentSession.sessionNumber || prev.sessionId,
              openedBy: currentSession.openedBy || currentSession.cashierName || prev.openedBy,
              openingBalance: openBal,
              expectedCash: expCash > 0 ? expCash : openBal,
            }));
          }

          if (historyData && Array.isArray(historyData) && historyData.length > 0) {
            setHistoryList(historyData.map((h, i) => ({
              id: h.sessionCode || h.sessionNumber || h.id || `REG-${i}`,
              date: h.openedAt ? new Date(h.openedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '28 Aug 2026',
              shift: h.shiftName || 'Day Shift',
              cashier: h.cashierName || 'Cashier 01',
              openedAt: h.openedAt ? new Date(h.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '09:00 AM',
              closedAt: h.closedAt ? new Date(h.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '10:00 PM',
              branch: h.branchName || 'Main Branch',
              openingBalance: parseFloat(h.openingBalance) || 2000.0,
              cashSales: parseFloat(h.totalSales || h.cashSales) || 0,
              cashRefunds: parseFloat(h.cashRefunds) || 0,
              pettyCashIn: 0,
              pettyCashOut: 0,
              expectedCash: parseFloat(h.expectedCash) || 0,
              countedCash: parseFloat(h.countedCash) || 0,
              variance: parseFloat(h.variance) || 0,
              status: h.varianceStatus || h.status || 'Balanced',
              notes: h.notes || 'Shift completed.',
            })));
          }

          if (movementsData && Array.isArray(movementsData) && movementsData.length > 0) {
            setPettyCashMovements(movementsData);
          }
        }
      } catch (err) {
        console.warn('Failed to load register session from API:', err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadRegisterData();
    return () => { isMounted = false; };
  }, []);

  // Calculate totals
  const totalPettyCashIn = pettyCashMovements
    .filter((m) => m.type === 'IN')
    .reduce((sum, m) => sum + m.amount, 0);

  const totalPettyCashOut = pettyCashMovements
    .filter((m) => m.type === 'OUT')
    .reduce((sum, m) => sum + m.amount, 0);

  // Calculate live variance in Close Modal
  const countedNum = parseFloat(countedCashInput) || 0;
  const expectedNum = session.expectedCash;
  const variance = countedNum - expectedNum;

  // Handler: Open Register (Image 1 -> Image 3)
  const handleOpenRegister = async () => {
    const balanceNum = parseFloat(openingBalanceInput);
    if (isNaN(balanceNum)) {
      if (onShowToast) onShowToast('⚠️ Please enter a valid number for opening balance.');
      return;
    }
    if (balanceNum < 0) {
      if (onShowToast) onShowToast('⚠️ Opening balance cannot be negative.');
      return;
    }

    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const initialExpected = balanceNum + 8750.0 - 350.0 + totalPettyCashIn - totalPettyCashOut;

    try {
      const res = await openRegisterShift({
        openingBalance: balanceNum,
        notes: openingNote || 'Opening shift float recorded.',
      });

      setSession((prev) => ({
        ...prev,
        isOpen: true,
        sessionId: res?.sessionCode || res?.sessionNumber || prev.sessionId,
        openingBalance: balanceNum,
        cashSales: 8750.0,
        upiSales: 4250.0,
        cardSales: 2800.0,
        creditSales: 1500.0,
        cashRefunds: 350.0,
        totalDiscounts: 420.0,
        expectedCash: initialExpected,
        openedAt: `${dateStr}, ${nowStr}`,
        sessionTime: 'Just started',
        notes: openingNote || 'Opening shift float recorded.',
      }));
    } catch {
      setSession((prev) => ({
        ...prev,
        isOpen: true,
        openingBalance: balanceNum,
        expectedCash: initialExpected,
        openedAt: `${dateStr}, ${nowStr}`,
        sessionTime: 'Just started',
        notes: openingNote || 'Opening shift float recorded.',
      }));
    }

    setCountedCashInput(initialExpected.toFixed(2));
    if (onShowToast) {
      onShowToast(`✓ Cash Register opened with float ₹${balanceNum.toFixed(2)} (CASH-01)`);
    }
  };

  // Handler: Close Register (Image 3 Modal Submit)
  const handleCloseRegister = async () => {
    const countedVal = parseFloat(countedCashInput) || 0;
    const varVal = countedVal - session.expectedCash;
    let varStatus = 'Balanced';
    if (varVal < -1) varStatus = 'Shortage';
    else if (varVal > 1) varStatus = 'Overage';

    try {
      await closeRegisterShift({
        countedCash: countedVal,
        notes: closingNotes || 'Shift closed and drawer reconciled.',
      });
    } catch (e) {
      console.warn('Error closing register shift on backend:', e.message);
    }

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
      pettyCashIn: totalPettyCashIn,
      pettyCashOut: totalPettyCashOut,
      expectedCash: session.expectedCash,
      countedCash: countedVal,
      variance: varVal,
      status: varStatus,
      notes: closingNotes || 'Shift closed and drawer reconciled.',
      movements: [...pettyCashMovements],
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
  const handleAddMovement = async () => {
    const amt = parseFloat(movementAmount);
    if (!amt || amt <= 0 || isNaN(amt)) {
      setMovementError('⚠️ Please enter a valid movement amount greater than ₹0.');
      return;
    }

    // Default reason if cashier leaves it blank so it never fails to record!
    const defaultReason = movementType === 'IN' ? 'Cash Float Addition' : 'General Store Expense';
    const finalReason = movementReason.trim() || defaultReason;

    const nowTimeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const nowDateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    let newId = `PC-${Math.floor(1000 + Math.random() * 9000)}`;

    try {
      const res = await recordCashMovement({
        movementType,
        amount: amt,
        reason: finalReason,
      });
      if (res?.movementNumber) {
        newId = res.movementNumber;
      }
    } catch (e) {
      console.warn('Error saving cash movement to backend:', e.message);
      try {
        const { enqueueMutation } = require('../../offline/syncQueue');
        enqueueMutation('RECORD_CASH_MOVEMENT', { movementType, amount: amt, reason: finalReason });
      } catch (err) {
        console.warn('Could not queue offline movement', err);
      }
    }

    const newMovement = {
      id: newId,
      type: movementType, // 'IN' or 'OUT'
      amount: amt,
      reason: finalReason,
      time: `${nowDateStr}, ${nowTimeStr}`,
      cashier: session.openedBy || 'Cashier 01',
      isNew: true,
    };

    setPettyCashMovements((prev) => [newMovement, ...prev]);
    setLastAddedMovementId(newId);

    if (movementType === 'IN') {
      setSession((prev) => ({
        ...prev,
        expectedCash: prev.expectedCash + amt,
      }));
      if (onShowToast) {
        onShowToast(`✓ Recorded Cash In: +₹${amt.toFixed(2)} (${finalReason})`);
      }
    } else {
      setSession((prev) => ({
        ...prev,
        expectedCash: prev.expectedCash - amt,
      }));
      if (onShowToast) {
        onShowToast(`✓ Recorded Expense Payout: -₹${amt.toFixed(2)} (${finalReason})`);
      }
    }

    setMovementAmount('');
    setMovementReason('');
    setMovementError('');
    setCashMovementModalVisible(false);
  };

  // Handler: Delete Movement
  const handleDeleteMovement = (id) => {
    const item = pettyCashMovements.find((m) => m.id === id);
    if (!item) return;

    setPettyCashMovements((prev) => prev.filter((m) => m.id !== id));
    setSession((prev) => ({
      ...prev,
      expectedCash: item.type === 'IN' ? prev.expectedCash - item.amount : prev.expectedCash + item.amount,
    }));

    if (onShowToast) {
      onShowToast(`✓ Removed petty cash movement ${item.id}`);
    }
  };

  const paginatedData = historyList.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (loading) {
    return (
      <View style={{ flex: 1, padding: 24, gap: 16 }}>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <SkeletonKpiCard />
          <SkeletonKpiCard />
        </View>
        <SkeletonTableRow />
        <SkeletonTableRow />
        <SkeletonTableRow />
      </View>
    );
  }

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
                  onPress={() => onNavigate && onNavigate('sales')}
                  style={styles.newSaleSmallBtn}
                >
                  <Text style={styles.newSaleSmallBtnText}>+ Start New Sale</Text>
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

                {totalPettyCashIn > 0 && (
                  <View style={styles.reconRow}>
                    <Text style={styles.reconLabel}>Petty Cash In (Float Added)</Text>
                    <Text style={[styles.reconValue, styles.reconPositive]}>
                      +₹{totalPettyCashIn.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </Text>
                  </View>
                )}

                {totalPettyCashOut > 0 && (
                  <View style={styles.reconRow}>
                    <Text style={styles.reconLabel}>Petty Cash Out (Expenses/Payouts)</Text>
                    <Text style={[styles.reconValue, styles.reconNegative]}>
                      -₹{totalPettyCashOut.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </Text>
                  </View>
                )}

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

          {/* Section: Petty Cash & Expense Movements Log (CASH-03) */}
          <View style={styles.pettyCashSectionCard}>
            <View style={[styles.pettyCashSectionHeader, isMobile && styles.pettyCashSectionHeaderMobile]}>
              <View style={{ flex: 1 }}>
                <View style={styles.pettyCashTitleBadgeRow}>
                  <Text style={styles.pettyCashSectionTitle}>Petty Cash & Expense Movements Log</Text>
                  <View style={styles.cashBadge}>
                    <Text style={styles.cashBadgeText}>CASH-03</Text>
                  </View>
                </View>
                <Text style={styles.pettyCashSectionSubtitle}>
                  Real-time audit log of cash float additions and expense payouts for this shift
                </Text>
              </View>

              <View style={[styles.pettyCashHeaderRight, isMobile && styles.pettyCashHeaderRightMobile]}>
                {/* Live Movement Stat Badges */}
                <View style={styles.pettyCashSummaryChipRow}>
                  <View style={[styles.pettySummaryChip, styles.pettySummaryIn]}>
                    <Text style={styles.pettySummaryChipLabel}>Cash In:</Text>
                    <Text style={styles.pettySummaryChipValueIn}>+₹{totalPettyCashIn.toFixed(2)}</Text>
                  </View>
                  <View style={[styles.pettySummaryChip, styles.pettySummaryOut]}>
                    <Text style={styles.pettySummaryChipLabel}>Expenses Out:</Text>
                    <Text style={styles.pettySummaryChipValueOut}>-₹{totalPettyCashOut.toFixed(2)}</Text>
                  </View>
                </View>

                <Pressable
                  onPress={() => setCashMovementModalVisible(true)}
                  style={({ hovered }) => [
                    styles.recordMovementBtn,
                    hovered && styles.recordMovementBtnHovered,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Record Movement"
                >
                  <Text style={styles.recordMovementBtnIcon}>±</Text>
                  <Text style={styles.recordMovementBtnText}>+ Record Movement</Text>
                </Pressable>
              </View>
            </View>

            {/* Recent Addition Banner */}
            {lastAddedMovementId && (
              <View style={styles.justAddedBanner}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <Text style={{ fontSize: 16 }}>🎉</Text>
                  <Text style={styles.justAddedBannerText}>
                    Movement <Text style={{ fontWeight: '800' }}>{lastAddedMovementId}</Text> successfully recorded! Added as the top row below & drawer balance updated.
                  </Text>
                </View>
                <Pressable onPress={() => setLastAddedMovementId(null)} style={{ padding: 4, cursor: 'pointer' }}>
                  <Text style={{ fontSize: 12, color: '#0F766E', fontWeight: '700' }}>✕ Dismiss</Text>
                </Pressable>
              </View>
            )}

            {pettyCashMovements.length === 0 ? (
              <View style={styles.emptyMovementsBox}>
                <Text style={styles.emptyMovementsIcon}>🧾</Text>
                <Text style={styles.emptyMovementsTitle}>No Cash Movements Recorded Yet</Text>
                <Text style={styles.emptyMovementsSubtitle}>
                  All cash float additions (cash in) and expense payouts (cash out) will be stored and logged here.
                </Text>
                <Pressable
                  onPress={() => setCashMovementModalVisible(true)}
                  style={styles.emptyRecordBtn}
                >
                  <Text style={styles.emptyRecordBtnText}>+ Record First Movement</Text>
                </Pressable>
              </View>
            ) : isMobile ? (
              <View style={styles.mobileMovementsList}>
                {pettyCashMovements.map((mov, idx) => {
                  const isIn = mov.type === 'IN';
                  const isHighlighted = mov.id === lastAddedMovementId || mov.isNew;
                  return (
                    <View
                      key={mov.id || idx}
                      style={[
                        styles.mobileMovementCard,
                        isHighlighted && styles.mobileMovementCardHighlight,
                      ]}
                    >
                      <View style={styles.mobileMovementHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.movIdText}>{mov.id}</Text>
                          {isHighlighted && (
                            <View style={styles.justAddedBadge}>
                              <Text style={styles.justAddedBadgeText}>NEW</Text>
                            </View>
                          )}
                          <View
                            style={[
                              styles.movementTypeBadge,
                              isIn ? styles.badgeCashIn : styles.badgeCashOut,
                            ]}
                          >
                            <Text
                              style={[
                                styles.movementTypeBadgeText,
                                isIn ? styles.badgeTextCashIn : styles.badgeTextCashOut,
                              ]}
                            >
                              {isIn ? '+ Cash In' : '− Cash Out'}
                            </Text>
                          </View>
                        </View>
                        <Pressable
                          onPress={() => handleDeleteMovement(mov.id)}
                          style={styles.deleteMovBtn}
                          accessibilityRole="button"
                          accessibilityLabel={`Delete movement ${mov.id}`}
                        >
                          <Text style={styles.deleteMovBtnText}>✕</Text>
                        </Pressable>
                      </View>

                      <Text style={styles.mobileMovementReason}>{mov.reason}</Text>

                      <View style={styles.mobileMovementFooter}>
                        <View>
                          <Text style={styles.mobileMovementTime}>{mov.time}</Text>
                          <Text style={styles.mobileMovementCashier}>👤 {mov.cashier}</Text>
                        </View>
                        <Text
                          style={[
                            styles.mobileMovementAmount,
                            { color: isIn ? '#059669' : '#DC2626' },
                          ]}
                        >
                          {isIn ? '+' : '-'}₹{mov.amount.toFixed(2)}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <ScrollView horizontal={true} showsHorizontalScrollIndicator={false} style={{ width: '100%' }}>
                <View style={styles.movementsTable}>
                  <View style={styles.movementsTableHeader}>
                    <Text style={[styles.movementsTh, { width: 120 }]}>MOVEMENT ID</Text>
                    <Text style={[styles.movementsTh, { width: 180 }]}>DATE & TIME</Text>
                    <Text style={[styles.movementsTh, { width: 170 }]}>TYPE</Text>
                    <Text style={[styles.movementsTh, { minWidth: 220, flex: 1 }]}>REASON / CATEGORY</Text>
                    <Text style={[styles.movementsTh, { width: 120 }]}>CASHIER</Text>
                    <Text style={[styles.movementsTh, { width: 130, textAlign: 'right' }]}>AMOUNT (₹)</Text>
                    <Text style={[styles.movementsTh, { width: 70, textAlign: 'center' }]}>ACTION</Text>
                  </View>

                  {pettyCashMovements.map((mov, idx) => {
                    const isIn = mov.type === 'IN';
                    const isHighlighted = mov.id === lastAddedMovementId || mov.isNew;
                    return (
                      <View
                        key={mov.id || idx}
                        style={[
                          styles.movementsTableRow,
                          idx === pettyCashMovements.length - 1 && styles.movementsTableRowLast,
                          isHighlighted && styles.movementsTableRowHighlight,
                        ]}
                      >
                        <View style={{ width: 120, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.movIdText}>{mov.id}</Text>
                          {isHighlighted && (
                            <View style={styles.justAddedBadge}>
                              <Text style={styles.justAddedBadgeText}>NEW</Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.movementsTd, { width: 180, color: '#64748B' }]}>
                          {mov.time}
                        </Text>
                        <View style={{ width: 170 }}>
                          <View
                            style={[
                              styles.movementTypeBadge,
                              isIn ? styles.badgeCashIn : styles.badgeCashOut,
                            ]}
                          >
                            <Text
                              style={[
                                styles.movementTypeBadgeText,
                                isIn ? styles.badgeTextCashIn : styles.badgeTextCashOut,
                              ]}
                            >
                              {isIn ? '+ Cash In (Float)' : '− Cash Out (Expense)'}
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.movementsTd, { minWidth: 220, flex: 1, color: '#0F172A', fontWeight: '500' }]}>
                          {mov.reason}
                        </Text>
                        <Text style={[styles.movementsTd, { width: 120, color: '#475569' }]}>
                          {mov.cashier}
                        </Text>
                        <Text
                          style={[
                            styles.movementsTd,
                            {
                              width: 130,
                              textAlign: 'right',
                              fontWeight: '700',
                              color: isIn ? '#059669' : '#DC2626',
                            },
                          ]}
                        >
                          {isIn ? '+' : '-'}₹{mov.amount.toFixed(2)}
                        </Text>
                        <View style={{ width: 70, alignItems: 'center' }}>
                          <Pressable
                            onPress={() => handleDeleteMovement(mov.id)}
                            style={styles.deleteMovBtn}
                            accessibilityRole="button"
                            accessibilityLabel={`Delete movement ${mov.id}`}
                          >
                            <Text style={styles.deleteMovBtnText}>✕</Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            )}
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
                <Text style={styles.modalBreakdownLabel}>Opening Balance / Float</Text>
                <Text style={styles.modalBreakdownValue}>
                  ₹{session.openingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </Text>
              </View>

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

              {totalPettyCashIn > 0 && (
                <View style={styles.modalBreakdownRow}>
                  <Text style={styles.modalBreakdownLabel}>Petty Cash In (Float Added)</Text>
                  <Text style={[styles.modalBreakdownValue, { color: '#059669', fontWeight: '600' }]}>
                    +₹{totalPettyCashIn.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </Text>
                </View>
              )}

              {totalPettyCashOut > 0 && (
                <View style={styles.modalBreakdownRow}>
                  <Text style={styles.modalBreakdownLabel}>Petty Cash Out (Expenses / Payouts)</Text>
                  <Text style={[styles.modalBreakdownValue, styles.modalRefundsText]}>
                    -₹{totalPettyCashOut.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </Text>
                </View>
              )}

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
              {isMobile ? (
                <View style={styles.mobileHistoryList}>
                  {paginatedData.map((item) => (
                    <View key={item.id} style={styles.mobileHistoryCard}>
                      <View style={styles.mobileHistoryHeader}>
                        <View>
                          <Text style={styles.historySessionId}>{item.id}</Text>
                          <Text style={styles.historyDate}>{item.date} • {item.closedAt}</Text>
                        </View>
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

                      <View style={styles.mobileHistoryDetailsRow}>
                        <Text style={styles.mobileHistoryLabel}>
                          Cashier: <Text style={{ color: '#0F172A', fontWeight: '600' }}>{item.cashier}</Text>
                        </Text>
                        <View style={styles.mobileHistoryShiftBadge}>
                          <Text style={styles.mobileHistoryShiftText}>{item.shift}</Text>
                        </View>
                      </View>

                      <View style={styles.mobileHistoryMetricsGrid}>
                        <View style={styles.mobileHistoryMetricItem}>
                          <Text style={styles.mobileHistoryMetricLabel}>Opening Float</Text>
                          <Text style={styles.mobileHistoryMetricVal}>₹{item.openingBalance.toFixed(2)}</Text>
                        </View>
                        <View style={styles.mobileHistoryMetricItem}>
                          <Text style={styles.mobileHistoryMetricLabel}>Expected</Text>
                          <Text style={styles.mobileHistoryMetricVal}>₹{item.expectedCash.toFixed(2)}</Text>
                        </View>
                        <View style={styles.mobileHistoryMetricItem}>
                          <Text style={styles.mobileHistoryMetricLabel}>Counted</Text>
                          <Text style={[styles.mobileHistoryMetricVal, { fontWeight: '800', color: '#0F172A' }]}>
                            ₹{item.countedCash.toFixed(2)}
                          </Text>
                        </View>
                      </View>

                      {item.movements && item.movements.length > 0 && (
                        <View style={styles.mobileHistoryMovementsBox}>
                          <Text style={styles.historyMovementsSummaryText}>
                            📋 {item.movements.length} Petty Cash Movement(s): +₹{(item.pettyCashIn || 0).toFixed(2)} / -₹{(item.pettyCashOut || 0).toFixed(2)}
                          </Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              ) : (
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

                  {paginatedData.map((item) => (
                    <View key={item.id}>
                      <View style={styles.historyTableRow}>
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
                      {item.movements && item.movements.length > 0 && (
                        <View style={styles.historyMovementsRow}>
                          <Text style={styles.historyMovementsSummaryText}>
                            📋 Includes {item.movements.length} Petty Cash Movement(s): Float In: +₹{(item.pettyCashIn || 0).toFixed(2)}, Expenses: -₹{(item.pettyCashOut || 0).toFixed(2)}
                          </Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>

            <View style={{ padding: 16 }}>
              <PaginationControls
                currentPage={currentPage}
                totalItems={historyList.length}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={(n) => { setItemsPerPage(n); setCurrentPage(1); }}
              />
            </View>

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
                onPress={() => {
                  setMovementType('OUT');
                  setMovementError('');
                }}
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
                onPress={() => {
                  setMovementType('IN');
                  setMovementError('');
                }}
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

            {/* In-Modal Error Banner */}
            {movementError ? (
              <View style={styles.modalErrorBox}>
                <Text style={styles.modalErrorText}>{movementError}</Text>
              </View>
            ) : null}

            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>Amount (₹) *</Text>
              <View style={styles.currencyInputRow}>
                <Text style={styles.currencySymbol}>₹</Text>
                <TextInput
                  style={styles.currencyInput}
                  value={movementAmount}
                  onChangeText={(val) => {
                    setMovementAmount(val);
                    if (movementError) setMovementError('');
                  }}
                  placeholder="0.00"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                  autoFocus={true}
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={styles.fieldLabel}>Reason / Expense Category</Text>
                <Text style={{ fontSize: 11, color: '#64748B' }}>
                  {movementReason.trim() ? '✓ Reason set' : '(Optional - auto-defaults if blank)'}
                </Text>
              </View>

              {/* Quick suggestion chips */}
              <View style={styles.quickChipsRow}>
                {movementType === 'IN' ? (
                  <>
                    {['Change Float', 'Opening Top-up', 'Bank Withdrawal', 'Cash Deposit'].map((chip) => (
                      <Pressable
                        key={chip}
                        onPress={() => setMovementReason(chip)}
                        style={[
                          styles.quickChipBtn,
                          movementReason === chip && styles.quickChipBtnActiveIn,
                        ]}
                      >
                        <Text
                          style={[
                            styles.quickChipText,
                            movementReason === chip && styles.quickChipTextActiveIn,
                          ]}
                        >
                          + {chip}
                        </Text>
                      </Pressable>
                    ))}
                  </>
                ) : (
                  <>
                    {['Courier / Delivery', 'Tea & Refreshments', 'Cleaning & Supplies', 'Repairs / Misc'].map((chip) => (
                      <Pressable
                        key={chip}
                        onPress={() => setMovementReason(chip)}
                        style={[
                          styles.quickChipBtn,
                          movementReason === chip && styles.quickChipBtnActiveOut,
                        ]}
                      >
                        <Text
                          style={[
                            styles.quickChipText,
                            movementReason === chip && styles.quickChipTextActiveOut,
                          ]}
                        >
                          − {chip}
                        </Text>
                      </Pressable>
                    ))}
                  </>
                )}
              </View>

              <TextInput
                style={styles.currencyInput}
                value={movementReason}
                onChangeText={setMovementReason}
                placeholder={movementType === 'IN' ? 'e.g. Cash float addition (or leave blank for default)' : 'e.g. Courier charges (or leave blank for default)'}
                placeholderTextColor="#94A3B8"
              />
            </View>

            <Text style={styles.modalSubmitHint}>
              💡 Entry will be logged to the Petty Cash table below and adjust drawer expected cash.
            </Text>

            <View style={styles.modalFooterRow}>
              <Pressable
                onPress={() => {
                  setCashMovementModalVisible(false);
                  setMovementError('');
                }}
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

  // PETTY CASH MOVEMENTS SECTION (CASH-03)
  pettyCashSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
    marginTop: 20,
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  pettyCashSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 12,
  },
  pettyCashSectionHeaderMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  pettyCashTitleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  pettyCashSectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  cashBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  cashBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
  },
  pettyCashSectionSubtitle: {
    fontSize: 13,
    color: '#64748B',
  },
  pettyCashHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pettyCashHeaderRightMobile: {
    width: '100%',
    justifyContent: 'space-between',
  },
  pettyCashSummaryChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pettySummaryChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pettySummaryIn: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  pettySummaryOut: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  pettySummaryChipLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  pettySummaryChipValueIn: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
  },
  pettySummaryChipValueOut: {
    fontSize: 12,
    fontWeight: '800',
    color: '#DC2626',
  },
  recordMovementBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0F766E',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    cursor: 'pointer',
  },
  recordMovementBtnHovered: {
    backgroundColor: '#115E59',
  },
  recordMovementBtnIcon: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  recordMovementBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyMovementsBox: {
    paddingVertical: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyMovementsIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyMovementsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  emptyMovementsSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    maxWidth: 420,
    marginBottom: 16,
  },
  emptyRecordBtn: {
    backgroundColor: '#0F766E',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    cursor: 'pointer',
  },
  emptyRecordBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  movementsTable: {
    width: '100%',
    minWidth: 900,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  movementsTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  movementsTh: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  movementsTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  movementsTableRowLast: {
    borderBottomWidth: 0,
  },
  movIdText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F766E',
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  movementsTd: {
    fontSize: 13,
  },
  movementTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  badgeCashIn: {
    backgroundColor: '#ECFDF5',
  },
  badgeCashOut: {
    backgroundColor: '#FEF2F2',
  },
  movementTypeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  badgeTextCashIn: {
    color: '#059669',
  },
  badgeTextCashOut: {
    color: '#DC2626',
  },
  deleteMovBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  deleteMovBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  historyMovementsRow: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  historyMovementsSummaryText: {
    fontSize: 12,
    color: '#0F766E',
    fontWeight: '600',
  },

  // Highlight & Banner
  justAddedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#6EE7B7',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  justAddedBannerText: {
    fontSize: 13,
    color: '#065F46',
    fontWeight: '600',
  },
  movementsTableRowHighlight: {
    backgroundColor: '#F0FDF4',
    borderLeftWidth: 4,
    borderLeftColor: '#059669',
  },
  justAddedBadge: {
    backgroundColor: '#059669',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  justAddedBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  modalErrorBox: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
  },
  modalErrorText: {
    color: '#991B1B',
    fontSize: 12,
    fontWeight: '700',
  },
  quickChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  quickChipBtn: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    cursor: 'pointer',
  },
  quickChipBtnActiveIn: {
    backgroundColor: '#CCFBF1',
    borderColor: '#0F766E',
  },
  quickChipBtnActiveOut: {
    backgroundColor: '#FEE2E2',
    borderColor: '#DC2626',
  },
  quickChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  quickChipTextActiveIn: {
    color: '#0F766E',
    fontWeight: '700',
  },
  quickChipTextActiveOut: {
    color: '#DC2626',
    fontWeight: '700',
  },
  modalSubmitHint: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
    marginBottom: 14,
  },
  // Mobile KPI Cards for Petty Cash Movements
  mobileMovementsList: {
    gap: 10,
    paddingVertical: 6,
  },
  mobileMovementCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 14,
    ...Platform.select({
      web: { boxShadow: '0 1px 2px rgba(0,0,0,0.03)' },
      default: { elevation: 1 },
    }),
  },
  mobileMovementCardHighlight: {
    borderColor: '#6EE7B7',
    backgroundColor: '#F0FDF4',
  },
  mobileMovementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  mobileMovementReason: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 10,
    lineHeight: 18,
  },
  mobileMovementFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  mobileMovementTime: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '500',
  },
  mobileMovementCashier: {
    fontSize: 11.5,
    color: '#475569',
    fontWeight: '600',
    marginTop: 2,
  },
  mobileMovementAmount: {
    fontSize: 15,
    fontWeight: '800',
  },

  // Mobile KPI Cards for Register History Modal
  mobileHistoryList: {
    gap: 12,
    paddingVertical: 6,
  },
  mobileHistoryCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 14,
    ...Platform.select({
      web: { boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
      default: { elevation: 1 },
    }),
  },
  mobileHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  mobileHistoryDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  mobileHistoryLabel: {
    fontSize: 12.5,
    color: '#64748B',
  },
  mobileHistoryShiftBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  mobileHistoryShiftText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  mobileHistoryMetricsGrid: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    justifyContent: 'space-between',
  },
  mobileHistoryMetricItem: {
    alignItems: 'center',
    flex: 1,
  },
  mobileHistoryMetricLabel: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  mobileHistoryMetricVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  mobileHistoryMovementsBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
});
