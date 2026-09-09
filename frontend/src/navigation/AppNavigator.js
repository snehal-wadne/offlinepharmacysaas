import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  Platform,
} from 'react-native';
import Sidebar from '../components/layout/Sidebar';
import Header from '../components/layout/Header';
import LoginScreen from '../screens/auth/LoginScreen';
import { PosProvider } from '../context/PosContext';

// 0. Sales & Cashier Screens (Sales / POS Billing, Cash Register)
import SalesScreen from '../screens/sales/SalesScreen';
import CashRegisterScreen from '../screens/cashier/CashRegisterScreen';
import HeldBillsScreen from '../screens/cashier/HeldBillsScreen';
import SalesReturnsScreen from '../screens/cashier/SalesReturnsScreen';

// 1. Master Dashboard
import InventoryDashboard from '../screens/inventory/InventoryDashboard';

// 2. Inventory Screens (3 Pages: Stock Adjustments, Stock Transfer, Stock Status)
import StockAdjustmentsScreen from '../screens/inventory/StockAdjustmentsScreen';
import StockTransferScreen from '../screens/inventory/StockTransferScreen';
import StockStatusScreen from '../screens/inventory/StockStatusScreen';

// 3. Purchases Screens (3 Pages: Purchases, Goods Receiving, Suppliers)
import PurchasesScreen from '../screens/purchases/PurchasesScreen';
import GoodsReceivingScreen from '../screens/purchases/GoodsReceivingScreen';
import SuppliersScreen from '../screens/purchases/SuppliersScreen';

// 4. Customers Screens (4 Pages: Customers / Patients, Customer Details, Customer Ledger / Credit, Customer Payments)
import CustomersPatientsScreen from '../screens/customers/CustomersPatientsScreen';
import CustomerDetailsScreen from '../screens/customers/CustomerDetailsScreen';
import CustomerLedgerScreen from '../screens/customers/CustomerLedgerScreen';
import CustomerPaymentsScreen from '../screens/customers/CustomerPaymentsScreen';

// 5. Management Screens (4 Pages: Branches, Users, Roles, Audit Log) + Settings (Page Permissions)
import BranchesScreen from '../screens/management/BranchesScreen';
import UsersScreen from '../screens/management/UsersScreen';
import RolesScreen from '../screens/management/RolesScreen';
import RolesPermissionsScreen from '../screens/management/RolesPermissionsScreen';
import AuditLogScreen from '../screens/management/AuditLogScreen';

// 6. Reports Screens (3 Pages: Inventory Reports, Purchase Reports, Expiry Reports)
import InventoryReportsScreen from '../screens/reports/InventoryReportsScreen';
import PurchaseReportsScreen from '../screens/reports/PurchaseReportsScreen';
import ExpiryReportsScreen from '../screens/reports/ExpiryReportsScreen';

// 7. Settings & Compliance Screens (Tax / GST & SaaS Subscriptions with 18% GST)
import TaxGstSettingsScreen from '../screens/settings/TaxGstSettingsScreen';
import SubscriptionPlansScreen from '../screens/settings/SubscriptionPlansScreen';

export default function AppNavigator() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Active Route State (Default: 'dashboard')
  const [currentRoute, setCurrentRoute] = useState('dashboard');
  const [selectedBranch, setSelectedBranch] = useState('Main Branch');
  const [selectedCustomerId, setSelectedCustomerId] = useState('CUST-1040');
  const [toastMessage, setToastMessage] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [branchRefreshKey, setBranchRefreshKey] = useState(0);

  const handleBranchesUpdated = () => {
    setBranchRefreshKey((prev) => prev + 1);
  };

  // Authenticated User State (Null by default to show Login & Sign-up screen)
  const [currentUser, setCurrentUser] = useState(null);

  // Pharmacy Architecture Mode: Multi-Branch (true) vs Single-Shop (false)
  const [isMultiBranch, setIsMultiBranch] = useState(true);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage('');
    }, 4000);
  };

  const handleNavigate = (routeKey, payload) => {
    if (payload) {
      setSelectedCustomerId(payload);
    }
    setCurrentRoute(routeKey);
    setMobileMenuOpen(false);
  };

  const handleTogglePharmacyMode = () => {
    handleSetPharmacyMode(!isMultiBranch);
  };

  const handleSetPharmacyMode = (multi) => {
    if (multi === isMultiBranch) return;
    setIsMultiBranch(multi);
    if (!multi && currentRoute === 'stock-transfer') {
      setCurrentRoute('stock-adjustments');
    }
    showToast(
      multi
        ? 'Switched to Multi-Branch Mode (Branch Switcher & Transfer Enabled)'
        : 'Switched to Single-Shop Mode (Streamlined for 1 Pharmacy Store)'
    );
  };

  const handleSignOut = () => {
    setCurrentUser(null);
    showToast('Signed out successfully.');
  };

  // Render Active Screen Component
  const renderScreen = () => {
    switch (currentRoute) {
      case 'dashboard':
        return (
          <InventoryDashboard
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
          />
        );
      case 'sales':
      case 'new-sale':
      case 'pos-billing':
        return (
          <SalesScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
          />
        );
      case 'cash-register':
      case 'cashier':
        return (
          <CashRegisterScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
          />
        );
      case 'held-bills':
        return (
          <HeldBillsScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
          />
        );
      case 'sales-returns':
      case 'returns':
        return (
          <SalesReturnsScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
          />
        );
      case 'stock-adjustments':
        return (
          <StockAdjustmentsScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
          />
        );
      case 'stock-transfer':
        return (
          <StockTransferScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
          />
        );
      case 'inventory':
      case 'stock-status':
      case 'low-stock-expiry':
        return (
          <StockStatusScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
          />
        );
      case 'purchases':
        return (
          <PurchasesScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
          />
        );
      case 'goods-receiving':
        return (
          <GoodsReceivingScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
          />
        );
      case 'suppliers':
        return (
          <SuppliersScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
          />
        );
      case 'customers-patients':
      case 'customers':
      case 'add-customer':
        return (
          <CustomersPatientsScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
          />
        );
      case 'customer-details':
        return (
          <CustomerDetailsScreen
            customerId={selectedCustomerId}
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
          />
        );
      case 'customer-ledger':
        return (
          <CustomerLedgerScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
          />
        );
      case 'customer-payments':
        return (
          <CustomerPaymentsScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
          />
        );
      case 'branches':
        return (
          <BranchesScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
            onBranchesUpdated={handleBranchesUpdated}
          />
        );
      case 'users':
        return (
          <UsersScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
          />
        );
      case 'roles':
        return (
          <RolesScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
          />
        );
      case 'roles-permissions':
      case 'page-permissions':
        return (
          <RolesPermissionsScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
          />
        );
      case 'audit-log':
        return (
          <AuditLogScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
          />
        );
      case 'inventory-reports':
        return (
          <InventoryReportsScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
          />
        );
      case 'purchase-reports':
        return (
          <PurchaseReportsScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
          />
        );
      case 'expiry-reports':
        return (
          <ExpiryReportsScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
          />
        );
      case 'tax-settings':
        return (
          <TaxGstSettingsScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
            currentUser={currentUser}
          />
        );
      case 'subscription-plans':
        return (
          <SubscriptionPlansScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
          />
        );
      default:
        return (
          <InventoryDashboard
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
          />
        );
    }
  };

  // Auth Guard: If no user is logged in, present the Login Screen
  if (!currentUser) {
    return (
      <LoginScreen
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          if (user?.branch) {
            setSelectedBranch(user.branch);
          }
          showToast(`Welcome back, ${user.display_name}! (Branch: ${user.branch || 'Main Branch'})`);
        }}
      />
    );
  }

  return (
    <PosProvider>
      <View style={styles.appContainer}>
        {/* 1. Fixed Left Sidebar for Desktop */}
      {!isMobile && (
        <Sidebar
          activeItem={currentRoute}
          onNavigate={handleNavigate}
          isMultiBranch={isMultiBranch}
          currentUser={currentUser}
        />
      )}

      {/* Mobile Drawer Navigation Modal (Positioned on Left) */}
      {isMobile && (
        <Modal
          visible={mobileMenuOpen}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setMobileMenuOpen(false)}
        >
          <View style={styles.mobileDrawerOverlay}>
            <View style={styles.mobileDrawerContent}>
              <View style={styles.mobileDrawerHeader}>
                <View style={styles.drawerBrandRow}>
                  <View style={styles.drawerBrandIcon}>
                    <Text style={styles.drawerBrandIconText}>Rx</Text>
                  </View>
                  <Text style={styles.mobileDrawerTitle}>PharmaFlow ERP</Text>
                </View>
                <Pressable
                  onPress={() => setMobileMenuOpen(false)}
                  style={styles.mobileCloseButton}
                  accessibilityRole="button"
                  accessibilityLabel="Close navigation menu"
                >
                  <Text style={styles.mobileCloseText}>✕</Text>
                </Pressable>
              </View>
              <Sidebar
                activeItem={currentRoute}
                onNavigate={handleNavigate}
                isMultiBranch={isMultiBranch}
                isMobile={true}
                currentUser={currentUser}
              />
            </View>
            <Pressable
              style={styles.mobileDrawerBackdrop}
              onPress={() => setMobileMenuOpen(false)}
              accessibilityLabel="Dismiss menu"
            />
          </View>
        </Modal>
      )}

      {/* 2. Main Application Wrapper */}
      <View style={styles.mainWrapper}>
        {/* Top Header with Multi/Single Branch Mode */}
        <Header
          currentBranch={selectedBranch}
          onBranchChange={(b) => {
            setSelectedBranch(b);
            showToast(`Switched active branch to ${b}`);
          }}
          isMultiBranch={isMultiBranch}
          onTogglePharmacyMode={handleTogglePharmacyMode}
          onSetPharmacyMode={handleSetPharmacyMode}
          currentUser={currentUser}
          onSignOut={handleSignOut}
          syncStatus="online"
          isMobile={isMobile}
          onToggleMobileMenu={() => setMobileMenuOpen(true)}
          onNavigate={handleNavigate}
          branchRefreshKey={branchRefreshKey}
        />

        {/* Global Action Feedback Toast */}
        {toastMessage ? (
          <View style={styles.toastBanner}>
            <View style={styles.toastDot} />
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        ) : null}

        {/* Dynamic Screen View */}
        <View style={styles.screenContainer}>{renderScreen()}</View>
      </View>
    </View>
    </PosProvider>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    ...Platform.select({
      web: {
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
      },
    }),
  },
  mainWrapper: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: '#F8FAFC',
    height: '100%',
  },
  toastBanner: {
    backgroundColor: '#F0FDFA',
    borderBottomWidth: 1,
    borderBottomColor: '#99F6E4',
    paddingVertical: 9,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...Platform.select({
      web: {
        transition: 'opacity 0.2s ease-in-out',
      },
    }),
  },
  toastDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0F766E',
  },
  toastText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F766E',
  },
  screenContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  mobileDrawerOverlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
  },
  mobileDrawerBackdrop: {
    flex: 1,
  },
  mobileDrawerContent: {
    width: 290,
    maxWidth: '82%',
    backgroundColor: '#FFFFFF',
    height: '100%',
    flexDirection: 'column',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  mobileDrawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#0D9488',
    backgroundColor: '#0F766E',
  },
  drawerBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  drawerBrandIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#14B8A6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerBrandIconText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  mobileDrawerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  mobileCloseButton: {
    padding: 6,
  },
  mobileCloseText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
});
