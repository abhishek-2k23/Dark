import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { useState } from "react";
import { Modal, Platform, Pressable, View } from "react-native";

import { useTheme } from "@/theme";
import { formatDate, formatTime } from "@/utils/format";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

type OpenMode = "date" | "time" | null;

export interface DateTimeFieldProps {
  /** The currently selected moment (controlled). */
  value: Date;
  onChange: (next: Date) => void;
  /** Earliest selectable moment; typically `new Date()` to forbid the past. */
  minimumDate?: Date;
  disabled?: boolean;
  /** Label for the iOS sheet's confirm button. Defaults to "Done". */
  doneLabel?: string;
}

/**
 * Only the picked component is taken from the native picker's result; the rest
 * is kept from the current value, so choosing a date never resets the time and
 * vice-versa. Guards against platforms that hand back a fully-defaulted Date.
 */
function merge(base: Date, picked: Date, mode: "date" | "time"): Date {
  const d = new Date(base);
  if (mode === "date") {
    d.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  } else {
    d.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  }
  return d;
}

/**
 * A themed date + time picker: two tappable pills (date | time) that open the
 * platform-native picker. Android presents a dialog; iOS shows an inline picker
 * in a themed bottom sheet, since iOS has no dialog-style picker.
 *
 * Uses @expo/ui's community DateTimePicker — already linked, so no extra native
 * dependency or dev-client rebuild.
 */
export function DateTimeField({
  value,
  onChange,
  minimumDate,
  disabled,
  doneLabel = "Done",
}: DateTimeFieldProps) {
  const { colors, scheme } = useTheme();
  const [open, setOpen] = useState<OpenMode>(null);

  const commit = (mode: "date" | "time", picked: Date) => onChange(merge(value, picked, mode));

  const pill = (mode: "date" | "time", icon: IconName, label: string) => (
    <Pressable
      disabled={disabled}
      onPress={() => setOpen(mode)}
      className="flex-1 flex-row items-center gap-2.5 rounded-lg border border-border px-3.5 py-3.5 active:opacity-80"
      style={{ backgroundColor: colors.glassFill, opacity: disabled ? 0.6 : 1 }}
    >
      <Icon name={icon} size={18} color="secondary" />
      <Text variant="body">{label}</Text>
    </Pressable>
  );

  return (
    <View className="flex-row gap-3">
      {pill("date", "calendar-outline", formatDate(value))}
      {pill("time", "time-outline", formatTime(value))}

      {/* Android: the native picker is itself a dialog — mount only while open. */}
      {Platform.OS === "android" && open && (
        <DateTimePicker
          value={value}
          mode={open}
          minimumDate={minimumDate}
          accentColor={colors.primary}
          onValueChange={(_e, picked) => {
            commit(open, picked);
            setOpen(null);
          }}
          onDismiss={() => setOpen(null)}
        />
      )}

      {/* iOS: no dialog picker exists — present the inline one in a sheet. */}
      {Platform.OS === "ios" && (
        <Modal
          visible={open !== null}
          transparent
          animationType="slide"
          onRequestClose={() => setOpen(null)}
        >
          <Pressable
            className="flex-1 justify-end"
            onPress={() => setOpen(null)}
            style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          >
            {/* Swallow taps so touching the sheet doesn't dismiss it. */}
            <Pressable
              onPress={() => {}}
              style={{
                backgroundColor: colors.surfaceElevated,
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                padding: 16,
                gap: 12,
              }}
            >
              {open && (
                <DateTimePicker
                  value={value}
                  mode={open}
                  display={open === "date" ? "inline" : "spinner"}
                  minimumDate={minimumDate}
                  accentColor={colors.primary}
                  themeVariant={scheme}
                  onValueChange={(_e, picked) => commit(open, picked)}
                />
              )}
              <Button
                label={doneLabel}
                variant="primary"
                size="lg"
                fullWidth
                onPress={() => setOpen(null)}
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}
