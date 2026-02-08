import { useState } from "react";
import { Settings } from "lucide-react";
import { useTimer } from "@/hooks/useTimer";
import { CircularProgress } from "@/components/CircularProgress";
import { ModeSelector } from "@/components/ModeSelector";
import { Controls } from "@/components/Controls";
import { SessionIndicator } from "@/components/SessionIndicator";
import { SettingsPanel } from "@/components/SettingsPanel";

function App() {
  const timer = useTimer();
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="app-container">
      <div className="app-content">
        {/* Mode Selector */}
        <ModeSelector mode={timer.mode} onModeChange={timer.setMode} />

        {/* Timer Display */}
        <div className="mt-10 mb-8">
          <CircularProgress
            progress={timer.progress}
            mode={timer.mode}
            timeLeft={timer.timeLeft}
          />
        </div>

        {/* Controls */}
        <Controls
          status={timer.status}
          mode={timer.mode}
          onStart={timer.start}
          onPause={timer.pause}
          onReset={timer.reset}
          onSkip={timer.skip}
        />

        {/* Session Indicator */}
        <div className="mt-8">
          <SessionIndicator
            completedSessions={timer.completedSessions}
            longBreakInterval={timer.settings.longBreakInterval}
            mode={timer.mode}
            onReset={timer.resetSessions}
          />
        </div>

        {/* Settings Button */}
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          className="mt-6 text-secondary hover:text-primary transition-colors"
          title="Settings"
        >
          <Settings size={20} />
        </button>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <SettingsPanel
          settings={timer.settings}
          onUpdate={timer.updateSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

export default App;
