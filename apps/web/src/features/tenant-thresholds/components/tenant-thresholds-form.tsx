"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import {
  updateTenantDefaultThresholdsInputSchema,
  type UpdateTenantDefaultThresholdsInput,
} from "~/schemas/tenant-thresholds";
import { api } from "~/trpc/react";

interface TenantThresholdsFormProps {
  disabled?: boolean;
}

type FormFeedback = {
  type: "success" | "error";
  message: string;
};

const DEFAULT_VALUES: UpdateTenantDefaultThresholdsInput = {
  criticalThreshold: 50,
  attentionThreshold: 100,
};

export function TenantThresholdsForm({ disabled = false }: TenantThresholdsFormProps) {
  const [feedback, setFeedback] = useState<FormFeedback | null>(null);
  const utils = api.useUtils();

  const { data: thresholds, isLoading } = api.tenantThresholds.getTenantDefaultThresholds.useQuery();

  const form = useForm<UpdateTenantDefaultThresholdsInput>({
    resolver: zodResolver(updateTenantDefaultThresholdsInputSchema),
    defaultValues: DEFAULT_VALUES,
    mode: "onChange",
  });

  useEffect(() => {
    if (thresholds) {
      form.reset(thresholds);
    }
  }, [form, thresholds]);

  const updateMutation = api.tenantThresholds.updateTenantDefaultThresholds.useMutation({
    onSuccess: async () => {
      setFeedback({
        type: "success",
        message: "Default thresholds saved successfully.",
      });
      await utils.tenantThresholds.getTenantDefaultThresholds.invalidate();
    },
    onError: (error) => {
      setFeedback({
        type: "error",
        message: error.message,
      });
    },
  });

  const onSubmit = async (data: UpdateTenantDefaultThresholdsInput) => {
    setFeedback(null);
    await updateMutation.mutateAsync(data);
  };

  if (isLoading) {
    return (
      <section className="rounded-lg bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-gray-900">Default Alert Thresholds</h2>
        <p className="mt-2 text-sm text-gray-600">Loading current threshold values...</p>
      </section>
    );
  }

  if (disabled) {
    return (
      <section className="rounded-lg bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-gray-900">Default Alert Thresholds</h2>
        <p className="mt-2 text-sm text-gray-600">
          You can view tenant defaults, but only Admin users can edit them.
        </p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-gray-600">Critical threshold</dt>
            <dd className="font-medium text-gray-900">
              {thresholds?.criticalThreshold ?? DEFAULT_VALUES.criticalThreshold}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-gray-600">Attention threshold</dt>
            <dd className="font-medium text-gray-900">
              {thresholds?.attentionThreshold ?? DEFAULT_VALUES.attentionThreshold}
            </dd>
          </div>
        </dl>
      </section>
    );
  }

  return (
    <section className="rounded-lg bg-white p-6 shadow">
      <h2 className="text-lg font-semibold text-gray-900">Default Alert Thresholds</h2>
      <p className="mt-2 text-sm text-gray-600">
        Configure tenant-wide defaults used when a product has no specific threshold.
      </p>

      <form className="mt-5 space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="criticalThreshold">
            Critical threshold
          </label>
          <input
            id="criticalThreshold"
            type="number"
            min={1}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            aria-invalid={form.formState.errors.criticalThreshold ? "true" : "false"}
            {...form.register("criticalThreshold", {
              setValueAs: (value) => (value === "" ? undefined : Number(value)),
            })}
          />
          {form.formState.errors.criticalThreshold ? (
            <p className="mt-1 text-xs text-red-600">{form.formState.errors.criticalThreshold.message}</p>
          ) : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="attentionThreshold">
            Attention threshold
          </label>
          <input
            id="attentionThreshold"
            type="number"
            min={1}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            aria-invalid={form.formState.errors.attentionThreshold ? "true" : "false"}
            {...form.register("attentionThreshold", {
              setValueAs: (value) => (value === "" ? undefined : Number(value)),
            })}
          />
          {form.formState.errors.attentionThreshold ? (
            <p className="mt-1 text-xs text-red-600">{form.formState.errors.attentionThreshold.message}</p>
          ) : null}
        </div>

        <p className="text-xs text-gray-500">
          Rules: both values must be greater than 0, and critical must be lower than attention.
        </p>

        {feedback ? (
          <p className={feedback.type === "success" ? "text-sm text-emerald-700" : "text-sm text-red-600"}>
            {feedback.message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={updateMutation.isPending || !form.formState.isDirty || !form.formState.isValid}
          className="inline-flex w-full items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {updateMutation.isPending ? "Saving..." : "Save changes"}
        </button>
      </form>
    </section>
  );
}
