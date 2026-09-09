import { useEffect, useMemo, useState } from "react";
import { ordersApi } from "../../services/resources";
import { Badge, EmptyState } from "../ui";
import { List, Receipt } from "lucide-react";

const STATUS_TONES = {
  sent: "success",
  failed: "danger",
  not_configured: "default",
};
const STATUS_LABELS = {
  sent: "Sent to Telegram",
  failed: "Telegram failed",
  not_configured: "No Telegram set up",
};

export default function OrdersTab({ brandId }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("table"); // 'table' (grouped, for billing) | 'all' (flat, chronological)

  useEffect(() => {
    ordersApi.list(brandId).then((data) => {
      setOrders(data);
      setLoading(false);
    });
  }, [brandId]);

  // Groups orders by table_label so a table's running total (across however
  // many separate orders they've placed) is visible at a glance — each
  // order itself stays independent, this is purely a billing-time view.
  const tableGroups = useMemo(() => {
    const groups = {};
    for (const o of orders) {
      const key = o.table_label || "__no_table__";
      if (!groups[key]) {
        groups[key] = {
          label: o.table_label || "No table label",
          orders: [],
          total: 0,
        };
      }
      groups[key].orders.push(o);
      groups[key].total += Number(o.total_amount);
    }
    return Object.values(groups).sort((a, b) => {
      const aLatest = Math.max(
        ...a.orders.map((o) => new Date(o.created_at).getTime()),
      );
      const bLatest = Math.max(
        ...b.orders.map((o) => new Date(o.created_at).getTime()),
      );
      return bLatest - aLatest;
    });
  }, [orders]);

  if (loading) return <p className="text-sm text-slate">Loading…</p>;

  if (orders.length === 0) {
    return (
      <EmptyState
        title="No orders yet"
        description="Orders placed by staff from the menu display will show up here."
      />
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate">The most recent 100 orders.</p>
        <div className="flex gap-1 rounded-md border border-sand bg-white p-1">
          <button
            onClick={() => setView("table")}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm ${view === "table" ? "bg-ink text-white" : "text-slate hover:text-ink"}`}
          >
            <Receipt size={14} /> By table
          </button>
          <button
            onClick={() => setView("all")}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm ${view === "all" ? "bg-ink text-white" : "text-slate hover:text-ink"}`}
          >
            <List size={14} /> All orders
          </button>
        </div>
      </div>

      {view === "table" ? (
        <ByTableView groups={tableGroups} />
      ) : (
        <FlatView orders={orders} />
      )}
    </div>
  );
}

function ByTableView({ groups }) {
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div
          key={group.label}
          className="overflow-hidden rounded-lg border border-sand bg-white"
        >
          <div className="flex items-center justify-between bg-paper px-5 py-3">
            <div>
              <p className="font-medium text-ink">{group.label}</p>
              <p className="text-xs text-slate">
                {group.orders.length} order
                {group.orders.length === 1 ? "" : "s"}
              </p>
            </div>
            <span className="font-display text-2xl text-marigold-dark">
              ${group.total.toFixed(2)}
            </span>
          </div>
          <div className="divide-y divide-sand">
            {group.orders
              .slice()
              .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
              .map((o) => (
                <div key={o.id} className="px-5 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate">
                      {new Date(o.created_at).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {o.placed_by_name && ` · ${o.placed_by_name}`}
                    </p>
                    <span className="text-sm font-medium text-ink">
                      ${Number(o.total_amount).toFixed(2)}
                    </span>
                  </div>
                  <ul className="mt-1 space-y-0.5 text-sm text-slate">
                    {o.items.map((item, i) => (
                      <li key={i}>
                        {item.quantity}x {item.food_name_en}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FlatView({ orders }) {
  return (
    <div className="divide-y divide-sand rounded-lg border border-sand bg-white">
      {orders.map((o) => (
        <div key={o.id} className="px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="font-medium text-ink">
                {o.table_label || "No table label"}
              </p>
              {o.zone_name_en && <Badge>{o.zone_name_en}</Badge>}
              <Badge tone={STATUS_TONES[o.telegram_notified]}>
                {STATUS_LABELS[o.telegram_notified]}
              </Badge>
            </div>
            <span className="font-display text-lg text-marigold-dark">
              ${Number(o.total_amount).toFixed(2)}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate">
            {o.placed_by_name && `${o.placed_by_name} · `}
            {new Date(o.created_at).toLocaleString()}
          </p>
          <ul className="mt-2 space-y-0.5 text-sm text-slate">
            {o.items.map((item, i) => (
              <li key={i}>
                {item.quantity}x {item.food_name_en} — $
                {Number(item.line_total).toFixed(2)}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
