import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  fetchPayments,
  processRefund,
  createPaymentOrder,
  verifyPayment,
  fetchPharmacies,
  fetchSubscriptionPlans,
} from '../../api/superadminApi';

export type PaymentStatus = 'Success' | 'Pending' | 'Failed' | 'Refunded';

export type Payment = {
  id: string;
  pharmacyName: string;
  razorpayPaymentId: string;
  razorpayOrderId: string;
  amount: string;
  rawAmount: number;
  paymentDate: string;
  isoDate: string; // YYYY-MM-DD
  monthKey: string;
  day: number;
  status: PaymentStatus;
};

const PAYMENTS: Payment[] = [
  // September 2026
  {
    id: '1',
    pharmacyName: 'Kailash Pharmacy',
    razorpayPaymentId: 'pay_MF8dk2xSa1',
    razorpayOrderId: 'order_FC20266991',
    amount: '₹39,999',
    rawAmount: 39999,
    paymentDate: '01 Sep 2026, 10:32 AM',
    isoDate: '2026-09-01',
    monthKey: '2026-09',
    day: 1,
    status: 'Success',
  },
  {
    id: '2',
    pharmacyName: 'Apex Care Chemist',
    razorpayPaymentId: 'pay_Ap9x87kL21',
    razorpayOrderId: 'order_FC20266995',
    amount: '₹19,999',
    rawAmount: 19999,
    paymentDate: '03 Sep 2026, 02:15 PM',
    isoDate: '2026-09-03',
    monthKey: '2026-09',
    day: 3,
    status: 'Success',
  },
  {
    id: '3',
    pharmacyName: 'Noble Pharmacy',
    razorpayPaymentId: 'pay_Nb3k90sP88',
    razorpayOrderId: 'order_FC20266998',
    amount: '₹9,999',
    rawAmount: 9999,
    paymentDate: '05 Sep 2026, 11:40 AM',
    isoDate: '2026-09-05',
    monthKey: '2026-09',
    day: 5,
    status: 'Pending',
  },
  {
    id: '4',
    pharmacyName: 'GreenCross Meds',
    razorpayPaymentId: 'pay_Gc88s7kQ12',
    razorpayOrderId: 'order_FC20267002',
    amount: '₹39,999',
    rawAmount: 39999,
    paymentDate: '07 Sep 2026, 09:20 AM',
    isoDate: '2026-09-07',
    monthKey: '2026-09',
    day: 7,
    status: 'Success',
  },
  {
    id: '5',
    pharmacyName: 'Apollo Medico',
    razorpayPaymentId: 'pay_Ap11m9xK54',
    razorpayOrderId: 'order_FC20267010',
    amount: '₹49,999',
    rawAmount: 49999,
    paymentDate: '08 Sep 2026, 04:55 PM',
    isoDate: '2026-09-08',
    monthKey: '2026-09',
    day: 8,
    status: 'Refunded',
  },
  {
    id: '6',
    pharmacyName: 'Delta Pharma',
    razorpayPaymentId: 'pay_Dt44p2xN99',
    razorpayOrderId: 'order_FC20267015',
    amount: '₹19,999',
    rawAmount: 19999,
    paymentDate: '09 Sep 2026, 01:10 PM',
    isoDate: '2026-09-09',
    monthKey: '2026-09',
    day: 9,
    status: 'Failed',
  },

  // August 2026
  {
    id: '7',
    pharmacyName: 'City Medico',
    razorpayPaymentId: 'pay_Lk2d9fS80d',
    razorpayOrderId: 'order_FC20266830',
    amount: '₹9,999',
    rawAmount: 9999,
    paymentDate: '30 Aug 2026, 04:12 PM',
    isoDate: '2026-08-30',
    monthKey: '2026-08',
    day: 30,
    status: 'Success',
  },
  {
    id: '8',
    pharmacyName: 'HealthCare Pharmacy',
    razorpayPaymentId: 'pay_T9s2k8Pd3',
    razorpayOrderId: 'order_FC20266828',
    amount: '₹39,999',
    rawAmount: 39999,
    paymentDate: '28 Aug 2026, 01:21 PM',
    isoDate: '2026-08-28',
    monthKey: '2026-08',
    day: 28,
    status: 'Failed',
  },
  {
    id: '9',
    pharmacyName: 'Sunrise Medicos',
    razorpayPaymentId: 'pay_Q8k2ntSd9',
    razorpayOrderId: 'order_FC20266827',
    amount: '₹19,999',
    rawAmount: 19999,
    paymentDate: '27 Aug 2026, 11:05 AM',
    isoDate: '2026-08-27',
    monthKey: '2026-08',
    day: 27,
    status: 'Success',
  },
  {
    id: '10',
    pharmacyName: 'LifeCare Pharmacy',
    razorpayPaymentId: 'pay_P3d9k2Lm0',
    razorpayOrderId: 'order_FC20266825',
    amount: '₹9,999',
    rawAmount: 9999,
    paymentDate: '25 Aug 2026, 03:44 PM',
    isoDate: '2026-08-25',
    monthKey: '2026-08',
    day: 25,
    status: 'Pending',
  },
  {
    id: '11',
    pharmacyName: 'MedPlus Pharmacy',
    razorpayPaymentId: 'pay_A9k1m3Sd2',
    razorpayOrderId: 'order_FC20266822',
    amount: '₹49,999',
    rawAmount: 49999,
    paymentDate: '22 Aug 2026, 12:10 PM',
    isoDate: '2026-08-22',
    monthKey: '2026-08',
    day: 22,
    status: 'Success',
  },
  {
    id: '12',
    pharmacyName: 'Guardian Drugs',
    razorpayPaymentId: 'pay_Gd77x2mP11',
    razorpayOrderId: 'order_FC20266818',
    amount: '₹19,999',
    rawAmount: 19999,
    paymentDate: '15 Aug 2026, 02:30 PM',
    isoDate: '2026-08-15',
    monthKey: '2026-08',
    day: 15,
    status: 'Refunded',
  },
  {
    id: '13',
    pharmacyName: 'Aliya Pharmacy',
    razorpayPaymentId: 'pay_K8d1m3Np0',
    razorpayOrderId: 'order_FC20266802',
    amount: '₹39,999',
    rawAmount: 39999,
    paymentDate: '02 Aug 2026, 03:12 PM',
    isoDate: '2026-08-02',
    monthKey: '2026-08',
    day: 2,
    status: 'Success',
  },

  // July 2026
  {
    id: '14',
    pharmacyName: 'Wellspring Chemist',
    razorpayPaymentId: 'pay_Ws55k9pL32',
    razorpayOrderId: 'order_FC20266750',
    amount: '₹29,999',
    rawAmount: 29999,
    paymentDate: '28 Jul 2026, 11:00 AM',
    isoDate: '2026-07-28',
    monthKey: '2026-07',
    day: 28,
    status: 'Success',
  },
  {
    id: '15',
    pharmacyName: 'National Meds',
    razorpayPaymentId: 'pay_Nm12x8rT45',
    razorpayOrderId: 'order_FC20266742',
    amount: '₹9,999',
    rawAmount: 9999,
    paymentDate: '14 Jul 2026, 05:22 PM',
    isoDate: '2026-07-14',
    monthKey: '2026-07',
    day: 14,
    status: 'Success',
  },
  {
    id: '16',
    pharmacyName: 'TrustCare Pharmacy',
    razorpayPaymentId: 'pay_Tc99m2vB77',
    razorpayOrderId: 'order_FC20266720',
    amount: '₹39,999',
    rawAmount: 39999,
    paymentDate: '06 Jul 2026, 10:15 AM',
    isoDate: '2026-07-06',
    monthKey: '2026-07',
    day: 6,
    status: 'Success',
  },
];

type MonthKey = 'ALL' | '2026-09' | '2026-08' | '2026-07';

const MONTH_DATA: Record<
  string,
  { label: string; short: string; days: number; startOffset: number; rangeText: string }
> = {
  '2026-09': {
    label: 'September 2026',
    short: 'Sep 2026',
    days: 30,
    startOffset: 2, // Tuesday
    rangeText: '01 Sep 2026 - 30 Sep 2026',
  },
  '2026-08': {
    label: 'August 2026',
    short: 'Aug 2026',
    days: 31,
    startOffset: 6, // Saturday
    rangeText: '01 Aug 2026 - 31 Aug 2026',
  },
  '2026-07': {
    label: 'July 2026',
    short: 'Jul 2026',
    days: 31,
    startOffset: 3, // Wednesday
    rangeText: '01 Jul 2026 - 31 Jul 2026',
  },
};

const STATUS_OPTIONS: Array<'All Status' | PaymentStatus> = [
  'All Status',
  'Success',
  'Pending',
  'Failed',
  'Refunded',
];

function mapBackendPayment(p: any): Payment {
  const d = new Date(p.created_at || Date.now());
  const isoDate = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : '2026-09-01';
  const monthKey = isoDate.slice(0, 7);
  const day = !isNaN(d.getTime()) ? d.getDate() : 1;
  const rawAmount = Number(p.total_amount || 0);

  let status: PaymentStatus = 'Pending';
  if (p.status === 'SUCCESS') status = 'Success';
  else if (p.status === 'FAILED') status = 'Failed';
  else if (p.status === 'REFUNDED' || p.status === 'PARTIALLY_REFUNDED') status = 'Refunded';

  const dateFormatted = !isNaN(d.getTime())
    ? d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '01 Sep 2026';

  return {
    id: p.id,
    pharmacyName: p.pharmacy_name || 'Pharmacy',
    razorpayPaymentId: p.razorpay_payment_id || 'pay_pending',
    razorpayOrderId: p.razorpay_order_id || 'order_pending',
    amount: `₹${rawAmount.toLocaleString('en-IN')}`,
    rawAmount,
    paymentDate: dateFormatted,
    isoDate,
    monthKey,
    day,
    status,
  };
}

export default function RazorPayPaymentsPage() {
  const params = useLocalSearchParams<{
    planId?: string;
    planName?: string;
    planPrice?: string;
    billingCycle?: string;
  }>();

  const [payments, setPayments] = useState<Payment[]>(PAYMENTS);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'All Status' | PaymentStatus>('All Status');
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);

  // Month and Date Selection State
  const [selectedMonth, setSelectedMonth] = useState<MonthKey>('ALL');
  const [selectedDate, setSelectedDate] = useState<string | null>(null); // Specific 'YYYY-MM-DD'
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [viewingMonthKey, setViewingMonthKey] = useState<'2026-09' | '2026-08' | '2026-07'>('2026-09');

  const loadPayments = useCallback(async () => {
    try {
      const res = await fetchPayments({
        search: search.trim() || undefined,
        status: status !== 'All Status' ? status : undefined,
        month: selectedMonth !== 'ALL' ? selectedMonth : undefined,
        date: selectedDate || undefined,
        limit: 50,
      });

      if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
        const live = res.data.map(mapBackendPayment);
        setPayments(live);
      }
    } catch (err) {
      console.warn('Backend payment fetch warning, keeping existing state:', err);
    }
  }, [search, status, selectedMonth, selectedDate]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const handleSimulatePayment = async () => {
    if (isProcessingAction) return;
    setIsProcessingAction(true);
    try {
      const [pharmRes, plansRes] = await Promise.all([
        fetchPharmacies({ limit: 5 }),
        fetchSubscriptionPlans(true),
      ]);
      const org = pharmRes?.data?.[0];
      const plan = plansRes?.data?.[0];

      if (!org) {
        Alert.alert('Simulate Payment', 'No pharmacy found to simulate payment.');
        return;
      }

      const orderRes = await createPaymentOrder({
        organisationId: org.id,
        planId: plan?.id,
        billingCycle: 'YEARLY',
      });

      if (orderRes && orderRes.data && orderRes.data.razorpayOrderId) {
        await verifyPayment({
          razorpay_order_id: orderRes.data.razorpayOrderId,
          razorpay_payment_id: `pay_sim_${Date.now()}`,
          razorpay_signature: `sim_sig_${Date.now()}`,
        });
        Alert.alert('Payment Succeeded', `Simulated payment processed for ${org.name}`);
        await loadPayments();
      }
    } catch (err: any) {
      Alert.alert('Simulation Error', err.message || 'Payment simulation failed.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleRefund = async (payment: Payment) => {
    if (isProcessingAction) return;
    setIsProcessingAction(true);
    try {
      await processRefund(payment.id, {
        reason: 'Requested by Super Administrator',
      });
      Alert.alert('Refund Processed', `Refund completed successfully for ${payment.pharmacyName}`);
      await loadPayments();
    } catch (err: any) {
      Alert.alert('Refund Failed', err.message || 'Could not process refund.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Filter payments by date/month FIRST for KPI calculations
  const dateFilteredPayments = useMemo(() => {
    return payments.filter((payment) => {
      if (selectedDate) {
        return payment.isoDate === selectedDate;
      }
      if (selectedMonth === 'ALL') {
        return true;
      }
      return payment.monthKey === selectedMonth;
    });
  }, [payments, selectedMonth, selectedDate]);

  // Dynamically calculate KPIs for the chosen month / date range
  const metrics = useMemo(() => {
    let collectedSum = 0;
    let successfulCount = 0;
    let pendingSum = 0;
    let pendingCount = 0;
    let failedSum = 0;
    let failedCount = 0;
    let refundedSum = 0;
    let refundedCount = 0;

    dateFilteredPayments.forEach((p) => {
      if (p.status === 'Success') {
        collectedSum += p.rawAmount;
        successfulCount += 1;
      } else if (p.status === 'Pending') {
        pendingSum += p.rawAmount;
        pendingCount += 1;
      } else if (p.status === 'Failed') {
        failedSum += p.rawAmount;
        failedCount += 1;
      } else if (p.status === 'Refunded') {
        refundedSum += p.rawAmount;
        refundedCount += 1;
      }
    });

    const formatINR = (val: number) => `₹${val.toLocaleString('en-IN')}`;

    return {
      totalCollected: formatINR(collectedSum),
      successfulValue: formatINR(collectedSum),
      successfulCount,
      pendingValue: formatINR(pendingSum),
      pendingCount,
      failedValue: formatINR(failedSum),
      failedCount,
      refundedValue: formatINR(refundedSum),
      refundedCount,
      totalTransactions: dateFilteredPayments.length,
    };
  }, [dateFilteredPayments]);

  // Final filtered list including search and status dropdown
  const displayedPayments = useMemo(() => {
    return dateFilteredPayments.filter((payment) => {
      const searchableText = `${payment.pharmacyName} ${payment.razorpayPaymentId} ${payment.razorpayOrderId}`.toLowerCase();
      const matchesSearch = searchableText.includes(search.toLowerCase());
      const matchesStatus = status === 'All Status' || payment.status === status;

      return matchesSearch && matchesStatus;
    });
  }, [dateFilteredPayments, search, status]);

  // Calendar label display
  const dateFilterLabel = useMemo(() => {
    if (selectedDate) {
      const p = PAYMENTS.find((item) => item.isoDate === selectedDate);
      return p ? p.paymentDate.split(',')[0] : selectedDate;
    }
    if (selectedMonth === 'ALL') {
      return 'All Months (Jul - Sep 2026)';
    }
    return MONTH_DATA[selectedMonth]?.rangeText || selectedMonth;
  }, [selectedMonth, selectedDate]);

  // Handle switching calendar month view
  const handlePrevMonth = () => {
    if (viewingMonthKey === '2026-09') setViewingMonthKey('2026-08');
    else if (viewingMonthKey === '2026-08') setViewingMonthKey('2026-07');
  };

  const handleNextMonth = () => {
    if (viewingMonthKey === '2026-07') setViewingMonthKey('2026-08');
    else if (viewingMonthKey === '2026-08') setViewingMonthKey('2026-09');
  };

  const selectMonthFilter = (mKey: MonthKey) => {
    setSelectedMonth(mKey);
    setSelectedDate(null);
    if (mKey !== 'ALL') {
      setViewingMonthKey(mKey);
    }
    setCalendarOpen(false);
  };

  const selectDayFilter = (dayNum: number) => {
    const paddedDay = dayNum < 10 ? `0${dayNum}` : `${dayNum}`;
    const iso = `${viewingMonthKey}-${paddedDay}`;
    setSelectedDate(iso);
    setSelectedMonth(viewingMonthKey);
    setCalendarOpen(false);
  };

  const activeMonthConfig = MONTH_DATA[viewingMonthKey];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      onScrollBeginDrag={() => {
        if (statusDropdownOpen) setStatusDropdownOpen(false);
        if (calendarOpen) setCalendarOpen(false);
      }}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Razorpay Payment Center</Text>
          <Text style={styles.subtitle}>
            Monitor online transactions, monthly collections, refunds, and gateway statuses.
          </Text>
        </View>

        <View style={styles.activeScopeBadge}>
          <Text style={styles.activeScopeText}>
            🗓 Active Period: {selectedDate ? selectedDate : selectedMonth === 'ALL' ? 'All Records' : MONTH_DATA[selectedMonth]?.label}
          </Text>
        </View>
      </View>

      {/* Plan Selection Banner if routed directly from Subscription Plans */}
      {params.planName && (
        <View style={styles.planBanner}>
          <View style={styles.planBannerIcon}>
            <Text style={styles.planBannerIconText}>⚡</Text>
          </View>
          <View style={styles.planBannerInfo}>
            <View style={styles.planBannerTag}>
              <Text style={styles.planBannerTagText}>DIRECT CHECKOUT READY</Text>
            </View>
            <Text style={styles.planBannerTitle}>
              Selected Plan: {params.planName} ({params.planPrice}/{params.billingCycle})
            </Text>
            <Text style={styles.planBannerDesc}>
              Bypassed intermediate forms. Razorpay payment intent is configured and ready for live checkout.
            </Text>
          </View>
          <Pressable
            style={styles.simulatePayBtn}
            onPress={handleSimulatePayment}
          >
            <Text style={styles.simulatePayBtnText}>Simulate Razorpay Pay →</Text>
          </Pressable>
        </View>
      )}

      {/* Dynamic Executive KPI Cards */}
      <View style={styles.statsRow}>
        <PaymentKpiCard
          title="Total Collected"
          value={metrics.totalCollected}
          subtitle={`${metrics.successfulCount} successful payments`}
          color="#DFF5ED"
          badgeColor="#E8F8F0"
          badgeTextColor="#047857"
          badgeText="Active Revenue"
          icon="▣"
        />

        <PaymentKpiCard
          title="Successful"
          value={metrics.successfulValue}
          subtitle={`${metrics.successfulCount} completed`}
          color="#E7F0FF"
          badgeColor="#EEF4FF"
          badgeTextColor="#1D4ED8"
          badgeText={metrics.totalTransactions > 0 ? `${Math.round((metrics.successfulCount / metrics.totalTransactions) * 100)}% Success` : '0%'}
          icon="✓"
        />

        <PaymentKpiCard
          title="Pending"
          value={metrics.pendingValue}
          subtitle={`${metrics.pendingCount} awaiting bank`}
          color="#FFF4D9"
          badgeColor="#FEF3C7"
          badgeTextColor="#B45309"
          badgeText="In Gateway"
          icon="◷"
        />

        <PaymentKpiCard
          title="Failed"
          value={metrics.failedValue}
          subtitle={`${metrics.failedCount} drops`}
          color="#FEE2E2"
          badgeColor="#FEE2E2"
          badgeTextColor="#B91C1C"
          badgeText="Declined"
          icon="×"
        />

        <PaymentKpiCard
          title="Refunded"
          value={metrics.refundedValue}
          subtitle={`${metrics.refundedCount} processed`}
          color="#F0E8FF"
          badgeColor="#F3E8FF"
          badgeTextColor="#7E22CE"
          badgeText="Reversed"
          icon="↶"
        />
      </View>

      {/* Quick Month Filter Bar */}
      <View style={styles.quickMonthsBar}>
        <Text style={styles.quickMonthsLabel}>Select Month:</Text>
        <Pressable
          style={[styles.monthPill, selectedMonth === 'ALL' && !selectedDate && styles.monthPillActive]}
          onPress={() => selectMonthFilter('ALL')}
        >
          <Text style={[styles.monthPillText, selectedMonth === 'ALL' && !selectedDate && styles.monthPillTextActive]}>
            All Months
          </Text>
        </Pressable>

        <Pressable
          style={[styles.monthPill, selectedMonth === '2026-09' && !selectedDate && styles.monthPillActive]}
          onPress={() => selectMonthFilter('2026-09')}
        >
          <Text style={[styles.monthPillText, selectedMonth === '2026-09' && !selectedDate && styles.monthPillTextActive]}>
            September 2026
          </Text>
        </Pressable>

        <Pressable
          style={[styles.monthPill, selectedMonth === '2026-08' && !selectedDate && styles.monthPillActive]}
          onPress={() => selectMonthFilter('2026-08')}
        >
          <Text style={[styles.monthPillText, selectedMonth === '2026-08' && !selectedDate && styles.monthPillTextActive]}>
            August 2026
          </Text>
        </Pressable>

        <Pressable
          style={[styles.monthPill, selectedMonth === '2026-07' && !selectedDate && styles.monthPillActive]}
          onPress={() => selectMonthFilter('2026-07')}
        >
          <Text style={[styles.monthPillText, selectedMonth === '2026-07' && !selectedDate && styles.monthPillTextActive]}>
            July 2026
          </Text>
        </Pressable>

        {selectedDate && (
          <View style={styles.specificDateTag}>
            <Text style={styles.specificDateTagText}>Day: {selectedDate}</Text>
            <Pressable onPress={() => setSelectedDate(null)} style={styles.clearDateBtn}>
              <Text style={styles.clearDateBtnText}>✕</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Filter Row with elevated zIndex */}
      <View style={styles.filterRow}>
        {/* Search */}
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search pharmacy name, Razorpay payment ID, order ID..."
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
          />
        </View>

        {/* All Status Dropdown - High zIndex */}
        <View style={styles.statusDropdownContainer}>
          <Pressable
            style={styles.statusButton}
            onPress={() => {
              setStatusDropdownOpen(!statusDropdownOpen);
              if (calendarOpen) setCalendarOpen(false);
            }}
          >
            <Text style={styles.filterText}>{status}</Text>
            <Text style={styles.arrow}>{statusDropdownOpen ? '▴' : '▾'}</Text>
          </Pressable>

          {statusDropdownOpen && (
            <View style={styles.dropdownMenu}>
              {STATUS_OPTIONS.map((item) => {
                const isSelected = status === item;
                return (
                  <Pressable
                    key={item}
                    style={[styles.dropdownItem, isSelected && styles.dropdownItemSelected]}
                    onPress={() => {
                      setStatus(item);
                      setStatusDropdownOpen(false);
                    }}
                  >
                    <View style={styles.dropdownItemLeft}>
                      {item === 'Success' && <View style={[styles.statusDot, { backgroundColor: '#10B981' }]} />}
                      {item === 'Pending' && <View style={[styles.statusDot, { backgroundColor: '#F59E0B' }]} />}
                      {item === 'Failed' && <View style={[styles.statusDot, { backgroundColor: '#EF4444' }]} />}
                      {item === 'Refunded' && <View style={[styles.statusDot, { backgroundColor: '#8B5CF6' }]} />}
                      {item === 'All Status' && <View style={[styles.statusDot, { backgroundColor: '#64748B' }]} />}
                      <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextSelected]}>
                        {item}
                      </Text>
                    </View>
                    {isSelected && <Text style={styles.checkIcon}>✓</Text>}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* Calendar / Date Filter Button - High zIndex */}
        <View style={styles.calendarContainer}>
          <Pressable
            style={styles.dateFilterButton}
            onPress={() => {
              setCalendarOpen(!calendarOpen);
              if (statusDropdownOpen) setStatusDropdownOpen(false);
            }}
          >
            <Text style={styles.calendarIcon}>📅</Text>
            <Text style={styles.dateFilterButtonText} numberOfLines={1}>
              {dateFilterLabel}
            </Text>
            <Text style={styles.arrow}>{calendarOpen ? '▴' : '▾'}</Text>
          </Pressable>

          {calendarOpen && (
            <View style={styles.calendarPopover}>
              {/* Popover Header */}
              <View style={styles.calHeader}>
                <Pressable
                  style={styles.calNavBtn}
                  onPress={handlePrevMonth}
                  disabled={viewingMonthKey === '2026-07'}
                >
                  <Text style={[styles.calNavText, viewingMonthKey === '2026-07' && styles.calNavDisabled]}>
                    ‹
                  </Text>
                </Pressable>

                <Text style={styles.calMonthHeading}>{activeMonthConfig.label}</Text>

                <Pressable
                  style={styles.calNavBtn}
                  onPress={handleNextMonth}
                  disabled={viewingMonthKey === '2026-09'}
                >
                  <Text style={[styles.calNavText, viewingMonthKey === '2026-09' && styles.calNavDisabled]}>
                    ›
                  </Text>
                </Pressable>
              </View>

              {/* Quick Month Switcher in Calendar */}
              <View style={styles.calQuickMonths}>
                {(['2026-09', '2026-08', '2026-07'] as const).map((mKey) => (
                  <Pressable
                    key={mKey}
                    style={[
                      styles.calMonthTab,
                      viewingMonthKey === mKey && styles.calMonthTabActive,
                    ]}
                    onPress={() => {
                      setViewingMonthKey(mKey);
                      setSelectedMonth(mKey);
                      setSelectedDate(null);
                    }}
                  >
                    <Text
                      style={[
                        styles.calMonthTabText,
                        viewingMonthKey === mKey && styles.calMonthTabTextActive,
                      ]}
                    >
                      {MONTH_DATA[mKey].short}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Days of Week Header */}
              <View style={styles.calWeekHeader}>
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
                  <Text key={day} style={styles.calWeekDay}>
                    {day}
                  </Text>
                ))}
              </View>

              {/* Day Grid */}
              <View style={styles.calGrid}>
                {/* Empty cells before start day */}
                {Array.from({ length: activeMonthConfig.startOffset }).map((_, i) => (
                  <View key={`empty-${i}`} style={styles.calDayCell} />
                ))}

                {/* Days of Month */}
                {Array.from({ length: activeMonthConfig.days }).map((_, i) => {
                  const dayNum = i + 1;
                  const paddedDay = dayNum < 10 ? `0${dayNum}` : `${dayNum}`;
                  const currentIso = `${viewingMonthKey}-${paddedDay}`;
                  const isDaySelected = selectedDate === currentIso;

                  // Check if any payment happened on this day
                  const hasPayment = PAYMENTS.some((p) => p.isoDate === currentIso);

                  return (
                    <Pressable
                      key={`day-${dayNum}`}
                      style={[
                        styles.calDayCell,
                        isDaySelected && styles.calDayCellSelected,
                      ]}
                      onPress={() => selectDayFilter(dayNum)}
                    >
                      <Text
                        style={[
                          styles.calDayText,
                          isDaySelected && styles.calDayTextSelected,
                        ]}
                      >
                        {dayNum}
                      </Text>
                      {hasPayment && !isDaySelected && (
                        <View style={styles.calEventDot} />
                      )}
                    </Pressable>
                  );
                })}
              </View>

              {/* Popover Footer actions */}
              <View style={styles.calFooter}>
                <Pressable
                  style={styles.calFullMonthBtn}
                  onPress={() => selectMonthFilter(viewingMonthKey)}
                >
                  <Text style={styles.calFullMonthBtnText}>
                    Select Full {activeMonthConfig.short}
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.calResetBtn}
                  onPress={() => selectMonthFilter('ALL')}
                >
                  <Text style={styles.calResetBtnText}>Reset / All Months</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Transactions Table Card (zIndex: 1 so dropdowns float over it) */}
      <View style={styles.tableCard}>
        <View style={styles.tableTopMeta}>
          <Text style={styles.tableMetaText}>
            Showing <Text style={styles.boldText}>{displayedPayments.length}</Text> of {dateFilteredPayments.length} transactions for {selectedDate ? selectedDate : selectedMonth === 'ALL' ? 'All Months' : MONTH_DATA[selectedMonth]?.label}
          </Text>
          {status !== 'All Status' && (
            <View style={styles.statusFilteredNotice}>
              <Text style={styles.statusFilteredNoticeText}>Filter: {status}</Text>
              <Pressable onPress={() => setStatus('All Status')}>
                <Text style={styles.clearStatusText}>✕</Text>
              </Pressable>
            </View>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.tableWidth}>
            <View style={styles.tableHeader}>
              <Text style={[styles.heading, styles.pharmacyColumn]}>
                PHARMACY NAME
              </Text>
              <Text style={[styles.heading, styles.paymentIdColumn]}>
                RAZORPAY PAYMENT ID
              </Text>
              <Text style={[styles.heading, styles.orderIdColumn]}>
                RAZORPAY ORDER ID
              </Text>
              <Text style={[styles.heading, styles.amountColumn]}>
                AMOUNT
              </Text>
              <Text style={[styles.heading, styles.dateColumn]}>
                PAYMENT DATE & TIME
              </Text>
              <Text style={[styles.heading, styles.statusColumn]}>
                STATUS
              </Text>
            </View>

            {displayedPayments.map((payment) => (
              <View style={styles.tableRow} key={payment.id}>
                <View style={styles.pharmacyColumn}>
                  <Text style={styles.pharmacyCellName}>{payment.pharmacyName}</Text>
                  <Text style={styles.pharmacyCellSub}>Registered Entity</Text>
                </View>

                <Text style={[styles.cell, styles.paymentIdColumn]}>
                  {payment.razorpayPaymentId}
                </Text>

                <Text style={[styles.cell, styles.orderIdColumn]}>
                  {payment.razorpayOrderId}
                </Text>

                <Text style={[styles.amount, styles.amountColumn]}>
                  {payment.amount}
                </Text>

                <Text style={[styles.cell, styles.dateColumn]}>
                  {payment.paymentDate}
                </Text>

                <View style={[styles.statusColumn, styles.statusActionRow]}>
                  <StatusBadge status={payment.status} />
                  {payment.status === 'Success' && (
                    <Pressable
                      style={styles.refundBtn}
                      onPress={() => handleRefund(payment)}
                    >
                      <Text style={styles.refundBtnText}>Refund</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ))}

            {displayedPayments.length === 0 && (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyIcon}>💳</Text>
                <Text style={styles.emptyTitle}>No payments found</Text>
                <Text style={styles.emptyText}>
                  No transactions match your search, status ({status}), or date ({dateFilterLabel}).
                </Text>
                <Pressable
                  style={styles.resetSearchBtn}
                  onPress={() => {
                    setSearch('');
                    setStatus('All Status');
                    setSelectedMonth('ALL');
                    setSelectedDate(null);
                  }}
                >
                  <Text style={styles.resetSearchBtnText}>Reset All Filters</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.footer}>
              <Text style={styles.footerText}>
                Showing 1-{displayedPayments.length} of {displayedPayments.length} transactions
              </Text>

              <View style={styles.pagination}>
                <Pressable style={styles.pageButton}>
                  <Text style={styles.pageArrow}>‹</Text>
                </Pressable>

                <Pressable style={[styles.pageButton, styles.activePage]}>
                  <Text style={styles.activePageText}>1</Text>
                </Pressable>

                <Pressable style={styles.pageButton}>
                  <Text style={styles.pageText}>2</Text>
                </Pressable>

                <Pressable style={styles.pageButton}>
                  <Text style={styles.pageArrow}>›</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    </ScrollView>
  );
}

function PaymentKpiCard({
  title,
  value,
  subtitle,
  color,
  badgeColor,
  badgeTextColor,
  badgeText,
  icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  color: string;
  badgeColor: string;
  badgeTextColor: string;
  badgeText: string;
  icon: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statTopRow}>
        <View style={[styles.statIcon, { backgroundColor: color }]}>
          <Text style={styles.statIconText}>{icon}</Text>
        </View>
        <View style={[styles.kpiBadge, { backgroundColor: badgeColor }]}>
          <Text style={[styles.kpiBadgeText, { color: badgeTextColor }]}>
            {badgeText}
          </Text>
        </View>
      </View>

      <Text style={styles.statTitle}>{title}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statSubtitle}>{subtitle}</Text>
    </View>
  );
}

function StatusBadge({ status }: { status: PaymentStatus | string }) {
  const norm = (status || '').toUpperCase();
  let badgeStyles = styles.pendingBadge;
  if (norm === 'SUCCESS' || norm === 'CAPTURED' || norm === 'PAID') {
    badgeStyles = styles.successBadge;
  } else if (norm === 'REFUNDED') {
    badgeStyles = styles.refundedBadge;
  } else if (norm === 'FAILED') {
    badgeStyles = styles.failedBadge;
  }

  return <Text style={[styles.statusBadge, badgeStyles]}>{status || 'Pending'}</Text>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 24,
    paddingBottom: 60,
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    color: '#0F172A',
    fontSize: 26,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 4,
    color: '#64748B',
    fontSize: 13,
  },
  activeScopeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  activeScopeText: {
    color: '#0369A1',
    fontSize: 12,
    fontWeight: '700',
  },

  // Plan Banner
  planBanner: {
    marginTop: 18,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  planBannerIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planBannerIconText: {
    fontSize: 20,
    color: '#FFFFFF',
  },
  planBannerInfo: {
    flex: 1,
    minWidth: 260,
  },
  planBannerTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#22C55E',
    marginBottom: 4,
  },
  planBannerTagText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  planBannerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  planBannerDesc: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  simulatePayBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#2563EB',
  },
  simulatePayBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  // KPI Row
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 20,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    minWidth: 180,
    minHeight: 125,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  statTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statIconText: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '900',
  },
  kpiBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  kpiBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  statTitle: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  statValue: {
    marginTop: 4,
    color: '#0F172A',
    fontSize: 22,
    fontWeight: '900',
  },
  statSubtitle: {
    marginTop: 4,
    color: '#94A3B8',
    fontSize: 11,
  },

  // Quick Month bar
  quickMonthsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  quickMonthsLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginRight: 4,
  },
  monthPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  monthPillActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  monthPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  monthPillTextActive: {
    color: '#FFFFFF',
  },
  specificDateTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  specificDateTagText: {
    color: '#92400E',
    fontSize: 11,
    fontWeight: '800',
  },
  clearDateBtn: {
    padding: 2,
  },
  clearDateBtnText: {
    color: '#92400E',
    fontSize: 10,
    fontWeight: '900',
  },

  // Filter Row & Stacking Context
  filterRow: {
    position: 'relative',
    zIndex: 9999,
    elevation: 50,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  searchBox: {
    flex: 1,
    minWidth: 280,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchIcon: {
    marginRight: 8,
    color: '#64748B',
    fontSize: 18,
  },
  searchInput: {
    flex: 1,
    color: '#0F172A',
    fontSize: 13,
  },

  // Status Dropdown Container
  statusDropdownContainer: {
    position: 'relative',
    zIndex: 10000,
  },
  statusButton: {
    width: 140,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '700',
  },
  arrow: {
    color: '#64748B',
    fontSize: 14,
  },
  dropdownMenu: {
    position: 'absolute',
    top: 48,
    left: 0,
    width: 170,
    zIndex: 10001,
    elevation: 60,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dropdownItemSelected: {
    backgroundColor: '#F1F5F9',
  },
  dropdownItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dropdownItemText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
  },
  dropdownItemTextSelected: {
    color: '#0F172A',
    fontWeight: '800',
  },
  checkIcon: {
    color: '#047857',
    fontSize: 12,
    fontWeight: '900',
  },

  // Calendar / Date Filter Container
  calendarContainer: {
    position: 'relative',
    zIndex: 10000,
  },
  dateFilterButton: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  calendarIcon: {
    fontSize: 14,
  },
  dateFilterButtonText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '700',
  },

  // Calendar Popover
  calendarPopover: {
    position: 'absolute',
    top: 48,
    right: 0,
    width: 320,
    zIndex: 10001,
    elevation: 60,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
  },
  calHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  calNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  calNavText: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '900',
  },
  calNavDisabled: {
    color: '#CBD5E1',
  },
  calMonthHeading: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },
  calQuickMonths: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 12,
  },
  calMonthTab: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  calMonthTabActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  calMonthTabText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
  },
  calMonthTabTextActive: {
    color: '#FFFFFF',
  },
  calWeekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 6,
  },
  calWeekDay: {
    width: 36,
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
  },
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calDayCell: {
    width: `${100 / 7}%`,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderRadius: 6,
    marginVertical: 2,
  },
  calDayCellSelected: {
    backgroundColor: '#2563EB',
  },
  calDayText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
  },
  calDayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  calEventDot: {
    position: 'absolute',
    bottom: 3,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#10B981',
  },
  calFooter: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    flexDirection: 'row',
    gap: 8,
  },
  calFullMonthBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#047857',
    alignItems: 'center',
  },
  calFullMonthBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  calResetBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  calResetBtnText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
  },

  // Table Card
  tableCard: {
    position: 'relative',
    zIndex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  tableTopMeta: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tableMetaText: {
    color: '#64748B',
    fontSize: 12,
  },
  boldText: {
    fontWeight: '800',
    color: '#0F172A',
  },
  statusFilteredNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  statusFilteredNoticeText: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '700',
  },
  clearStatusText: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '900',
  },
  tableWidth: {
    minWidth: 1050,
  },
  tableHeader: {
    minHeight: 46,
    paddingHorizontal: 16,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  tableRow: {
    minHeight: 62,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    flexDirection: 'row',
    alignItems: 'center',
  },
  heading: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  pharmacyColumn: {
    width: 200,
  },
  pharmacyCellName: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
  },
  pharmacyCellSub: {
    color: '#94A3B8',
    fontSize: 10,
    marginTop: 2,
  },
  paymentIdColumn: {
    width: 190,
  },
  orderIdColumn: {
    width: 180,
  },
  amountColumn: {
    width: 130,
  },
  dateColumn: {
    width: 190,
  },
  statusColumn: {
    width: 180,
  },
  statusActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  refundBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  refundBtnText: {
    color: '#B91C1C',
    fontSize: 10,
    fontWeight: '800',
  },
  cell: {
    color: '#475569',
    fontSize: 12,
  },
  amount: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '900',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    fontSize: 11,
    fontWeight: '800',
    overflow: 'hidden',
  },
  successBadge: {
    color: '#047857',
    backgroundColor: '#D1FAE5',
  },
  pendingBadge: {
    color: '#B45309',
    backgroundColor: '#FEF3C7',
  },
  failedBadge: {
    color: '#B91C1C',
    backgroundColor: '#FEE2E2',
  },
  refundedBadge: {
    color: '#7E22CE',
    backgroundColor: '#F3E8FF',
  },
  footer: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FAFAFA',
  },
  footerText: {
    color: '#64748B',
    fontSize: 12,
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pageButton: {
    width: 30,
    height: 30,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  activePage: {
    borderColor: '#0F172A',
    backgroundColor: '#0F172A',
  },
  activePageText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  pageText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
  },
  pageArrow: {
    color: '#64748B',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyBox: {
    padding: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '800',
  },
  emptyText: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
    maxWidth: 400,
  },
  resetSearchBtn: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#0F172A',
  },
  resetSearchBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
