import { useState } from "react";
import { Pressable } from "react-native";

import { Icon } from "./Icon";
import { Input, type InputProps } from "./Input";

export type PasswordInputProps = Omit<InputProps, "secureTextEntry" | "rightSlot">;

/** Password field with a show/hide (eye) toggle in the trailing slot. */
export function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <Input
      autoCapitalize="none"
      {...props}
      secureTextEntry={!visible}
      rightSlot={
        <Pressable
          onPress={() => setVisible((v) => !v)}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Icon
            name={visible ? "eye-off-outline" : "eye-outline"}
            size={20}
            color="tertiary"
          />
        </Pressable>
      }
    />
  );
}
