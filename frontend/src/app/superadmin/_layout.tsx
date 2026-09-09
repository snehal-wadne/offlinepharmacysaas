import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, Slot, router, usePathname } from 'expo-router';

import { SuperAdminProvider } from './store';

export default function SuperAdminLayout() {
  return (
    <SuperAdminProvider>
      <SuperAdminShell />
    </SuperAdminProvider>
  );
}

function SuperAdminShell() {
  const pathname = usePathname();

  if (pathname === '/superadmin') {
    return <Redirect href="/superadmin/dashboard" />;
  }

  const isPharmacies = pathname.includes('pharmacies') ||
    pathname.includes('pharmacy-details') ||
    pathname.includes('add-pharmacy') ||
    pathname.includes('choose-plan') ||
    pathname.includes('payment') ||
    pathname.includes('confirmation');

  return (
    <View style={styles.shell}>
      <View style={styles.sidebar}>
        <View style={styles.brand}>
          <Text style={styles.brandSmall}>FALAHCODE</Text>
          <Text style={styles.brandName}>SAAS PLATFORM</Text>
        </View>

        <View style={styles.menu}>
          <MenuItem
            icon="▦"
            label="Dashboard"
            active={pathname.endsWith('/dashboard')}
            onPress={() => router.replace('/superadmin/dashboard')}
          />
          <MenuItem
            icon="♧"
            label="Pharmacies"
            active={isPharmacies}
            onPress={() => router.replace('/superadmin/pharmacies')}
          />
          <MenuItem
            icon="▤"
            label="Subscription Plans"
            active={pathname.endsWith('/subscription-plans')}
            onPress={() => router.replace('/superadmin/subscription-plans')}
          />
          <MenuItem
            icon="▣"
            label="Razor Pay Page"
            active={pathname.endsWith('/razorpay-payment')}
            onPress={() => router.replace('/superadmin/razorpay-payment')}
          />
        </View>

        <View style={styles.sidebarFooter}>
          <Text style={styles.logout}>↪ Logout</Text>
          <Text style={styles.date}>▣ 01 Sep - 30 Sep</Text>
        </View>
      </View>

      <View style={styles.main}>
        <View style={styles.topbar}>
          <Text style={styles.menuIcon}>☰</Text>
          <View style={styles.admin}>
            <View>
              <Text style={styles.adminName}>Super Admin</Text>
              <Text style={styles.adminRole}>Super Administrator</Text>
            </View>
            <Text style={styles.avatar}>SA</Text>
          </View>
        </View>
        <Slot />
      </View>
    </View>
  );
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
  sidebar: {
    width: 180,
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
    paddingHorizontal: 12,
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
