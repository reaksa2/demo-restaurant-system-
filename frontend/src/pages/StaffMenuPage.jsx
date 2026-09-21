import { useEffect, useState, useMemo, useRef } from "react";
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
  MapPin,
} from "lucide-react";

export default function StaffMenuPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(null);
  const [activeZoneId, setActiveZoneId] = useState(null);
  const [zoneSwitching, setZoneSwitching] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");
  const [error, setError] = useState("");
  const [cart, setCart] = useState({}); // food_id -> quantity
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    menuApi
      .get()
      .then((m) => {
        setMenu(m);
        setActiveZoneId(m.active_zone_id);
      })
      .catch(() =>
        setError(
          "Could not load the menu. Ask a manager to check your zone assignment.",
        ),
      );
  }, []);

  // Keeps the tablet in sync with admin changes (price edits, new/removed
  // items, availability toggles) without staff ever needing to reload the
  // page. Two triggers: a quiet poll every 20s, and an immediate refetch the
  // moment the tablet's screen/app comes back to the foreground (covers a
  // tablet that was asleep or backgrounded through a change). It's a silent
  // background refresh — no loading spinner, no error banner if one poll
  // fails, since a temporary blip shouldn't interrupt staff mid-service.
  //
  // On a slow or flaky connection this needs three guards, or it makes
  // things worse instead of better:
  //   1. A hung request must not block forever — a per-request timeout
  //      (via AbortController) lets a slow poll fail fast instead of
  //      sitting open indefinitely.
  //   2. A new poll must not fire while the previous one is still in
  //      flight — otherwise a slow connection stacks up multiple pending
  //      requests every 20s, competing for bandwidth with the order the
  //      staff is actually trying to submit.
  //   3. Responses can arrive out of order (a fast reply to a later poll
  //      landing before a slow reply to an earlier one) — a request id
  //      guard makes sure a late, stale response can never overwrite
  //      fresher data that already rendered.
  const cartOpenRef = useRef(cartOpen);
  useEffect(() => {
    cartOpenRef.current = cartOpen;
  }, [cartOpen]);

  const hasMenu = menu !== null;
  useEffect(() => {
    if (!hasMenu) return;

    let inFlight = false;
    let latestRequestId = 0;
    const POLL_TIMEOUT_MS = 10000;

    const refreshMenu = () => {
      // Don't swap the food data out from under someone mid-checkout, and
      // don't pile a new request on top of one that hasn't come back yet.
      if (cartOpenRef.current || inFlight) return;

      const requestId = ++latestRequestId;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), POLL_TIMEOUT_MS);
      inFlight = true;

      menuApi
        .get(activeZoneId || undefined, { signal: controller.signal })
        .then((m) => {
          // A slower, older request that finally resolved after a newer
          // one already landed — discard it rather than roll the UI back.
          if (requestId !== latestRequestId) return;
          setMenu(m);
          // If admin deleted an item that's sitting in someone's cart,
          // drop it rather than let a stale line item reach checkout.
          setCart((prev) => {
            const validIds = new Set(m.foods.map((f) => f.id));
            let changed = false;
            const next = {};
            for (const [id, qty] of Object.entries(prev)) {
              if (validIds.has(id)) next[id] = qty;
              else changed = true;
            }
            return changed ? next : prev;
          });
        })
        .catch(() => {
          // Silent — this is a background refresh, not a user-initiated
          // load. A timeout or dropped connection just means we try again
          // on the next tick with whatever data is already on screen.
        })
        .finally(() => {
          clearTimeout(timeoutId);
          inFlight = false;
        });
    };

    const interval = setInterval(refreshMenu, 20000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshMenu();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", refreshMenu);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", refreshMenu);
    };
  }, [hasMenu, activeZoneId]);

  // Zones this staff account can browse via tabs. Empty for a staff account
  // locked to a single zone — that account never sees a zone-tab bar at all.
  const zoneTabs = menu?.zones || [];

  const switchZone = (zoneId) => {
    if (zoneId === activeZoneId || zoneSwitching) return;
    setZoneSwitching(true);
    // Each zone tab is its own fetch, resolved to exactly that one zone's
    // prices server-side — the app never holds more than one zone's prices
    // in memory at a time. Cart is cleared on switch since it was priced
    // against the zone being left.
    menuApi
      .get(zoneId)
      .then((m) => {
        setMenu(m);
        setActiveZoneId(m.active_zone_id);
        setCart({});
        setError("");
      })
      .catch(() => setError("Could not load that zone's menu. Please try again."))
      .finally(() => setZoneSwitching(false));
  };

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

  const hasBackground = Boolean(menu.brand.background_image_url);

  return (
    <div className="relative min-h-screen bg-paper pb-24">
      {hasBackground && (
        <div
          className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `url(${resolveMediaUrl(menu.brand.background_image_url)})`,
            opacity: menu.brand.background_opacity / 100,
          }}
        />
      )}
      <header className="sticky top-0 z-10 border-b border-sand/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {menu.brand.logo_url ? (
              <img
                src={resolveMediaUrl(menu.brand.logo_url)}
                alt=""
                className="h-11 w-11 flex-shrink-0 rounded-full object-cover ring-1 ring-sand"
              />
            ) : (
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-marigold-light text-sm font-semibold text-marigold-dark">
                {menu.brand.name_en?.[0]?.toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="truncate font-khmer-display text-xl leading-tight text-ink">
                {menu.brand.name_kh}
              </h1>
              <p className="truncate text-xs text-slate">{menu.brand.name_en}</p>
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            {orderingEnabled && (
              <button
                onClick={() => navigate("/staff/orders")}
                className="flex items-center gap-1.5 rounded-full border border-sand px-3.5 py-2 text-sm font-medium text-slate transition-colors hover:border-ink/20 hover:bg-paper hover:text-ink"
              >
                <ClipboardList size={15} /> Orders
              </button>
            )}
            <ProfileMenu dropDirection="down" />
          </div>
        </div>

        {zoneTabs.length > 0 && (
          <div className="mx-auto max-w-5xl overflow-x-auto px-6 pb-3">
            <div className="inline-flex gap-1 rounded-full bg-sand/50 p-1">
              {zoneTabs.map((z) => (
                <button
                  key={z.id}
                  onClick={() => switchZone(z.id)}
                  disabled={zoneSwitching}
                  className={`flex flex-shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all disabled:opacity-60 ${
                    activeZoneId === z.id
                      ? "bg-ink text-white shadow-sm"
                      : "text-slate hover:text-ink"
                  }`}
                >
                  <MapPin size={13} className={activeZoneId === z.id ? "opacity-80" : "opacity-50"} />
                  <span className="font-khmer">{z.name_kh}</span>
                  <span className="opacity-70">{z.name_en}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {topCategories.length > 0 && (
          <div className="mx-auto flex max-w-5xl gap-1.5 overflow-x-auto px-6 pb-4">
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

      <main className="relative z-[1] mx-auto max-w-5xl px-6 py-8">
        {sections.every((s) => s.foods.length === 0) ? (
          <p className="py-16 text-center text-slate">
            No foods in this category yet.
          </p>
        ) : (
          <div className="space-y-10">
            {sections.map((section, i) => (
              <div key={section.heading?.id || `direct-${i}`}>
                {section.heading && (
                  // A subcategory ("Soup", "Steamed", etc.) gets its own
                  // colored tag + a rule spanning the rest of the row, so
                  // scrolling from one subgroup into the next reads as a
                  // clear break between kinds, not just a smaller heading.
                  <div className="mb-5 flex items-center gap-3">
                    <span className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full bg-moss px-3.5 py-1.5 shadow-sm">
                      <span className="font-khmer-display text-sm leading-none text-white">
                        {section.heading.name_kh}
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-white/80">
                        {section.heading.name_en}
                      </span>
                    </span>
                    <span className="h-px flex-1 bg-sand" />
                  </div>
                )}
                <div className="grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 xl:grid-cols-3">
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
        <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4">
          <button
            onClick={() => setCartOpen(true)}
            className="mx-auto flex w-full max-w-md items-center justify-between gap-3 rounded-full bg-ink px-5 py-3.5 text-white shadow-xl transition-transform active:scale-[0.98]"
          >
            <span className="flex items-center gap-2">
              <ShoppingCart size={18} />
              <span className="font-medium">
                {cartCount} item{cartCount === 1 ? "" : "s"}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <span className="font-display text-lg">${cartTotal.toFixed(2)}</span>
              <span className="rounded-full bg-marigold px-3 py-1.5 text-sm font-medium">
                Review
              </span>
            </span>
          </button>
        </div>
      )}

      {orderingEnabled && (
        <CartModal
          open={cartOpen}
          onClose={() => setCartOpen(false)}
          cartEntries={cartEntries}
          foodsById={foodsById}
          cartTotal={cartTotal}
          onAdjust={adjustCart}
          zoneId={activeZoneId}
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
      className={`flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
        active
          ? "bg-marigold-dark text-white"
          : "bg-white text-slate ring-1 ring-inset ring-sand hover:text-ink"
      }`}
    >
      <span>
        <span className="font-khmer">{labelKh}</span>{" "}
        <span className="opacity-70">{labelEn}</span>
      </span>
    </button>
  );
}

function FoodCard({ food, quantity, onAdjust, orderingEnabled }) {
  const orderable = orderingEnabled && food.is_available && food.price;

  return (
    <div
      className={`group overflow-hidden rounded-2xl border bg-white transition-shadow ${
        quantity > 0 ? "border-marigold shadow-sm" : "border-sand/80 hover:shadow-md"
      } ${!food.is_available ? "opacity-60" : ""}`}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-sand">
        {food.image_url ? (
          <img
            src={resolveMediaUrl(food.image_url)}
            alt={food.name_en}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-slate/60">
            No photo
          </div>
        )}
        {!food.is_available && (
          <div className="absolute inset-0 flex items-center justify-center bg-ink/40">
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-clay">
              Unavailable
            </span>
          </div>
        )}
      </div>
      <div className="p-4">
        <p className="font-khmer-display text-lg leading-tight text-ink">
          {food.name_kh}
        </p>
        <p className="font-display text-sm text-slate">{food.name_en}</p>

        {(food.description_kh || food.description_en) && (
          <div className="mt-1.5 space-y-0.5">
            {food.description_kh && (
              <p className="font-khmer text-xs text-slate/90">
                {food.description_kh}
              </p>
            )}
            {food.description_en && (
              <p className="text-xs text-slate/90">{food.description_en}</p>
            )}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          {food.is_available && food.price ? (
            <span className="flex items-center gap-1.5">
              <span className="font-display text-xl text-marigold-dark">
                ${Number(food.price.price).toFixed(2)}
              </span>
              {food.price.is_discounted && (
                <span className="rounded-full bg-moss-light px-2 py-0.5 text-[11px] font-medium text-moss">
                  Discount
                </span>
              )}
            </span>
          ) : food.is_available ? (
            <span className="text-sm text-slate">Price not set</span>
          ) : (
            <span />
          )}

          {orderable &&
            (quantity > 0 ? (
              <div className="flex items-center gap-2 rounded-full bg-paper px-1 py-1">
                <button
                  onClick={() => onAdjust(-1)}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-ink shadow-sm transition-transform active:scale-95"
                >
                  <Minus size={14} />
                </button>
                <span className="w-4 text-center text-sm font-medium text-ink">
                  {quantity}
                </span>
                <button
                  onClick={() => onAdjust(1)}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-marigold text-white transition-transform active:scale-95"
                >
                  <Plus size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => onAdjust(1)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-marigold text-white transition-colors hover:bg-marigold-dark active:scale-95"
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
  zoneId,
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
        zone_id: zoneId || null,
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
