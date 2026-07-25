import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { ExportSheet } from "@/components/ExportSheet";
import { ErrorState, Loading } from "@/components/ListState";
import { ResidentContactSheet } from "@/components/ResidentContactSheet";
import { SectionHeader } from "@/components/SectionHeader";
import { StackHeader } from "@/components/StackHeader";
import { Avatar, Badge, Button, Card, Icon, IconButton, Screen, Text } from "@/components/ui";
import {
  buildResidentReportCsv,
  buildResidentReportPdf,
  REPORT_SECTIONS,
} from "@/lib/residentReport";
import { trpc } from "@/lib/trpc";
import { useUIStore } from "@/stores/uiStore";
import { confirmAction } from "@/utils/confirm";
import { formatDate, formatDateTime, formatMoney } from "@/utils/format";

/**
 * A label/value line inside an info card. When the value is missing and `onAdd`
 * is given, the blank becomes the way to fill it in rather than a dead dash.
 */
function Field({
  label,
  value,
  onAdd,
}: {
  label: string;
  value: string | null;
  onAdd?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <View className="flex-row items-center justify-between gap-4">
      <Text variant="bodySmall" color="secondary" className="shrink-0">
        {label}
      </Text>
      {value ? (
        <Text variant="bodySmall" align="right" className="flex-1">
          {value}
        </Text>
      ) : onAdd ? (
        <Pressable
          onPress={onAdd}
          hitSlop={8}
          accessibilityRole="button"
          className="flex-row items-center gap-1 active:opacity-70"
        >
          <Icon name="add-circle-outline" size={15} color="primary" />
          <Text variant="bodySmall" color="primary">
            {t("common.add")}
          </Text>
        </Pressable>
      ) : (
        <Text variant="bodySmall" align="right" className="flex-1">
          —
        </Text>
      )}
    </View>
  );
}

function StatTile({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone: "primary" | "success" | "danger" | "accent";
}) {
  return (
    <Card variant="elevated" className="flex-1 items-center gap-0.5 py-3">
      <Text variant="title" color={tone === "accent" ? "primary" : tone}>
        {value}
      </Text>
      <Text variant="caption" color="secondary" align="center" numberOfLines={2}>
        {label}
      </Text>
    </Card>
  );
}

/** A collapsible list section: header with a count, rows, and an empty state. */
function ListSection({
  title,
  count,
  emptyLabel,
  children,
}: {
  title: string;
  count: number;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-2">
      <SectionHeader title={count > 0 ? `${title} (${count})` : title} />
      {count === 0 ? (
        <Text variant="caption" color="tertiary">
          {emptyLabel}
        </Text>
      ) : (
        <View className="gap-2">{children}</View>
      )}
    </View>
  );
}

/** One row in a list section: a title line, a muted meta line, and a badge. */
function Row({
  title,
  meta,
  badge,
  badgeTone = "neutral",
}: {
  title: string;
  meta: string;
  badge?: string;
  badgeTone?: "neutral" | "primary" | "success" | "warning" | "danger";
}) {
  return (
    <Card className="flex-row items-center gap-3 py-3">
      <View className="flex-1 gap-0.5">
        <Text variant="subtitle" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" color="secondary" numberOfLines={1}>
          {meta}
        </Text>
      </View>
      {badge && <Badge label={badge} tone={badgeTone} size="sm" />}
    </Card>
  );
}

const DUE_TONE = { PAID: "success", OVERDUE: "danger", PENDING: "warning" } as const;
const TICKET_TONE = {
  OPEN: "warning",
  IN_PROGRESS: "primary",
  RESOLVED: "success",
  CLOSED: "neutral",
} as const;
const VISITOR_TONE = {
  APPROVED: "success",
  PENDING: "warning",
  DENIED: "danger",
  EXPIRED: "neutral",
} as const;

export default function ResidentDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const showToast = useUIStore((s) => s.showToast);
  const utils = trpc.useUtils();

  const [exportOpen, setExportOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  const detailQuery = trpc.resident.detail.useQuery({ userId }, { enabled: !!userId });
  const society = trpc.society.get.useQuery();

  const onSettled = () => {
    void utils.resident.detail.invalidate();
    void utils.resident.list.invalidate();
  };
  const deactivate = trpc.resident.deactivate.useMutation({
    onSuccess: () => {
      showToast(t("admin.residentDeactivated"), "info");
      onSettled();
    },
    onError: (e) => showToast(e.message, "error"),
  });
  const reactivate = trpc.resident.reactivate.useMutation({
    onSuccess: () => {
      showToast(t("admin.residentReactivated"), "success");
      onSettled();
    },
    onError: (e) => showToast(e.message, "error"),
  });

  if (detailQuery.isLoading) {
    return (
      <Screen scroll contentClassName="gap-4">
        <StackHeader title={t("admin.residentDetail.title")} />
        <Loading variant="detail" />
      </Screen>
    );
  }
  if (detailQuery.error || !detailQuery.data) {
    return (
      <Screen scroll contentClassName="gap-4">
        <StackHeader title={t("admin.residentDetail.title")} />
        <ErrorState
          message={detailQuery.error?.message ?? t("errors.generic")}
          onRetry={detailQuery.refetch}
        />
      </Screen>
    );
  }

  const detail = detailQuery.data;
  const { profile, summary } = detail;
  const busy = deactivate.isPending || reactivate.isPending;

  return (
    <Screen scroll contentClassName="gap-5 pb-10">
      <StackHeader
        title={t("admin.residentDetail.title")}
        right={
          <IconButton
            name="download-outline"
            accessibilityLabel={t("admin.residentReport.title")}
            onPress={() => setExportOpen(true)}
          />
        }
      />

      {/* Identity */}
      <View className="items-center gap-2">
        <Avatar uri={profile.avatarUrl} name={profile.name} size={88} ring />
        <Text variant="h2" align="center">
          {profile.name}
        </Text>
        <View className="flex-row items-center gap-1">
          <Icon name="business-outline" size={14} color="secondary" />
          <Text variant="body" color="secondary">
            {t("guard.flatLine", { tower: profile.towerName, flat: profile.flatNumber })}
          </Text>
        </View>
        <View className="flex-row flex-wrap justify-center gap-2">
          <Badge
            label={profile.isActive ? t("status.active") : t("admin.inactive")}
            tone={profile.isActive ? "success" : "neutral"}
            size="sm"
            uppercase
          />
          {profile.isPrimaryResident && (
            <Badge label={t("common.primary")} tone="primary" size="sm" />
          )}
          {/* A bulk-imported row nobody has claimed yet: on the register, but
              cannot sign in. Worth flagging to the admin who imported them. */}
          {profile.importedAt && (
            <Badge label={t("admin.residentDetail.notJoined")} tone="warning" size="sm" />
          )}
        </View>
      </View>

      {/* Headline numbers */}
      <View className="flex-row gap-3">
        <StatTile
          value={formatMoney(summary.outstandingDue)}
          label={t("admin.residentDetail.outstanding")}
          tone={summary.outstandingDue > 0 ? "danger" : "success"}
        />
        <StatTile
          value={formatMoney(summary.totalPaid)}
          label={t("admin.residentDetail.totalPaid")}
          tone="success"
        />
        <StatTile
          value={String(summary.openTicketCount)}
          label={t("admin.residentDetail.openComplaints")}
          tone="primary"
        />
      </View>

      {/* Info */}
      <Card className="gap-2">
        <Text variant="subtitle">{t("admin.residentDetail.info")}</Text>
        <Field
          label={t("signup.email")}
          value={profile.email}
          onAdd={() => setContactOpen(true)}
        />
        <Field
          label={t("signup.phone")}
          value={profile.phone}
          onAdd={() => setContactOpen(true)}
        />
        <Field label={t("admin.floor")} value={String(profile.floor)} />
        <Field
          label={t("admin.residentReport.flatType")}
          value={t(`enums.flatType.${profile.flatType}`)}
        />
        <Field label={t("admin.residentReport.joined")} value={formatDate(profile.joinedAt)} />
        {profile.moveInDate && (
          <Field
            label={t("admin.residentReport.movedIn")}
            value={formatDate(profile.moveInDate)}
          />
        )}
        <Field
          label={t("profile.emergencyContact")}
          value={
            profile.emergencyContactName
              ? `${profile.emergencyContactName}${
                  profile.emergencyContactPhone ? ` · ${profile.emergencyContactPhone}` : ""
                }`
              : t("profile.notSet")
          }
        />
      </Card>

      {/* Household */}
      <ListSection
        title={t("admin.residentReport.sections.family")}
        count={detail.familyMembers.length}
        emptyLabel={t("family.empty")}
      >
        {detail.familyMembers.map((member) => (
          <Row
            key={member.id}
            title={member.name}
            meta={
              member.age === null
                ? member.relation
                : `${member.relation} · ${t("family.age", { age: member.age })}`
            }
          />
        ))}
      </ListSection>

      {/* Vehicles */}
      <ListSection
        title={t("admin.residentReport.sections.vehicles")}
        count={detail.vehicles.length}
        emptyLabel={t("vehicles.empty")}
      >
        {detail.vehicles.map((vehicle) => (
          <Row
            key={vehicle.id}
            title={vehicle.number}
            meta={t(`enums.vehicleType.${vehicle.type}`)}
          />
        ))}
      </ListSection>

      {/* Visitors — flat-scoped, and the copy says so. */}
      <ListSection
        title={t("admin.residentReport.sections.visitors")}
        count={detail.visitors.length}
        emptyLabel={t("visitors.noHistory")}
      >
        <Text variant="caption" color="tertiary">
          {t("admin.residentDetail.flatScoped")}
        </Text>
        {detail.visitors.slice(0, 10).map((visitor) => (
          <Row
            key={visitor.id}
            title={visitor.name}
            meta={`${t(`enums.visitorPurpose.${visitor.purpose}`)} · ${formatDateTime(
              visitor.createdAt,
            )}`}
            badge={t(`enums.visitorStatus.${visitor.status}`)}
            badgeTone={VISITOR_TONE[visitor.status]}
          />
        ))}
      </ListSection>

      {/* Complaints */}
      <ListSection
        title={t("admin.residentReport.sections.tickets")}
        count={detail.tickets.length}
        emptyLabel={t("tickets.empty")}
      >
        {detail.tickets.slice(0, 10).map((ticket) => (
          <Card
            key={ticket.id}
            className="flex-row items-center gap-3 py-3"
            onPress={() => router.push(`/(admin)/tickets/${ticket.id}`)}
          >
            <View className="flex-1 gap-0.5">
              <Text variant="subtitle" numberOfLines={1}>
                {ticket.title}
              </Text>
              <Text variant="caption" color="secondary" numberOfLines={1}>
                {ticket.referenceCode} · {formatDate(ticket.createdAt)}
              </Text>
            </View>
            <Badge
              label={t(`enums.ticketStatus.${ticket.status}`)}
              tone={TICKET_TONE[ticket.status]}
              size="sm"
            />
          </Card>
        ))}
      </ListSection>

      {/* Amenity bookings */}
      <ListSection
        title={t("admin.residentReport.sections.bookings")}
        count={detail.bookings.length}
        emptyLabel={t("amenities.noBookings")}
      >
        {detail.bookings.slice(0, 10).map((booking) => (
          <Row
            key={booking.id}
            title={booking.amenityName}
            meta={`${formatDate(booking.date)} · ${booking.startTime}–${booking.endTime}`}
            badge={t(`enums.bookingStatus.${booking.status}`)}
            badgeTone={booking.status === "BOOKED" ? "primary" : "neutral"}
          />
        ))}
      </ListSection>

      {/* Dues — also flat-scoped. */}
      <ListSection
        title={t("admin.residentReport.sections.dues")}
        count={detail.dues.length}
        emptyLabel={t("payments.noDues")}
      >
        <Text variant="caption" color="tertiary">
          {t("admin.residentDetail.flatScoped")}
        </Text>
        {detail.dues.slice(0, 10).map((due) => (
          <Row
            key={due.id}
            title={formatMoney(due.amount)}
            meta={`${due.month}/${due.year} · ${formatDate(due.dueDate)}`}
            badge={t(`enums.dueStatus.${due.status}`)}
            badgeTone={DUE_TONE[due.status]}
          />
        ))}
      </ListSection>

      {/* Payments */}
      <ListSection
        title={t("admin.residentReport.sections.payments")}
        count={detail.payments.length}
        emptyLabel={t("payments.noHistory")}
      >
        {detail.payments.slice(0, 10).map((payment) => (
          <Row
            key={payment.id}
            title={formatMoney(payment.amount)}
            meta={`${payment.target} · ${formatDate(payment.paidAt ?? payment.createdAt)}`}
            badge={t(`enums.paymentStatus.${payment.status}`)}
            badgeTone={payment.status === "SUCCESS" ? "success" : "warning"}
          />
        ))}
      </ListSection>

      {/* Account actions */}
      {profile.isActive ? (
        <Button
          label={t("admin.deactivate")}
          variant="dangerSoft"
          loading={busy}
          onPress={() =>
            confirmAction({
              title: t("admin.deactivateConfirmTitle"),
              message: t("admin.deactivateConfirmMessage"),
              confirmLabel: t("admin.deactivate"),
              cancelLabel: t("common.cancel"),
              onConfirm: () => deactivate.mutate({ userId: profile.id }),
            })
          }
        />
      ) : (
        <Button
          label={t("admin.reactivate")}
          variant="secondary"
          loading={busy}
          onPress={() => reactivate.mutate({ userId: profile.id })}
        />
      )}

      <ResidentContactSheet
        visible={contactOpen}
        onClose={() => setContactOpen(false)}
        userId={profile.id}
        missingEmail={!profile.email}
        missingPhone={!profile.phone}
      />

      <ExportSheet
        visible={exportOpen}
        onClose={() => setExportOpen(false)}
        title={t("admin.residentReport.title")}
        subtitle={t("admin.residentReport.hint")}
        sections={REPORT_SECTIONS}
        sectionLabel={(section) => t(`admin.residentReport.sections.${section}`)}
        shareTitle={t("admin.residentReport.title")}
        build={({ format, sections }) => {
          const params = {
            detail,
            sections,
            societyName: society.data?.name ?? t("app.name"),
            t,
          };
          return format === "pdf"
            ? buildResidentReportPdf(params)
            : Promise.resolve(buildResidentReportCsv(params));
        }}
      />
    </Screen>
  );
}
