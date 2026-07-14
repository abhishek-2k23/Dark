import * as WebBrowser from "expo-web-browser";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import {
  Button,
  Card,
  Divider,
  Icon,
  IconCircle,
  Text,
  type IconName,
} from "@/components/ui";
import { WEB_BASE_URL } from "@/lib/env";
import { useUIStore } from "@/stores/uiStore";

function LinkRow({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Card
      variant="filled"
      onPress={onPress}
      className="flex-row items-center gap-3"
    >
      <IconCircle name={icon} tone="primary" size={38} />
      <Text variant="subtitle" className="flex-1">
        {label}
      </Text>
      <Icon name="open-outline" size={18} color="tertiary" />
    </Card>
  );
}

/**
 * Legal/support links and the account-deletion entry point, shared by every
 * role's Profile tab. The links and the deletion flow all live in the web app,
 * so each opens the corresponding page in an in-app browser.
 */
export function AccountLegalActions() {
  const { t } = useTranslation();
  const showToast = useUIStore((s) => s.showToast);

  const open = (path: string) => async () => {
    try {
      await WebBrowser.openBrowserAsync(`${WEB_BASE_URL}${path}`);
    } catch {
      showToast(t("profile.linkError"), "error");
    }
  };

  return (
    <>
      <View className="gap-2.5">
        <Text variant="label" color="secondary">
          {t("profile.legal")}
        </Text>
        <LinkRow
          icon="shield-checkmark-outline"
          label={t("profile.privacy")}
          onPress={open("/privacy")}
        />
        <LinkRow
          icon="document-text-outline"
          label={t("profile.terms")}
          onPress={open("/terms")}
        />
        <LinkRow
          icon="help-circle-outline"
          label={t("profile.help")}
          onPress={open("/help")}
        />
      </View>

      <Divider />

      <View className="gap-2">
        <Button
          label={t("profile.deleteAccount")}
          variant="danger"
          leftIcon="trash-outline"
          onPress={open("/delete-account")}
          fullWidth
        />
        <Text variant="caption" color="tertiary" align="center">
          {t("profile.deleteAccountHint")}
        </Text>
      </View>
    </>
  );
}
