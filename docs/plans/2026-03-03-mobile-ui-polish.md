# Mobile UI Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** モバイルアプリの4画面を全体的に磨く（確認ダイアログ・優先度表示・プロジェクト紐付け・タスク編集・タイマー表示・細かい修正）

**Architecture:** 既存の react-native-paper コンポーネントを拡張・改善する。新しい依存関係は追加しない。全変更は `mobile/src/screens/` 内のファイルのみ。

**Tech Stack:** React Native, Expo, react-native-paper (MD3), TypeScript

---

## コンテキスト

### 現状のデータモデル
- `Task` に `projectId?: string` フィールドあり（storage.ts で INSERT/UPDATE 済み）
- `Project` 一覧は `storage.getAllProjects()` で取得可能
- `storage.updateTask(id, updates)` は `projectId` を含む任意フィールド更新可能

### 各画面の現状
- `NextTaskScreen.tsx` — `_theme` が未使用変数。スコアが生の数値で表示
- `TaskListScreen.tsx` — 優先度が「優先度: 5」のような文字列。☁ が description に埋め込み。編集不可。削除機能なし
- `ProjectsScreen.tsx` — 削除前確認なし（即削除）
- `SettingsScreen.tsx` — ほぼ問題なし

---

## Task 1: NextTaskScreen のクリーンアップと表示改善

**Files:**
- Modify: `mobile/src/screens/NextTaskScreen.tsx`

**変更内容:**

1. `const _theme = useTheme();` を削除（`useTheme` import も不要なら削除）
2. スコア表示を生数値からパーセント表示に変更:
   - `subtitle={`優先度スコア: ${score}`}` → `subtitle={`優先度スコア: ${Math.round(score * 100)}%`}`
   - （スコアは 0〜1 の float と仮定。もし整数なら `${score}pt` でよい）
3. 実行中タスクのタイマーUI: task.state が "RUNNING" のとき `<Chip icon="timer">実行中 {task.elapsedMinutes}分</Chip>` を表示

**Step 1: 変更を実装**

```typescript
// useTheme, _theme を削除
// スコア表示修正
subtitle={`優先度スコア: ${typeof score === 'number' && score <= 1 ? `${Math.round(score * 100)}%` : `${score}pt`}`}
// 実行中チップを reasons の上に追加
{task.state === "RUNNING" && (
  <Chip icon="timer" style={styles.runningChip}>
    実行中 {task.elapsedMinutes}分 経過
  </Chip>
)}
// styles に追加
runningChip: { backgroundColor: "#E8F5E9", marginBottom: 8 },
```

**Step 2: TypeScript チェック**
```bash
cd mobile && npx tsc --noEmit 2>&1 | head -30
```
エラーがあれば修正する。

**Step 3: Commit**
```bash
git add mobile/src/screens/NextTaskScreen.tsx
git commit -m "fix(mobile): clean up NextTaskScreen - remove unused theme, improve score display"
```

---

## Task 2: TaskListScreen — 優先度の視覚的表示と☁インジケーター改善

**Files:**
- Modify: `mobile/src/screens/TaskListScreen.tsx`

**変更内容:**

優先度 (1〜10) を星アイコン数で表示するヘルパー関数を追加:
```typescript
function priorityStars(p: number): string {
  const stars = Math.ceil(p / 2); // 1-2→★, 3-4→★★, 5-6→★★★, 7-8→★★★★, 9-10→★★★★★
  return "★".repeat(Math.min(stars, 5));
}
```

`List.Item` の `description` を変更:
```typescript
// BEFORE
description={`優先度: ${item.priority}${item.estimatedMinutes ? ` | 見積: ${item.estimatedMinutes}分` : ""}${item.calendarEventId ? " ☁" : ""}`}

// AFTER
description={[
  priorityStars(item.priority),
  item.estimatedMinutes ? `${item.estimatedMinutes}分` : null,
  item.state === "RUNNING" ? `${item.elapsedMinutes}分経過` : null,
].filter(Boolean).join("  ·  ")}
```

右側の `right` に ☁ を Chip で追加（calendarEventId がある場合のみ）:
```typescript
// taskActions View の中、Chip の前に追加
{item.calendarEventId && (
  <Chip compact icon="cloud-check" style={styles.cloudChip}>{""}</Chip>
)}
// styles に追加
cloudChip: { height: 28, marginRight: 4 },
```

**Step 1: 実装**

**Step 2: TypeScript チェック**
```bash
cd mobile && npx tsc --noEmit 2>&1 | head -30
```

**Step 3: Commit**
```bash
git add mobile/src/screens/TaskListScreen.tsx
git commit -m "feat(mobile): improve task list - priority stars, sync indicator, elapsed time"
```

---

## Task 3: TaskListScreen — タスク削除とタスク編集機能

**Files:**
- Modify: `mobile/src/screens/TaskListScreen.tsx`

**変更内容:**

### 3-A: タスク削除（確認 Alert）

imports に `Alert` を追加:
```typescript
import { View, StyleSheet, FlatList, Alert } from "react-native";
```

削除ハンドラを追加:
```typescript
const handleDeleteTask = (task: Task) => {
  Alert.alert(
    "タスクを削除",
    `「${task.title}」を削除しますか？`,
    [
      { text: "キャンセル", style: "cancel" },
      {
        text: "削除",
        style: "destructive",
        onPress: async () => {
          try {
            await storage.deleteTask(task.id);
            refresh();
            setSnackMsg("タスクを削除しました");
          } catch (e) {
            setSnackMsg(`エラー: ${e instanceof Error ? e.message : String(e)}`);
          }
        },
      },
    ]
  );
};
```

`storage` を import:
```typescript
import * as storage from "../services/storage";
```

`right` の IconButton に削除ボタンを追加:
```typescript
{item.state !== "RUNNING" && (
  <IconButton
    {...props}
    icon="delete"
    iconColor={theme.colors.error}
    onPress={() => handleDeleteTask(item)}
  />
)}
```

### 3-B: タスク編集ダイアログ

state を追加:
```typescript
const [editTask, setEditTask] = useState<Task | null>(null);
const [editTitle, setEditTitle] = useState("");
const [editPriority, setEditPriority] = useState("");
const [editEstimate, setEditEstimate] = useState("");
```

editTask 用 Dialog を追加（既存の追加ダイアログとは別に）:
```typescript
<Dialog visible={!!editTask} onDismiss={() => setEditTask(null)}>
  <Dialog.Title>タスクを編集</Dialog.Title>
  <Dialog.Content>
    <TextInput label="タスク名" value={editTitle} onChangeText={setEditTitle} mode="outlined" style={styles.input} />
    <TextInput label="優先度 (1-10)" value={editPriority} onChangeText={setEditPriority} mode="outlined" keyboardType="numeric" style={styles.input} />
    <TextInput label="見積時間 (分、任意)" value={editEstimate} onChangeText={setEditEstimate} mode="outlined" keyboardType="numeric" style={styles.input} />
  </Dialog.Content>
  <Dialog.Actions>
    <Button onPress={() => setEditTask(null)}>キャンセル</Button>
    <Button mode="contained" onPress={handleUpdateTask}>保存</Button>
  </Dialog.Actions>
</Dialog>
```

`handleUpdateTask` を追加:
```typescript
const handleUpdateTask = async () => {
  if (!editTask || !editTitle.trim()) return;
  try {
    await storage.updateTask(editTask.id, {
      title: editTitle.trim(),
      priority: parseInt(editPriority, 10) || editTask.priority,
      estimatedMinutes: editEstimate ? parseInt(editEstimate, 10) : undefined,
    });
    setEditTask(null);
    refresh();
    setSnackMsg("タスクを更新しました");
  } catch (e) {
    setSnackMsg(`エラー: ${e instanceof Error ? e.message : String(e)}`);
  }
};
```

`right` に編集ボタンを追加（DONE 以外）:
```typescript
{item.state !== "DONE" && (
  <IconButton {...props} icon="pencil" onPress={() => {
    setEditTask(item);
    setEditTitle(item.title);
    setEditPriority(String(item.priority));
    setEditEstimate(item.estimatedMinutes ? String(item.estimatedMinutes) : "");
  }} />
)}
```

**Step 1: 実装**

**Step 2: TypeScript チェック**
```bash
cd mobile && npx tsc --noEmit 2>&1 | head -30
```

**Step 3: Commit**
```bash
git add mobile/src/screens/TaskListScreen.tsx
git commit -m "feat(mobile): add task delete confirmation and task edit dialog"
```

---

## Task 4: TaskListScreen — タスク作成時のプロジェクト選択

**Files:**
- Modify: `mobile/src/screens/TaskListScreen.tsx`

**変更内容:**

プロジェクト一覧を取得する:
```typescript
import { useProjects } from "../hooks/useProjects";
// ...
const { projects } = useProjects();
```

タスク作成 state にプロジェクト選択を追加:
```typescript
const [newTaskProjectId, setNewTaskProjectId] = useState<string>("");
```

プロジェクト選択の Chip 群を追加ダイアログの `Dialog.Content` に追加:
```typescript
{projects.length > 0 && (
  <>
    <Text variant="labelMedium" style={styles.sectionLabel}>プロジェクト（任意）</Text>
    <View style={styles.projectChips}>
      <Chip
        selected={newTaskProjectId === ""}
        onPress={() => setNewTaskProjectId("")}
        style={styles.projectChip}
      >
        なし
      </Chip>
      {projects.map((p) => (
        <Chip
          key={p.id}
          selected={newTaskProjectId === p.id}
          onPress={() => setNewTaskProjectId(p.id)}
          style={styles.projectChip}
        >
          {p.name}
        </Chip>
      ))}
    </View>
  </>
)}
```

`createTaskWithSync` 呼び出しに `projectId` を追加:
```typescript
await createTaskWithSync({
  // ... existing fields
  projectId: newTaskProjectId || undefined,
});
// reset
setNewTaskProjectId("");
```

styles に追加:
```typescript
projectChips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
projectChip: { marginRight: 0 },
sectionLabel: { marginBottom: 6, opacity: 0.7 },
```

タスク一覧に現在のプロジェクト名を表示:
`List.Item` の description を修正して、`projectId` があれば `projects.find(p=>p.id===item.projectId)?.name` を追記する:
```typescript
description={[
  priorityStars(item.priority),
  item.estimatedMinutes ? `${item.estimatedMinutes}分` : null,
  item.state === "RUNNING" ? `${item.elapsedMinutes}分経過` : null,
  item.projectId ? projects.find(p => p.id === item.projectId)?.name : null,
].filter(Boolean).join("  ·  ")}
```

**Step 1: 実装**

**Step 2: TypeScript チェック**
```bash
cd mobile && npx tsc --noEmit 2>&1 | head -30
```

**Step 3: Commit**
```bash
git add mobile/src/screens/TaskListScreen.tsx
git commit -m "feat(mobile): add project selector to task creation dialog"
```

---

## Task 5: ProjectsScreen — 削除確認ダイアログ

**Files:**
- Modify: `mobile/src/screens/ProjectsScreen.tsx`

**変更内容:**

`Alert` を import:
```typescript
import { View, StyleSheet, FlatList, Alert } from "react-native";
```

`handleDelete` を Alert 確認付きに変更:
```typescript
const handleDelete = (project: Project) => {
  Alert.alert(
    "プロジェクトを削除",
    `「${project.name}」を削除しますか？\n関連タスクのプロジェクト紐付けは解除されます。`,
    [
      { text: "キャンセル", style: "cancel" },
      {
        text: "削除",
        style: "destructive",
        onPress: async () => {
          try {
            await storage.deleteProject(project.id);
            refresh();
            setSnackMsg("削除しました");
          } catch (e) {
            setSnackMsg(`エラー: ${e instanceof Error ? e.message : String(e)}`);
          }
        },
      },
    ]
  );
};
```

（`handleDelete` のシグネチャは `async` でなく同期になる — `Alert.alert` がコールバックを使うため）

**Step 1: 実装**

**Step 2: TypeScript チェック**
```bash
cd mobile && npx tsc --noEmit 2>&1 | head -30
```

**Step 3: Commit**
```bash
git add mobile/src/screens/ProjectsScreen.tsx
git commit -m "feat(mobile): add delete confirmation dialog to ProjectsScreen"
```

---

## Task 6: 最終 TypeScript チェックとプッシュ

**Step 1: フルビルドチェック**
```bash
cd mobile && npx tsc --noEmit 2>&1
```
エラーがあれば修正してコミット。

**Step 2: git push**
```bash
cd .. && git push origin main
```

**Step 3: 変更サマリーを報告**
完了した変更の一覧を日本語でまとめて報告する。
