import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { usePos } from '../../context/PosContext';

const SALES_SUBITEMS = [
  { title: 'New Sale', key: 'new-sale', icon: '⚡' },
  { title: 'Hold Bill', key: 'held-bills', icon: '⏸️', hasBadge: true },
  { title: 'Returns', key: 'sales-returns', icon: '🔄' },
];

const CASHIER_SUBITEMS = [
  { title: 'Cash Register', key: 'cash-register', icon: '🗄️' },
];

const ALL_INVENTORY_SUBITEMS = [
  { title: 'Stock Adjustments', key: 'stock-adjustments', icon: '📝' },
  { title: 'Stock Transfer', key: 'stock-transfer', icon: '🔄' },
  { title: 'Stock Status', key: 'stock-status', icon: '⚠️' },
];

const PURCHASES_SUBITEMS = [
  { title: 'Purchases', key: 'purchases', icon: '🛒' },
  { title: 'Goods Receiving', key: 'goods-receiving', icon: '📦' },
  { title: 'Suppliers Directory', key: 'suppliers', icon: '🏢' },
];

const CUSTOMERS_SUBITEMS = [
  { title: 'Customers / Patients', key: 'customers-patients', icon: '👥' },
  { title: 'Customer Details', key: 'customer-details', icon: '👤' },
  { title: 'Customer Ledger', key: 'customer-ledger', icon: '📑' },
  { title: 'Payment Receipts', key: 'customer-payments', icon: '💳' },
];

const MANAGEMENT_SUBITEMS = [
  { title: 'Branches', key: 'branches', icon: '🏛️' },
  { title: 'Users', key: 'users', icon: '👥' },
  { title: 'Roles', key: 'roles', icon: '🛡️' },
  { title: 'Audit Log', key: 'audit-log', icon: '📋' },
];

const REPORTS_SUBITEMS = [
  { title: 'Inventory Reports', key: 'inventory-reports', icon: '📊' },
  { title: 'Purchase Reports', key: 'purchase-reports', icon: '📈' },
  { title: 'Expiry Reports', key: 'expiry-reports', icon: '⏳' },
];

const SETTINGS_SUBITEMS = [
  { title: 'Tax and GST Settings', key: 'tax-settings', icon: '⚙️', adminOnly: true },
  { title: 'Subscription & Plans', key: 'subscription-plans', icon: '💳' },
  { title: 'Page Permissions', key: 'page-permissions', icon: '🛡️' },
];

export default function Sidebar({
  activeItem = 'dashboard',
  onNavigate,
  isMultiBranch = true,
  isMobile = false,
  currentUser,
}) {
  const roleName = (currentUser?.role || '').toLowerCase();
  const accessLevel = (currentUser?.accessLevel || '').toLowerCase();
  const isAdmin =
    !currentUser ||
    roleName.includes('admin') ||
    accessLevel.includes('admin');

  let heldCount = 6;
  try {
    const posCtx = usePos();
    if (posCtx && posCtx.heldBills) {
      heldCount = posCtx.heldBills.length;
    }
  } catch (e) {}

  // Inventory subitems (Stock Adjustments, Stock Transfer, Stock Status)
  const inventorySubItems = ALL_INVENTORY_SUBITEMS;

  const settingsSubItems = SETTINGS_SUBITEMS.filter(
    (item) => !item.adminOnly || isAdmin
  );

  const isSalesActive =
    SALES_SUBITEMS.some((item) => item.key === activeItem) ||
    activeItem === 'sales' ||
    activeItem === 'pos-billing' ||
    activeItem === 'new-sale' ||
    activeItem === 'held-bills' ||
    activeItem === 'sales-returns' ||
    activeItem === 'returns';
  const isCashierActive = activeItem === 'cash-register';
  const isInventoryActive =
    inventorySubItems.some((item) => item.key === activeItem) ||
    activeItem === 'inventory' ||
    activeItem === 'low-stock-expiry';
  const isPurchasesActive = PURCHASES_SUBITEMS.some((item) => item.key === activeItem);
  const isCustomersActive = CUSTOMERS_SUBITEMS.some((item) => item.key === activeItem);
  const isManagementActive =
    MANAGEMENT_SUBITEMS.some((item) => item.key === activeItem) ||
    activeItem === 'roles' ||
    activeItem === 'roles-permissions';
  const isReportsActive = REPORTS_SUBITEMS.some((item) => item.key === activeItem);
  const isSettingsActive =
    SETTINGS_SUBITEMS.some((item) => item.key === activeItem) ||
    activeItem === 'page-permissions';

  // Default all sections to expanded, EXCEPT Management which is collapsed by default
  const [salesExpanded, setSalesExpanded] = useState(true);
  const [cashierExpanded, setCashierExpanded] = useState(true);
  const [inventoryExpanded, setInventoryExpanded] = useState(true);
  const [purchasesExpanded, setPurchasesExpanded] = useState(true);
  const [customersExpanded, setCustomersExpanded] = useState(true);
  const [managementExpanded, setManagementExpanded] = useState(false);
  const [reportsExpanded, setReportsExpanded] = useState(true);
  const [settingsExpanded, setSettingsExpanded] = useState(true);

  // Bottom-left clock
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setCurrentTime(timeStr);
    };
    updateTime();
    const timer = setInterval(updateTime, 1000 * 60);
    return () => clearInterval(timer);
  }, []);

  // Ensure sections stay expanded when navigated
  useEffect(() => {
    if (isSalesActive) setSalesExpanded(true);
  }, [activeItem, isSalesActive]);

  // Ensure sections stay expanded when navigated
  useEffect(() => {
    if (isCashierActive) setCashierExpanded(true);
  }, [activeItem, isCashierActive]);

  useEffect(() => {
    if (isInventoryActive) setInventoryExpanded(true);
  }, [activeItem, isInventoryActive]);

  useEffect(() => {
    if (isPurchasesActive) setPurchasesExpanded(true);
  }, [activeItem, isPurchasesActive]);

  useEffect(() => {
    if (isCustomersActive) setCustomersExpanded(true);
  }, [activeItem, isCustomersActive]);

  useEffect(() => {
    if (isManagementActive) setManagementExpanded(true);
  }, [activeItem, isManagementActive]);

  useEffect(() => {
    if (isReportsActive) setReportsExpanded(true);
  }, [activeItem, isReportsActive]);

  useEffect(() => {
    if (isSettingsActive) setSettingsExpanded(true);
  }, [activeItem, isSettingsActive]);

  const handleDashboardClick = () => {
    if (onNavigate) {
      onNavigate('dashboard');
    }
  };

  const handleSalesClick = () => {
    setSalesExpanded(!salesExpanded);
  };

  const handleCashierClick = () => {
    if (onNavigate) {
      onNavigate('cash-register');
    }
  };

  const handleInventoryClick = () => {
    setInventoryExpanded(!inventoryExpanded);
  };

  const handlePurchasesClick = () => {
    setPurchasesExpanded(!purchasesExpanded);
  };

  const handleCustomersClick = () => {
    setCustomersExpanded(!customersExpanded);
  };

  const handleManagementClick = () => {
    setManagementExpanded(!managementExpanded);
  };

  const handleReportsClick = () => {
    setReportsExpanded(!reportsExpanded);
  };

  const handleSubItemClick = (key) => {
    if (onNavigate) {
      onNavigate(key);
    }
  };

  return (
    <View style={[styles.sidebarContainer, isMobile && styles.sidebarContainerMobile]}>
      {/* Brand Header (Desktop only - Mobile has modal header) */}
      {!isMobile && (
        <View style={styles.brandContainer}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoBadgeText}>+</Text>
          </View>
          <View style={styles.brandTextContainer}>
            <Text style={styles.brandTitle}>FALAH</Text>
            <Text style={styles.brandSubtitle}>PHARMACY POS</Text>
          </View>
        </View>
      )}

      {/* Navigation List */}
      <ScrollView
        style={styles.navScroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.navContent}
      >
        {/* 1. Dashboard */}
        <Pressable
          onPress={handleDashboardClick}
          style={[
            styles.mainNavItem,
            activeItem === 'dashboard' && styles.mainNavItemActive,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Dashboard"
        >
          {activeItem === 'dashboard' && <View style={styles.activeIndicator} />}
          <Text
            style={[
              styles.mainNavText,
              activeItem === 'dashboard' && styles.mainNavTextActive,
            ]}
          >
            Dashboard
          </Text>
        </Pressable>

        {/* Section Divider */}
        <View style={styles.sectionDivider} />

        {/* 2. Sales Section (Expandable - New Sale, Held Bills, Refunds) */}
        <View style={styles.expandableSection}>
          <Pressable
            onPress={handleSalesClick}
            style={[
              styles.expandableHeader,
              isSalesActive && styles.expandableHeaderSelected,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Sales Menu"
          >
            <Text
              style={[
                styles.mainNavText,
                isSalesActive && styles.expandableTextSelected,
              ]}
            >
              Sales
            </Text>
            <Text
              style={[
                styles.chevronText,
                isSalesActive && styles.chevronSelected,
              ]}
            >
              {salesExpanded ? '▴' : '▾'}
            </Text>
          </Pressable>

          {/* Submenu: New Sale, Hold Bill, Returns */}
          {salesExpanded && (
            <View style={styles.submenuContainer}>
              {SALES_SUBITEMS.map((subItem) => {
                const isActive = activeItem === subItem.key;
                return (
                  <Pressable
                    key={subItem.key}
                    onPress={() => handleSubItemClick(subItem.key)}
                    style={[
                      styles.subNavItem,
                      isActive && styles.subNavItemActive,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={subItem.title}
                  >
                    {isActive && <View style={styles.subActiveIndicator} />}
                    <Text
                      style={[
                        styles.subNavText,
                        isActive && styles.subNavTextActive,
                        { flex: 1 },
                      ]}
                    >
                      {subItem.title}
                    </Text>
                    {subItem.hasBadge && heldCount > 0 ? (
                      <View style={styles.orangeBadge}>
                        <Text style={styles.orangeBadgeText}>{heldCount}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* 3. Cashier (Cash Register Only) */}
        <Pressable
          onPress={handleCashierClick}
          style={[
            styles.mainNavItem,
            isCashierActive && styles.mainNavItemActive,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Cashier (Cash Register)"
        >
          {isCashierActive && <View style={styles.activeIndicator} />}
          <Text
            style={[
              styles.mainNavText,
              isCashierActive && styles.mainNavTextActive,
            ]}
          >
            Cashier
          </Text>
        </Pressable>

        {/* 2. Inventory Section (Dynamic subitems) */}
        <View style={styles.expandableSection}>
          <Pressable
            onPress={handleInventoryClick}
            style={[
              styles.expandableHeader,
              isInventoryActive && styles.expandableHeaderSelected,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Inventory Menu"
          >
            <Text
              style={[
                styles.mainNavText,
                isInventoryActive && styles.expandableTextSelected,
              ]}
            >
              Inventory
            </Text>
            <Text
              style={[
                styles.chevronText,
                isInventoryActive && styles.chevronSelected,
              ]}
            >
              {inventoryExpanded ? '▴' : '▾'}
            </Text>
          </Pressable>

          {/* Submenu */}
          {inventoryExpanded && (
            <View style={styles.submenuContainer}>
              {inventorySubItems.map((subItem) => {
                const isActive = activeItem === subItem.key;
                return (
                  <Pressable
                    key={subItem.key}
                    onPress={() => handleSubItemClick(subItem.key)}
                    style={[
                      styles.subNavItem,
                      isActive && styles.subNavItemActive,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={subItem.title}
                  >
                    {isActive && <View style={styles.subActiveIndicator} />}
                    <Text
                      style={[
                        styles.subNavText,
                        isActive && styles.subNavTextActive,
                      ]}
                    >
                      {subItem.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* 3. Purchases Section (Expandable - 3 Items) */}
        <View style={styles.expandableSection}>
          <Pressable
            onPress={handlePurchasesClick}
            style={[
              styles.expandableHeader,
              isPurchasesActive && styles.expandableHeaderSelected,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Purchases Menu"
          >
            <Text
              style={[
                styles.mainNavText,
                isPurchasesActive && styles.expandableTextSelected,
              ]}
            >
              Purchases
            </Text>
            <Text
              style={[
                styles.chevronText,
                isPurchasesActive && styles.chevronSelected,
              ]}
            >
              {purchasesExpanded ? '▴' : '▾'}
            </Text>
          </Pressable>

          {/* Submenu: Purchases, Goods Receiving, Suppliers */}
          {purchasesExpanded && (
            <View style={styles.submenuContainer}>
              {PURCHASES_SUBITEMS.map((subItem) => {
                const isActive = activeItem === subItem.key;
                return (
                  <Pressable
                    key={subItem.key}
                    onPress={() => handleSubItemClick(subItem.key)}
                    style={[
                      styles.subNavItem,
                      isActive && styles.subNavItemActive,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={subItem.title}
                  >
                    {isActive && <View style={styles.subActiveIndicator} />}
                    <Text
                      style={[
                        styles.subNavText,
                        isActive && styles.subNavTextActive,
                      ]}
                    >
                      {subItem.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* 4. Customers Section (Expandable - 3 Items) */}
        <View style={styles.expandableSection}>
          <Pressable
            onPress={handleCustomersClick}
            style={[
              styles.expandableHeader,
              isCustomersActive && styles.expandableHeaderSelected,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Customers Menu"
          >
            <Text
              style={[
                styles.mainNavText,
                isCustomersActive && styles.expandableTextSelected,
              ]}
            >
              Customers
            </Text>
            <Text
              style={[
                styles.chevronText,
                isCustomersActive && styles.chevronSelected,
              ]}
            >
              {customersExpanded ? '▴' : '▾'}
            </Text>
          </Pressable>

          {/* Submenu: Customers / Patients, Customer Ledger / Credit, Customer Payments */}
          {customersExpanded && (
            <View style={styles.submenuContainer}>
              {CUSTOMERS_SUBITEMS.map((subItem) => {
                const isActive = activeItem === subItem.key;
                return (
                  <Pressable
                    key={subItem.key}
                    onPress={() => handleSubItemClick(subItem.key)}
                    style={[
                      styles.subNavItem,
                      isActive && styles.subNavItemActive,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={subItem.title}
                  >
                    {isActive && <View style={styles.subActiveIndicator} />}
                    <Text
                      style={[
                        styles.subNavText,
                        isActive && styles.subNavTextActive,
                      ]}
                    >
                      {subItem.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* 5. Management Section (Expandable - 4 Subitems, Collapsed by default) */}
        <View style={styles.expandableSection}>
          <Pressable
            onPress={handleManagementClick}
            style={[
              styles.expandableHeader,
              isManagementActive && styles.expandableHeaderSelected,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Management Menu"
          >
            <Text
              style={[
                styles.mainNavText,
                isManagementActive && styles.expandableTextSelected,
              ]}
            >
              Management
            </Text>
            <Text
              style={[
                styles.chevronText,
                isManagementActive && styles.chevronSelected,
              ]}
            >
              {managementExpanded ? '▴' : '▾'}
            </Text>
          </Pressable>

          {/* Submenu: Branches, Users, Roles & Permissions, Audit Log */}
          {managementExpanded && (
            <View style={styles.submenuContainer}>
              {MANAGEMENT_SUBITEMS.map((subItem) => {
                const isActive = activeItem === subItem.key;
                return (
                  <Pressable
                    key={subItem.key}
                    onPress={() => handleSubItemClick(subItem.key)}
                    style={[
                      styles.subNavItem,
                      isActive && styles.subNavItemActive,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={subItem.title}
                  >
                    {isActive && <View style={styles.subActiveIndicator} />}
                    <Text
                      style={[
                        styles.subNavText,
                        isActive && styles.subNavTextActive,
                      ]}
                    >
                      {subItem.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* 6. Reports Section (Expandable - 3 Items) */}
        <View style={styles.expandableSection}>
          <Pressable
            onPress={handleReportsClick}
            style={[
              styles.expandableHeader,
              isReportsActive && styles.expandableHeaderSelected,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Reports Menu"
          >
            <Text
              style={[
                styles.mainNavText,
                isReportsActive && styles.expandableTextSelected,
              ]}
            >
              Reports
            </Text>
            <Text
              style={[
                styles.chevronText,
                isReportsActive && styles.chevronSelected,
              ]}
            >
              {reportsExpanded ? '▴' : '▾'}
            </Text>
          </Pressable>

          {/* Submenu: Inventory Reports, Purchase Reports, Expiry Reports */}
          {reportsExpanded && (
            <View style={styles.submenuContainer}>
              {REPORTS_SUBITEMS.map((subItem) => {
                const isActive = activeItem === subItem.key;
                return (
                  <Pressable
                    key={subItem.key}
                    onPress={() => handleSubItemClick(subItem.key)}
                    style={[
                      styles.subNavItem,
                      isActive && styles.subNavItemActive,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={subItem.title}
                  >
                    {isActive && <View style={styles.subActiveIndicator} />}
                    <Text
                      style={[
                        styles.subNavText,
                        isActive && styles.subNavTextActive,
                      ]}
                    >
                      {subItem.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* 7. Settings Section */}
        <View style={styles.expandableSection}>
          <Pressable
            onPress={() => setSettingsExpanded(!settingsExpanded)}
            style={[
              styles.expandableHeader,
              isSettingsActive && styles.expandableHeaderSelected,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Settings Menu"
          >
            <Text
              style={[
                styles.mainNavText,
                isSettingsActive && styles.expandableTextSelected,
              ]}
            >
              Settings
            </Text>
            <Text
              style={[
                styles.chevronText,
                isSettingsActive && styles.chevronSelected,
              ]}
            >
              {settingsExpanded ? '▴' : '▾'}
            </Text>
          </Pressable>

          {/* Submenu: Tax / GST Settings, Page Permissions */}
          {settingsExpanded && (
            <View style={styles.submenuContainer}>
              {settingsSubItems.map((subItem) => {
                const isActive = activeItem === subItem.key;
                return (
                  <Pressable
                    key={subItem.key}
                    onPress={() => handleSubItemClick(subItem.key)}
                    style={[
                      styles.subNavItem,
                      isActive && styles.subNavItemActive,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={subItem.title}
                  >
                    {isActive && <View style={styles.subActiveIndicator} />}
                    <Text
                      style={[
                        styles.subNavText,
                        isActive && styles.subNavTextActive,
                      ]}
                    >
                      {subItem.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Footer Status Badge (Matches Screenshot 1) */}
      <View style={styles.sidebarFooter}>
        <View style={styles.onlineStatusRow}>
          <View style={styles.onlineDot} />
          <View>
            <Text style={styles.onlineStatusText}>Online</Text>
            <Text style={styles.lastSyncText}>Last sync: Just now</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebarContainer: {
    width: 230,
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
    flexDirection: 'column',
    height: '100%',
    ...Platform.select({
      web: {
        height: '100vh',
        position: 'sticky',
        top: 0,
      },
    }),
  },
  sidebarContainerMobile: {
    width: '100%',
    borderRightWidth: 0,
    flex: 1,
    height: '100%',
    overflow: 'hidden',
    ...Platform.select({
      web: {
        height: '100%',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      },
    }),
  },
  brandContainer: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#0F766E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  logoBadgeText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginTop: -2,
  },
  brandTextContainer: {
    flexDirection: 'column',
  },
  brandTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F766E',
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
    marginTop: 1,
  },
  navScroll: {
    flex: 1,
  },
  navContent: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    paddingBottom: 90,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 8,
    marginHorizontal: 4,
  },
  mainNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 4,
    position: 'relative',
    cursor: 'pointer',
    backgroundColor: 'transparent',
  },
  mainNavItemActive: {
    backgroundColor: '#F1F5F9',
  },
  activeIndicator: {
    position: 'absolute',
    left: 0,
    top: 6,
    bottom: 6,
    width: 3.5,
    backgroundColor: '#0F766E',
    borderRadius: 2,
  },
  mainNavText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#334155',
  },
  mainNavTextActive: {
    fontWeight: '700',
    color: '#0F766E',
  },
  expandableSection: {
    marginBottom: 4,
  },
  expandableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    cursor: 'pointer',
  },
  expandableHeaderSelected: {
    backgroundColor: 'transparent',
  },
  expandableTextSelected: {
    color: '#0F172A',
    fontWeight: '800',
  },
  chevronText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  chevronSelected: {
    color: '#0F766E',
  },
  submenuContainer: {
    paddingLeft: 12,
    paddingTop: 3,
    paddingBottom: 3,
  },
  subNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8.5,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginBottom: 2,
    position: 'relative',
    cursor: 'pointer',
    backgroundColor: 'transparent',
  },
  subNavItemActive: {
    backgroundColor: '#F0FDFA',
  },
  subActiveIndicator: {
    position: 'absolute',
    left: 0,
    top: 5,
    bottom: 5,
    width: 3,
    backgroundColor: '#0F766E',
    borderRadius: 2,
  },
  subNavText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#475569',
  },
  subNavTextActive: {
    fontWeight: '700',
    color: '#0F766E',
  },
  orangeBadge: {
    backgroundColor: '#F59E0B',
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  orangeBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  sidebarFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  onlineStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  onlineDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#10B981',
  },
  onlineStatusText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  lastSyncText: {
    fontSize: 10.5,
    color: '#64748B',
  },
});
