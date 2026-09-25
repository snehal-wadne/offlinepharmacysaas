import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  StyleSheet,
  Platform,
  Animated,
  ScrollView,
} from 'react-native';

export default function BarcodeScannerModal({
  visible,
  onClose,
  onScan,
  title = 'Barcode & QR Code Scanner',
  mode = 'all', // 'invoice' | 'product' | 'all'
  sampleInvoices = ['INV-1025', 'INV-1024', 'INV-1023', 'INV-1022', 'INV-1021'],
  // Optional rich, persistent result card the caller renders after
  // processing a scan (e.g. matched medicine name + live stock). Unlike
  // the transient "Scanned Successfully" line below, this stays on screen
  // until the caller clears it or a new scan overwrites it — it never
  // auto-hides on a timer.
  resultCard = null,
}) {
  const [manualCode, setManualCode] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraFacing, setCameraFacing] = useState('user'); // 'user' (front/webcam) | 'environment' (back)
  const [cameraStatusMessage, setCameraStatusMessage] = useState('Initializing webcam...');
  const [lastScanned, setLastScanned] = useState(null);

  const videoElementRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const laserAnim = useRef(new Animated.Value(0)).current;
  // Dedupe continuous camera detections of the same code (the scan loop
  // polls every 350ms, so a barcode held in frame would otherwise re-fire
  // onScan many times a second now that the modal stays open after a scan).
  const lastFiredRef = useRef({ code: null, time: 0 });

  // Sound feedback upon scan
  const triggerScanBeep = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1400, ctx.currentTime);
          gain.gain.setValueAtTime(0.2, ctx.currentTime);
          osc.start();
          osc.stop(ctx.currentTime + 0.12);
        }
      } catch (e) {
        // Audio error ignored
      }
    }
  };

  // Laser animation loop
  useEffect(() => {
    if (visible) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(laserAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(laserAnim, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [visible, laserAnim]);

  // Execute scan callback
  const executeScan = (code, { skipDedupe = false } = {}) => {
    if (!code || !code.trim()) return;
    const clean = code.trim();

    if (!skipDedupe) {
      const now = Date.now();
      const last = lastFiredRef.current;
      if (last.code === clean && now - last.time < 2500) {
        // Same code still in front of the camera — ignore the repeat fire
        // instead of re-adding/re-processing it every 350ms.
        return;
      }
      lastFiredRef.current = { code: clean, time: now };
    }

    triggerScanBeep();
    setLastScanned(clean);
    setManualCode('');
    if (onScan) {
      onScan(clean);
    }
  };

  // Callback ref that ensures the video DOM element connects to the stream immediately upon mounting
  const handleVideoRef = (el) => {
    videoElementRef.current = el;
    if (el && streamRef.current) {
      try {
        if (el.srcObject !== streamRef.current) {
          el.srcObject = streamRef.current;
        }
        el.muted = true;
        el.playsInline = true;
        el.play().catch((err) => {
          console.warn('[Scanner] video play in ref callback:', err.message);
        });
      } catch (err) {
        console.warn('[Scanner] error attaching stream in ref callback:', err);
      }
    }
  };

  // Setup Web Camera with fallback to ensure user camera / laptop webcam always works
  useEffect(() => {
    if (!visible) {
      // Clean up stream when modal is closed
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
      setCameraActive(false);
      lastFiredRef.current = { code: null, time: 0 };
      return;
    }

    let isMounted = true;

    async function startCamera() {
      if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        if (isMounted) {
          setCameraStatusMessage('Web camera not available on this platform. Hardware gun active.');
        }
        return;
      }

      // Stop previous stream if switching camera
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      setCameraStatusMessage('Connecting to webcam...');

      try {
        let stream = null;
        try {
          // Attempt 1: Try specific facingMode ('user' for front/laptop webcam or 'environment')
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: cameraFacing === 'user' ? 'user' : { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch (e1) {
          // Attempt 2: Fallback to basic { video: true } which always succeeds on laptop webcams
          console.warn('[Scanner] Trying fallback { video: true }...', e1.message);
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }

        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        setCameraActive(true);
        setCameraStatusMessage(
          cameraFacing === 'user'
            ? '🟢 Live Front Webcam (Face) Active'
            : '🟢 Live Back Camera Active'
        );

        // Attach stream to video DOM element if already mounted
        if (videoElementRef.current) {
          try {
            videoElementRef.current.srcObject = stream;
            videoElementRef.current.muted = true;
            videoElementRef.current.playsInline = true;
            videoElementRef.current.play().catch((err) => {
              console.warn('[Scanner] video.play notice:', err.message);
            });
          } catch (e) {
            console.warn('[Scanner] attach stream error:', e);
          }
        }

        // Automatic scanning loop for BOTH 1D Barcodes and 2D QR Codes
        if (typeof window !== 'undefined' && window.BarcodeDetector) {
          try {
            const barcodeDetector = new window.BarcodeDetector({
              formats: [
                'qr_code',
                'ean_13',
                'ean_8',
                'code_128',
                'code_39',
                'upc_a',
                'upc_e',
                'data_matrix',
              ],
            });

            scanIntervalRef.current = setInterval(async () => {
              const vid = videoElementRef.current;
              if (vid && vid.readyState >= 2 && !vid.paused) {
                try {
                  const detected = await barcodeDetector.detect(vid);
                  if (detected && detected.length > 0) {
                    const detectedValue = detected[0].rawValue;
                    if (detectedValue) {
                      executeScan(detectedValue);
                    }
                  }
                } catch (detectErr) {}
              }
            }, 350);
          } catch (detectorInitErr) {
            console.warn('[Scanner] BarcodeDetector init:', detectorInitErr);
          }
        }
      } catch (err) {
        if (!isMounted) return;
        console.warn('[Scanner] Camera error:', err.message);
        setCameraActive(false);
        setCameraStatusMessage(
          '⚠️ Camera permission blocked or unavailable. You can use manual input or test presets below.'
        );
      }
    }

    startCamera();

    return () => {
      isMounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    };
  }, [visible, cameraFacing]);

  // Hardware Scanner Gun Listener (captures rapid barcode keystrokes + Enter)
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;

    let buffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;

      const currentTime = Date.now();
      const diff = currentTime - lastKeyTime;
      lastKeyTime = currentTime;

      if (e.key === 'Enter') {
        if (buffer.length >= 3) {
          e.preventDefault();
          executeScan(buffer.trim(), { skipDedupe: true });
        }
        buffer = '';
      } else if (e.key.length === 1) {
        if (diff > 300) {
          buffer = e.key;
        } else {
          buffer += e.key;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible]);

  // Toggle front vs back camera
  const handleToggleCamera = () => {
    setCameraFacing((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  const sampleProducts = [
    { code: '890114820251', name: 'Paracetamol 500mg' },
    { code: '8904567890123', name: 'Azithromycin 500mg' },
    { code: '8905678901234', name: 'Cetirizine 10mg' },
    { code: '8907890123456', name: 'Vitamin C Tablets' },
    { code: '8908901234567', name: 'ORS Powder' },
    { code: '8903456789012', name: 'Pan 40 Tablets' },
  ];

  const laserTranslateY = laserAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 170],
  });

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconBadge}>
                <Text style={styles.headerIcon}>📷</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle} numberOfLines={1}>{title}</Text>
                <Text style={styles.modalSubtitle} numberOfLines={1}>
                  Supports QR Code, 1D/2D Barcodes & Hardware Scanners
                </Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close scanner"
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          {/* Scrollable body — camera, result card & manual/preset inputs.
              Keeps the header and the "Close Scanner" footer button always
              visible/reachable on short mobile viewports instead of the
              growing content (e.g. the result card) pushing the footer
              off-screen with no way to scroll down to it. */}
          <ScrollView
            style={styles.modalBody}
            contentContainerStyle={styles.modalBodyContent}
            showsVerticalScrollIndicator={false}
          >
          {/* Universal Unified Scanner Feature Banner */}
          <View style={styles.unifiedFeatureBanner}>
            <Text style={styles.unifiedFeatureIcon}>⚡</Text>
            <Text style={styles.unifiedFeatureText}>
              Universal Scanner Active: Simultaneously detects both 1D Barcodes and 2D QR Codes
            </Text>
          </View>

          {/* Live Camera Viewfinder Box */}
          <View style={styles.cameraViewportContainer}>
            {/* Native DOM <video> rendered directly by React for 100% reliable webcam display */}
            {Platform.OS === 'web' ? (
              <video
                ref={handleVideoRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  borderRadius: '12px',
                  zIndex: 2,
                  transform: cameraFacing === 'user' ? 'scaleX(-1)' : 'none',
                  backgroundColor: '#0F172A',
                }}
              />
            ) : null}

            {/* Fallback placeholder if camera not active */}
            {!cameraActive && (
              <View style={styles.placeholderCameraView}>
                <Text style={styles.viewfinderGridIcon}>🎯</Text>
                <Text style={styles.viewfinderText}>{cameraStatusMessage}</Text>
                <Text style={styles.viewfinderSub}>
                  Hold barcode or QR code in front of camera
                </Text>
              </View>
            )}

            {/* Viewfinder Target Reticle Overlay */}
            <View style={styles.reticleOverlay} pointerEvents="none">
              <View style={styles.cornerTL} />
              <View style={styles.cornerTR} />
              <View style={styles.cornerBL} />
              <View style={styles.cornerBR} />
              <Animated.View
                style={[
                  styles.laserLine,
                  { transform: [{ translateY: laserTranslateY }] },
                ]}
              />
              <View style={styles.centerAimCrosshair}>
                <Text style={styles.aimCrosshairText}>
                  🎯 SMART SCANNER (BARCODE & QR)
                </Text>
              </View>
            </View>

            {/* Top camera status pill overlay */}
            <View style={styles.cameraStatusPillOverlay}>
              <Text style={styles.cameraStatusPillText}>
                {cameraActive
                  ? cameraFacing === 'user'
                    ? '🟢 Live Webcam (Face) Active'
                    : '🟢 Live Back Camera Active'
                  : cameraStatusMessage}
              </Text>
            </View>

            {/* Camera Switch / Flip Button */}
            <Pressable onPress={handleToggleCamera} style={styles.cameraFlipBtn}>
              <Text style={styles.cameraFlipBtnText}>
                🔄 Flip ({cameraFacing === 'user' ? 'Webcam / Face' : 'Back'})
              </Text>
            </Pressable>
          </View>

          {/* Feedback Banner when scanned (raw code — always shown) */}
          {lastScanned && (
            <View style={styles.scannedNoticeBox}>
              <Text style={styles.scannedNoticeText}>
                ✓ Scanned Successfully:{' '}
                <Text style={styles.scannedCodeText}>{lastScanned}</Text>
              </Text>
            </View>
          )}

          {/* Persistent Result Card — stays on screen (no auto-hide timer)
              until the caller clears it or a new scan replaces it. */}
          {resultCard && (
            <View
              style={[
                styles.resultCardBox,
                resultCard.status === 'notfound' && styles.resultCardBoxWarn,
              ]}
            >
              {resultCard.status === 'notfound' ? (
                <>
                  <Text style={styles.resultCardTitle}>
                    ❓ No medicine found for "{resultCard.code}"
                  </Text>
                  <Text style={styles.resultCardSubtitle}>
                    Try the manual search below, or check the SKU on the
                    printed label.
                  </Text>
                </>
              ) : (
                <>
                  <View style={styles.resultCardHeaderRow}>
                    <Text style={styles.resultCardTitle} numberOfLines={2}>
                      ✓ {resultCard.name}
                    </Text>
                    {resultCard.qty ? (
                      <Text style={styles.resultCardQtyBadge}>
                        {resultCard.qty} in cart
                      </Text>
                    ) : null}
                  </View>
                  {resultCard.generic ? (
                    <Text style={styles.resultCardSubtitle}>
                      {resultCard.generic}
                    </Text>
                  ) : null}
                  <View style={styles.resultCardStatsRow}>
                    <View style={styles.resultCardStat}>
                      <Text style={styles.resultCardStatLabel}>Stock</Text>
                      <Text
                        style={[
                          styles.resultCardStatValue,
                          Number(resultCard.stock || 0) < 50 &&
                            styles.resultCardStatValueLow,
                        ]}
                      >
                        {Number(resultCard.stock || 0)} units
                      </Text>
                    </View>
                    {resultCard.price != null ? (
                      <View style={styles.resultCardStat}>
                        <Text style={styles.resultCardStatLabel}>Price</Text>
                        <Text style={styles.resultCardStatValue}>
                          ₹{Number(resultCard.price).toFixed(2)}
                        </Text>
                      </View>
                    ) : null}
                    {resultCard.batch ? (
                      <View style={styles.resultCardStat}>
                        <Text style={styles.resultCardStatLabel}>Batch</Text>
                        <Text style={styles.resultCardStatValue}>
                          {resultCard.batch}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </>
              )}
            </View>
          )}

          {/* Manual Input Bar */}
          <View style={styles.manualInputGroup}>
            <Text style={styles.inputLabel}>Manual Barcode / QR Code Search:</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.textInput}
                placeholder={
                  mode === 'invoice'
                    ? 'Enter Invoice # (e.g. INV-1025)...'
                    : 'Enter barcode or QR text (e.g. 890114820251)...'
                }
                placeholderTextColor="#94A3B8"
                value={manualCode}
                onChangeText={setManualCode}
                onSubmitEditing={() => executeScan(manualCode, { skipDedupe: true })}
                autoFocus={true}
              />
              <Pressable
                onPress={() => executeScan(manualCode, { skipDedupe: true })}
                style={styles.scanActionBtn}
              >
                <Text style={styles.scanActionBtnText}>Scan</Text>
              </Pressable>
            </View>
          </View>

          {/* 1-Click Simulation Buttons */}
          <View style={styles.quickTestSection}>
            <Text style={styles.quickTestLabel}>
              1-Click Test Codes (Test Instantly Without Camera):
            </Text>

            {mode === 'invoice' || mode === 'all' ? (
              <View style={styles.presetsGroup}>
                <Text style={styles.presetGroupTitle}>Invoices (Returns):</Text>
                <View style={styles.chipRow}>
                  {sampleInvoices.map((inv) => (
                    <Pressable
                      key={inv}
                      onPress={() => executeScan(inv, { skipDedupe: true })}
                      style={styles.presetChipInvoice}
                    >
                      <Text style={styles.presetChipInvoiceText}>{inv}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {mode === 'product' || mode === 'all' ? (
              <View style={styles.presetsGroup}>
                <Text style={styles.presetGroupTitle}>Medicines (New Sale):</Text>
                <View style={styles.chipRow}>
                  {sampleProducts.map((p) => (
                    <Pressable
                      key={p.code}
                      onPress={() => executeScan(p.code, { skipDedupe: true })}
                      style={styles.presetChipProduct}
                    >
                      <Text style={styles.presetChipProductText}>
                        {p.name.split(' ')[0]} ({p.code.slice(-4)})
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.modalFooter}>
            <Pressable onPress={onClose} style={styles.doneBtn} accessibilityRole="button" accessibilityLabel="Close Scanner">
              <Text style={styles.doneBtnText}>✕ Close Scanner</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    zIndex: 1000,
  },
  modalCard: {
    width: '100%',
    maxWidth: 540,
    maxHeight: '92%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    flexShrink: 1,
    overflow: 'hidden',
  },
  modalBody: {
    flexShrink: 1,
  },
  modalBodyContent: {
    flexGrow: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  headerIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#E6F4F1',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerIcon: {
    fontSize: 18,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    cursor: 'pointer',
    zIndex: 99,
  },
  closeBtnText: {
    fontSize: 16,
    color: '#1E293B',
    fontWeight: '800',
  },

  // Unified Scanner Feature Banner
  unifiedFeatureBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  unifiedFeatureIcon: {
    fontSize: 14,
  },
  unifiedFeatureText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
    flex: 1,
  },

  // Viewport Container
  cameraViewportContainer: {
    width: '100%',
    height: 240,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  placeholderCameraView: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    zIndex: 1,
  },
  viewfinderGridIcon: {
    fontSize: 34,
    marginBottom: 8,
  },
  viewfinderText: {
    color: '#E2E8F0',
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 360,
  },
  viewfinderSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },

  // Reticle Viewfinder Overlay
  reticleOverlay: {
    position: 'absolute',
    width: 240,
    height: 170,
    top: 35,
    left: '50%',
    marginLeft: -120,
    pointerEvents: 'none',
    zIndex: 3,
  },
  cornerTL: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 28,
    height: 28,
    borderTopWidth: 3.5,
    borderLeftWidth: 3.5,
    borderColor: '#10B981',
  },
  cornerTR: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 28,
    height: 28,
    borderTopWidth: 3.5,
    borderRightWidth: 3.5,
    borderColor: '#10B981',
  },
  cornerBL: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 28,
    height: 28,
    borderBottomWidth: 3.5,
    borderLeftWidth: 3.5,
    borderColor: '#10B981',
  },
  cornerBR: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderBottomWidth: 3.5,
    borderRightWidth: 3.5,
    borderColor: '#10B981',
  },
  laserLine: {
    position: 'absolute',
    left: 6,
    right: 6,
    top: 0,
    height: 2.5,
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 4,
  },
  centerAimCrosshair: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  aimCrosshairText: {
    color: '#34D399',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // Overlays inside Camera
  cameraStatusPillOverlay: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    zIndex: 4,
  },
  cameraStatusPillText: {
    color: '#E2E8F0',
    fontSize: 10.5,
    fontWeight: '700',
  },
  cameraFlipBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    zIndex: 4,
    cursor: 'pointer',
  },
  cameraFlipBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },

  // Scanned Notice
  scannedNoticeBox: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  scannedNoticeText: {
    fontSize: 12,
    color: '#065F46',
    fontWeight: '600',
  },
  scannedCodeText: {
    fontWeight: '800',
    color: '#047857',
  },

  // Persistent Scan Result Card
  resultCardBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#6EE7B7',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  resultCardBoxWarn: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D',
  },
  resultCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  resultCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
  },
  resultCardQtyBadge: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0F766E',
    backgroundColor: '#CCFBF1',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  resultCardSubtitle: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
    marginTop: 2,
  },
  resultCardStatsRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },
  resultCardStat: {},
  resultCardStatLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  resultCardStatValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 1,
  },
  resultCardStatValueLow: {
    color: '#B91C1C',
  },

  // Manual Input
  manualInputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  textInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#0F172A',
    ...Platform.select({ web: { outlineStyle: 'none' } }),
  },
  scanActionBtn: {
    backgroundColor: '#0F766E',
    paddingHorizontal: 18,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  scanActionBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },

  // Quick Test Presets
  quickTestSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    marginBottom: 12,
  },
  quickTestLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
  },
  presetsGroup: {
    marginBottom: 6,
  },
  presetGroupTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  presetChipInvoice: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#0F766E',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    cursor: 'pointer',
  },
  presetChipInvoiceText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F766E',
  },
  presetChipProduct: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    cursor: 'pointer',
  },
  presetChipProductText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },

  // Footer
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  doneBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    cursor: 'pointer',
  },
  doneBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
});
