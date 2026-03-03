import { useState } from "react";
import { View, StyleSheet, FlatList } from "react-native";
import {
  List,
  FAB,
  Portal,
  Dialog,
  TextInput,
  Button,
  IconButton,
  Text,
  useTheme,
  Snackbar,
} from "react-native-paper";
import { useProjects } from "../hooks/useProjects";
import * as storage from "../services/storage";
import { pushProject } from "../services/syncService";
import { isAuthenticated } from "../services/googleAuth";
import type { Project } from "../types";

export default function ProjectsScreen() {
  const theme = useTheme();
  const { projects, loading, refresh } = useProjects();
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [name, setName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [snackMsg, setSnackMsg] = useState("");

  const openAdd = () => {
    setEditProject(null);
    setName("");
    setDeadline("");
    setDialogVisible(true);
  };

  const openEdit = (p: Project) => {
    setEditProject(p);
    setName(p.name);
    setDeadline(p.deadline ?? "");
    setDialogVisible(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    const authed = await isAuthenticated();

    try {
      if (editProject) {
        const updated = await storage.updateProject(editProject.id, {
          name: name.trim(),
          deadline: deadline.trim() || undefined,
        });
        setDialogVisible(false);
        refresh();
        setSnackMsg("更新しました");
        if (updated && authed) {
          pushProject(updated).catch(() => {}); // fire-and-forget; fullSync will retry
        }
      } else {
        const created = await storage.createProject({
          name: name.trim(),
          deadline: deadline.trim() || undefined,
        });
        setDialogVisible(false);
        refresh();
        setSnackMsg("作成しました");
        if (authed) {
          pushProject(created).catch(() => {}); // fire-and-forget; fullSync will retry
        }
      }
    } catch (e) {
      setSnackMsg(`エラー: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleDelete = async (project: Project) => {
    try {
      await storage.deleteProject(project.id);
      refresh();
      setSnackMsg("削除しました");
    } catch (e) {
      setSnackMsg(`エラー: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const renderProject = ({ item }: { item: Project }) => (
    <List.Item
      title={item.name}
      description={
        item.deadline
          ? `期限: ${new Date(item.deadline).toLocaleDateString("ja-JP")}`
          : "期限なし"
      }
      left={(props) => (
        <List.Icon {...props} icon="folder" color={theme.colors.primary} />
      )}
      right={(props) => (
        <View style={styles.actions}>
          <IconButton {...props} icon="pencil" onPress={() => openEdit(item)} />
          <IconButton
            {...props}
            icon="delete"
            onPress={() => handleDelete(item)}
          />
        </View>
      )}
    />
  );

  return (
    <View style={styles.container}>
      {projects.length === 0 && !loading && (
        <View style={styles.empty}>
          <Text variant="titleMedium">プロジェクトがありません</Text>
          <Text variant="bodyMedium" style={styles.emptyHint}>
            ＋ ボタンでプロジェクトを追加してください
          </Text>
        </View>
      )}
      <FlatList
        data={projects}
        renderItem={renderProject}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        onRefresh={refresh}
        contentContainerStyle={styles.list}
      />

      <Portal>
        <Dialog
          visible={dialogVisible}
          onDismiss={() => setDialogVisible(false)}
        >
          <Dialog.Title>
            {editProject ? "プロジェクトを編集" : "新しいプロジェクト"}
          </Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="プロジェクト名"
              value={name}
              onChangeText={setName}
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label="期限 (YYYY-MM-DD、任意)"
              value={deadline}
              onChangeText={setDeadline}
              mode="outlined"
              placeholder="2026-12-31"
              style={styles.input}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialogVisible(false)}>キャンセル</Button>
            <Button onPress={handleSave} mode="contained">
              保存
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        onPress={openAdd}
      />
      <Snackbar
        visible={!!snackMsg}
        onDismiss={() => setSnackMsg("")}
        duration={2500}
      >
        {snackMsg}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingVertical: 8 },
  actions: { flexDirection: "row", alignItems: "center" },
  fab: { position: "absolute", margin: 16, right: 0, bottom: 0 },
  input: { marginBottom: 12 },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyHint: { marginTop: 8, opacity: 0.6, textAlign: "center" },
});
