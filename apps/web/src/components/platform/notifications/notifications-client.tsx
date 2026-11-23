"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Bell, Send } from "lucide-react";
import { z } from "zod";
import { errorMessage, platformRequest } from "../api-client";
import type { NotificationRow } from "../platform-types";
import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  SkeletonRows,
  Textarea,
  formatDateTime,
} from "../ui";

const formSchema = z.object({
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(500),
  severity: z.enum(["info", "warning", "critical"]),
});

type FormValues = z.infer<typeof formSchema>;

type TenantOption = { id: string; name: string; slug: string };

const SEVERITY_TONE = {
  info: "info",
  warning: "warning",
  critical: "danger",
} as const;

export function NotificationsClient() {
  const t = useTranslations("platform.notifications");
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"compose" | "history">("compose");
  const [audienceMode, setAudienceMode] = useState<"all" | "selected">("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sent, setSent] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: "", body: "", severity: "info" },
  });
  const { register, handleSubmit, reset, watch, formState } = form;

  const tenants = useQuery<{ items: TenantOption[] }>({
    queryKey: ["platform", "tenants", "notification-options"],
    queryFn: () => platformRequest<{ items: TenantOption[] }>("/api/platform/tenants?limit=100"),
    staleTime: 60_000,
    enabled: tab === "compose",
  });

  const history = useQuery<NotificationRow[]>({
    queryKey: ["platform", "notifications"],
    queryFn: () => platformRequest<NotificationRow[]>("/api/platform/notifications"),
    staleTime: 15_000,
  });

  const title = watch("title");
  const body = watch("body");
  const severity = watch("severity");

  // Reset the success banner once the operator starts a new message.
  useEffect(() => {
    setSent(false);
  }, [title, body]);

  const sendMutation = useMutation({
    mutationFn: (values: FormValues) =>
      platformRequest<NotificationRow>("/api/platform/notifications", {
        method: "POST",
        body: JSON.stringify({
          title: values.title.trim(),
          body: values.body.trim(),
          severity: values.severity,
          audience: audienceMode === "all" ? [] : selected,
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["platform", "notifications"] });
      setConfirming(false);
      setSent(true);
      reset({ title: "", body: "", severity: "info" });
      setSelected([]);
      setAudienceMode("all");
      setTab("history");
    },
    onError: (error) => setSendError(errorMessage(error, t("sendError"))),
  });

  function send(values: FormValues) {
    if (audienceMode === "selected" && selected.length === 0) {
      setSendError(t("selectAtLeastOne"));
      return;
    }
    setSendError("");
    void values;
    setConfirming(true);
  }

  function resend(row: NotificationRow) {
    reset({ title: row.title, body: row.body, severity: row.severity });
    setAudienceMode(row.allTenants ? "all" : "selected");
    setSelected(row.audience);
    setTab("compose");
    setSent(false);
  }

  const audienceLabel =
    audienceMode === "all"
      ? t("audienceAll")
      : t("audienceCount", { count: selected.length });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <div role="tablist" aria-label={t("title")} className="flex gap-1 border-b border-[var(--border)]">
        {(["compose", "history"] as const).map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={[
              "rounded-t-lg px-4 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              tab === key
                ? "border-b-2 border-[var(--accent)] text-[var(--foreground)]"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
            ].join(" ")}
          >
            {t(key)}
          </button>
        ))}
      </div>

      {tab === "compose" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <form
            onSubmit={handleSubmit(send)}
            className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5"
          >
            <Field
              label={t("fieldTitle")}
              htmlFor="notification-title"
              required
              hint={t("fieldTitleHint")}
              error={formState.errors.title?.message}
            >
              <Input id="notification-title" maxLength={100} {...register("title")} />
            </Field>
            <Field
              label={t("fieldBody")}
              htmlFor="notification-body"
              required
              hint={t("fieldBodyHint")}
              error={formState.errors.body?.message}
            >
              <Textarea id="notification-body" rows={5} maxLength={500} {...register("body")} />
            </Field>
            <Field label={t("fieldSeverity")} htmlFor="notification-severity" error={formState.errors.severity?.message}>
              <Select id="notification-severity" {...register("severity")} className="w-40">
                <option value="info">{t("severityInfo")}</option>
                <option value="warning">{t("severityWarning")}</option>
                <option value="critical">{t("severityCritical")}</option>
              </Select>
            </Field>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-[var(--foreground)]">{t("audience")}</legend>
              <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                <input
                  type="radio"
                  name="audience-mode"
                  checked={audienceMode === "all"}
                  onChange={() => setAudienceMode("all")}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                {t("audienceAll")}
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                <input
                  type="radio"
                  name="audience-mode"
                  checked={audienceMode === "selected"}
                  onChange={() => setAudienceMode("selected")}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                {t("audienceSpecific")}
              </label>
              {audienceMode === "selected" && (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--border)] p-3">
                  {tenants.isLoading && (
                    <div className="h-4 w-1/2 animate-pulse rounded bg-[var(--muted)]" />
                  )}
                  {tenants.isError && (
                    <p className="text-xs text-[var(--destructive)]">{t("tenantsError")}</p>
                  )}
                  {(tenants.data?.items ?? []).map((tenant) => (
                    <label key={tenant.id} className="flex items-center gap-2 py-1 text-sm text-[var(--foreground)]">
                      <input
                        type="checkbox"
                        checked={selected.includes(tenant.id)}
                        onChange={() =>
                          setSelected((current) =>
                            current.includes(tenant.id)
                              ? current.filter((id) => id !== tenant.id)
                              : [...current, tenant.id],
                          )
                        }
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                      {tenant.name}
                      <span className="font-mono text-xs text-[var(--muted-foreground)]">{tenant.slug}</span>
                    </label>
                  ))}
                  {!tenants.isLoading && (tenants.data?.items.length ?? 0) === 0 && (
                    <p className="text-xs text-[var(--muted-foreground)]">{t("noTenants")}</p>
                  )}
                </div>
              )}
            </fieldset>

            {sendError && (
              <p role="alert" className="text-sm text-[var(--destructive)]">
                {sendError}
              </p>
            )}
            {sent && <p className="text-sm text-[var(--success)]">{t("sent")}</p>}

            <div className="flex justify-end">
              <Button type="submit" variant="primary">
                <Send size={15} aria-hidden />
                {t("send")}
              </Button>
            </div>
          </form>

          <section aria-label={t("preview")} className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-[var(--foreground)]">{t("preview")}</h3>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-[var(--card-foreground)]">{title || t("previewTitle")}</p>
                <Badge tone={SEVERITY_TONE[severity]}>{t(`severity${severity[0]!.toUpperCase()}${severity.slice(1)}`)}</Badge>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--muted-foreground)]">
                {body || t("previewBody")}
              </p>
              <p className="mt-3 text-xs text-[var(--muted-foreground)]">{audienceLabel}</p>
            </div>
          </section>
        </div>
      )}

      {tab === "history" && (
        <>
          {history.isError && (
            <ErrorBanner message={t("historyError")} onRetry={() => history.refetch()} />
          )}
          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[900px] text-left text-sm">
                <caption className="sr-only">{t("history")}</caption>
                <thead className="border-b border-[var(--border)] bg-[var(--muted)] text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">{t("colSent")}</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">{t("colTitle")}</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">{t("colSeverity")}</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">{t("colAudience")}</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">{t("colStatus")}</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">{t("colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.isLoading && <SkeletonRows cols={6} />}
                  {!history.isLoading &&
                    (history.data ?? []).map((row) => (
                      <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
                        <td className="px-4 py-3 text-[var(--muted-foreground)]">
                          {formatDateTime(row.publishedAt ?? row.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-[var(--foreground)]">{row.title}</p>
                          <p className="line-clamp-1 text-xs text-[var(--muted-foreground)]">{row.body}</p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={SEVERITY_TONE[row.severity]}>
                            {t(`severity${row.severity[0]!.toUpperCase()}${row.severity.slice(1)}`)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-[var(--muted-foreground)]">
                          {row.allTenants
                            ? t("audienceAll")
                            : t("audienceCount", { count: row.recipients.length })}
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={row.status === "sent" ? "success" : "warning"}>
                            {t(`status${row.status[0]!.toUpperCase()}${row.status.slice(1)}`)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Button variant="secondary" onClick={() => resend(row)}>
                            {t("resend")}
                          </Button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-[var(--border)] md:hidden">
              {!history.isLoading &&
                (history.data ?? []).map((row) => (
                  <div key={row.id} className="flex flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-[var(--foreground)]">{row.title}</p>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          {formatDateTime(row.publishedAt ?? row.createdAt)}
                        </p>
                      </div>
                      <Badge tone={SEVERITY_TONE[row.severity]}>
                        {t(`severity${row.severity[0]!.toUpperCase()}${row.severity.slice(1)}`)}
                      </Badge>
                    </div>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {row.allTenants ? t("audienceAll") : t("audienceCount", { count: row.recipients.length })}
                    </p>
                    <Button variant="secondary" onClick={() => resend(row)}>
                      {t("resend")}
                    </Button>
                  </div>
                ))}
            </div>

            {!history.isLoading && (history.data ?? []).length === 0 && (
              <EmptyState icon={Bell} title={t("historyEmpty")} hint={t("historyEmptyHint")} />
            )}
          </div>
        </>
      )}

      <Modal
        open={confirming}
        onClose={() => !sendMutation.isPending && setConfirming(false)}
        title={t("confirmTitle")}
        description={t("confirmBody", { audience: audienceLabel })}
        busy={sendMutation.isPending}
        footer={
          <>
            <Button onClick={() => setConfirming(false)} disabled={sendMutation.isPending}>
              {t("cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit((values) => sendMutation.mutate(values))}
              disabled={sendMutation.isPending}
            >
              {sendMutation.isPending ? t("sending") : t("send")}
            </Button>
          </>
        }
      >
        {sendError && (
          <p role="alert" className="text-sm text-[var(--destructive)]">
            {sendError}
          </p>
        )}
      </Modal>
    </div>
  );
}
