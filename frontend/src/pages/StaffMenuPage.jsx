import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { menuApi, ordersApi } from "../services/resources";
import { resolveMediaUrl } from "../services/api";
import { useAuth } from "../stores/authStore";
import { ProfileMenu } from "../components/ProfileMenu";
import { Modal } from "../components/Modal";
import { Button, Input } from "../components/ui";
import {
  Plus,
  Minus,
  ShoppingCart,
  CheckCircle2,
  ClipboardList,
} from "lucide-react";

export default function StaffMenuPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(null);
  const [activeCategory, setActiveCategory] = useState("all");
  const [error, setError] = useState("");
  const [cart, setCart] = useState({}); // food_id -> quantity
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    menuApi
      .get()
      .then(setMenu)
      .catch(() =>
        setError(
          "Could not load the menu. Ask a manager to check your zone assignment.",
        ),
      );
  }, []);

  const topCategories = useMemo(
    () => (menu ? menu.categories.filter((c) => !c.parent_id) : []),
    [menu],
  );
  const subcategoriesOf = (parentId) =>
    menu.categories.filter((c) => c.parent_id === parentId);
  const orderingEnabled = menu?.brand?.ordering_enabled ?? true;

  const sections = useMemo(() => {
    if (!menu) return [];
    if (activeCategory === "all") {
      return [{ heading: null, foods: menu.foods }];
    }
    const direct = menu.foods.filter((f) => f.category_id === activeCategory);
    const subSections = subcategoriesOf(activeCategory)
      .map((sub) => ({
        heading: sub,
        foods: menu.foods.filter((f) => f.category_id === sub.id),
      }))
      .filter((s) => s.foods.length > 0);
    const directSection =
      direct.length > 0 ? [{ heading: null, foods: direct }] : [];
    return [...directSection, ...subSections];
  }, [menu, activeCategory]);

  const foodsById = useMemo(() => {
    const map = {};
    if (menu) for (const f of menu.foods) map[f.id] = f;
    return map;
  }, [menu]);

  const cartEntries = Object.entries(cart).filter(([, qty]) => qty > 0);
  const cartCount = cartEntries.reduce((sum, [, qty]) => sum + qty, 0);
  const cartTotal = cartEntries.reduce((sum, [foodId, qty]) => {
    const food = foodsById[foodId];
    return sum + (food?.price ? Number(food.price.price) * qty : 0);
  }, 0);

  const adjustCart = (foodId, delta) => {
    setCart((prev) => ({
      ...prev,
      [foodId]: Math.max(0, (prev[foodId] || 0) + delta),
    }));
  };

  const clearCart = () => setCart({});

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-6 text-center">
        <div>
          <p className="text-clay">{error}</p>
          <button
            onClick={logout}
            className="mt-3 text-sm text-slate underline"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (!menu) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper text-slate">
        Loading menu…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper pb-20">
      <header className="border-b border-sand bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            {menu.brand.logo_url && (
              <img
                src={resolveMediaUrl(menu.brand.logo_url)}
                alt=""
                className="h-11 w-11 rounded-md object-cover"
              />
            )}
            <div>
              <h1 className="font-khmer-display text-2xl text-ink">
                {menu.brand.name_kh}
              </h1>
              <p className="text-sm text-slate">{menu.brand.name_en}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {orderingEnabled && (
              <button
                onClick={() => navigate("/staff/orders")}
                className="flex items-center gap-1.5 rounded-md border border-sand px-3 py-2 text-sm text-slate hover:bg-paper hover:text-ink"
              >
                <ClipboardList size={16} /> Orders
              </button>
            )}
            <ProfileMenu dropDirection="down" />
          </div>
        </div>

        {topCategories.length > 0 && (
          <div className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-6 pb-3">
            <CategoryTab
              active={activeCategory === "all"}
              onClick={() => setActiveCategory("all")}
              labelEn="All"
              labelKh="ទាំងអស់"
            />
            {topCategories.map((c) => (
              <CategoryTab
                key={c.id}
                active={activeCategory === c.id}
                onClick={() => setActiveCategory(c.id)}
                labelEn={c.name_en}
                labelKh={c.name_kh}
              />
            ))}
          </div>
        )}
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {sections.every((s) => s.foods.length === 0) ? (
          <p className="py-16 text-center text-slate">
            No foods in this category yet.
          </p>
        ) : (
          <div className="space-y-8">
            {sections.map((section, i) => (
              <div key={section.heading?.id || `direct-${i}`}>
                {section.heading && (
                  <div className="mb-5 flex items-center gap-3 border-b border-sand pb-3">
                    <span className="h-7 w-1 flex-shrink-0 rounded-full bg-marigold" />
                    <div>
                      <h2 className="font-khmer-display text-3xl leading-tight text-ink">
                        {section.heading.name_kh}
                      </h2>
                      <p className="text-xs font-medium uppercase tracking-wider text-slate">
                        {section.heading.name_en}
                      </p>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {section.foods.map((food) => (
                    <FoodCard
                      key={food.id}
                      food={food}
                      quantity={cart[food.id] || 0}
                      onAdjust={(delta) => adjustCart(food.id, delta)}
                      orderingEnabled={orderingEnabled}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {orderingEnabled && cartCount > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-center gap-3 bg-ink py-4 text-white shadow-lg"
        >
          <ShoppingCart size={18} />
          <span className="font-medium">
            {cartCount} item{cartCount === 1 ? "" : "s"}
          </span>
          <span className="opacity-60">·</span>
          <span className="font-display text-lg">${cartTotal.toFixed(2)}</span>
          <span className="ml-1 rounded-full bg-marigold px-3 py-1 text-sm font-medium">
            Review order
          </span>
        </button>
      )}

      {orderingEnabled && (
        <CartModal
          open={cartOpen}
          onClose={() => setCartOpen(false)}
          cartEntries={cartEntries}
          foodsById={foodsById}
          cartTotal={cartTotal}
          onAdjust={adjustCart}
          onCleared={() => {
            clearCart();
            setCartOpen(false);
          }}
        />
      )}
    </div>
  );
}

function CategoryTab({ active, onClick, labelEn, labelKh }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm transition-colors ${
        active ? "bg-ink text-white" : "bg-sand/60 text-slate hover:bg-sand"
      }`}
    >
      <span className="font-khmer">{labelKh}</span>{" "}
      <span className="opacity-70">{labelEn}</span>
    </button>
  );
}

function FoodCard({ food, quantity, onAdjust, orderingEnabled }) {
  const orderable = orderingEnabled && food.is_available && food.price;

  return (
    <div
      className={`overflow-hidden rounded-lg border bg-white ${quantity > 0 ? "border-marigold" : "border-sand"} ${!food.is_available ? "opacity-60" : ""}`}
    >
      <div className="aspect-[4/3] bg-sand">
        {food.image_url && (
          <img
            src={resolveMediaUrl(food.image_url)}
            alt={food.name_en}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="p-4">
        <p className="font-khmer-display text-lg leading-tight text-ink">
          {food.name_kh}
        </p>
        <p className="font-display text-sm text-slate">{food.name_en}</p>

        {(food.description_kh || food.description_en) && (
          <div className="mt-2 space-y-0.5">
            {food.description_kh && (
              <p className="font-khmer text-xs text-slate">
                {food.description_kh}
              </p>
            )}
            {food.description_en && (
              <p className="text-xs text-slate">{food.description_en}</p>
            )}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          {!food.is_available ? (
            <span className="text-sm font-medium text-clay">Unavailable</span>
          ) : food.price ? (
            <span className="font-display text-xl text-marigold-dark">
              ${Number(food.price.price).toFixed(2)}
              {food.price.is_discounted && (
                <span className="ml-1.5 text-xs font-sans text-moss">
                  Discount
                </span>
              )}
            </span>
          ) : (
            <span className="text-sm text-slate">Price not set</span>
          )}

          {orderable &&
            (quantity > 0 ? (
              <div className="flex items-center gap-2 rounded-full bg-paper px-1 py-1">
                <button
                  onClick={() => onAdjust(-1)}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-ink shadow-sm"
                >
                  <Minus size={14} />
                </button>
                <span className="w-4 text-center text-sm font-medium text-ink">
                  {quantity}
                </span>
                <button
                  onClick={() => onAdjust(1)}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-marigold text-white"
                >
                  <Plus size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => onAdjust(1)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-marigold text-white hover:bg-marigold-dark"
              >
                <Plus size={16} />
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}

function CartModal({
  open,
  onClose,
  cartEntries,
  foodsById,
  cartTotal,
  onAdjust,
  onCleared,
}) {
  const [tableLabel, setTableLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  const confirmOrder = async () => {
    setSubmitting(true);
    setError("");
    try {
      const items = cartEntries.map(([foodId, quantity]) => ({
        food_id: foodId,
        quantity,
      }));
      const order = await ordersApi.create({
        table_label: tableLabel || null,
        items,
      });
      setSuccess(order);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "Could not place the order. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setSuccess(null);
    setTableLabel("");
    setError("");
    onClose();
  };

  const handleDone = () => {
    setSuccess(null);
    setTableLabel("");
    onCleared();
  };

  if (success) {
    return (
      <Modal open={open} onClose={handleDone} title="Order sent">
        <div className="py-4 text-center">
          <CheckCircle2 size={40} className="mx-auto text-moss" />
          <p className="mt-3 text-lg font-medium text-ink">Order confirmed</p>
          <p className="mt-1 text-sm text-slate">
            {success.table_label ? `${success.table_label} · ` : ""}$
            {Number(success.total_amount).toFixed(2)}
          </p>
          {success.telegram_notified === "failed" && (
            <p className="mt-2 text-xs text-clay">
              Note: the kitchen Telegram notification failed to send. Let a
              manager know.
            </p>
          )}
          {success.telegram_notified === "not_configured" && (
            <p className="mt-2 text-xs text-slate">
              Telegram notifications aren't set up for this brand yet.
            </p>
          )}
          <Button className="mt-5 w-full" onClick={handleDone}>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={handleClose} title="Review order">
      <div className="space-y-4">
        {cartEntries.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate">Cart is empty.</p>
        ) : (
          <div className="divide-y divide-sand">
            {cartEntries.map(([foodId, qty]) => {
              const food = foodsById[foodId];
              if (!food) return null;
              const lineTotal =
                (food.price ? Number(food.price.price) : 0) * qty;
              return (
                <div
                  key={foodId}
                  className="flex items-center justify-between py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {food.name_en}
                    </p>
                    <p className="text-xs text-slate">
                      ${Number(food.price?.price ?? 0).toFixed(2)} each
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onAdjust(foodId, -1)}
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-paper text-ink"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="w-4 text-center text-sm">{qty}</span>
                    <button
                      onClick={() => onAdjust(foodId, 1)}
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-paper text-ink"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  <span className="ml-4 w-14 text-right text-sm font-medium text-ink">
                    ${lineTotal.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-sand pt-3">
          <span className="text-sm font-medium text-ink">Total</span>
          <span className="font-display text-xl text-marigold-dark">
            ${cartTotal.toFixed(2)}
          </span>
        </div>

        <Input
          label="Table / room (optional)"
          placeholder="e.g. Table 5"
          value={tableLabel}
          onChange={(e) => setTableLabel(e.target.value)}
        />

        {error && <p className="text-sm text-clay">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={confirmOrder}
            disabled={submitting || cartEntries.length === 0}
          >
            {submitting ? "Sending…" : "Confirm order"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
