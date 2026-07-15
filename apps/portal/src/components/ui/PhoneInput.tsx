import { Input, type InputProps } from "./Input";

export type PhoneInputProps = Omit<
  InputProps,
  "keyboardType" | "maxLength" | "onChangeText"
> & {
  onChangeText: (value: string) => void;
};

/**
 * Phone number field limited to a 10-digit national number: numeric keypad,
 * capped at 10 characters, with any non-digit input stripped so the value
 * always matches the backend's 10-digit validation.
 */
export function PhoneInput({ onChangeText, ...props }: PhoneInputProps) {
  return (
    <Input
      autoComplete="tel"
      {...props}
      keyboardType="number-pad"
      maxLength={10}
      onChangeText={(value) => onChangeText(value.replace(/\D/g, ""))}
    />
  );
}
