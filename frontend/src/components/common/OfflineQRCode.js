import React, { useMemo } from 'react';
import { View, Image, Text, StyleSheet, Platform } from 'react-native';
import { generateOfflineQRCode, generateOfflineQRCodeSvg } from '../../utils/qrGenerator';

/**
 * Universal Offline QR Code Component
 * - 100% Offline-resilient (0 network calls, 0 external APIs)
 * - Renders crisp vector SVG directly on Web (synchronous DOM injection)
 * - Uses Base64 SVG Data URI on Native platforms (iOS/Android)
 */
export default function OfflineQRCode({
  value,
  size = 200,
  style,
  showBadge = false,
  badgeText = '⚡ Scan to Pay',
  testID,
}) {
  const cleanValue = value ? String(value) : 'upi://pay';

  // Memoize SVG and Data URI to avoid recalculation unless value/size change
  const svgString = useMemo(() => {
    return generateOfflineQRCodeSvg(cleanValue, size);
  }, [cleanValue, size]);

  const dataUri = useMemo(() => {
    return generateOfflineQRCode(cleanValue, size);
  }, [cleanValue, size]);

  return (
    <View style={[styles.wrapper, { width: size, minHeight: size }, style]} testID={testID}>
      {Platform.OS === 'web' ? (
        <div
          style={{
            width: size,
            height: size,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            overflow: 'hidden',
          }}
          dangerouslySetInnerHTML={{ __html: svgString }}
        />
      ) : (
        <Image
          source={{ uri: dataUri }}
          style={{ width: size, height: size, backgroundColor: '#FFFFFF', borderRadius: 8 }}
          resizeMode="contain"
        />
      )}

      {showBadge && (
        <View style={styles.badgeContainer}>
          <Text style={styles.badgeText}>{badgeText}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 4,
  },
  badgeContainer: {
    marginTop: 6,
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
    textAlign: 'center',
  },
});
