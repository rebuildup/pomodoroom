import { useState, useEffect, useCallback } from "react";
import { View, StyleSheet } from "react-native";
import { Card, Text, Button, Chip, ActivityIndicator, useTheme } from "react-native-paper";
import { getNextTaskCandidate, startTask } from "../services/taskService";
import type { NextTaskCandidate } from "../types";

export default function NextTaskScreen() {
	const _theme = useTheme();
	const [candidate, setCandidate] = useState<NextTaskCandidate | null>(null);
	const [loading, setLoading] = useState(true);

	const loadCandidate = useCallback(async () => {
		setLoading(true);
		const result = await getNextTaskCandidate();
		setCandidate(result);
		setLoading(false);
	}, []);

	useEffect(() => {
		loadCandidate();
	}, [loadCandidate]);

	const handleStartTask = async () => {
		if (!candidate) return;
		await startTask(candidate.task.id);
		loadCandidate();
	};

	if (loading) {
		return (
			<View style={styles.centered}>
				<ActivityIndicator size="large" />
			</View>
		);
	}

	if (!candidate) {
		return (
			<View style={styles.centered}>
				<Text variant="titleMedium">準備中のタスクがありません</Text>
				<Text variant="bodyMedium" style={styles.subtitle}>
					タスク一覧から新しいタスクを追加してください
				</Text>
				<Button mode="contained" onPress={loadCandidate} style={styles.button}>
					更新
				</Button>
			</View>
		);
	}

	const { task, score, reasons } = candidate;

	return (
		<View style={styles.container}>
			<Card style={styles.card}>
				<Card.Title title="次のタスク候補" subtitle={`優先度スコア: ${score}`} />
				<Card.Content>
					<Text variant="headlineSmall" style={styles.taskTitle}>
						{task.title}
					</Text>

					{task.description && (
						<Text variant="bodyMedium" style={styles.description}>
							{task.description}
						</Text>
					)}

					<View style={styles.details}>
						<Text variant="bodySmall">優先度: {task.priority}</Text>
						{task.estimatedMinutes && (
							<Text variant="bodySmall">見積時間: {task.estimatedMinutes}分</Text>
						)}
						{task.dueDate && (
							<Text variant="bodySmall">
								期限: {new Date(task.dueDate).toLocaleDateString("ja-JP")}
							</Text>
						)}
					</View>

					<View style={styles.reasons}>
						{reasons.map((reason) => (
							<Chip key={reason} style={styles.chip}>
								{reason}
							</Chip>
						))}
					</View>
				</Card.Content>
				<Card.Actions>
					<Button onPress={loadCandidate}>スキップ</Button>
					<Button mode="contained" onPress={handleStartTask}>
						開始
					</Button>
				</Card.Actions>
			</Card>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		padding: 16,
	},
	centered: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 16,
	},
	card: {
		elevation: 4,
	},
	taskTitle: {
		marginBottom: 8,
	},
	description: {
		marginBottom: 16,
		opacity: 0.7,
	},
	details: {
		marginBottom: 16,
		gap: 4,
	},
	reasons: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 8,
	},
	chip: {
		backgroundColor: "#E8DEF8",
	},
	subtitle: {
		marginTop: 8,
		opacity: 0.6,
		textAlign: "center",
	},
	button: {
		marginTop: 16,
	},
});
