import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  Platform,
} from 'react-native';
import Sidebar from '../components/layout/Sidebar';
import Header from '../components/layout/Header';
import LoginScreen from '../screens/auth/LoginScreen';

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

// 4. Reports Screens (3 Pages: Inventory Reports, Purchase Reports, Expiry Reports)
import InventoryReportsScreen from '../screens/reports/InventoryReportsScreen';
import PurchaseReportsScreen from '../screens/reports/PurchaseReportsScreen';
import ExpiryReportsScreen from '../screens/reports/ExpiryReportsScreen';

export default function AppNavigator() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Active Route State (Default: 'dashboard')
  const [currentRoute, setCurrentRoute] = useState('dashboard');
  const [selectedBranch, setSelectedBranch] = useState('Main Branch');
  const [toastMessage, setToastMessage] = useState('');

  // Authenticated User State
  const [currentUser, setCurrentUser] = useState(null);

  // Pharmacy Architecture Mode: Multi-Branch (true) vs Single-Shop (false)
  const [isMultiBranch, setIsMultiBranch] = useState(true);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage('');
    }, 4000);
  };

  const handleNavigate = (routeKey) => {
    setCurrentRoute(routeKey);
  };

  const handleTogglePharmacyMode = () => {
    const nextMode = !isMultiBranch;
    setIsMultiBranch(nextMode);
    if (!nextMode && currentRoute === 'stock-transfer') {
      setCurrentRoute('stock-adjustments');
    }
    showToast(
      nextMode
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
      case 'stock-adjustments':
        return (
          <StockAdjustmentsScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={isMultiBranch}
          />
        );
      case 'stock-transfer':
        return isMultiBranch ? (
          <StockTransferScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
          />
        ) : (
          <StockAdjustmentsScreen
            onNavigate={handleNavigate}
            onShowToast={showToast}
            isMultiBranch={false}
          />
        );
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
          showToast(`Welcome back, ${user.display_name}!`);
        }}
      />
    );
  }

  return (
    <View style={styles.appContainer}>
      {/* 1. Fixed Left Sidebar */}
      {!isMobile && (
        <Sidebar
          activeItem={currentRoute}
          onNavigate={handleNavigate}
          isMultiBranch={isMultiBranch}
        />
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
          currentUser={currentUser}
          onSignOut={handleSignOut}
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
        animation: 'fadeIn 0.2s ease-in-out',
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
});
