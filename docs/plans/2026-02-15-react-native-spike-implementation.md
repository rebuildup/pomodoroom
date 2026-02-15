## Goal
iOS/Android向けに最小機能版(タスク/次候補/休憩提案)を検証する。

## Scope
- 同一ドメインモデル。
- Calendar-DBモード優先。

## Implementation Plan

### Phase 1: Project Setup
1. Initialize Expo project in `mobile/` directory
2. Configure TypeScript, ESLint, Prettier
3. Set up React Navigation
4. Configure Material Design 3 theming

### Phase 2: Core Integration
1. Create bridge layer to pomodoroom-core (via FFI or HTTP API)
2. Implement Calendar-DB mode sync
3. Set up local SQLite storage

### Phase 3: UI Components
1. Task list screen
2. Next task candidate display
3. Break suggestion modal
4. Timer controls

### Phase 4: Testing
1. Unit tests for business logic
2. Integration tests for sync
3. E2E tests for critical paths

## Technical Stack
- Expo SDK 52
- React Native 0.76
- TypeScript 5
- React Navigation 7
- React Native Paper (Material Design 3)
- SQLite (expo-sqlite)

## File Structure
```
mobile/
├── src/
│   ├── components/     # Reusable UI components
│   ├── screens/        # Screen components
│   ├── hooks/          # Custom React hooks
│   ├── services/       # API and storage services
│   ├── types/          # TypeScript types
│   └── utils/          # Utility functions
├── App.tsx
├── package.json
└── tsconfig.json
```

## Acceptance Criteria
- [ ] App builds and runs on iOS/Android simulators
- [ ] Can view task list
- [ ] Shows next task candidate based on priority
- [ ] Displays break suggestions
- [ ] Syncs with Calendar-DB mode
- [ ] All tests pass

Closes #289
