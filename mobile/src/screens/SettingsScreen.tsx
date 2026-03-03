import { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import {
  List,
  Divider,
  Button,
  Text,
  ActivityIndicator,
  Banner,
  useTheme,
  Snackbar,
} from "react-native-paper";
import * as AuthSession from "expo-auth-session";
import {
  useGoogleAuth,
  exchangeCodeForToken,
  revokeAuth,
  isAuthenticated,
} from "../services/googleAuth";
import { fullSync, getLastSyncAt } from "../services/syncService";
import { GOOGLE_CLIENT_ID } from "../config";

export default function SettingsScreen() {
  const theme = useTheme();
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [snackMsg, setSnackMsg] = useState("");

  const { request, response, promptAsync } = useGoogleAuth();

  const checkAuth = useCallback(async () => {
    setLoading(true);
    setAuthed(await isAuthenticated());
    setLastSync(await getLastSyncAt());
    setLoading(false);
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Handle OAuth redirect callback
  useEffect(() => {
    if (response?.type !== "success") return;
    const { code } = response.params;
    const redirectUri = AuthSession.makeRedirectUri({
      scheme: "com.pomodoroom.mobile",
    });

    (async () => {
      try {
        setLoading(true);
        await exchangeCodeForToken(code, redirectUri, request!.codeVerifier!);
        await checkAuth();
        setSnackMsg("Google アカウントに接続しました");
      } catch (e) {
        setSnackMsg(`認証エラー: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [response, request, checkAuth]);

  const handleConnect = () => {
    if (!GOOGLE_CLIENT_ID) {
      setSnackMsg("EXPO_PUBLIC_GOOGLE_CLIENT_ID が設定されていません");
      return;
    }
    promptAsync();
  };

  const handleDisconnect = async () => {
    setLoading(true);
    await revokeAuth();
    await checkAuth();
    setSnackMsg("Google アカウントを切断しました");
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fullSync();
      setLastSync(await getLastSyncAt());
      setSnackMsg("同期が完了しました");
    } catch (e) {
      setSnackMsg(`同期エラー: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {!GOOGLE_CLIENT_ID && (
        <Banner visible icon="alert" actions={[]}>
          EXPO_PUBLIC_GOOGLE_CLIENT_ID が未設定です。.env ファイルに設定してください。
        </Banner>
      )}

      <List.Section title="Google Calendar 連携">
        <List.Item
          title="接続状態"
          description={authed ? "接続済み ✓" : "未接続"}
          left={(props) => (
            <List.Icon
              {...props}
              icon={authed ? "check-circle" : "circle-outline"}
              color={authed ? theme.colors.primary : "gray"}
            />
          )}
        />
        <Divider />
        {authed ? (
          <>
            <View style={styles.buttonRow}>
              <Button
                mode="contained"
                onPress={handleSync}
                loading={syncing}
                disabled={syncing}
                icon="sync"
                style={styles.button}
              >
                今すぐ同期
              </Button>
              <Button
                mode="outlined"
                onPress={handleDisconnect}
                icon="logout"
                style={styles.button}
                textColor={theme.colors.error}
              >
                切断
              </Button>
            </View>
            {lastSync && (
              <Text variant="bodySmall" style={styles.lastSync}>
                最終同期: {new Date(lastSync).toLocaleString("ja-JP")}
              </Text>
            )}
          </>
        ) : (
          <View style={styles.buttonRow}>
            <Button
              mode="contained"
              onPress={handleConnect}
              icon="google"
              style={styles.button}
            >
              Google でログイン
            </Button>
          </View>
        )}
      </List.Section>

      <List.Section title="について">
        <List.Item title="バージョン" description="0.1.0" />
        <List.Item
          title="データ保存先"
          description={
            authed
              ? "Google Calendar (リモート) + ローカルキャッシュ"
              : "ローカルのみ"
          }
        />
      </List.Section>

      <Snackbar
        visible={!!snackMsg}
        onDismiss={() => setSnackMsg("")}
        duration={3000}
      >
        {snackMsg}
      </Snackbar>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
    padding: 16,
    flexWrap: "wrap",
  },
  button: { flex: 1, minWidth: 120 },
  lastSync: { paddingHorizontal: 16, paddingBottom: 8, opacity: 0.6 },
});
