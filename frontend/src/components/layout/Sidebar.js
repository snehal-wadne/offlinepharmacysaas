import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';

const ALL_INVENTORY_SUBITEMS = [
  { title: 'Stock Adjustments', key: 'stock-adjustments', icon: '📝' },
  { title: 'Stock Transfer', key: 'stock-transfer', multiOnly: true, icon: '🔄' },
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
  { title: 'Tax / GST Settings', key: 'tax-settings', icon: '⚙️' },
  { title: 'Subscription & Plans', key: 'subscription-plans', icon: '💳' },
  { title: 'Page Permissions', key: 'page-permissions', icon: '🛡️' },
];

export default function Sidebar({
  activeItem = 'dashboard',
  onNavigate,
  isMultiBranch = true,
  isMobile = false,
}) {
  // Filter inventory subitems conditionally based on Single-Shop vs Multi-Branch
  const inventorySubItems = ALL_INVENTORY_SUBITEMS.filter(
    (item) => !item.multiOnly || isMultiBranch
  );

  const isInventoryActive = inventorySubItems.some((item) => item.key === activeItem);
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
            <Text style={styles.logoBadgeText}>PF</Text>
          </View>
          <View style={styles.brandTextContainer}>
            <Text style={styles.brandTitle}>PharmaFlow</Text>
            <Text style={styles.brandSubtitle}>Pharmacy Billing & ERP</Text>
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
              {SETTINGS_SUBITEMS.map((subItem) => {
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

      {/* Footer Clock Badge */}
      <View style={styles.sidebarFooter}>
        <View style={styles.timeBadge}>
          <Text style={styles.timeBadgeText}>{currentTime || '12:42 PM'}</Text>
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
    height: '100%',
    ...Platform.select({
      web: {
        height: '100%',
        position: 'relative',
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
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  brandTextContainer: {
    flexDirection: 'column',
  },
  brandTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  brandSubtitle: {
    fontSize: 10.5,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 1,
  },
  navScroll: {
    flex: 1,
  },
  navContent: {
    paddingVertical: 16,
    paddingHorizontal: 12,
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
    backgroundColor: 'transparent',
  },
  expandableHeaderSelected: {
    backgroundColor: 'transparent',
  },
  expandableTextSelected: {
    color: '#0F766E',
    fontWeight: '700',
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
    paddingVertical: 8.5,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginBottom: 2,
    position: 'relative',
    cursor: 'pointer',
    backgroundColor: 'transparent',
  },
  subNavItemActive: {
    backgroundColor: '#F1F5F9',
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
  sidebarFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    alignItems: 'center',
  },
  timeBadge: {
    backgroundColor: '#EEF2F6',
    borderRadius: 6,
    paddingVertical: 7,
    paddingHorizontal: 14,
    width: '100%',
    alignItems: 'center',
  },
  timeBadgeText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
  },
});
