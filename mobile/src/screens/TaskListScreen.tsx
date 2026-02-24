import { useState } from "react";
import { View, StyleSheet, FlatList } from "react-native";
import {
	List,
	FAB,
	Portal,
	Dialog,
	TextInput,
	Button,
	Chip,
	IconButton,
	useTheme,
} from "react-native-paper";
import { useTasks } from "../hooks/useTasks";
import { storage } from "../services/taskService";
import type { Task, TaskState } from "../types";

const stateLabels: Record<TaskState, string> = {
	READY: "準備中",
	RUNNING: "実行中",
	PAUSED: "一時停止",
	DONE: "完了",
};

const stateColors: Record<TaskState, string> = {
	READY: "#6750A4",
	RUNNING: "#2E7D32",
	PAUSED: "#ED6C02",
	DONE: "#757575",
};

export default function TaskListScreen() {
	const theme = useTheme();
	const { tasks, loading, refresh } = useTasks();
	const [dialogVisible, setDialogVisible] = useState(false);
	const [newTaskTitle, setNewTaskTitle] = useState("");
	const [newTaskPriority, setNewTaskPriority] = useState("5");

	const handleAddTask = async () => {
		if (!newTaskTitle.trim()) return;

		await storage.createTask({
			title: newTaskTitle.trim(),
			state: "READY",
			priority: parseInt(newTaskPriority, 10),
			elapsedMinutes: 0,
		});

		setNewTaskTitle("");
		setNewTaskPriority("5");
		setDialogVisible(false);
		refresh();
	};

	const handleStartTask = async (taskId: string) => {
		await storage.updateTask(taskId, { state: "RUNNING" });
		refresh();
	};

	const renderTask = ({ item }: { item: Task }) => (
		<List.Item
			title={item.title}
			description={`優先度: ${item.priority}${item.estimatedMinutes ? ` | 見積: ${item.estimatedMinutes}分` : ""}`}
			left={(props) => (
				<List.Icon {...props} icon="checkbox-blank-circle" color={stateColors[item.state]} />
			)}
			right={(props) => (
				<View style={styles.taskActions}>
					<Chip style={{ backgroundColor: `${stateColors[item.state]}20` }}>
						{stateLabels[item.state]}
					</Chip>
					{item.state === "READY" && (
						<IconButton {...props} icon="play" onPress={() => handleStartTask(item.id)} />
					)}
				</View>
			)}
		/>
	);

	return (
		<View style={styles.container}>
			<FlatList
				data={tasks}
				renderItem={renderTask}
				keyExtractor={(item) => item.id}
				refreshing={loading}
				onRefresh={refresh}
				contentContainerStyle={styles.list}
			/>

			<Portal>
				<Dialog visible={dialogVisible} onDismiss={() => setDialogVisible(false)}>
					<Dialog.Title>新しいタスク</Dialog.Title>
					<Dialog.Content>
						<TextInput
							label="タスク名"
							value={newTaskTitle}
							onChangeText={setNewTaskTitle}
							mode="outlined"
							style={styles.input}
						/>
						<TextInput
							label="優先度 (1-10)"
							value={newTaskPriority}
							onChangeText={setNewTaskPriority}
							mode="outlined"
							keyboardType="numeric"
							style={styles.input}
						/>
					</Dialog.Content>
					<Dialog.Actions>
						<Button onPress={() => setDialogVisible(false)}>キャンセル</Button>
						<Button onPress={handleAddTask} mode="contained">
							追加
						</Button>
					</Dialog.Actions>
				</Dialog>
			</Portal>

			<FAB
				icon="plus"
				style={[styles.fab, { backgroundColor: theme.colors.primary }]}
				onPress={() => setDialogVisible(true)}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	list: {
		paddingVertical: 8,
	},
	taskActions: {
		flexDirection: "row",
		alignItems: "center",
	},
	fab: {
		position: "absolute",
		margin: 16,
		right: 0,
		bottom: 0,
	},
	input: {
		marginBottom: 12,
	},
});
