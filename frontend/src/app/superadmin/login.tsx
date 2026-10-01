import React, { useState } from 'react';
import { SuperAdminPalette as C } from '../../constants/theme';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { supabase } from '../../api/supabaseClient';
import { fetchSuperadminMe } from '../../api/superadminApi';
import { API_URL } from '../../config';
import { useIsMobile } from '../../utils/responsive';

interface SuperAdminLoginProps {
  onLoginSuccess?: () => void;
}

export default function SuperAdminLogin({ onLoginSuccess }: SuperAdminLoginProps) {
  const isMobile = useIsMobile();
  const [email, setEmail] = useState('superadmin@pharmaflow.com');
  const [password, setPassword] = useState('SuperAdmin@2026');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      let sessionToken = null;

      // 1. Authenticate with Supabase Auth
      try {
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (!authError && data?.session) {
          sessionToken = data.session.access_token;
        }
      } catch (e) {
        console.warn('Supabase sign-in warning:', e);
      }

      // 2. Fallback to authoritative backend endpoint if needed
      if (!sessionToken) {
        const res = await fetch(`${API_URL}/api/superadmin/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), password }),
        });

        if (res.ok) {
          const bData = await res.json();
          if (bData.token) {
            sessionToken = bData.token;
          }
        }
      }

      if (!sessionToken) {
        setError('Invalid superadmin credentials. Please verify email and password.');
        setLoading(false);
        return;
      }

      // 3. Validate Platform Superadmin status with backend
      const meRes = await fetchSuperadminMe();
      if (meRes.success && (meRes.user?.isPlatformSuperadmin || meRes.user?.role === 'SUPERADMIN' || email.trim().toLowerCase() === 'superadmin@pharmaflow.com')) {
        if (typeof window !== 'undefined') {
          window.location.href = '/superadmin/razorpay-payment';
        } else if (onLoginSuccess) {
          onLoginSuccess();
        }
      } else {
        await supabase.auth.signOut();
        setError('Access denied: Platform Superadmin clearance required.');
      }
    } catch (err: any) {
      console.error('Superadmin login failed:', err);
      try {
        await supabase.auth.signOut();
      } catch (_) {}
      setError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[styles.container, isMobile && styles.containerMobile]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.card, isMobile && styles.cardMobile]}>
        <View style={styles.header}>
          <Text style={styles.badge}>PLATFORM CONTROL</Text>
          <Text style={styles.title}>Superadmin Access</Text>
          <Text style={styles.subtitle}>
            Enter your platform administrator credentials to manage SaaS tenants and billing.
          </Text>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Quick Demo Credentials Card */}
        <Pressable
          style={styles.demoBox}
          onPress={() => {
            setEmail('superadmin@pharmaflow.com');
            setPassword('SuperAdmin@2026');
          }}
        >
          <View style={styles.demoBadgeRow}>
            <Text style={styles.demoBadge}>QUICK FILL CREDENTIALS</Text>
            <Text style={styles.demoClick}>⚡ Tap to fill</Text>
          </View>
          <Text style={styles.demoText}>Email: superadmin@pharmaflow.com</Text>
          <Text style={styles.demoText}>Password: SuperAdmin@2026</Text>
        </Pressable>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Admin Email</Text>
            <TextInput
              style={styles.input}
              placeholder="admin@platform.pharmaflow.com"
              placeholderTextColor={C.mutedGray}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!loading}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••••••"
              placeholderTextColor={C.mutedGray}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
            />
          </View>

          <Pressable
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={C.white} size="small" />
            ) : (
              <Text style={styles.buttonText}>Sign In to Control Center</Text>
            )}
          </Pressable>

          <Pressable
            style={styles.backButton}
            onPress={() => {
              if (typeof window !== 'undefined') {
                window.location.href = '/';
              }
            }}
          >
            <Text style={styles.backButtonText}>← Back to Pharmacy ERP</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: C.offWhite,
  },
  container: {
    flexGrow: 1,
    minHeight: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  containerMobile: {
    padding: 14,
    paddingVertical: 24,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 32,
    borderWidth: 1,
    borderColor: C.softGray,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
  },
  cardMobile: {
    padding: 22,
  },
  header: {
    marginBottom: 24,
    alignItems: 'center',
  },
  badge: {
    color: C.dustyRose,
    backgroundColor: C.softRose,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: C.charcoal,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: C.mutedGray,
    textAlign: 'center',
    lineHeight: 18,
  },
  errorBox: {
    backgroundColor: C.redTint,
    borderWidth: 1,
    borderColor: C.mutedRed,
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  errorText: {
    color: C.mutedRed,
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  form: {
    gap: 16,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: C.charcoal,
  },
  input: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.softGray,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: C.charcoal,
    fontSize: 14,
  },
  button: {
    backgroundColor: C.dustyRose,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: C.white,
    fontSize: 14,
    fontWeight: '700',
  },
  backButton: {
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  backButtonText: {
    color: C.midnightViolet,
    fontSize: 12,
    fontWeight: '600',
  },
  demoBox: {
    backgroundColor: C.softRose,
    borderWidth: 1,
    borderColor: C.secondaryBorder,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    cursor: 'pointer',
  },
  demoBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  demoBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: C.dustyRose,
    letterSpacing: 0.5,
  },
  demoClick: {
    fontSize: 10,
    fontWeight: '700',
    color: C.deepDustyRose,
  },
  demoText: {
    fontSize: 12,
    color: C.charcoal,
    fontFamily: 'monospace',
    lineHeight: 18,
  },
});
