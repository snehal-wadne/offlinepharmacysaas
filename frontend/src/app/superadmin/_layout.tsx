import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, Slot, router, usePathname, RouterProvider } from 'expo-router';

import { SuperAdminProvider } from './store';
import SuperAdminDashboard from './dashboard';
import PharmaciesTenantsPage from './pharmacies';
import PharmacyDetailsPage from './pharmacy-details';
import AddPharmacyPage from './add-pharmacy';
import ChoosePlanPage from './choose-plan';
import PharmacyPaymentPage from './payment';
import ConfirmationPage from './confirmation';
import SubscriptionPlansPage from './subscription-plans';
import RazorPayPaymentsPage from './razorpay-payment';
import SuperAdminLogin from './login';
import { fetchSuperadminMe } from '../../api/superadminApi';
import { supabase } from '../../api/supabaseClient';
import { useIsMobile } from '../../utils/responsive';

export default function SuperAdminLayout() {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminUser, setAdminUser] = useState<any>(null);

  const checkAuth = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setIsAuthenticated(false);
        setAdminUser(null);
        setLoading(false);
        return;
      }

      const res = await fetchSuperadminMe();
      if (res.success && (res.user?.isPlatformSuperadmin || res.user?.role === 'SUPERADMIN')) {
        setIsAuthenticated(true);
        setAdminUser(res.user);
      } else {
        setIsAuthenticated(false);
        setAdminUser(null);
      }
    } catch (e) {
      setIsAuthenticated(false);
      setAdminUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkAuth();
    });
    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setIsAuthenticated(false);
    setAdminUser(null);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F172A' }}>
        <ActivityIndicator size="large" color="#38BDF8" />
        <Text style={{ marginTop: 12, color: '#94A3B8', fontSize: 13, fontWeight: '600' }}>
          Verifying Superadmin Clearance...
        </Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return <SuperAdminLogin onLoginSuccess={() => checkAuth()} />;
  }

  return (
    <RouterProvider>
      <SuperAdminProvider>
        <SuperAdminShell adminUser={adminUser} onSignOut={handleSignOut} />
      </SuperAdminProvider>
    </RouterProvider>
  );
}

function SuperAdminShell({ adminUser, onSignOut }: { adminUser?: any; onSignOut: () => void }) {
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (pathname === '/superadmin') {
    return <Redirect href="/superadmin/dashboard" />;
  }

  const isPharmacies = pathname.includes('pharmacies') ||
    pathname.includes('pharmacy-details') ||
    pathname.includes('add-pharmacy') ||
    pathname.includes('choose-plan') ||
    pathname.includes('payment') ||
    pathname.includes('confirmation');

  const goTo = (href: string) => {
    setSidebarOpen(false);
    router.replace(href);
  };

  const showSidebar = !isMobile || sidebarOpen;

  return (
    <View style={[styles.shell, isMobile && styles.shellMobile]}>
      {showSidebar && (
        <View style={[styles.sidebar, isMobile && styles.sidebarMobile]}>
          <View style={styles.brand}>
            <Text style={styles.brandSmall}>FALAHCODE</Text>
            <Text style={styles.brandName}>SAAS PLATFORM</Text>
          </View>

          <View style={styles.menu}>
            <MenuItem
              icon="▦"
              label="Dashboard"
              active={pathname.endsWith('/dashboard')}
              onPress={() => goTo('/superadmin/dashboard')}
            />
            <MenuItem
              icon="♧"
              label="Pharmacies"
              active={isPharmacies}
              onPress={() => goTo('/superadmin/pharmacies')}
            />
            <MenuItem
              icon="▤"
              label="Subscription Plans"
              active={pathname.endsWith('/subscription-plans')}
              onPress={() => goTo('/superadmin/subscription-plans')}
            />
            <MenuItem
              icon="▣"
              label="Razor Pay Page"
              active={pathname.endsWith('/razorpay-payment')}
              onPress={() => goTo('/superadmin/razorpay-payment')}
            />
          </View>

          <View style={styles.sidebarFooter}>
            <Pressable onPress={onSignOut}>
              <Text style={styles.logout}>⎋ Sign Out</Text>
            </Pressable>
            <Pressable onPress={() => { if (typeof window !== 'undefined') window.location.href = '/'; }}>
              <Text style={[styles.logout, { color: '#627D98' }]}>↪ Back to ERP</Text>
            </Pressable>
            <Text style={styles.date}>▣ 01 Sep - 30 Sep</Text>
          </View>
        </View>
      )}

      {isMobile && sidebarOpen && (
        <Pressable style={styles.sidebarOverlay} onPress={() => setSidebarOpen(false)} />
      )}

      <View style={styles.main}>
        <View style={styles.topbar}>
          <Pressable onPress={() => setSidebarOpen((open) => !open)} hitSlop={10}>
            <Text style={styles.menuIcon}>☰</Text>
          </Pressable>
          <View style={styles.admin}>
            {!isMobile && (
              <View>
                <Text style={styles.adminName}>{adminUser?.name || 'Super Admin'}</Text>
                <Text style={styles.adminRole}>{adminUser?.email || 'Super Administrator'}</Text>
              </View>
            )}
            <Text style={styles.avatar}>
              {(adminUser?.name || 'SA')
                .split(' ')
                .map((n: string) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </Text>
          </View>
        </View>
        {renderSuperAdminContent(pathname)}
      </View>
    </View>
  );
}

function renderSuperAdminContent(pathname: string) {
  if (pathname.includes('pharmacy-details')) return <PharmacyDetailsPage />;
  if (pathname.includes('add-pharmacy')) return <AddPharmacyPage />;
  if (pathname.includes('choose-plan')) return <ChoosePlanPage />;
  if (pathname.includes('payment') && !pathname.includes('razorpay')) return <PharmacyPaymentPage />;
  if (pathname.includes('confirmation')) return <ConfirmationPage />;
  if (pathname.includes('pharmacies')) return <PharmaciesTenantsPage />;
  if (pathname.includes('subscription-plans')) return <SubscriptionPlansPage />;
  if (pathname.includes('razorpay-payment')) return <RazorPayPaymentsPage />;
  return <SuperAdminDashboard />;
}

function MenuItem({
  icon,
  label,
  active,
  onPress,
}: {
  icon: string;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.menuItem, active && styles.activeMenu]} onPress={onPress}>
      <Text style={[styles.menuIconText, active && styles.activeText]}>{icon}</Text>
      <Text style={[styles.menuLabel, active && styles.activeText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row', backgroundColor: '#F8FAFC' },
  shellMobile: { position: 'relative' },
  sidebar: {
    width: 180,
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
    paddingHorizontal: 12,
  },
  sidebarMobile: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: 20,
    elevation: 20,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  sidebarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    zIndex: 10,
    elevation: 10,
  },
  brand: { paddingHorizontal: 14, paddingTop: 18, paddingBottom: 25 },
  brandSmall: { color: '#627D98', fontSize: 9, fontWeight: '700' },
  brandName: { color: '#147D64', fontSize: 15, fontWeight: '900', marginTop: 2 },
  menu: { gap: 4 },
  menuItem: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  activeMenu: { backgroundColor: '#E2F5EF' },
  menuIconText: { color: '#627D98', fontSize: 16, width: 18, textAlign: 'center' },
  menuLabel: { color: '#52606D', fontSize: 12, fontWeight: '600' },
  activeText: { color: '#147D64', fontWeight: '800' },
  sidebarFooter: { marginTop: 'auto', paddingBottom: 18, gap: 14 },
  logout: { color: '#B94A48', fontSize: 12, fontWeight: '700', paddingHorizontal: 12 },
  date: {
    color: '#52606D',
    fontSize: 11,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 7,
    padding: 8,
  },
  main: { flex: 1, minWidth: 0 },
  topbar: {
    height: 52,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
  },
  menuIcon: { color: '#243B53', fontSize: 18 },
  admin: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  adminName: { color: '#102A43', fontSize: 12, fontWeight: '800', textAlign: 'right' },
  adminRole: { color: '#829AB1', fontSize: 9, textAlign: 'right' },
  avatar: {
    color: '#FFFFFF',
    backgroundColor: '#147D64',
    borderRadius: 18,
    width: 32,
    height: 32,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 11,
    fontWeight: '800',
  },
});
