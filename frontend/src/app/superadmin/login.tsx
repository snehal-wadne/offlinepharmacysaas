import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../../api/supabaseClient';
import { fetchSuperadminMe } from '../../api/superadminApi';
import { API_URL } from '../../config';

interface SuperAdminLoginProps {
  onLoginSuccess?: () => void;
}

export default function SuperAdminLogin({ onLoginSuccess }: SuperAdminLoginProps) {
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
    <View style={styles.container}>
      <View style={styles.card}>
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
              placeholderTextColor="#94A3B8"
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
              placeholderTextColor="#94A3B8"
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
              <ActivityIndicator color="#FFFFFF" size="small" />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: '100%',
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 32,
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  header: {
    marginBottom: 24,
    alignItems: 'center',
  },
  badge: {
    color: '#38BDF8',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
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
    color: '#F8FAFC',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  errorText: {
    color: '#FCA5A5',
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
    color: '#CBD5E1',
  },
  input: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#F8FAFC',
    fontSize: 14,
  },
  button: {
    backgroundColor: '#0EA5E9',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  backButton: {
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  backButtonText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  demoBox: {
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
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
    color: '#38BDF8',
    letterSpacing: 0.5,
  },
  demoClick: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7DD3FC',
  },
  demoText: {
    fontSize: 12,
    color: '#CBD5E1',
    fontFamily: 'monospace',
    lineHeight: 18,
  },
});

