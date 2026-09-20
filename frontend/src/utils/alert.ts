import { Alert, Platform } from 'react-native';

/**
 * react-native-web's Alert.alert() is a no-op (it never renders anything),
 * so on web every Alert.alert(...) call silently does nothing. This wraps
 * it so messages are actually visible on web while using the native
 * Alert dialog everywhere else.
 */
export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.alert) {
      window.alert(message ? `${title}\n\n${message}` : title);
    }
    return;
  }
  Alert.alert(title, message);
}
