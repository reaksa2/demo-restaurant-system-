import { useState } from "react";
import { brandsApi, imagesApi } from "../../services/resources";
import { resolveMediaUrl } from "../../services/api";
import { useAuth } from "../../stores/authStore";
import { Button, Input, Textarea, Checkbox } from "../ui";
import {
  Upload,
  Send,
  ClipboardList,
  Receipt,
  Image as ImageIcon,
  X,
} from "lucide-react";

export default function BrandInfoTab({ brand, onUpdated }) {
  const { user } = useAuth();
  const isLevel1 = user.role === "level1";

  const [form, setForm] = useState({
    name_en: brand.name_en,
    name_kh: brand.name_kh,
    description_en: brand.description_en || "",
    description_kh: brand.description_kh || "",
    logo_url: brand.logo_url || "",
    background_image_url: brand.background_image_url || "",
    background_opacity: brand.background_opacity ?? 15,
    telegram_bot_token: brand.telegram_bot_token || "",
    telegram_chat_id: brand.telegram_chat_id || "",
    ordering_enabled: brand.ordering_enabled,
    billing_enabled: brand.billing_enabled,
  });
  const [uploading, setUploading] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await imagesApi.upload(file);
      setForm((f) => ({ ...f, logo_url: url }));
    } finally {
      setUploading(false);
    }
  };

  const handleBackgroundUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingBg(true);
    try {
      const { url } = await imagesApi.upload(file);
      setForm((f) => ({ ...f, background_image_url: url }));
    } finally {
      setUploadingBg(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      // Only Level1 can change ordering_enabled, so only Level1 needs the
      // admin endpoint — Level2/3 keep using the regular one, which quietly
      // ignores that field even if present.
      const updated = isLevel1
        ? await brandsApi.adminUpdate(brand.id, form)
        : await brandsApi.update(brand.id, form);
      onUpdated(updated);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="max-w-lg space-y-4">
      <div>
        <span className="mb-1.5 block text-sm font-medium text-ink">Logo</span>
        <div className="flex items-center gap-3">
          {form.logo_url && (
            <img
              src={resolveMediaUrl(form.logo_url)}
              alt=""
              className="h-14 w-14 rounded-md object-cover"
            />
          )}
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-sand px-3 py-2 text-sm text-slate hover:bg-paper">
            <Upload size={14} />
            {uploading ? "Uploading…" : "Upload logo"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleLogoUpload}
              disabled={uploading}
            />
          </label>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Name (English)"
          required
          value={form.name_en}
          onChange={(e) => setForm({ ...form, name_en: e.target.value })}
        />
        <Input
          label="Name (Khmer)"
          required
          value={form.name_kh}
          onChange={(e) => setForm({ ...form, name_kh: e.target.value })}
          className="font-khmer"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Textarea
          label="Description (English)"
          rows={3}
          value={form.description_en}
          onChange={(e) => setForm({ ...form, description_en: e.target.value })}
        />
        <Textarea
          label="Description (Khmer)"
          rows={3}
          value={form.description_kh}
          onChange={(e) => setForm({ ...form, description_kh: e.target.value })}
          className="font-khmer"
        />
      </div>

      <div className="rounded-md border border-sand p-4">
        <div className="mb-3 flex items-center gap-2">
          <ImageIcon size={15} className="text-marigold-dark" />
          <span className="text-sm font-medium text-ink">
            Menu display background
          </span>
        </div>
        <p className="mb-3 text-xs text-slate">
          Optional. Adds a custom background image (like a branded design)
          behind the staff/customer menu screen. Leave empty to keep the plain
          default background. Opacity controls how strong the image shows
          through — keep it low so food names and prices stay easy to read.
        </p>

        {form.background_image_url ? (
          <div className="relative mb-3 flex h-28 items-center justify-center overflow-hidden rounded-md border border-sand bg-paper">
            <img
              src={resolveMediaUrl(form.background_image_url)}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              style={{ opacity: form.background_opacity / 100 }}
            />
            <span className="relative font-khmer-display text-lg text-ink">
              មាន់បំពង
            </span>
            <button
              type="button"
              onClick={() =>
                setForm((f) => ({ ...f, background_image_url: "" }))
              }
              className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-ink shadow-sm hover:bg-white"
              title="Remove background image"
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <label className="mb-3 flex h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-sand text-slate hover:bg-paper">
            <Upload size={16} />
            <span className="text-xs">
              {uploadingBg ? "Uploading…" : "Upload a background image"}
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleBackgroundUpload}
              disabled={uploadingBg}
            />
          </label>
        )}

        {form.background_image_url && (
          <div>
            <label className="mb-1.5 flex items-center justify-between text-sm font-medium text-ink">
              <span>Opacity</span>
              <span className="text-slate">{form.background_opacity}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="60"
              value={form.background_opacity}
              onChange={(e) =>
                setForm({ ...form, background_opacity: Number(e.target.value) })
              }
              className="w-full accent-marigold"
            />
          </div>
        )}
      </div>

      <div className="rounded-md border border-sand p-4">
        <div className="mb-3 flex items-center gap-2">
          <Send size={15} className="text-marigold-dark" />
          <span className="text-sm font-medium text-ink">
            Telegram order notifications
          </span>
        </div>
        <p className="mb-3 text-xs text-slate">
          Optional. When both fields are set, confirmed orders from this brand
          are sent to your Telegram group automatically. Create a bot via{" "}
          <span className="font-medium">@BotFather</span> on Telegram to get a
          token, add the bot to your group, then send any message in the group
          and check{" "}
          <code className="rounded bg-paper px-1">
            https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates
          </code>{" "}
          to find the chat ID (it's usually a negative number for groups).
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Bot token"
            type="password"
            placeholder="123456:ABC-DEF..."
            value={form.telegram_bot_token}
            onChange={(e) =>
              setForm({ ...form, telegram_bot_token: e.target.value })
            }
          />
          <Input
            label="Chat ID"
            placeholder="-1001234567890"
            value={form.telegram_chat_id}
            onChange={(e) =>
              setForm({ ...form, telegram_chat_id: e.target.value })
            }
          />
        </div>
      </div>

      {isLevel1 && (
        <div className="rounded-md border border-sand p-4">
          <div className="mb-3 flex items-center gap-2">
            <ClipboardList size={15} className="text-marigold-dark" />
            <span className="text-sm font-medium text-ink">Ordering</span>
          </div>
          <Checkbox
            label="Allow staff to take orders through the app"
            checked={form.ordering_enabled}
            onChange={(e) =>
              setForm({ ...form, ordering_enabled: e.target.checked })
            }
          />
          <p className="mt-2 text-xs text-slate">
            Turn this off for a brand that only wants the digital menu display —
            staff will still see prices and photos, but the cart and "Confirm
            order" button disappear, and orders will be taken down manually on
            paper instead.
          </p>
        </div>
      )}

      {isLevel1 && (
        <div className="rounded-md border border-sand p-4">
          <div className="mb-3 flex items-center gap-2">
            <Receipt size={15} className="text-marigold-dark" />
            <span className="text-sm font-medium text-ink">Billing & invoices</span>
          </div>
          <Checkbox
            label="Allow staff to generate bills and invoices"
            checked={form.billing_enabled}
            onChange={(e) =>
              setForm({ ...form, billing_enabled: e.target.checked })
            }
          />
          <p className="mt-2 text-xs text-slate">
            Turn this on for a full-service restaurant: staff can fold a
            table's completed orders into a bill, apply a discount or tax,
            print an invoice, and mark it paid. Leave off for a brand that
            only needs the digital menu (with or without ordering).
          </p>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
        {saved && <span className="text-sm text-moss">Saved.</span>}
      </div>
    </form>
  );
}
