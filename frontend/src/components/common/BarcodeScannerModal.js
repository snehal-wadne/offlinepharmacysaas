
import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
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
  const [cameraFacing, setCameraFacing] = useState('user');
  const [cameraStatusMessage, setCameraStatusMessage] = useState('Initializing webcam...');
  const [lastScanned, setLastScanned] = useState(null);
  const [imageScanning, setImageScanning] = useState(false);
  const [imageScanError, setImageScanError] = useState('');

  const laserAnim = useRef(new Animated.Value(0)).current;
  const lastFiredRef = useRef({ code: null, time: 0 });
  const html5ScannerRef = useRef(null);
  const scanLockedRef = useRef(false);
  const fileInputRef = useRef(null);

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

  // Web camera scanner
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') {
      setCameraActive(false);
      lastFiredRef.current = { code: null, time: 0 };
      return;
    }

    let cancelled = false;
    let scanner = null;
    let startPromise = null;

    scanLockedRef.current = false;
    setCameraActive(false);
    setCameraStatusMessage('Starting camera...');

    const startScanner = async () => {
      try {
        // 1. Wait for container DOM element to be mounted in DOM
        let elem = document.getElementById('pharmacy-barcode-reader');
        let attempts = 0;
        while (!elem && attempts < 20) {
          await new Promise((r) => setTimeout(r, 100));
          if (cancelled) return;
          elem = document.getElementById('pharmacy-barcode-reader');
          attempts++;
        }

        if (!elem) {
          throw new Error('Scanner viewfinder element not found. Please click retry.');
        }

        // Clean any leftover elements inside the container
        elem.innerHTML = '';

        const formatsToSupport = [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.CODABAR,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.UPC_EAN_EXTENSION,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
        ];

        scanner = new Html5Qrcode('pharmacy-barcode-reader', {
          formatsToSupport,
          verbose: false,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
        });

        html5ScannerRef.current = scanner;

        // 2. Discover available camera devices
        let cameraConfig = null;
        try {
          const cameras = await Html5Qrcode.getCameras();
          if (cameras && cameras.length > 0) {
            const targetRegex =
              cameraFacing === 'environment'
                ? /back|rear|environment/i
                : /front|user|face/i;
            const matchedCam = cameras.find((c) => targetRegex.test(c.label));
            cameraConfig = matchedCam ? matchedCam.id : cameras[0].id;
          }
        } catch (_) {
          // If enumerateDevices fails, fall back to facingMode constraint
        }

        if (!cameraConfig) {
          cameraConfig = { facingMode: { ideal: cameraFacing } };
        }

        const scanSuccessCallback = (decodedText) => {
          if (cancelled || scanLockedRef.current) return;

          console.log('CAMERA DETECTED:', decodedText);
          scanLockedRef.current = true;
          // Unlock scanner after 1.5 seconds so user can scan consecutive products
          setTimeout(() => {
            scanLockedRef.current = false;
          }, 1500);
          executeScan(decodedText);
        };

        const scanConfig = {
          fps: 20,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const edgeMin = Math.min(viewfinderWidth, viewfinderHeight);
            const w = Math.max(140, Math.floor(Math.min(viewfinderWidth * 0.9, 280)));
            const h = Math.max(100, Math.floor(Math.min(viewfinderHeight * 0.85, 200)));
            return {
              width: Math.min(w, Math.max(120, viewfinderWidth - 10)),
              height: Math.min(h, Math.max(100, viewfinderHeight - 10)),
            };
          },
        };

        startPromise = scanner.start(
          cameraConfig,
          scanConfig,
          scanSuccessCallback,
          () => {}
        );

        await startPromise;

        if (cancelled) return;

        setCameraActive(true);
        setCameraStatusMessage('Camera ready — hold barcode or QR code in front of camera');
      } catch (error) {
        if (!cancelled) {
          console.error('[Scanner]', error);
          setCameraActive(false);
          let reason = error?.message || 'Check camera permission';
          if (error?.name === 'NotAllowedError' || reason.toLowerCase().includes('permission')) {
            reason = 'Camera access blocked. Click "Allow Camera" or enable camera permission in your browser.';
          } else if (error?.name === 'NotFoundError' || reason.toLowerCase().includes('device')) {
            reason = 'No camera device detected on this system. You can type or upload barcode.';
          } else if (error?.name === 'NotReadableError') {
            reason = 'Camera is currently in use by another application.';
          }
          setCameraStatusMessage(reason);
        }
      }
    };

    const timer = setTimeout(startScanner, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      scanLockedRef.current = true;

      if (scanner) {
        const scannerToClean = scanner;

        const cleanup = async () => {
          try {
            if (startPromise) {
              await startPromise.catch(() => {});
            }

            if (scannerToClean.isScanning) {
              await scannerToClean.stop();
            }

            scannerToClean.clear();
          } catch (error) {
            console.warn('[Scanner cleanup]', error);
          }
        };

        cleanup();
      }

      if (html5ScannerRef.current === scanner) {
        html5ScannerRef.current = null;
      }
    };
  }, [visible, cameraFacing]);

  // Hardware Scanner Gun Listener
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;

    let buffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e) => {
      if (e.target && e.target.tagName === 'INPUT') {
        if (e.key === 'Enter') {
          const val = e.target.value;
          if (val && val.trim().length >= 2) {
            e.preventDefault();
            executeScan(val.trim(), { skipDedupe: true });
          }
        }
        return;
      }

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
    setCameraFacing((prev) =>
      prev === 'user' ? 'environment' : 'user'
    );
  };

  // Explicit user-gesture camera permission requester
  const handleRetryCamera = async () => {
    setCameraStatusMessage('Requesting camera access...');
    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach((t) => t.stop());
      }
      setCameraFacing((prev) => (prev === 'user' ? 'environment' : 'user'));
    } catch (err) {
      setCameraStatusMessage('Camera access blocked: ' + (err.message || 'Check browser permissions'));
    }
  };

  // Scan directly from an uploaded or dropped image file
  const handleImageFileUpload = async (event) => {
    const file = event?.target?.files?.[0];
    if (!file) return;

    setImageScanning(true);
    setImageScanError('');

    try {
      let decodedText = null;

      const formatsToSupport = [
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.CODE_93,
        Html5QrcodeSupportedFormats.CODABAR,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.UPC_EAN_EXTENSION,
        Html5QrcodeSupportedFormats.ITF,
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.DATA_MATRIX,
      ];

      if (html5ScannerRef.current) {
        decodedText = await html5ScannerRef.current.scanFile(file, true);
      } else {
        const tempScanner = new Html5Qrcode('pharmacy-barcode-reader', {
          formatsToSupport,
          verbose: false,
        });
        decodedText = await tempScanner.scanFile(file, true);
        tempScanner.clear();
      }

      if (decodedText) {
        setImageScanError('');
        executeScan(decodedText, { skipDedupe: true });
      } else {
        setImageScanError(
          'No barcode found in uploaded image. Please ensure the full barcode lines and numbers are clearly visible.'
        );
      }
    } catch (err) {
      console.warn('Image scan failed:', err);
      setImageScanError(
        'Could not decode barcode from image. Reason: ' +
          (err?.message || 'Barcode lines are blurry, low-resolution, or cut off.')
      );
    } finally {
      setImageScanning(false);
      if (event.target) event.target.value = '';
    }
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
                <Text style={styles.modalTitle} numberOfLines={1}>
                  {title}
                </Text>
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
              Universal Scanner Active: Simultaneously detects both 1D
              Barcodes and 2D QR Codes
            </Text>
          </View>

          {/* Live Camera Viewfinder Box */}
          <View style={styles.cameraViewportContainer}>
            {Platform.OS === 'web' ? (
              <div
                id="pharmacy-barcode-reader"
                style={{
                  width: '100%',
                  height: '100%',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  zIndex: 2,
                  overflow: 'hidden',
                  borderRadius: 12,
                }}
              />
            ) : null}

            {/* Fallback placeholder if camera not active */}
            {!cameraActive && (
              <View style={styles.placeholderCameraView}>
                <Text style={styles.viewfinderGridIcon}>🎯</Text>
                <Text style={styles.viewfinderText}>
                  {cameraStatusMessage}
                </Text>
                <Pressable
                  onPress={handleRetryCamera}
                  style={styles.retryCameraBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Allow camera access or retry"
                >
                  <Text style={styles.retryCameraBtnText}>📷 Allow Camera / Retry</Text>
                </Pressable>
                <Text style={styles.viewfinderSub}>
                  Hold barcode in front of camera or upload image below
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
                  {
                    transform: [
                      { translateY: laserTranslateY },
                    ],
                  },
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

            {/* Camera Switch / Flip Button inside viewport */}
            <Pressable
              onPress={handleToggleCamera}
              style={styles.cameraFlipBtn}
            >
              <Text style={styles.cameraFlipBtnText}>
                🔄 Flip (
                {cameraFacing === 'user'
                  ? 'Webcam / Face'
                  : 'Back'}
                )
              </Text>
            </Pressable>
          </View>

          {/* Action row: Flip Camera + Upload Image Barcode Button */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10, marginBottom: 8 }}>
            <Pressable
              onPress={handleToggleCamera}
              style={{
                flex: 1,
                backgroundColor: '#F1F5F9',
                borderColor: '#CBD5E1',
                borderWidth: 1,
                borderRadius: 8,
                paddingVertical: 9,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#334155' }}>
                🔄 Flip Camera ({cameraFacing === 'user' ? 'Face' : 'Back'})
              </Text>
            </Pressable>

            {Platform.OS === 'web' && (
              <Pressable
                onPress={() => fileInputRef.current?.click()}
                disabled={imageScanning}
                style={{
                  flex: 1,
                  backgroundColor: '#EFF6FF',
                  borderColor: '#3B82F6',
                  borderWidth: 1,
                  borderRadius: 8,
                  paddingVertical: 9,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  gap: 6,
                  opacity: imageScanning ? 0.6 : 1,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#1D4ED8' }}>
                  {imageScanning ? 'Scanning Image... ⏳' : '📁 Upload Barcode Image'}
                </Text>
              </Pressable>
            )}
          </View>

          {/* Hidden File Input for Image Upload */}
          {Platform.OS === 'web' && (
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleImageFileUpload}
            />
          )}

          {/* Image Scanning Failure / Diagnostic Error Notice */}
          {Boolean(imageScanError) && (
            <View
              style={{
                backgroundColor: '#FEF2F2',
                borderColor: '#FCA5A5',
                borderWidth: 1,
                borderRadius: 8,
                padding: 12,
                marginBottom: 10,
              }}
            >
              <Text style={{ color: '#DC2626', fontWeight: '700', fontSize: 13, marginBottom: 4 }}>
                ⚠️ Barcode Detection Issue
              </Text>
              <Text style={{ color: '#991B1B', fontSize: 12, lineHeight: 18 }}>
                {imageScanError}
              </Text>
              <Text style={{ color: '#6B7280', fontSize: 11, marginTop: 4 }}>
                💡 Tip: If scanning a barcode from another phone screen, increase screen brightness to 70%+ and reduce light reflections.
              </Text>
            </View>
          )}

          {/* Quick Scanner Guidance & Diagnostic Tips */}
          <View
            style={{
              backgroundColor: '#F8FAFC',
              borderColor: '#E2E8F0',
              borderWidth: 1,
              borderRadius: 8,
              padding: 10,
              marginBottom: 10,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#1E293B', marginBottom: 2 }}>
              🎯 How to scan barcode images & labels:
            </Text>
            <Text style={{ fontSize: 11, color: '#64748B', lineHeight: 16 }}>
              • Hold barcode 15–25 cm in front of camera, keeping stripes horizontal.{'\n'}
              • If holding a phone screen displaying the barcode, set brightness to 70%+ to avoid glare.{'\n'}
              • You can also click <Text style={{ fontWeight: '700', color: '#2563EB' }}>"📁 Upload Barcode Image"</Text> above to scan any screenshot directly.
            </Text>
          </View>

          {/* Feedback Banner when scanned (raw code — always shown) */}
          {lastScanned && (
            <View style={styles.scannedNoticeBox}>
              <Text style={styles.scannedNoticeText}>
                ✓ Scanned Successfully:{' '}
                <Text style={styles.scannedCodeText}>
                  {lastScanned}
                </Text>
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
                resultCard.status === 'error' && styles.resultCardBoxError,
              ]}
            >
              {resultCard.status === 'notfound' || resultCard.status === 'error' ? (
                <>
                  <Text
                    style={[
                      styles.resultCardTitle,
                      resultCard.status === 'error' && { color: '#DC2626' },
                    ]}
                  >
                    {resultCard.title ||
                      (resultCard.status === 'error'
                        ? `⚠️ Invalid Barcode Details ("${resultCard.code}")`
                        : `❓ No medicine found for "${resultCard.code}"`)}
                  </Text>
                  <Text
                    style={[
                      styles.resultCardSubtitle,
                      resultCard.status === 'error' && { color: '#991B1B' },
                    ]}
                  >
                    {resultCard.reason ||
                      'Try the manual search below, or check the SKU on the printed label.'}
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
            <Text style={styles.inputLabel}>
              Manual Barcode / QR Code Search:
            </Text>

            <View style={styles.inputRow}>
              <TextInput
                style={styles.textInput}
                placeholder={
                  mode === 'invoice'
                    ? 'Enter Invoice # (e.g. INV-1025)...'
                    : 'Enter barcode or QR text (e.g. 890114820251)...'
                }
                placeholderTextColor="#77717A"
                value={manualCode}
                onChangeText={setManualCode}
                onSubmitEditing={() => executeScan(manualCode, { skipDedupe: true })}
                autoFocus={true}
              />

              <Pressable
                onPress={() => executeScan(manualCode, { skipDedupe: true })}
                style={styles.scanActionBtn}
              >
                <Text style={styles.scanActionBtnText}>
                  Scan
                </Text>
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
                <Text style={styles.presetGroupTitle}>
                  Invoices (Returns):
                </Text>

                <View style={styles.chipRow}>
                  {sampleInvoices.map((inv) => (
                    <Pressable
                      key={inv}
                      onPress={() => executeScan(inv, { skipDedupe: true })}
                      style={styles.presetChipInvoice}
                    >
                      <Text style={styles.presetChipInvoiceText}>
                        {inv}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {mode === 'product' || mode === 'all' ? (
              <View style={styles.presetsGroup}>
                <Text style={styles.presetGroupTitle}>
                  Medicines (New Sale):
                </Text>

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
            <Pressable
              onPress={onClose}
              style={styles.doneBtn}
              accessibilityRole="button"
              accessibilityLabel="Close Scanner"
            >
              <Text style={styles.doneBtnText}>
                ✕ Close Scanner
              </Text>
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
    shadowColor: '#28242B',
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
    backgroundColor: '#E8D5DD',
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
    color: '#28242B',
  },
  modalSubtitle: {
    fontSize: 11,
    color: '#77717A',
    marginTop: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F8F5F7',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderWidth: 1,
    borderColor: '#E5DFE4',
    cursor: 'pointer',
    zIndex: 99,
  },
  closeBtnText: {
    fontSize: 16,
    color: '#28242B',
    fontWeight: '800',
  },

  // Unified Scanner Feature Banner
  unifiedFeatureBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EAF2EE',
    borderWidth: 1,
    borderColor: '#EAF2EE',
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
    color: '#4F8A72',
    flex: 1,
  },

  // Viewport Container
  cameraViewportContainer: {
    width: '100%',
    height: 240,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#28242B',
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
    color: '#E5DFE4',
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 360,
  },
  viewfinderSub: {
    color: '#77717A',
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },
  retryCameraBtn: {
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: '#059669',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
    cursor: 'pointer',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryCameraBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
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
    borderColor: '#4F8A72',
  },
  cornerTR: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 28,
    height: 28,
    borderTopWidth: 3.5,
    borderRightWidth: 3.5,
    borderColor: '#4F8A72',
  },
  cornerBL: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 28,
    height: 28,
    borderBottomWidth: 3.5,
    borderLeftWidth: 3.5,
    borderColor: '#4F8A72',
  },
  cornerBR: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderBottomWidth: 3.5,
    borderRightWidth: 3.5,
    borderColor: '#4F8A72',
  },
  laserLine: {
    position: 'absolute',
    left: 6,
    right: 6,
    top: 0,
    height: 2.5,
    backgroundColor: '#B85C64',
    shadowColor: '#B85C64',
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
    color: '#4F8A72',
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
    color: '#E5DFE4',
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
    backgroundColor: '#EAF2EE',
    borderWidth: 1,
    borderColor: '#EAF2EE',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  scannedNoticeText: {
    fontSize: 12,
    color: '#4F8A72',
    fontWeight: '600',
  },
  scannedCodeText: {
    fontWeight: '800',
    color: '#4F8A72',
  },

  // Persistent Scan Result Card
  resultCardBox: {
    backgroundColor: '#EAF2EE',
    borderWidth: 1.5,
    borderColor: '#EAF2EE',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  resultCardBoxWarn: {
    backgroundColor: '#F7F0E5',
    borderColor: '#F7F0E5',
  },
  resultCardBoxError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
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
    color: '#28242B',
    flex: 1,
  },
  resultCardQtyBadge: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#B9829A',
    backgroundColor: '#E8D5DD',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  resultCardSubtitle: {
    fontSize: 12,
    color: '#77717A',
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
    color: '#77717A',
    textTransform: 'uppercase',
  },
  resultCardStatValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#28242B',
    marginTop: 1,
  },
  resultCardStatValueLow: {
    color: '#B85C64',
  },

  // Manual Input
  manualInputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#28242B',
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  textInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#F8F5F7',
    borderWidth: 1,
    borderColor: '#E5DFE4',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#28242B',
    ...Platform.select({
      web: { outlineStyle: 'none' },
    }),
  },
  scanActionBtn: {
    backgroundColor: '#B9829A',
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
    backgroundColor: '#F8F5F7',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5DFE4',
    padding: 10,
    marginBottom: 12,
  },
  quickTestLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#77717A',
    marginBottom: 6,
  },
  presetsGroup: {
    marginBottom: 6,
  },
  presetGroupTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#77717A',
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
    borderColor: '#B9829A',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    cursor: 'pointer',
  },
  presetChipInvoiceText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B9829A',
  },
  presetChipProduct: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5DFE4',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    cursor: 'pointer',
  },
  presetChipProductText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#28242B',
  },

  // Footer
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5DFE4',
  },
  doneBtn: {
    backgroundColor: '#F8F5F7',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5DFE4',
    cursor: 'pointer',
  },
  doneBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#28242B',
  },
});