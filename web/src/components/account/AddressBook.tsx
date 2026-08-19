"use client";

import { useState } from "react";
import { ApiError, createMyAddress, deleteMyAddress, updateMyAddress } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import type { Address } from "@/types/user";

const PHONE_PATTERN = /^(0|\+84)[0-9]{9,10}$/;

// An address row has exactly three looks, and the component decides which one it renders instead
// of letting a parent selector decide: a pickable radio row, the picked one, and the read-only
// card the profile page's "manage" mode shows. Each variant carries its own border colour,
// background and cursor, so no two class strings compete for the same property.
const OPTION_BASE =
  "flex flex-row items-center gap-[0.65rem] rounded-[10px] border px-[0.9rem] py-3 transition-[border-color,box-shadow] duration-[180ms] ease-in-out";
const OPTION_SELECTABLE = "cursor-pointer border-border bg-[#fffdf9] hover:border-accent";
const OPTION_SELECTED =
  "cursor-pointer border-accent bg-white shadow-[0_0_0_3px_rgba(201,123,74,0.13)]";
const OPTION_STATIC = "cursor-default border-border bg-[#fffdf9]";

const EDIT_BTN =
  "shrink-0 cursor-pointer self-center rounded-lg border border-border bg-transparent px-[0.7rem] py-[0.3rem] text-[0.78rem] font-semibold text-text-secondary transition-[border-color,color] duration-[180ms] ease-in-out disabled:cursor-not-allowed disabled:opacity-50";
const EDIT_BTN_NEUTRAL = `${EDIT_BTN} hover:border-accent hover:text-accent-dark`;
const EDIT_BTN_DANGER = `${EDIT_BTN} hover:border-[#c0392b] hover:text-[#c0392b]`;

// AddressBook is mounted both inside the checkout form and inside the profile page, so it styles
// its own labels/fields rather than inheriting them from whichever page hosts it.
const FORM_LABEL = "flex flex-col gap-[0.4rem] text-[0.82rem] font-[650] text-text-secondary";
const FORM_FIELD =
  "input min-h-[46px] rounded-[10px] bg-[#fffdf9] px-[0.85rem] py-[0.72rem] text-[0.92rem] focus:bg-white";
const ADD_FORM =
  "flex flex-col gap-[0.85rem] rounded-[10px] border border-dashed border-border bg-[#fffdf9] p-[0.9rem]";
const OPTION_BODY = "flex min-w-0 flex-1 flex-col gap-[0.2rem]";
const OPTION_NAME = "inline-flex items-center gap-2 text-[0.9rem] font-[650] text-text";
const OPTION_BADGE =
  "rounded-full bg-[rgba(201,123,74,0.13)] px-2 py-[0.1rem] text-[0.7rem] font-[650] text-accent-dark";

interface AddressFormValues {
  receiverName: string;
  receiverPhone: string;
  address: string;
  isDefault: boolean;
}

const BLANK_ADDRESS_FORM: AddressFormValues = {
  receiverName: "",
  receiverPhone: "",
  address: "",
  isDefault: false,
};

interface AddressFormErrors {
  receiverName?: string;
  receiverPhone?: string;
  address?: string;
}

function validateAddressForm(values: AddressFormValues): AddressFormErrors {
  const errors: AddressFormErrors = {};

  if (!values.receiverName.trim()) {
    errors.receiverName = "Tên người nhận không được để trống.";
  }

  if (!values.receiverPhone.trim()) {
    errors.receiverPhone = "Số điện thoại không được để trống.";
  } else if (!PHONE_PATTERN.test(values.receiverPhone.trim())) {
    errors.receiverPhone = "Số điện thoại không hợp lệ.";
  }

  if (!values.address.trim()) {
    errors.address = "Địa chỉ không được để trống.";
  }

  return errors;
}

// Shared field set for the "add new address" and "edit address" forms — same shape
// (receiverName/receiverPhone/address/isDefault), just a different idPrefix so <label htmlFor>
// ids stay unique across multiple forms rendered on the same page.
function AddressFormFields({
  idPrefix,
  values,
  errors,
  onChange,
}: {
  idPrefix: string;
  values: AddressFormValues;
  errors: AddressFormErrors;
  onChange: (values: AddressFormValues) => void;
}) {
  return (
    <>
      <label htmlFor={`${idPrefix}-receiver-name`} className={FORM_LABEL}>
        Tên người nhận
        <input
          id={`${idPrefix}-receiver-name`}
          type="text"
          className={FORM_FIELD}
          value={values.receiverName}
          onChange={(event) => onChange({ ...values, receiverName: event.target.value })}
          autoComplete="name"
        />
        {errors.receiverName && <span className="field-error">{errors.receiverName}</span>}
      </label>

      <label htmlFor={`${idPrefix}-receiver-phone`} className={FORM_LABEL}>
        Số điện thoại
        <input
          id={`${idPrefix}-receiver-phone`}
          type="tel"
          className={FORM_FIELD}
          value={values.receiverPhone}
          onChange={(event) => onChange({ ...values, receiverPhone: event.target.value })}
          autoComplete="tel"
        />
        {errors.receiverPhone && <span className="field-error">{errors.receiverPhone}</span>}
      </label>

      <label htmlFor={`${idPrefix}-line`} className={FORM_LABEL}>
        Địa chỉ giao hàng
        <input
          id={`${idPrefix}-line`}
          type="text"
          className={FORM_FIELD}
          value={values.address}
          onChange={(event) => onChange({ ...values, address: event.target.value })}
          autoComplete="street-address"
        />
        {errors.address && <span className="field-error">{errors.address}</span>}
      </label>

      <label className="flex cursor-pointer flex-row items-center gap-2 text-[0.85rem] font-medium text-text-secondary">
        <input
          type="checkbox"
          className="h-4 w-4 cursor-pointer"
          checked={values.isDefault}
          onChange={(event) => onChange({ ...values, isDefault: event.target.checked })}
        />
        Đặt làm địa chỉ mặc định
      </label>
    </>
  );
}

interface AddressBookProps {
  addresses: Address[];
  isLoading: boolean;
  error: string | null;
  onAddressesChange: () => Promise<void>;
  // "picker": radio selection for checkout (CheckoutPage owns the selected id and submits it).
  // "manage": plain list with edit/delete, no selection (profile's address book).
  mode: "picker" | "manage";
  selectedAddressId?: string | null;
  onSelectAddress?: (address: Address) => void;
}

// Add/edit/delete UI for a user's saved shipping addresses (user-service's /addresses). Shared
// between CheckoutPage (pick one to ship to) and the profile page (manage the whole list) so the
// form fields, validation and save/delete plumbing exist in exactly one place.
export function AddressBook({
  addresses,
  isLoading,
  error,
  onAddressesChange,
  mode,
  selectedAddressId = null,
  onSelectAddress,
}: AddressBookProps) {
  const isPicker = mode === "picker";

  const [isAddingAddress, setIsAddingAddress] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addressForm, setAddressForm] = useState<AddressFormValues>(BLANK_ADDRESS_FORM);
  const [addressFormErrors, setAddressFormErrors] = useState<AddressFormErrors>({});
  const [isSavingAddressForm, setIsSavingAddressForm] = useState(false);
  const [addressFormError, setAddressFormError] = useState<string | null>(null);
  const [deletingAddressId, setDeletingAddressId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function openAddForm() {
    setEditingAddressId(null);
    setIsAddingAddress(true);
    setAddressForm(BLANK_ADDRESS_FORM);
    setAddressFormErrors({});
    setAddressFormError(null);
  }

  function openEditForm(address: Address) {
    setIsAddingAddress(false);
    setEditingAddressId(address.id);
    setAddressForm({
      receiverName: address.receiverName,
      receiverPhone: address.receiverPhone,
      address: address.address,
      isDefault: address.isDefault,
    });
    setAddressFormErrors({});
    setAddressFormError(null);
  }

  function closeAddressForm() {
    setIsAddingAddress(false);
    setEditingAddressId(null);
    setAddressFormErrors({});
    setAddressFormError(null);
  }

  async function handleSaveAddressForm() {
    const errors = validateAddressForm(addressForm);
    setAddressFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const token = getAccessToken();
    if (!token) {
      setAddressFormError("Bạn cần đăng nhập để lưu địa chỉ.");
      return;
    }

    const payload = {
      receiverName: addressForm.receiverName.trim(),
      receiverPhone: addressForm.receiverPhone.trim(),
      address: addressForm.address.trim(),
      isDefault: addressForm.isDefault,
    };

    setIsSavingAddressForm(true);
    setAddressFormError(null);
    try {
      const response = editingAddressId
        ? await updateMyAddress(token, editingAddressId, payload)
        : await createMyAddress(token, payload);
      await onAddressesChange();
      onSelectAddress?.(response.data);
      closeAddressForm();
    } catch (err) {
      setAddressFormError(err instanceof ApiError ? err.message : "Không thể lưu địa chỉ.");
    } finally {
      setIsSavingAddressForm(false);
    }
  }

  async function handleDeleteAddress(address: Address) {
    if (!window.confirm(`Xóa địa chỉ của ${address.receiverName}? Hành động này không thể hoàn tác.`)) {
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setDeleteError("Bạn cần đăng nhập để xóa địa chỉ.");
      return;
    }

    setDeletingAddressId(address.id);
    setDeleteError(null);
    try {
      await deleteMyAddress(token, address.id);
      await onAddressesChange();
      if (editingAddressId === address.id) closeAddressForm();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Không thể xóa địa chỉ.");
    } finally {
      setDeletingAddressId(null);
    }
  }

  if (isLoading) {
    return <p className="text-[0.88rem] text-text-muted">Đang tải địa chỉ...</p>;
  }

  const isAddressFormOpen = isAddingAddress || editingAddressId !== null;
  const showAddForm = isAddingAddress || addresses.length === 0;

  return (
    <div className="flex flex-col gap-[0.6rem]">
      {error && <p className="field-error my-[1em]">{error}</p>}
      {deleteError && (
        <p role="alert" className="my-[1em] text-[#a92828]">
          {deleteError}
        </p>
      )}

      {addresses.length > 0 && (
        <div
          className="flex flex-col gap-[0.6rem]"
          role={isPicker ? "radiogroup" : undefined}
          aria-label={isPicker ? "Chọn địa chỉ giao hàng" : undefined}
        >
          {addresses.map((address) =>
            editingAddressId === address.id ? (
              <div key={address.id} className={ADD_FORM}>
                <AddressFormFields
                  idPrefix={`edit-address-${address.id}`}
                  values={addressForm}
                  errors={addressFormErrors}
                  onChange={setAddressForm}
                />

                {addressFormError && (
                  <p role="alert" className="my-[1em] text-[#a92828]">
                    {addressFormError}
                  </p>
                )}

                <div className="flex gap-[0.6rem]">
                  <button
                    type="button"
                    className="btn btn-primary btn-small"
                    onClick={handleSaveAddressForm}
                    disabled={isSavingAddressForm}
                  >
                    {isSavingAddressForm ? "Đang lưu..." : "Lưu"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-small"
                    onClick={closeAddressForm}
                    disabled={isSavingAddressForm}
                  >
                    Hủy
                  </button>
                </div>
              </div>
            ) : isPicker ? (
              <label
                key={address.id}
                className={cn(
                  OPTION_BASE,
                  !isAddressFormOpen && selectedAddressId === address.id
                    ? OPTION_SELECTED
                    : OPTION_SELECTABLE,
                )}
              >
                <input
                  type="radio"
                  name="shipping-address"
                  className="h-4 w-4 shrink-0 cursor-pointer"
                  checked={!isAddressFormOpen && selectedAddressId === address.id}
                  onChange={() => {
                    onSelectAddress?.(address);
                    closeAddressForm();
                  }}
                />
                <span className={OPTION_BODY}>
                  <span className={OPTION_NAME}>
                    {address.receiverName} · {address.receiverPhone}
                    {address.isDefault && <span className={OPTION_BADGE}>Mặc định</span>}
                  </span>
                  <span className="text-[0.82rem] text-text-muted">{address.address}</span>
                </span>
                <button
                  type="button"
                  className={EDIT_BTN_NEUTRAL}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    openEditForm(address);
                  }}
                >
                  Sửa
                </button>
              </label>
            ) : (
              <div key={address.id} className={cn(OPTION_BASE, OPTION_STATIC)}>
                <span className={OPTION_BODY}>
                  <span className={OPTION_NAME}>
                    {address.receiverName} · {address.receiverPhone}
                    {address.isDefault && <span className={OPTION_BADGE}>Mặc định</span>}
                  </span>
                  <span className="text-[0.82rem] text-text-muted">{address.address}</span>
                </span>
                <div className="flex shrink-0 self-center gap-2">
                  <button type="button" className={EDIT_BTN_NEUTRAL} onClick={() => openEditForm(address)}>
                    Sửa
                  </button>
                  <button
                    type="button"
                    className={EDIT_BTN_DANGER}
                    onClick={() => handleDeleteAddress(address)}
                    disabled={deletingAddressId === address.id}
                  >
                    {deletingAddressId === address.id ? "Đang xóa..." : "Xóa"}
                  </button>
                </div>
              </div>
            ),
          )}

          {isPicker && (
            <label className={cn(OPTION_BASE, isAddingAddress ? OPTION_SELECTED : OPTION_SELECTABLE)}>
              <input
                type="radio"
                name="shipping-address"
                className="h-4 w-4 shrink-0 cursor-pointer"
                checked={isAddingAddress}
                onChange={openAddForm}
              />
              <span className={OPTION_BODY}>
                <span className={OPTION_NAME}>Thêm địa chỉ mới</span>
              </span>
            </label>
          )}
        </div>
      )}

      {!isPicker && !showAddForm && (
        <button
          type="button"
          className="btn btn-outline btn-small self-start"
          onClick={openAddForm}
        >
          Thêm địa chỉ mới
        </button>
      )}

      {showAddForm && (
        <div className={ADD_FORM}>
          <AddressFormFields
            idPrefix="new-address"
            values={addressForm}
            errors={addressFormErrors}
            onChange={setAddressForm}
          />

          {addressFormError && (
            <p role="alert" className="my-[1em] text-[#a92828]">
              {addressFormError}
            </p>
          )}

          <div className="flex gap-[0.6rem]">
            <button
              type="button"
              className="btn btn-primary btn-small"
              onClick={handleSaveAddressForm}
              disabled={isSavingAddressForm}
            >
              {isSavingAddressForm ? "Đang lưu..." : "Lưu địa chỉ"}
            </button>
            {addresses.length > 0 && (
              <button
                type="button"
                className="btn btn-outline btn-small"
                onClick={closeAddressForm}
                disabled={isSavingAddressForm}
              >
                Hủy
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
