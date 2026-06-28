import React, { useEffect, useMemo, useState } from "react";
import {
  Cookie,
  LogOut,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  CalendarDays,
  Banknote,
  ClipboardList,
  PackageCheck,
  Download,
  Settings,
  Save,
  X,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import { peso, localDateString } from "./utils/currency";
import CostingTab from "./components/CostingTab";

const starterFlavors = [
  {
    name: "Classic Chocolate Chip",
    prices: { 60: 0, 100: 100 },
  },
  {
    name: "Red Velvet",
    prices: { 60: 65, 100: 0 },
  },
  {
    name: "Oatmeal Cookie",
    prices: { 60: 65, 100: 0 },
  },
  {
    name: "S'mores",
    prices: { 60: 110, 100: 0 },
  },
  {
    name: "Stuffed Oreo",
    prices: { 60: 110, 100: 0 },
  },
  {
    name: "Biscoff",
    prices: { 60: 0, 100: 0 },
  },
];

const emptyOrderForm = () => ({
  customer_name: "",
  customer_contact: "",
  batch_date: localDateString(),
  order_type: "Pickup",
  amount_paid: "",
  notes: "",
  items: [],
});

function calculateOrder(order) {
  const items = order.order_items || [];
  const total = items.reduce((sum, item) => {
    return sum + Number(item.quantity || 0) * Number(item.price_each || 0);
  }, 0);

  const paid = Number(order.amount_paid || 0);
  const balance = Math.max(total - paid, 0);
  const change = Math.max(paid - total, 0);

  let status = "Unpaid";
  if (total === 0 && paid === 0) status = "No total";
  else if (paid >= total) status = "Paid";
  else if (paid > 0) status = "Partial";

  return {
    ...order,
    computed_total: total,
    computed_paid: paid,
    computed_balance: balance,
    computed_change: change,
    computed_status: status,
  };
}

function getFlavorName(item, flavors) {
  return (
    item.flavor_name_snapshot ||
    item.flavors?.name ||
    flavors.find((flavor) => flavor.id === item.flavor_id)?.name ||
    "Unknown flavor"
  );
}

function normalizeFlavors(data = []) {
  return data
    .map((flavor) => {
      const prices = { 60: 0, 100: 0 };
      (flavor.flavor_prices || []).forEach((row) => {
        prices[row.size_grams] = Number(row.price || 0);
      });

      return {
        ...flavor,
        prices,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function AuthPanel() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

let result;

if (mode === "signin") {
  result = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
} else {
  result = await supabase.auth.signUp({
    email: email.trim(),
    password,
  });
}

const { error } = result;

    if (error) {
      setMessage(error.message);
    } else if (mode === "signup") {
      setMessage("Account created. Check your email if confirmation is enabled, then sign in.");
    }

    setBusy(false);
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand-lockup">
          <span className="brand-icon">
            <Cookie size={32} />
          </span>
          <div>
            <p className="eyebrow">Butterhaus</p>
            <h1>Order Dashboard</h1>
          </div>
        </div>

        <p className="auth-copy">
          Track orders, payment, change, balance, and production count without using a calculator.
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Email
            <input
              type="email"
              required
              value={email}
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@email.com"
            />
          </label>

          <label>
            Password
            <input
              type="password"
              required
              minLength={6}
              value={password}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimum 6 characters"
            />
          </label>

          {message && <div className="notice warning">{message}</div>}

          <button className="primary-btn full" disabled={busy}>
            {busy ? "Please wait..." : mode === "signin" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <button
          className="ghost-btn full"
          onClick={() => {
            setMode((current) => (current === "signin" ? "signup" : "signin"));
            setMessage("");
          }}
        >
          {mode === "signin" ? "Create new account" : "I already have an account"}
        </button>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, detail }) {
  return (
    <div className="stat-card">
      <div className="stat-icon">
        <Icon size={20} />
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        {detail && <span>{detail}</span>}
      </div>
    </div>
  );
}

function PriceManager({ flavors, onReload }) {
  const [open, setOpen] = useState(false);
  const [newFlavor, setNewFlavor] = useState("");
  const [new60, setNew60] = useState("");
  const [new100, setNew100] = useState("");
  const [saving, setSaving] = useState(false);
  const [localPrices, setLocalPrices] = useState({});

  useEffect(() => {
    const initial = {};

    flavors.forEach((flavor) => {
      initial[flavor.id] = {
        name: flavor.name,
        active: flavor.active,
        60: flavor.prices[60] ?? 0,
        100: flavor.prices[100] ?? 0,
      };
    });

    setLocalPrices(initial);
  }, [flavors]);

  async function saveFlavor(flavor) {
    setSaving(true);

    try {
      const local = localPrices[flavor.id];

      const { error: flavorError } = await supabase
        .from("flavors")
        .update({
          name: local.name.trim(),
          active: Boolean(local.active),
        })
        .eq("id", flavor.id);

      if (flavorError) throw flavorError;

      for (const size of [60, 100]) {
        const existing = flavor.flavor_prices?.find(
          (row) => Number(row.size_grams) === size
        );

        const price = Number(local[size] || 0);

        const result = existing
          ? await supabase
              .from("flavor_prices")
              .update({ price })
              .eq("id", existing.id)
          : await supabase.from("flavor_prices").insert({
              flavor_id: flavor.id,
              size_grams: size,
              price,
            });

        if (result.error) throw result.error;
      }

      await onReload();
    } catch (error) {
      alert(error.message || "Failed to save flavor.");
    } finally {
      setSaving(false);
    }
  }

  async function addFlavor(event) {
    event.preventDefault();

    if (!newFlavor.trim()) return;

    setSaving(true);

    try {
      const { data: flavor, error } = await supabase
        .from("flavors")
        .insert({
          name: newFlavor.trim(),
          active: true,
        })
        .select("*")
        .single();

      if (error) throw error;

      const { error: priceError } = await supabase.from("flavor_prices").insert([
        {
          flavor_id: flavor.id,
          size_grams: 60,
          price: Number(new60 || 0),
        },
        {
          flavor_id: flavor.id,
          size_grams: 100,
          price: Number(new100 || 0),
        },
      ]);

      if (priceError) throw priceError;

      setNewFlavor("");
      setNew60("");
      setNew100("");

      await onReload();
    } catch (error) {
      alert(error.message || "Failed to add flavor.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteFlavor(flavor) {
    const confirmed = window.confirm(
      `Delete ${flavor.name}? Only do this if it has no existing order items.`
    );

    if (!confirmed) return;

    try {
      const { error } = await supabase.from("flavors").delete().eq("id", flavor.id);

      if (error) throw error;

      await onReload();
    } catch (error) {
      alert(error.message || "Failed to delete flavor.");
    }
  }

  if (!open) {
    return (
      <button
        className="secondary-btn manager-open-btn"
        type="button"
        onClick={() => setOpen(true)}
      >
        <Settings size={16} />
        Manage flavors/prices
      </button>
    );
  }

  return (
    <section className="manager-panel responsive-manager">
      <div className="panel-title-row manager-title-row">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>Flavor & Price Manager</h2>
        </div>

        <button
          className="icon-btn"
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close settings"
        >
          <X size={18} />
        </button>
      </div>

      <form className="responsive-add-grid" onSubmit={addFlavor}>
        <label className="manager-field new-flavor-field">
          <span>New flavor</span>
          <input
            value={newFlavor}
            onChange={(event) => setNewFlavor(event.target.value)}
            placeholder="New flavor name"
          />
        </label>

        <label className="manager-field">
          <span>60g price</span>
          <input
            type="number"
            min="0"
            step="1"
            value={new60}
            onChange={(event) => setNew60(event.target.value)}
            placeholder="60g price"
          />
        </label>

        <label className="manager-field">
          <span>100g price</span>
          <input
            type="number"
            min="0"
            step="1"
            value={new100}
            onChange={(event) => setNew100(event.target.value)}
            placeholder="100g price"
          />
        </label>

        <button className="primary-btn add-flavor-btn" disabled={saving}>
          <Plus size={16} />
          Add
        </button>
      </form>

      <div className="responsive-price-table">
        <div className="responsive-price-head">
          <span>Flavor</span>
          <span>60g</span>
          <span>100g</span>
          <span>Active</span>
          <span>Actions</span>
        </div>

        {flavors.map((flavor) => {
          const local = localPrices[flavor.id] || {};

          return (
            <div className="responsive-price-row" key={flavor.id}>
              <label className="manager-price-field flavor-field">
                <span>Flavor</span>
                <input
                  value={local.name || ""}
                  onChange={(event) =>
                    setLocalPrices((current) => ({
                      ...current,
                      [flavor.id]: {
                        ...current[flavor.id],
                        name: event.target.value,
                      },
                    }))
                  }
                />
              </label>

              <label className="manager-price-field">
                <span>60g</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={local[60] ?? ""}
                  onChange={(event) =>
                    setLocalPrices((current) => ({
                      ...current,
                      [flavor.id]: {
                        ...current[flavor.id],
                        60: event.target.value,
                      },
                    }))
                  }
                />
              </label>

              <label className="manager-price-field">
                <span>100g</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={local[100] ?? ""}
                  onChange={(event) =>
                    setLocalPrices((current) => ({
                      ...current,
                      [flavor.id]: {
                        ...current[flavor.id],
                        100: event.target.value,
                      },
                    }))
                  }
                />
              </label>

              <label className="manager-active-field">
                <span>Active</span>

                <div className="active-control">
                  <input
                    type="checkbox"
                    checked={Boolean(local.active)}
                    onChange={(event) =>
                      setLocalPrices((current) => ({
                        ...current,
                        [flavor.id]: {
                          ...current[flavor.id],
                          active: event.target.checked,
                        },
                      }))
                    }
                  />
                  Show
                </div>
              </label>

              <div className="manager-row-actions">
                <button
                  className="icon-btn"
                  type="button"
                  onClick={() => saveFlavor(flavor)}
                  aria-label={`Save ${flavor.name}`}
                >
                  <Save size={16} />
                </button>

                <button
                  className="icon-btn danger"
                  type="button"
                  onClick={() => deleteFlavor(flavor)}
                  aria-label={`Delete ${flavor.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
function OrderForm({ flavors, onCreated }) {
  const activeFlavors = flavors.filter((flavor) => flavor.active);
  const [form, setForm] = useState(emptyOrderForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (activeFlavors.length && form.items.length === 0) {
      const firstFlavor = activeFlavors[0];
      setForm((current) => ({
        ...current,
        items: [
          {
            flavor_id: firstFlavor.id,
            size_grams: 60,
            quantity: 1,
            price_each: firstFlavor.prices[60] ?? 0,
          },
        ],
      }));
    }
  }, [activeFlavors.length]);

  const draftTotal = useMemo(() => {
    return form.items.reduce((sum, item) => {
      return sum + Number(item.quantity || 0) * Number(item.price_each || 0);
    }, 0);
  }, [form.items]);

  const draftPaid = Number(form.amount_paid || 0);
  const draftBalance = Math.max(draftTotal - draftPaid, 0);
  const draftChange = Math.max(draftPaid - draftTotal, 0);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function addItem() {
    const firstFlavor = activeFlavors[0];
    if (!firstFlavor) return;

    setForm((current) => ({
      ...current,
      items: [
        ...current.items,
        {
          flavor_id: firstFlavor.id,
          size_grams: 60,
          quantity: 1,
          price_each: firstFlavor.prices[60] ?? 0,
        },
      ],
    }));
  }

  function updateItem(index, field, value) {
    setForm((current) => {
      const nextItems = current.items.map((item, itemIndex) => {
        if (itemIndex !== index) return item;

        const updated = {
          ...item,
          [field]: value,
        };

        if (field === "flavor_id" || field === "size_grams") {
          const flavor = activeFlavors.find((row) => row.id === updated.flavor_id);
          updated.price_each = flavor?.prices[Number(updated.size_grams)] ?? 0;
        }

        return updated;
      });

      return {
        ...current,
        items: nextItems,
      };
    });
  }

  function removeItem(index) {
    setForm((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!form.items.length) {
      alert("Add at least one cookie item.");
      return;
    }

    setSaving(true);

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        customer_name: form.customer_name.trim(),
        customer_contact: form.customer_contact.trim() || null,
        batch_date: form.batch_date,
        order_type: form.order_type,
        amount_paid: Number(form.amount_paid || 0),
        notes: form.notes.trim() || null,
      })
      .select("*")
      .single();

    if (orderError) {
      alert(orderError.message);
      setSaving(false);
      return;
    }

    const rows = form.items.map((item) => {
      const flavor = activeFlavors.find((row) => row.id === item.flavor_id);
      return {
        order_id: order.id,
        flavor_id: item.flavor_id,
        flavor_name_snapshot: flavor?.name || "Unknown flavor",
        size_grams: Number(item.size_grams),
        quantity: Number(item.quantity || 1),
        price_each: Number(item.price_each || 0),
      };
    });

    const { error: itemsError } = await supabase.from("order_items").insert(rows);

    if (itemsError) {
      alert(itemsError.message);
      await supabase.from("orders").delete().eq("id", order.id);
      setSaving(false);
      return;
    }

    setForm(emptyOrderForm());
    await onCreated();
    setSaving(false);
  }

  return (
    <section className="card order-form-card">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">New order</p>
          <h2>Add customer order</h2>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="order-form">
        <div className="form-grid">
          <label>
            Customer name
            <input
              required
              value={form.customer_name}
              onChange={(event) => updateField("customer_name", event.target.value)}
              placeholder="Example: Claire"
            />
          </label>

          <label>
            Contact / note
            <input
              value={form.customer_contact}
              onChange={(event) => updateField("customer_contact", event.target.value)}
              placeholder="Optional"
            />
          </label>

          <label>
            Batch date
            <input
              type="date"
              required
              value={form.batch_date}
              onChange={(event) => updateField("batch_date", event.target.value)}
            />
          </label>

          <label>
            Order type
            <select
              value={form.order_type}
              onChange={(event) => updateField("order_type", event.target.value)}
            >
              <option>Pickup</option>
              <option>Delivery</option>
            </select>
          </label>
        </div>

        <div className="items-area">
          <div className="items-title-row">
            <strong>Cookie items</strong>
            <button type="button" className="secondary-btn small" onClick={addItem}>
              <Plus size={14} />
              Add item
            </button>
          </div>

          {form.items.map((item, index) => (
            <div className="item-row" key={`${item.flavor_id}-${index}`}>
              <label>
                Flavor
                <select
                  value={item.flavor_id}
                  onChange={(event) => updateItem(index, "flavor_id", event.target.value)}
                >
                  {activeFlavors.map((flavor) => (
                    <option value={flavor.id} key={flavor.id}>
                      {flavor.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Size
                <select
                  value={item.size_grams}
                  onChange={(event) => updateItem(index, "size_grams", Number(event.target.value))}
                >
                  <option value={60}>60g</option>
                  <option value={100}>100g</option>
                </select>
              </label>

              <label>
                Qty
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={item.quantity}
                  onChange={(event) => updateItem(index, "quantity", event.target.value)}
                />
              </label>

              <label>
                Price each
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={item.price_each}
                  onChange={(event) => updateItem(index, "price_each", event.target.value)}
                />
              </label>

              <div className="line-total">
                <span>Line total</span>
                <strong>{peso(Number(item.quantity || 0) * Number(item.price_each || 0))}</strong>
              </div>

              <button type="button" className="icon-btn danger" onClick={() => removeItem(index)}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>

        <div className="payment-grid">
          <label>
            Amount paid
            <input
              type="number"
              min="0"
              step="1"
              value={form.amount_paid}
              onChange={(event) => updateField("amount_paid", event.target.value)}
              placeholder="0"
            />
          </label>

          <label className="wide">
            Notes
            <input
              value={form.notes}
              onChange={(event) => updateField("notes", event.target.value)}
              placeholder="Example: Paid via GCash, pickup tomorrow"
            />
          </label>
        </div>

        <div className="checkout-strip">
          <div>
            <span>Total</span>
            <strong>{peso(draftTotal)}</strong>
          </div>
          <div>
            <span>Paid</span>
            <strong>{peso(draftPaid)}</strong>
          </div>
          <div className={draftBalance > 0 ? "bad" : ""}>
            <span>Balance</span>
            <strong>{peso(draftBalance)}</strong>
          </div>
          <div className={draftChange > 0 ? "good" : ""}>
            <span>Change</span>
            <strong>{peso(draftChange)}</strong>
          </div>
          <button className="primary-btn" disabled={saving || !activeFlavors.length}>
            <Save size={16} />
            {saving ? "Saving..." : "Save order"}
          </button>
        </div>
      </form>
    </section>
  );
}

function ProductionSummary({ summary }) {
  return (
    <section className="card">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Baking prep</p>
          <h2>Production Summary</h2>
        </div>
      </div>

      {summary.length === 0 ? (
        <div className="empty-state">No items for this filter yet.</div>
      ) : (
        <div className="summary-grid">
          {summary.map((row) => (
            <div className="summary-card" key={`${row.flavor}-${row.size}`}>
              <span>{row.size}g</span>
              <strong>{row.quantity} pcs</strong>
              <p>{row.flavor}</p>
              <small>{peso(row.revenue)} projected sales</small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function OrderList({ orders, flavors, onReload }) {
  async function deleteOrder(orderId) {
    const confirmed = window.confirm("Delete this order?");
    if (!confirmed) return;

    const { error } = await supabase.from("orders").delete().eq("id", orderId);
    if (error) alert(error.message);
    await onReload();
  }

  async function markPaid(order) {
    const { error } = await supabase
      .from("orders")
      .update({ amount_paid: order.computed_total })
      .eq("id", order.id);

    if (error) alert(error.message);
    await onReload();
  }

  return (
    <section className="card">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Order list</p>
          <h2>Customers & Payments</h2>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="empty-state">No orders match your filters.</div>
      ) : (
        <div className="orders-stack">
          {orders.map((order) => (
            <article className="order-card" key={order.id}>
              <div className="order-main">
                <div>
                  <div className="customer-line">
                    <strong>{order.customer_name}</strong>
                    <span className={`status ${order.computed_status.toLowerCase().replace(" ", "-")}`}>
                      {order.computed_status === "Paid" ? (
                        <CheckCircle2 size={13} />
                      ) : (
                        <AlertTriangle size={13} />
                      )}
                      {order.computed_status}
                    </span>
                  </div>
                  <p>
                    {order.batch_date} • {order.order_type}
                    {order.customer_contact ? ` • ${order.customer_contact}` : ""}
                  </p>
                </div>

                <div className="order-money">
                  <span>Total: {peso(order.computed_total)}</span>
                  <span>Paid: {peso(order.computed_paid)}</span>
                  {order.computed_balance > 0 && <strong>Balance: {peso(order.computed_balance)}</strong>}
                  {order.computed_change > 0 && <strong className="good">Change: {peso(order.computed_change)}</strong>}
                </div>
              </div>

              <div className="order-items">
                {order.order_items?.map((item) => (
                  <span key={item.id}>
                    {item.quantity}x {getFlavorName(item, flavors)} {item.size_grams}g @{" "}
                    {peso(item.price_each)}
                  </span>
                ))}
              </div>

              {order.notes && <p className="order-notes">{order.notes}</p>}

              <div className="order-actions">
                {order.computed_status !== "Paid" && (
                  <button className="secondary-btn small" onClick={() => markPaid(order)}>
                    Mark paid
                  </button>
                )}
                <button className="icon-btn danger" onClick={() => deleteOrder(order.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function exportCsv(orders, flavors) {
  const headers = [
    "Customer",
    "Batch Date",
    "Type",
    "Items",
    "Total",
    "Paid",
    "Balance",
    "Change",
    "Status",
    "Notes",
  ];

  const rows = orders.map((order) => [
    order.customer_name,
    order.batch_date,
    order.order_type,
    (order.order_items || [])
      .map((item) => {
        return `${item.quantity}x ${getFlavorName(item, flavors)} ${item.size_grams}g @ ${item.price_each}`;
      })
      .join(" | "),
    order.computed_total,
    order.computed_paid,
    order.computed_balance,
    order.computed_change,
    order.computed_status,
    order.notes || "",
  ]);

  const csv = [headers, ...rows]
    .map((row) =>
      row
        .map((cell) => {
          const safe = String(cell ?? "").replace(/"/g, '""');
          return `"${safe}"`;
        })
        .join(",")
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `butterhaus-orders-${localDateString()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function Dashboard({ session }) {
  const [flavors, setFlavors] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [batchDate, setBatchDate] = useState(localDateString());
  const [status, setStatus] = useState("All");
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("orders");

  async function ensureStarterFlavors() {
    const { data, error } = await supabase.from("flavors").select("id").limit(1);

    if (error) throw error;
    if (data?.length) return;

    const { data: createdFlavors, error: flavorError } = await supabase
      .from("flavors")
      .insert(starterFlavors.map((flavor) => ({ name: flavor.name, active: true })))
      .select("*");

    if (flavorError) throw flavorError;

    const priceRows = createdFlavors.flatMap((flavor) => {
      const starter = starterFlavors.find((row) => row.name === flavor.name);
      return [60, 100].map((size) => ({
        flavor_id: flavor.id,
        size_grams: size,
        price: starter?.prices[size] ?? 0,
      }));
    });

    const { error: priceError } = await supabase.from("flavor_prices").insert(priceRows);
    if (priceError) throw priceError;
  }

  async function loadData() {
    setLoading(true);

    try {
      await ensureStarterFlavors();

      const [{ data: flavorData, error: flavorError }, { data: orderData, error: orderError }] =
        await Promise.all([
          supabase
            .from("flavors")
            .select("*, flavor_prices(*)")
            .order("name", { ascending: true }),
          supabase
            .from("orders")
            .select("*, order_items(*, flavors(name))")
            .order("batch_date", { ascending: false })
            .order("created_at", { ascending: false }),
        ]);

      if (flavorError) throw flavorError;
      if (orderError) throw orderError;

      setFlavors(normalizeFlavors(flavorData || []));
      setOrders((orderData || []).map(calculateOrder));
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const filteredOrders = useMemo(() => {
    const lowerQuery = query.toLowerCase().trim();

    return orders.filter((order) => {
      const matchesDate = batchDate ? order.batch_date === batchDate : true;
      const matchesStatus = status === "All" ? true : order.computed_status === status;

      const haystack = [
        order.customer_name,
        order.customer_contact,
        order.notes,
        order.order_type,
        ...(order.order_items || []).map((item) => getFlavorName(item, flavors)),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = lowerQuery ? haystack.includes(lowerQuery) : true;

      return matchesDate && matchesStatus && matchesSearch;
    });
  }, [orders, batchDate, status, query, flavors]);

  const stats = useMemo(() => {
    return filteredOrders.reduce(
      (acc, order) => {
        acc.orders += 1;
        acc.sales += order.computed_total;
        acc.paid += order.computed_paid;
        acc.balance += order.computed_balance;
        acc.change += order.computed_change;
        acc.pieces += (order.order_items || []).reduce(
          (sum, item) => sum + Number(item.quantity || 0),
          0
        );
        return acc;
      },
      {
        orders: 0,
        sales: 0,
        paid: 0,
        balance: 0,
        change: 0,
        pieces: 0,
      }
    );
  }, [filteredOrders]);

  const productionSummary = useMemo(() => {
    const map = new Map();

    filteredOrders.forEach((order) => {
      (order.order_items || []).forEach((item) => {
        const flavor = getFlavorName(item, flavors);
        const key = `${flavor}-${item.size_grams}`;
        const current = map.get(key) || {
          flavor,
          size: item.size_grams,
          quantity: 0,
          revenue: 0,
        };

        current.quantity += Number(item.quantity || 0);
        current.revenue += Number(item.quantity || 0) * Number(item.price_each || 0);
        map.set(key, current);
      });
    });

    return Array.from(map.values()).sort((a, b) => {
      const flavorSort = a.flavor.localeCompare(b.flavor);
      if (flavorSort !== 0) return flavorSort;
      return a.size - b.size;
    });
  }, [filteredOrders, flavors]);

  if (loading) {
    return (
      <div className="loading-screen">
        <Cookie className="spin-slow" size={44} />
        <p>Loading Butterhaus dashboard...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-shell">
      <header className="topbar">
        <div className="brand-lockup mini">
          <span className="brand-icon">
            <Cookie size={24} />
          </span>
          <div>
            <p className="eyebrow">Butterhaus</p>
            <h1>Order Dashboard</h1>
          </div>
        </div>

        <div className="topbar-actions">
          <button className="secondary-btn" onClick={loadData}>
            <RefreshCw size={16} />
            Refresh
          </button>
          <button className="ghost-btn" onClick={() => supabase.auth.signOut()}>
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </header>

      <main>
        <section className="hero-card">
          <div>
            <p className="eyebrow">Batch control</p>
            <h2>Butterhaus cookies</h2>
            <p>
              Add orders once, then see production count, sales, paid amount, balance, and change
              instantly.
            </p>
          </div>
          <div className="hero-pill">
            Logged in as <strong>{session.user.email}</strong>
          </div>
        </section>

        <section className="toolbar">
          <label className="filter-field">
            <CalendarDays size={16} />
            Batch date
            <input type="date" value={batchDate} onChange={(event) => setBatchDate(event.target.value)} />
          </label>

          <label className="filter-field">
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option>All</option>
              <option>Paid</option>
              <option>Partial</option>
              <option>Unpaid</option>
              <option>No total</option>
            </select>
          </label>

          <label className="filter-field search-field">
            <Search size={16} />
            Search
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, flavor, notes..."
            />
          </label>

          <button className="secondary-btn" onClick={() => exportCsv(filteredOrders, flavors)}>
            <Download size={16} />
            Export CSV
          </button>

          <button className="ghost-btn" onClick={() => setBatchDate("")}>
            All dates
          </button>
        </section>

        <section className="stats-grid">
          <StatCard icon={ClipboardList} label="Orders" value={stats.orders} detail="filtered batch" />
          <StatCard icon={PackageCheck} label="Pieces" value={stats.pieces} detail="cookies to make" />
          <StatCard icon={Banknote} label="Sales" value={peso(stats.sales)} detail={`Paid ${peso(stats.paid)}`} />
          <StatCard icon={AlertTriangle} label="Balance" value={peso(stats.balance)} detail={`Change ${peso(stats.change)}`} />
        </section>

 <section className="app-tabs">
  <button
    type="button"
    className={activeTab === "orders" ? "active" : ""}
    onClick={() => setActiveTab("orders")}
  >
    Orders
  </button>

  <button
    type="button"
    className={activeTab === "costing" ? "active" : ""}
    onClick={() => setActiveTab("costing")}
  >
    Costing / Profit
  </button>
</section>

{activeTab === "orders" ? (
  <>
    <PriceManager flavors={flavors} onReload={loadData} />

    <div className="dashboard-grid">
      <div className="left-column">
        <OrderForm flavors={flavors} onCreated={loadData} />
        <OrderList orders={filteredOrders} flavors={flavors} onReload={loadData} />
      </div>

      <div className="right-column">
        <ProductionSummary summary={productionSummary} />

        <section className="card tips-card">
          <p className="eyebrow">Workflow tip</p>
          <h2>Best daily use</h2>
          <ol>
            <li>Set the batch date first.</li>
            <li>Add all orders for that baking batch.</li>
            <li>Check Production Summary before baking.</li>
            <li>Use Customers & Payments to prepare change/balance.</li>
          </ol>
        </section>
      </div>
    </div>
  </>
) : (
  <CostingTab
    flavors={flavors}
    filteredOrders={filteredOrders}
    batchDate={batchDate}
  />
)}
      </main>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCheckingSession(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setCheckingSession(false);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  if (checkingSession) {
    return (
      <div className="loading-screen">
        <Cookie className="spin-slow" size={44} />
        <p>Checking session...</p>
      </div>
    );
  }

  return session ? <Dashboard session={session} /> : <AuthPanel />;
}
