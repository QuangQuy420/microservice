"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, type FormEvent } from "react";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { apiErrorDetails, getSagaSettings, updateSagaSettings, useApiError } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";

interface FormState {
  intervalMs: string;
  stuckThresholdMinutes: string;
  maxAttempts: string;
}

const FORM_FIELD = "mb-1.5 block text-[0.8rem] font-medium";

function blankForm(): FormState {
  return { intervalMs: "", stuckThresholdMinutes: "", maxAttempts: "" };
}

// Admin "Settings" tab (T16, AC4) — view/edit the checkout saga reconciliation job's live retry
// config (retry interval, stuck threshold, max attempts). Bounds mirror order-service's
// UpdateReconciliationSettingsRequest / api-gateway's UpdateSagaSettingsDto (plan Q1): interval
// >= 10000ms, stuck threshold >= 1 minute, max attempts 1-20. Field/validation/submit flow
// modeled on ProductEditForm.tsx's numeric-field pattern.
export function SagaSettingsPage() {
  const t = useTranslations("admin");
  const common = useTranslations("common");
  const translateError = useApiError();

  const [form, setForm] = useState<FormState>(blankForm());
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const token = getAccessToken();
      if (!token) {
        if (!cancelled) {
          setLoadError(t("settings.sessionExpired"));
          setIsLoading(false);
        }
        return;
      }

      try {
        const settings = await getSagaSettings(token);
        if (cancelled) return;
        setForm({
          intervalMs: String(settings.intervalMs),
          stuckThresholdMinutes: String(settings.stuckThresholdMinutes),
          maxAttempts: String(settings.maxAttempts),
        });
        setUpdatedAt(settings.updatedAt);
      } catch (err) {
        if (!cancelled) {
          setLoadError(translateError(err));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [t, translateError]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setMessage(null);

    const intervalMs = Number(form.intervalMs);
    const stuckThresholdMinutes = Number(form.stuckThresholdMinutes);
    const maxAttempts = Number(form.maxAttempts);

    if (!Number.isInteger(intervalMs) || intervalMs < 10000) {
      setError(t("settings.intervalInvalid"));
      return;
    }
    if (!Number.isInteger(stuckThresholdMinutes) || stuckThresholdMinutes < 1) {
      setError(t("settings.stuckThresholdInvalid"));
      return;
    }
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
      setError(t("settings.maxAttemptsInvalid"));
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setError(t("settings.sessionExpired"));
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = await updateSagaSettings(token, {
        intervalMs,
        stuckThresholdMinutes,
        maxAttempts,
      });
      setForm({
        intervalMs: String(updated.intervalMs),
        stuckThresholdMinutes: String(updated.stuckThresholdMinutes),
        maxAttempts: String(updated.maxAttempts),
      });
      setUpdatedAt(updated.updatedAt);
      setMessage(t("settings.saved"));
    } catch (err) {
      setError(translateError(err));
      setFieldErrors(apiErrorDetails(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) return <LoadingState label={t("settings.loading")} />;
  if (loadError) return <ErrorState message={loadError} />;

  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-7 py-5">
        <div className="flex gap-2.5">
          <button
            type="submit"
            form="saga-settings-form"
            className="btn btn-primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? common("saving") : t("settings.saveButton")}
          </button>
        </div>
      </header>

      <form id="saga-settings-form" className="mx-auto max-w-[980px] p-7" onSubmit={handleSubmit}>
        <div className="mb-1 font-heading text-2xl font-semibold">{t("settings.heading")}</div>
        <div className="mb-6 text-[0.85rem] text-text-muted">{t("settings.description")}</div>

        {error && <p className="field-error my-[1em]">{error}</p>}
        {message && <p role="status" className="my-[1em]">{message}</p>}

        <div className="rounded-lg border border-border bg-surface p-5">
          <div className="mb-4 text-[0.78rem] font-semibold tracking-[0.06em] text-text-muted uppercase">
            {t("settings.paramsSection")}
          </div>

          <label className={FORM_FIELD} htmlFor="settings-interval-ms">
            {t("settings.intervalLabel")}
          </label>
          <input
            id="settings-interval-ms"
            type="number"
            min={10000}
            step={1000}
            className="input mb-4"
            value={form.intervalMs}
            onChange={(event) => updateField("intervalMs", event.target.value)}
          />
          {fieldErrors.intervalMs?.map((msg) => (
            <p key={msg} role="alert" className="field-error mb-4">
              {msg}
            </p>
          ))}

          <label className={FORM_FIELD} htmlFor="settings-stuck-threshold">
            {t("settings.stuckThresholdLabel")}
          </label>
          <input
            id="settings-stuck-threshold"
            type="number"
            min={1}
            step={1}
            className="input mb-4"
            value={form.stuckThresholdMinutes}
            onChange={(event) => updateField("stuckThresholdMinutes", event.target.value)}
          />
          {fieldErrors.stuckThresholdMinutes?.map((msg) => (
            <p key={msg} role="alert" className="field-error mb-4">
              {msg}
            </p>
          ))}

          <label className={FORM_FIELD} htmlFor="settings-max-attempts">
            {t("settings.maxAttemptsLabel")}
          </label>
          <input
            id="settings-max-attempts"
            type="number"
            min={1}
            max={20}
            step={1}
            className="input mb-4"
            value={form.maxAttempts}
            onChange={(event) => updateField("maxAttempts", event.target.value)}
          />
          {fieldErrors.maxAttempts?.map((msg) => (
            <p key={msg} role="alert" className="field-error mb-4">
              {msg}
            </p>
          ))}
        </div>

        {updatedAt && (
          <p className="text-xs text-text-muted">
            {t("settings.lastUpdated", { at: new Date(updatedAt).toLocaleString("vi-VN") })}
          </p>
        )}
      </form>
    </>
  );
}
