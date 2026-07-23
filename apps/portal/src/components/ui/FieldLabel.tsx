import { View } from "react-native";

import { Text } from "./Text";

export interface FieldLabelProps {
  label: string;
  /** Renders a red asterisk after the label and flags it for screen readers. */
  required?: boolean;
  /** Optional right-aligned trailing note (e.g. a short helper). */
  hint?: string;
}

/**
 * The shared label row for form fields: the label text, an optional red `*` for
 * required fields, and an optional right-aligned hint. Used inside `Input` and
 * directly above non-Input fields (chip pickers, date/time pickers) so the
 * required marker looks identical everywhere.
 */
export function FieldLabel({ label, required, hint }: FieldLabelProps) {
  return (
    <View className="flex-row items-center justify-between">
      <Text
        variant="subtitle"
        color="primary"
        accessibilityLabel={required ? `${label} (required)` : undefined}
      >
        {label}
        {required && (
          <Text variant="subtitle" color="danger">
            {" *"}
          </Text>
        )}
      </Text>
      {hint && (
        <Text variant="overline" color="tertiary">
          {hint}
        </Text>
      )}
    </View>
  );
}
