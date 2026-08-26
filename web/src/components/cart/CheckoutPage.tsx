"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { AddressBook } from "@/components/account/AddressBook";
import { ErrorState } from "@/components/common/ErrorState";
import { ImageWithFallback } from "@/components/common/ImageWithFallback";
import { LoadingState } from "@/components/common/LoadingState";
import { useAddresses } from "@/hooks/useAddresses";
import { dispatchCartChange, useCart } from "@/hooks/useCart";
import { apiErrorDetails, checkout, useApiError } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import { formatPriceVnd } from "@/lib/format/price";

// CheckoutRequest.paymentMethod (order-service) is a free-form @NotBlank String, not an enum —
// so any non-empty string works. This is the only payment method payment-service supports; the
// display text lives in the `checkout.paymentMethods` messages, keyed by the raw value.
const PAYMENT_METHODS = ["CARD"];

// Receiver/address fields aren't typed on this form (they're copied from the picked address book
// entry) and `variantIds` comes from the query string — a 422 on any of them is therefore shown
// next to the address picker rather than under an input of its own.
const ADDRESS_ERROR_FIELDS = ["receiverName", "receiverPhone", "shippingAddress", "variantIds"];

// FR5: `details` messages from a 422 VALIDATION_ERROR are English text authored by the backend —
// rendered as-is, never translated. `.field-error` and the <span> element match the auth forms,
// which render these inside a <label> too.
function FieldErrors({ messages }: { messages?: string[] }) {
  if (!messages || messages.length === 0) return null;

  return (
    <>
      {messages.map((message) => (
        <span key={message} role="alert" className="field-error">
          {message}
        </span>
      ))}
    </>
  );
}

// Checkout-form field deltas on top of the shared `.input` base (taller minimum, 10px radius,
// warmer field background) — `focus:bg-white` re-states `.input:focus`'s background, which the
// inline background utility would otherwise win against.
const CHECKOUT_LABEL = "flex flex-col gap-[0.4rem] text-[0.82rem] font-[650] text-text-secondary";
const CHECKOUT_FIELD =
  "input rounded-[10px] bg-[#fffdf9] px-[0.85rem] py-[0.72rem] text-[0.92rem] focus:bg-white";
const SUMMARY_ITEM_IMAGE = "h-12 w-12 shrink-0 rounded-lg bg-[#f0f0f0] object-contain";
const SUMMARY_ITEM_IMAGE_PLACEHOLDER = `${SUMMARY_ITEM_IMAGE} bg-[repeating-linear-gradient(135deg,#ede6d8,#ede6d8_10px,#e4dbc9_10px,#e4dbc9_20px)]`;
const EMPTY_NOTICE =
  "rounded-2xl border border-border bg-surface p-[clamp(1.5rem,4vw,2.5rem)] text-center text-text-muted";

// FR2/T17: checkout form + order summary from the current cart. Redirects to the new order's
// detail page on success and clears the cart badge via dispatchCartChange (order-service itself
// removes just the checked-out items from the cart server-side — see
// CartServiceImpl.removeItems, called from OrderSagaEventListener post-payment).
//
// T-checkout-select: only checks out the variants the user selected on /cart, carried here via
// the `variantIds` query param (CartPage builds that URL) — never the whole cart.
//
// T-address-book: receiver/address fields are no longer typed by hand every time. The user
// picks one of their saved addresses via AddressBook (also used, in "manage" mode, on the
// profile page) — the chosen address's fields are copied into the CheckoutPayload at submit time
// (order-service still stores a denormalized snapshot per order, unrelated to the address book).
export function CheckoutPage() {
  const t = useTranslations("checkout");
  const translateError = useApiError();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { cart, isLoading, error: cartError } = useCart();
  const {
    addresses,
    isLoading: isLoadingAddresses,
    error: addressesError,
    refetch: refetchAddresses,
  } = useAddresses();

  const selectedVariantIds = (searchParams.get("variantIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);

  const [note, setNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const selectedAddress = addresses.find((address) => address.id === effectiveSelectedAddressId);
    if (!selectedAddress) {
      setSubmitError(t("errorAddressRequired"));
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setSubmitError(t("errorLoginRequired"));
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setFieldErrors({});
    try {
      const result = await checkout(token, {
        receiverName: selectedAddress.receiverName,
        receiverPhone: selectedAddress.receiverPhone,
        shippingAddress: selectedAddress.address,
        note: note.trim() || undefined,
        paymentMethod,
        variantIds: selectedVariantIds,
      });
      dispatchCartChange();
      router.push(`/orders/${result.orderId}`);
    } catch (err) {
      setSubmitError(translateError(err));
      setFieldErrors(apiErrorDetails(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) return <LoadingState label={t("loadingCart")} />;
  if (cartError) return <ErrorState message={cartError} />;

  const allItems = cart?.items ?? [];

  if (allItems.length === 0) {
    return <p className={EMPTY_NOTICE}>{t("emptyCart")}</p>;
  }

  const items = allItems.filter((item) => selectedVariantIds.includes(item.variantId));

  if (items.length === 0) {
    return (
      <p className={EMPTY_NOTICE}>
        {t("noSelection")}{" "}
        <Link href="/cart">{t("backToCart")}</Link>.
      </p>
    );
  }

  const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);

  const effectiveSelectedAddressId =
    selectedAddressId ?? (addresses.find((address) => address.isDefault) ?? addresses[0])?.id ?? null;

  return (
    <section
      aria-labelledby="checkout-heading"
      className="mx-auto max-w-[1050px] py-[clamp(1.5rem,4vw,3rem)]"
    >
      <h1
        id="checkout-heading"
        className="mb-5 font-heading text-[clamp(1.75rem,3vw,2.25rem)] text-text"
      >
        {t("title")}
      </h1>

      <div className="grid grid-cols-[1.4fr_1fr] items-start gap-7 max-[700px]:grid-cols-1">
        <form
          className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-[clamp(1.2rem,3vw,1.75rem)] shadow-[0_14px_36px_rgba(43,36,32,0.06)]"
          onSubmit={handleSubmit}
          noValidate
        >
          <p className="text-[0.82rem] font-[650] text-text-secondary">{t("shippingAddress")}</p>

          <AddressBook
            mode="picker"
            addresses={addresses}
            isLoading={isLoadingAddresses}
            error={addressesError}
            onAddressesChange={refetchAddresses}
            selectedAddressId={effectiveSelectedAddressId}
            onSelectAddress={(address) => setSelectedAddressId(address.id)}
          />

          <FieldErrors
            messages={ADDRESS_ERROR_FIELDS.flatMap((field) => fieldErrors[field] ?? [])}
          />

          <label htmlFor="checkout-note" className={CHECKOUT_LABEL}>
            {t("note")}
            <textarea
              id="checkout-note"
              className={`${CHECKOUT_FIELD} min-h-[90px] resize-y`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <FieldErrors messages={fieldErrors.note} />
          </label>

          <label htmlFor="checkout-payment-method" className={CHECKOUT_LABEL}>
            {t("paymentMethod")}
            <select
              id="checkout-payment-method"
              className={`${CHECKOUT_FIELD} min-h-[46px]`}
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value)}
            >
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {t(`paymentMethods.${method}`)}
                </option>
              ))}
            </select>
            <FieldErrors messages={fieldErrors.paymentMethod} />
          </label>

          <button
            type="submit"
            className="btn btn-primary mt-1 min-w-[180px] self-start"
            disabled={isSubmitting}
          >
            {isSubmitting ? t("submitting") : t("submit")}
          </button>

          {submitError && (
            <p role="alert" className="my-[1em] text-[#a92828]">
              {submitError}
            </p>
          )}
        </form>

        <aside
          className="rounded-2xl border border-border bg-surface p-[clamp(1.2rem,3vw,1.75rem)] shadow-[0_14px_36px_rgba(43,36,32,0.06)]"
          aria-label={t("summaryTitle")}
        >
          <h2 className="mb-4 font-heading text-[1.2rem] text-text">{t("summaryTitle")}</h2>
          <ul className="mb-4 flex flex-col gap-[0.65rem]">
            {items.map((item) => (
              <li
                key={item.variantId}
                className="flex items-center justify-between gap-3 border-b border-border pb-[0.65rem] text-[0.85rem] text-text-secondary"
              >
                {item.productImageUrl ? (
                  <ImageWithFallback
                    src={item.productImageUrl}
                    alt={item.productName}
                    className={SUMMARY_ITEM_IMAGE}
                    placeholderClassName={SUMMARY_ITEM_IMAGE_PLACEHOLDER}
                  />
                ) : (
                  <div className={SUMMARY_ITEM_IMAGE_PLACEHOLDER} />
                )}
                <span className="min-w-0 flex-1">
                  {t("summaryItem", {
                    name: item.productName,
                    color: item.color,
                    size: item.size,
                    quantity: item.quantity,
                  })}
                </span>
                <span className="shrink-0 font-semibold text-text">
                  {formatPriceVnd(item.subtotal)}
                </span>
              </li>
            ))}
          </ul>
          <p className="pt-1 text-[1.05rem] text-text-secondary">
            {t("total")} <strong className="text-[1.2rem] text-text">{formatPriceVnd(totalAmount)}</strong>
          </p>
        </aside>
      </div>
    </section>
  );
}
