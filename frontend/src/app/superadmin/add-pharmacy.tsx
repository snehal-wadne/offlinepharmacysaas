import React, { useEffect, useState } from 'react';
import { SuperAdminPalette as C } from '../../constants/theme';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { notify } from '../../utils/alert';
import { useIsMobile } from '../../utils/responsive';

type FormData = {
  name: string;
  adminName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  branches: string;
  gstNumber: string;
  businessType: string;
};

const INITIAL_FORM: FormData = {
  name: '',
  adminName: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  branches: '1',
  gstNumber: '',
  businessType: 'Private Limited',
};

export const ADD_PHARMACY_DRAFT_KEY = 'pharmaflow.add-pharmacy-draft';

function getParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function readDraft(): Partial<FormData> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.sessionStorage.getItem(ADD_PHARMACY_DRAFT_KEY) || '{}');
  } catch {
    return {};
  }
}

export function clearAddPharmacyDraft() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(ADD_PHARMACY_DRAFT_KEY);
}

export default function AddPharmacyPage() {
  const params = useLocalSearchParams<Partial<FormData> & {
    mode?: string;
    pharmacyId?: string;
  }>();
  const mode = params.mode || 'create';
  const isMobile = useIsMobile();
  const [form, setForm] = useState<FormData>(() => {
    const draft = readDraft();
    return {
      name: getParam(params.name) || draft.name || INITIAL_FORM.name,
      adminName: getParam(params.adminName) || draft.adminName || INITIAL_FORM.adminName,
      email: getParam(params.email) || draft.email || INITIAL_FORM.email,
      phone: getParam(params.phone) || draft.phone || INITIAL_FORM.phone,
      address: getParam(params.address) || draft.address || INITIAL_FORM.address,
      city: getParam(params.city) || draft.city || INITIAL_FORM.city,
      state: getParam(params.state) || draft.state || INITIAL_FORM.state,
      pincode: getParam(params.pincode) || draft.pincode || INITIAL_FORM.pincode,
      branches: getParam(params.branches) || draft.branches || INITIAL_FORM.branches,
      gstNumber: getParam(params.gstNumber) || draft.gstNumber || INITIAL_FORM.gstNumber,
      businessType: getParam(params.businessType) || draft.businessType || INITIAL_FORM.businessType,
    };
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(ADD_PHARMACY_DRAFT_KEY, JSON.stringify(form));
  }, [form]);

  const updateField = (field: keyof FormData, value: string) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const validateForm = () => {
    if (!form.name.trim()) {
      notify('Required', 'Please enter pharmacy name.');
      return false;
    }

    if (!form.adminName.trim()) {
      notify('Required', 'Please enter owner/contact person.');
      return false;
    }

    if (!form.email.trim()) {
      notify('Required', 'Please enter email address.');
      return false;
    }

    if (!form.phone.trim()) {
      notify('Required', 'Please enter phone number.');
      return false;
    }

    if (!form.address.trim()) {
      notify('Required', 'Please enter business address.');
      return false;
    }

    return true;
  };

  const saveAndContinue = () => {
    if (!validateForm()) return;

    router.push({
      pathname: '/superadmin/choose-plan',
      params: {
        mode,
        pharmacyId: getParam(params.pharmacyId),
        name: form.name,
        adminName: form.adminName,
        email: form.email,
        phone: form.phone,
        address: form.address,
        city: form.city,
        state: form.state,
        pincode: form.pincode,
        branches: form.branches,
        gstNumber: form.gstNumber,
        businessType: form.businessType,
      },
    });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, isMobile && styles.contentMobile]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.breadcrumb}>
        <Pressable
          onPress={() => router.replace('/superadmin/pharmacies')}
        >
          <Text style={styles.breadcrumbLink}>Pharmacies</Text>
        </Pressable>

        <Text style={styles.separator}>/</Text>
        <Text style={styles.breadcrumbText}>Add New Pharmacy</Text>
      </View>

      <View style={[styles.steps, isMobile && styles.stepsMobile]}>
        <Step number="1" title="Business Details" active compact={isMobile} />
        <Step number="2" title="Choose Plan" compact={isMobile} />
        <Step number="3" title="Payment" compact={isMobile} />
        <Step number="4" title="Confirmation" compact={isMobile} />
      </View>

      <Text style={styles.title}>Onboard New Pharmacy</Text>
      <Text style={styles.subtitle}>
        Enter details of new business partner
      </Text>

      <View style={styles.mainGrid}>
        <View style={[styles.formCard, isMobile && styles.fullWidthCard]}>
          <Text style={styles.cardTitle}>
            Pharmacy / Business Information
          </Text>

          <FormField
            label="Pharmacy Name"
            required
            value={form.name}
            placeholder="Al Noor Pharmacy"
            onChangeText={(value) => updateField('name', value)}
          />

          <FormField
            label="Owner / Contact Person"
            required
            value={form.adminName}
            placeholder="Mohammed Ali"
            onChangeText={(value) => updateField('adminName', value)}
          />

          <FormField
            label="Email (Login ID)"
            required
            value={form.email}
            placeholder="admin@pharmacy.com"
            keyboardType="email-address"
            onChangeText={(value) => updateField('email', value)}
          />

          <Text style={styles.helperText}>
            This email will be used as Login ID for the admin.
          </Text>

          <FormField
            label="Phone / Mobile"
            required
            value={form.phone}
            placeholder="+91 98765 43210"
            keyboardType="phone-pad"
            onChangeText={(value) => updateField('phone', value)}
          />

          <FormField
            label="Business Address"
            required
            value={form.address}
            placeholder="No. 12, Residency Road, Shanthala Nagar"
            multiline
            onChangeText={(value) => updateField('address', value)}
          />

          <View style={[styles.threeFields, isMobile && styles.threeFieldsMobile]}>
            <View style={styles.cityField}>
              <FormField
                label="City"
                required
                value={form.city}
                placeholder="Bangalore"
                onChangeText={(value) => updateField('city', value)}
              />
            </View>

            <View style={styles.stateField}>
              <FormField
                label="State"
                required
                value={form.state}
                placeholder="Karnataka"
                onChangeText={(value) => updateField('state', value)}
              />
            </View>

            <View style={styles.pincodeField}>
              <FormField
                label="Pincode"
                required
                value={form.pincode}
                placeholder="560001"
                keyboardType="number-pad"
                onChangeText={(value) => updateField('pincode', value)}
              />
            </View>
          </View>
        </View>

        <View style={[styles.rightColumn, isMobile && styles.fullWidthCard]}>
          <View style={styles.formCard}>
            <Text style={styles.cardTitle}>Additional Information</Text>

            <FormField
              label="Number of Branches"
              required
              value={form.branches}
              placeholder="1"
              keyboardType="number-pad"
              onChangeText={(value) => updateField('branches', value)}
            />

            <FormField
              label="GST Number"
              value={form.gstNumber}
              placeholder="29ABCDE1234F1Z5"
              onChangeText={(value) => updateField('gstNumber', value)}
            />

            <FormField
              label="Business Type"
              value={form.businessType}
              placeholder="Private Limited"
              onChangeText={(value) => updateField('businessType', value)}
            />
          </View>

          <View style={styles.nextCard}>
            <Text style={styles.nextTitle}>What happens next?</Text>

            <Text style={styles.nextItem}>
              1. You will select a subscription plan in the next step.
            </Text>

            <Text style={styles.nextItem}>
              2. Complete payment to activate the pharmacy.
            </Text>

            <Text style={styles.nextItem}>
              3. Login ID and initial password will be generated.
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.bottomActions}>
        <Pressable
          style={styles.cancelButton}
          onPress={() => {
            clearAddPharmacyDraft();
            router.replace('/superadmin/pharmacies');
          }}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>

        <Pressable
          style={styles.continueButton}
          onPress={saveAndContinue}
        >
          <Text style={styles.continueText}>Save & Continue</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Step({
  number,
  title,
  active = false,
  compact = false,
}: {
  number: string;
  title: string;
  active?: boolean;
  compact?: boolean;
}) {
  return (
    <View style={[styles.step, compact && styles.stepMobile]}>
      <View style={[styles.stepCircle, active && styles.activeStepCircle]}>
        <Text style={[styles.stepNumber, active && styles.activeStepNumber]}>
          {number}
        </Text>
      </View>

      <Text style={[styles.stepTitle, active && styles.activeStepTitle]}>
        {title}
      </Text>
    </View>
  );
}

function FormField({
  label,
  value,
  placeholder,
  required = false,
  multiline = false,
  keyboardType = 'default',
  onChangeText,
}: {
  label: string;
  value: string;
  placeholder: string;
  required?: boolean;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'number-pad';
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>

      <TextInput
        value={value}
        placeholder={placeholder}
        placeholderTextColor={C.mutedGray}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        onChangeText={onChangeText}
        style={[styles.input, multiline && styles.multilineInput]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.offWhite,
  },
  content: {
    padding: 24,
    paddingBottom: 45,
  },
  contentMobile: {
    padding: 14,
    paddingBottom: 32,
  },
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 18,
  },
  breadcrumbLink: {
    color: C.mutedGray,
    fontSize: 13,
  },
  separator: {
    color: C.mutedGray,
  },
  breadcrumbText: {
    color: C.charcoal,
    fontSize: 13,
    fontWeight: '800',
  },
  steps: {
    minHeight: 64,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.softGray,
    backgroundColor: C.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  stepsMobile: {
    minHeight: 0,
    padding: 12,
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 12,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  stepMobile: {
    width: '47%',
    gap: 6,
  },
  stepCircle: {
    width: 24,
    height: 24,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.softGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeStepCircle: {
    borderColor: C.dustyRose,
    backgroundColor: C.dustyRose,
  },
  stepNumber: {
    color: C.mutedGray,
    fontSize: 11,
    fontWeight: '800',
  },
  activeStepNumber: {
    color: C.white,
  },
  stepTitle: {
    color: C.mutedGray,
    fontSize: 12,
  },
  activeStepTitle: {
    color: C.dustyRose,
    fontWeight: '800',
  },
  title: {
    color: C.charcoal,
    fontSize: 28,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 5,
    color: C.mutedGray,
    fontSize: 14,
    marginBottom: 20,
  },
  mainGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
  },
  formCard: {
    flex: 1,
    minWidth: 480,
    padding: 22,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.softGray,
    backgroundColor: C.white,
  },
  rightColumn: {
    flex: 0.7,
    minWidth: 340,
    gap: 18,
  },
  fullWidthCard: {
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
    flexBasis: '100%',
    padding: 16,
  },
  cardTitle: {
    marginBottom: 12,
    color: C.charcoal,
    fontSize: 16,
    fontWeight: '900',
  },
  field: {
    marginBottom: 12,
  },
  label: {
    marginBottom: 6,
    color: C.mutedGray,
    fontSize: 12,
    fontWeight: '800',
  },
  required: {
    color: C.mutedRed,
  },
  input: {
    minHeight: 42,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.softGray,
    backgroundColor: C.white,
    color: C.charcoal,
    fontSize: 13,
  },
  multilineInput: {
    minHeight: 78,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  helperText: {
    marginTop: -6,
    marginBottom: 11,
    color: C.mutedGray,
    fontSize: 10,
  },
  threeFields: {
    flexDirection: 'row',
    gap: 10,
  },
  threeFieldsMobile: {
    flexDirection: 'column',
    gap: 0,
  },
  cityField: {
    flex: 1,
  },
  stateField: {
    flex: 1,
  },
  pincodeField: {
    flex: 1,
  },
  nextCard: {
    padding: 18,
    borderRadius: 12,
    backgroundColor: C.sageTint,
  },
  nextTitle: {
    marginBottom: 10,
    color: C.sageGreen,
    fontSize: 14,
    fontWeight: '900',
  },
  nextItem: {
    marginTop: 8,
    color: C.sageGreen,
    fontSize: 12,
    lineHeight: 18,
  },
  bottomActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 18,
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.secondaryBorder,
    backgroundColor: C.white,
  },
  cancelText: {
    color: C.midnightViolet,
    fontSize: 13,
    fontWeight: '800',
  },
  continueButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: C.dustyRose,
  },
  continueText: {
    color: C.white,
    fontSize: 13,
    fontWeight: '800',
  },
});
