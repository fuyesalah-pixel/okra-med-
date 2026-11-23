"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Package, Pencil, Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { errorMessage, platformRequest } from "../api-client";
import type { ModuleRow } from "../platform-types";
import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  Modal,
  PageHeader,
  SkeletonRows,
  formatMinor,
} from "../ui";

const formSchema = z.object({
  name: z.string().min(2).max(255),
  key: z
    .string()
    .min(2)
    .max(63)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "lowercase letters, digits and hyphens only"),
  description: z.string().max(2000),
  displayOrder: z.coerce.number().int().min(0).max(999),
  isCore: z.boolean(),
  isActive: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

const EMPTY: FormValues = {
  name: "",
  key: "",
  description: "",
  displayOrder: 0,
  isCore: false,
  isActive: true,
};

export function ModuleCatalog() {
  const t = useTranslations("platform.modules");
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ModuleRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ModuleRow | null>(null);
  const [dialogError, setDialogError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery<ModuleRow[]>({
    queryKey: ["platform", "modules"],
    queryFn: () => platformRequest<ModuleRow[]>("/api/platform/modules"),
    staleTime: 15_000,
  });

  const rows = data ?? [];

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: EMPTY,
  });
  const { register, handleSubmit, reset, setValue, watch, formState } = form;

  useEffect(() => {
    if (creating) {
      reset(EMPTY);
      setKeyTouched(false);
      setDialogError("");
    }
  }, [creating, reset]);

  useEffect(() => {
    if (editing) {
      reset({
        name: editing.name,
        key: editing.key,
        description: editing.description ?? "",
        displayOrder: editing.displayOrder,
        isCore: editing.isCore,
        isActive: editing.isActive,
      });
      setKeyTouched(true);
      setDialogError("");
    }
  }, [editing, reset]);

  // Key follows the name until the operator edits it, then it stops moving.
  const nameValue = watch("name");
  useEffect(() => {
    if (!creating || keyTouched) return;
    setValue("key", slugify(nameValue ?? ""), { shouldValidate: false });
  }, [nameValue, creating, keyTouched, setValue]);

  const saveMutation = useMutation({
    mutationFn: (values: FormValues) => {
      const body = {
        name: values.name,
        description: values.description.trim() || undefined,
        displayOrder: values.displayOrder,
        isCore: values.isCore,
        isActive: values.isActive,
      };
      if (editing) {
        return platformRequest(`/api/platform/modules/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }
      return platformRequest("/api/platform/modules", {
        method: "POST",
        body: JSON.stringify({ ...body, key: values.key }),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["platform", "modules"] });
      setCreating(false);
      setEditing(null);
    },
    onError: (error) => setDialogError(errorMessage(error, t("saveError"))),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      platformRequest<void>(`/api/platform/modules/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["platform", "modules"] });
      setDeleting(null);
    },
    onError: (error) => setDeleteError(errorMessage(error, t("deleteError"))),
  });

  const dialogOpen = creating || Boolean(editing);
  const busy = saveMutation.isPending;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <PageHeader title={t("title")} subtitle={t("subtitle")}>
        <Button
          variant="primary"
          onClick={() => {
            setEditing(null);
            setCreating(true);
          }}
        >
          <Plus size={16} aria-hidden />
          {t("newModule")}
        </Button>
      </PageHeader>

      {isError && <ErrorBanner message={t("errorLoad")} onRetry={() => refetch()} />}

      {!isError && (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[820px] text-left text-sm">
              <caption className="sr-only">{t("title")}</caption>
              <thead className="border-b border-[var(--border)] bg-[var(--muted)] text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t("colName")}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t("colKey")}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t("colOrder")}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t("colActive")}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t("colCore")}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t("colPrice")}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t("colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <SkeletonRows cols={7} />}
                {!isLoading &&
                  rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-[var(--border)] last:border-0"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-[var(--foreground)]">{row.name}</p>
                        {row.description && (
                          <p className="text-xs text-[var(--muted-foreground)]">{row.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--muted-foreground)]">
                        {row.key}
                      </td>
                      <td className="px-4 py-3 text-[var(--muted-foreground)]">{row.displayOrder}</td>
                      <td className="px-4 py-3">
                        <Badge tone={row.isActive ? "success" : "neutral"}>
                          {row.isActive ? t("active") : t("inactive")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {row.isCore ? <Badge tone="info">{t("yes")}</Badge> : <span className="text-[var(--muted-foreground)]">—</span>}
                      </td>
                      <td className="px-4 py-3 text-[var(--foreground)]">
                        {row.pricing
                          ? formatMinor(row.pricing.instancePrice, row.pricing.currency)
                          : t("noPrice")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setCreating(false);
                              setEditing(row);
                            }}
                            aria-label={t("edit")}
                            className="rounded p-1.5 text-[var(--muted-foreground)] outline-none hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                          >
                            <Pencil size={15} aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteError("");
                              setDeleting(row);
                            }}
                            aria-label={t("delete")}
                            className="rounded p-1.5 text-[var(--destructive)] outline-none hover:bg-[var(--destructive-surface)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                          >
                            <Trash2 size={15} aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: rows become cards so no horizontal scrolling is needed. */}
          <div className="divide-y divide-[var(--border)] md:hidden">
            {isLoading &&
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="space-y-2 p-4">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--muted)]" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-[var(--muted)]" />
                </div>
              ))}
            {!isLoading &&
              rows.map((row) => (
                <div key={row.id} className="flex flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-[var(--foreground)]">{row.name}</p>
                      <p className="font-mono text-xs text-[var(--muted-foreground)]">{row.key}</p>
                    </div>
                    <Badge tone={row.isActive ? "success" : "neutral"}>
                      {row.isActive ? t("active") : t("inactive")}
                    </Badge>
                  </div>
                  <p className="text-sm text-[var(--foreground)]">
                    {row.pricing
                      ? formatMinor(row.pricing.instancePrice, row.pricing.currency)
                      : t("noPrice")}
                  </p>
                  <div className="flex gap-2">
                    <Button onClick={() => { setCreating(false); setEditing(row); }}>
                      <Pencil size={14} aria-hidden />
                      {t("edit")}
                    </Button>
                    <Button variant="danger" onClick={() => { setDeleteError(""); setDeleting(row); }}>
                      <Trash2 size={14} aria-hidden />
                      {t("delete")}
                    </Button>
                  </div>
                </div>
              ))}
          </div>

          {!isLoading && rows.length === 0 && (
            <EmptyState
              icon={Package}
              title={t("empty")}
              hint={t("emptyHint")}
              action={
                <Button variant="primary" onClick={() => setCreating(true)}>
                  <Plus size={16} aria-hidden />
                  {t("createFirst")}
                </Button>
              }
            />
          )}
        </div>
      )}

      <Modal
        open={dialogOpen}
        onClose={() => {
          if (busy) return;
          setCreating(false);
          setEditing(null);
        }}
        title={editing ? t("editTitle") : t("newTitle")}
        busy={busy}
        footer={
          <>
            <Button
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
              disabled={busy}
            >
              {t("cancel")}
            </Button>
            <Button variant="primary" onClick={handleSubmit((values) => saveMutation.mutate(values))} disabled={busy}>
              {busy ? t("saving") : editing ? t("save") : t("create")}
            </Button>
          </>
        }
      >
        <form
          onSubmit={handleSubmit((values) => saveMutation.mutate(values))}
          className="flex flex-col gap-3"
        >
          <Field label={t("name")} htmlFor="module-name" required error={formState.errors.name?.message}>
            <Input id="module-name" {...register("name")} />
          </Field>
          <Field
            label={t("key")}
            htmlFor="module-key"
            required={!editing}
            hint={editing ? t("keyLocked") : t("keyHint")}
            error={formState.errors.key?.message}
          >
            <Input
              id="module-key"
              {...register("key", { onChange: () => setKeyTouched(true) })}
              disabled={Boolean(editing)}
              className="font-mono"
            />
          </Field>
          <Field label={t("description")} htmlFor="module-description" error={formState.errors.description?.message}>
            <Input id="module-description" {...register("description")} />
          </Field>
          <Field label={t("displayOrder")} htmlFor="module-order" error={formState.errors.displayOrder?.message}>
            <Input id="module-order" type="number" min={0} max={999} {...register("displayOrder")} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
            <input type="checkbox" {...register("isCore")} className="h-4 w-4 accent-[var(--accent)]" />
            <span>
              {t("isCore")}
              <span className="block text-xs text-[var(--muted-foreground)]">{t("isCoreHint")}</span>
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
            <input type="checkbox" {...register("isActive")} className="h-4 w-4 accent-[var(--accent)]" />
            <span>
              {t("isActive")}
              <span className="block text-xs text-[var(--muted-foreground)]">{t("isActiveHint")}</span>
            </span>
          </label>
          {dialogError && (
            <p role="alert" className="text-sm text-[var(--destructive)]">
              {dialogError}
            </p>
          )}
        </form>
      </Modal>

      <Modal
        open={Boolean(deleting)}
        onClose={() => !deleteMutation.isPending && setDeleting(null)}
        title={t("deleteTitle", { name: deleting?.name ?? "" })}
        description={t("deleteBody")}
        busy={deleteMutation.isPending}
        footer={
          <>
            <Button onClick={() => setDeleting(null)} disabled={deleteMutation.isPending}>
              {t("cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? t("deleting") : t("deleteConfirm")}
            </Button>
          </>
        }
      >
        {deleteError && (
          <p role="alert" className="text-sm text-[var(--destructive)]">
            {deleteError}
          </p>
        )}
      </Modal>
    </div>
  );
}
