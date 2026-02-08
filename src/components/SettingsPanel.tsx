import { X, Minus, Plus } from "lucide-react";
import type { TimerSettings } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";

interface SettingsPanelProps {
  settings: TimerSettings;
  onUpdate: (settings: TimerSettings) => void;
  onClose: () => void;
}

function NumberInput({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm text-secondary">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - step))}
          className="settings-stepper"
          disabled={value <= min}
        >
          <Minus size={14} />
        </button>
        <span className="w-12 text-center text-sm text-primary tabular-nums">
          {value} {unit}
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + step))}
          className="settings-stepper"
          disabled={value >= max}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm text-secondary">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`settings-toggle ${checked ? "settings-toggle-on" : ""}`}
      >
        <div className="settings-toggle-thumb" />
      </button>
    </div>
  );
}

export function SettingsPanel({
  settings,
  onUpdate,
  onClose,
}: SettingsPanelProps) {
  const update = (patch: Partial<TimerSettings>) => {
    onUpdate({ ...settings, ...patch });
  };

  const handleReset = () => {
    onUpdate(DEFAULT_SETTINGS);
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div
        className="settings-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-semibold text-primary">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-secondary hover:text-primary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-1">
          <h3 className="text-xs font-medium text-secondary uppercase tracking-wider mb-2">
            Duration
          </h3>
          <NumberInput
            label="Focus"
            value={settings.pomodoro}
            min={1}
            max={90}
            step={5}
            unit="min"
            onChange={(v) => update({ pomodoro: v })}
          />
          <NumberInput
            label="Short Break"
            value={settings.shortBreak}
            min={1}
            max={30}
            step={1}
            unit="min"
            onChange={(v) => update({ shortBreak: v })}
          />
          <NumberInput
            label="Long Break"
            value={settings.longBreak}
            min={1}
            max={60}
            step={5}
            unit="min"
            onChange={(v) => update({ longBreak: v })}
          />
          <NumberInput
            label="Long Break Interval"
            value={settings.longBreakInterval}
            min={2}
            max={8}
            step={1}
            unit=""
            onChange={(v) => update({ longBreakInterval: v })}
          />
        </div>

        <div className="mt-6 space-y-1 border-t border-border pt-4">
          <h3 className="text-xs font-medium text-secondary uppercase tracking-wider mb-2">
            Automation
          </h3>
          <Toggle
            label="Auto-start Breaks"
            checked={settings.autoStartBreaks}
            onChange={(v) => update({ autoStartBreaks: v })}
          />
          <Toggle
            label="Auto-start Focus"
            checked={settings.autoStartPomodoros}
            onChange={(v) => update({ autoStartPomodoros: v })}
          />
        </div>

        <button
          type="button"
          onClick={handleReset}
          className="mt-6 w-full text-xs text-secondary hover:text-primary transition-colors py-2"
        >
          Reset to Defaults
        </button>
      </div>
    </div>
  );
}
