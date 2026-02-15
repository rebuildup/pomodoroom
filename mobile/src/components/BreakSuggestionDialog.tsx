import React from 'react';
import { View, StyleSheet } from 'react-native';
import {
  Dialog,
  Text,
  Button,
  Portal,
  Card,
  useTheme,
} from 'react-native-paper';
import type { BreakSuggestion } from '../types';

interface BreakSuggestionDialogProps {
  suggestion: BreakSuggestion | null;
  visible: boolean;
  onDismiss: () => void;
  onTakeBreak: () => void;
  onSkip: () => void;
}

export default function BreakSuggestionDialog({
  suggestion,
  visible,
  onDismiss,
  onTakeBreak,
  onSkip,
}: BreakSuggestionDialogProps) {
  const theme = useTheme();

  if (!suggestion) return null;

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>休憩の提案</Dialog.Title>
        <Dialog.Content>
          <Card style={[styles.suggestionCard, { backgroundColor: theme.colors.secondaryContainer }]}>
            <Card.Content>
              <Text variant="titleLarge" style={styles.title}>
                {suggestion.title}
              </Text>
              <Text variant="displaySmall" style={styles.duration}>
                {suggestion.durationMinutes}分
              </Text>
              <Text variant="bodyMedium" style={styles.reason}>
                {suggestion.reason}
              </Text>
            </Card.Content>
          </Card>
          
          <Text variant="bodySmall" style={styles.tip}>
            適切な休憩は生産性と集中力を維持するために重要です
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onSkip}>スキップ</Button>
          <Button mode="contained" onPress={onTakeBreak}>
            休憩を取る
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  suggestionCard: {
    marginVertical: 8,
  },
  title: {
    textAlign: 'center',
    marginBottom: 8,
  },
  duration: {
    textAlign: 'center',
    marginVertical: 16,
  },
  reason: {
    textAlign: 'center',
    opacity: 0.8,
  },
  tip: {
    marginTop: 16,
    textAlign: 'center',
    opacity: 0.6,
    fontStyle: 'italic',
  },
});
