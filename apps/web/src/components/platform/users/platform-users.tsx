"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Plus, ShieldAlert, UserCheck, UserX, Users } from "lucide-react";
import { z } from "zod";
import { errorMessage, PlatformApiError, platformRequest } from "../api-client";
import type { PlatformUserRow } from "../platform-types";
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
  formatDateTime,
} from "../ui";

const inviteSchema = z.object({
  name: z.string().min(2).max(255),
  email: z.string().email().max(255),
  role: z.enum(["super_admin", "platform_support"]),
});

type InviteValues = z.infer<typeof inviteSchema>;

export function PlatformUsers() {
  const t = useTranslations("platform.users");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [inviting, setInviting] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<PlatformUserRow | null>(null);
  const [dialogError, setDialogError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  const { data, isLoading, isError, error, refetch } = useQuery<PlatformUserRow[]>({
    queryKey: ["platform", "users"],
    queryFn: () => platformRequest<PlatformUserRow[]>("/api/platform/users"),
    staleTime: 15_000,
    retry: false,
  });

  // Route guard: the API is the real boundary (403 for platform_support), but a
  // support user who lands here by URL should be sent back, not shown an error.
  useEffect(() => {
    if (error instanceof PlatformApiError && error.status === 403) {
      router.replace("/platform/dashboard");
    }
  }, [error, router]);

  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { name: "", email: "", role: "platform_support" },
  });
  const { register, handleSubmit, reset, formState } = form;

  useEffect(() => {
    if (inviting) {
      reset({ name: "", email: "", role: "platform_support" });
      setDialogError("");
    }
  }, [inviting, reset]);

  const inviteMutation = useMutation({
    mutationFn: (values: InviteValues) =>
      platformRequest<PlatformUserRow>("/api/platform/users", {
        method: "POST",
        body: JSON.stringify(values),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["platform", "users"] });
      setInviting(false);
      setNotice(t("createdNoEmail"));
    },
    onError: (err) => setDialogError(errorMessage(err, t("saveError"))),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { role?: string; isActive?: boolean } }) =>
      platformRequest(`/api/platform/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["platform", "users"] });
      setToggleTarget(null);
      setActionError("");
    },
    onError: (err) => {
      const message = errorMessage(err, t("saveError"));
      setActionError(message);
      setDialogError(message);
    },
  });

  const rows = data ?? [];
  const forbidden = error instanceof PlatformApiError && error.status === 403;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <PageHeader title={t("title")} subtitle={t("subtitle")}>
        <Button variant="primary" onClick={() => setInviting(true)}>
          <Plus size={16} aria-hidden />
          {t("invite")}
        </Button>
      </PageHeader>

      {notice && (
        <div
          role="status"
          className="rounded-xl border border-[var(--info)] bg-[var(--info-surface)] p-4 text-sm text-[var(--info-surface-foreground)]"
        >
          {notice}
        </div>
      )}

      {isError && !forbidden && <ErrorBanner message={t("errorLoad")} onRetry={() => refetch()} />}
      {forbidden && (
        <ErrorBanner message={t("forbidden")} onRetry={() => router.replace("/platform/dashboard")} retryLabel={t("goDashboard")} />
      )}
      {actionError && !toggleTarget && (
        <p role="alert" className="text-sm text-[var(--destructive)]">
          {actionError}
        </p>
      )}

      {!isError && (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[860px] text-left text-sm">
              <caption className="sr-only">{t("title")}</caption>
              <thead className="border-b border-[var(--border)] bg-[var(--muted)] text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t("colName")}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t("colEmail")}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t("colRole")}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t("colLastActive")}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t("colStatus")}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t("colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <SkeletonRows cols={6} />}
                {!isLoading &&
                  rows.map((row) => (
                    <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-4 py-3 font-medium text-[var(--foreground)]">{row.name}</td>
                      <td className="px-4 py-3 text-[var(--muted-foreground)]">{row.email}</td>
                      <td className="px-4 py-3">
                        <Select
                          value={row.role}
                          disabled={patchMutation.isPending}
                          onChange={(event) =>
                            patchMutation.mutate({
                              id: row.id,
                              body: { role: event.target.value },
                            })
                          }
                          aria-label={t("colRole")}
                        >
                          <option value="super_admin">{t("roleSuperAdmin")}</option>
                          <option value="platform_support">{t("roleSupport")}</option>
                        </Select>
                      </td>
                      <td className="px-4 py-3 text-[var(--muted-foreground)]">
                        {formatDateTime(row.lastActiveAt ?? row.lastLoginAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={row.isActive ? "success" : "neutral"}>
                          {row.isActive ? t("active") : t("inactive")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant={row.isActive ? "danger" : "secondary"}
                          onClick={() => {
                            setActionError("");
                            setDialogError("");
                            setToggleTarget(row);
                          }}
                        >
                          {row.isActive ? <UserX size={14} aria-hidden /> : <UserCheck size={14} aria-hidden />}
                          {row.isActive ? t("deactivate") : t("reactivate")}
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-[var(--border)] md:hidden">
            {isLoading &&
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="space-y-2 p-4">
                  <div className="h-4 w-1/2 animate-pulse rounded bg-[var(--muted)]" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--muted)]" />
                </div>
              ))}
            {!isLoading &&
              rows.map((row) => (
                <div key={row.id} className="flex flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-[var(--foreground)]">{row.name}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">{row.email}</p>
                    </div>
                    <Badge tone={row.isActive ? "success" : "neutral"}>
                      {row.isActive ? t("active") : t("inactive")}
                    </Badge>
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {t("lastActive", { date: formatDateTime(row.lastActiveAt ?? row.lastLoginAt) })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Select
                      value={row.role}
                      onChange={(event) =>
                        patchMutation.mutate({ id: row.id, body: { role: event.target.value } })
                      }
                      aria-label={t("colRole")}
                    >
                      <option value="super_admin">{t("roleSuperAdmin")}</option>
                      <option value="platform_support">{t("roleSupport")}</option>
                    </Select>
                    <Button
                      variant={row.isActive ? "danger" : "secondary"}
                      onClick={() => {
                        setActionError("");
                        setToggleTarget(row);
                      }}
                    >
                      {row.isActive ? t("deactivate") : t("reactivate")}
                    </Button>
                  </div>
                </div>
              ))}
          </div>

          {!isLoading && rows.length === 0 && (
            <EmptyState icon={Users} title={t("empty")} hint={t("emptyHint")} />
          )}
        </div>
      )}

      <Modal
        open={inviting}
        onClose={() => !inviteMutation.isPending && setInviting(false)}
        title={t("inviteTitle")}
        description={t("inviteHint")}
        busy={inviteMutation.isPending}
        footer={
          <>
            <Button onClick={() => setInviting(false)} disabled={inviteMutation.isPending}>
              {t("cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit((values) => inviteMutation.mutate(values))}
              disabled={inviteMutation.isPending}
            >
              {inviteMutation.isPending ? t("saving") : t("invite")}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit((values) => inviteMutation.mutate(values))} className="flex flex-col gap-3">
          <Field label={t("colName")} htmlFor="invite-name" required error={formState.errors.name?.message}>
            <Input id="invite-name" {...register("name")} />
          </Field>
          <Field label={t("colEmail")} htmlFor="invite-email" required error={formState.errors.email?.message}>
            <Input id="invite-email" type="email" {...register("email")} />
          </Field>
          <Field label={t("colRole")} htmlFor="invite-role" error={formState.errors.role?.message}>
            <Select id="invite-role" {...register("role")}>
              <option value="platform_support">{t("roleSupport")}</option>
              <option value="super_admin">{t("roleSuperAdmin")}</option>
            </Select>
          </Field>
          <div className="flex items-start gap-2 rounded-lg border border-[var(--warning)] bg-[var(--warning-surface)] p-3 text-xs text-[var(--warning-surface-foreground)]">
            <ShieldAlert size={15} aria-hidden className="mt-0.5 shrink-0" />
            <span>{t("inviteNotice")}</span>
          </div>
          {dialogError && (
            <p role="alert" className="text-sm text-[var(--destructive)]">
              {dialogError}
            </p>
          )}
        </form>
      </Modal>

      <Modal
        open={Boolean(toggleTarget)}
        onClose={() => !patchMutation.isPending && setToggleTarget(null)}
        title={
          toggleTarget?.isActive
            ? t("deactivateTitle", { name: toggleTarget.name })
            : t("reactivateTitle", { name: toggleTarget?.name ?? "" })
        }
        description={toggleTarget?.isActive ? t("deactivateBody") : t("reactivateBody")}
        busy={patchMutation.isPending}
        footer={
          <>
            <Button onClick={() => setToggleTarget(null)} disabled={patchMutation.isPending}>
              {t("cancel")}
            </Button>
            <Button
              variant={toggleTarget?.isActive ? "danger" : "primary"}
              onClick={() =>
                toggleTarget &&
                patchMutation.mutate({
                  id: toggleTarget.id,
                  body: { isActive: !toggleTarget.isActive },
                })
              }
              disabled={patchMutation.isPending}
            >
              {patchMutation.isPending
                ? t("saving")
                : toggleTarget?.isActive
                  ? t("deactivate")
                  : t("reactivate")}
            </Button>
          </>
        }
      >
        {dialogError && (
          <p role="alert" className="text-sm text-[var(--destructive)]">
            {dialogError}
          </p>
        )}
      </Modal>
    </div>
  );
}
