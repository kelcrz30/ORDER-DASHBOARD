import React, { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  Calculator,
  Package,
  Plus,
  ReceiptText,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { localDateString, peso } from "../utils/currency";

const emptyIngredientForm = {
  name: "",
  unit: "g",
  package_amount: "",
  package_cost: "",
};

const emptyRecipeForm = {
  flavor_id: "",
  size_grams: 60,
  ingredient_id: "",
  quantity_used: "",
};

const emptyExpenseForm = {
  expense_date: localDateString(),
  name: "",
  amount: "",
  notes: "",
};

function getFlavorName(flavors, flavorId) {
  return flavors.find((flavor) => flavor.id === flavorId)?.name || "Unknown flavor";
}

function getIngredientName(ingredients, ingredientId) {
  return ingredients.find((ingredient) => ingredient.id === ingredientId)?.name || "Unknown ingredient";
}

function getIngredientUnit(ingredients, ingredientId) {
  return ingredients.find((ingredient) => ingredient.id === ingredientId)?.unit || "unit";
}

function getIngredientCostPerUnit(ingredient) {
  const packageAmount = Number(ingredient.package_amount || 0);
  const packageCost = Number(ingredient.package_cost || 0);

  if (packageAmount <= 0) return 0;

  return packageCost / packageAmount;
}

function CostingStatCard({ icon: Icon, label, value, detail, tone = "" }) {
  return (
    <div className={`costing-stat-card ${tone}`}>
      <div className="costing-stat-icon">
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

export default function CostingTab({ flavors, filteredOrders, batchDate }) {
  const [ingredients, setIngredients] = useState([]);
  const [recipeItems, setRecipeItems] = useState([]);
  const [expenses, setExpenses] = useState([]);

  const [ingredientForm, setIngredientForm] = useState(emptyIngredientForm);
  const [recipeForm, setRecipeForm] = useState(emptyRecipeForm);
  const [expenseForm, setExpenseForm] = useState({
    ...emptyExpenseForm,
    expense_date: batchDate || localDateString(),
  });

  const [ingredientEdits, setIngredientEdits] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadCostingData() {
    setLoading(true);

    try {
      const [
        { data: ingredientData, error: ingredientError },
        { data: recipeData, error: recipeError },
        { data: expenseData, error: expenseError },
      ] = await Promise.all([
        supabase.from("ingredients").select("*").order("name", { ascending: true }),
        supabase.from("recipe_items").select("*").order("created_at", { ascending: false }),
        supabase.from("business_expenses").select("*").order("expense_date", { ascending: false }),
      ]);

      if (ingredientError) throw ingredientError;
      if (recipeError) throw recipeError;
      if (expenseError) throw expenseError;

      setIngredients(ingredientData || []);
      setRecipeItems(recipeData || []);
      setExpenses(expenseData || []);
    } catch (error) {
      alert(error.message || "Failed to load costing data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCostingData();
  }, []);

  useEffect(() => {
    const initial = {};

    ingredients.forEach((ingredient) => {
      initial[ingredient.id] = {
        name: ingredient.name,
        unit: ingredient.unit,
        package_amount: ingredient.package_amount,
        package_cost: ingredient.package_cost,
      };
    });

    setIngredientEdits(initial);
  }, [ingredients]);

  useEffect(() => {
    setExpenseForm((current) => ({
      ...current,
      expense_date: batchDate || current.expense_date || localDateString(),
    }));
  }, [batchDate]);

  const recipeCostMap = useMemo(() => {
    const map = new Map();

    recipeItems.forEach((item) => {
      const ingredient = ingredients.find((row) => row.id === item.ingredient_id);
      if (!ingredient) return;

      const key = `${item.flavor_id}-${item.size_grams}`;
      const currentCost = map.get(key) || 0;

      const costPerUnit = getIngredientCostPerUnit(ingredient);
      const usedCost = Number(item.quantity_used || 0) * costPerUnit;

      map.set(key, currentCost + usedCost);
    });

    return map;
  }, [recipeItems, ingredients]);

  const costingSummary = useMemo(() => {
    const totalSales = filteredOrders.reduce((sum, order) => {
      return sum + Number(order.computed_total || 0);
    }, 0);

    let estimatedProductCost = 0;
    let missingRecipeLines = 0;

    filteredOrders.forEach((order) => {
      (order.order_items || []).forEach((item) => {
        const key = `${item.flavor_id}-${item.size_grams}`;
        const costPerCookie = recipeCostMap.get(key);

        if (costPerCookie === undefined) {
          missingRecipeLines += 1;
          return;
        }

        estimatedProductCost += Number(item.quantity || 0) * costPerCookie;
      });
    });

    const filteredExpenses = expenses.filter((expense) => {
      if (!batchDate) return true;
      return expense.expense_date === batchDate;
    });

    const totalExpenses = filteredExpenses.reduce((sum, expense) => {
      return sum + Number(expense.amount || 0);
    }, 0);

    const grossProfit = totalSales - estimatedProductCost;
    const netProfit = grossProfit - totalExpenses;

    return {
      totalSales,
      estimatedProductCost,
      grossProfit,
      totalExpenses,
      netProfit,
      missingRecipeLines,
      filteredExpenses,
    };
  }, [filteredOrders, recipeCostMap, expenses, batchDate]);

  const recipeCostList = useMemo(() => {
    return flavors
      .flatMap((flavor) => {
        return [60, 100].map((size) => {
          const key = `${flavor.id}-${size}`;
          const cost = recipeCostMap.get(key) || 0;
          const sellingPrice = Number(flavor.prices?.[size] || 0);
          const profit = sellingPrice - cost;
          const margin = sellingPrice > 0 ? (profit / sellingPrice) * 100 : 0;

          return {
            flavor,
            size,
            cost,
            sellingPrice,
            profit,
            margin,
          };
        });
      })
      .filter((row) => row.sellingPrice > 0 || row.cost > 0);
  }, [flavors, recipeCostMap]);

  async function addIngredient(event) {
    event.preventDefault();

    if (!ingredientForm.name.trim()) return;

    setSaving(true);

    try {
      const { error } = await supabase.from("ingredients").insert({
        name: ingredientForm.name.trim(),
        unit: ingredientForm.unit.trim() || "g",
        package_amount: Number(ingredientForm.package_amount || 0),
        package_cost: Number(ingredientForm.package_cost || 0),
      });

      if (error) throw error;

      setIngredientForm(emptyIngredientForm);
      await loadCostingData();
    } catch (error) {
      alert(error.message || "Failed to add ingredient.");
    } finally {
      setSaving(false);
    }
  }

  async function saveIngredient(ingredient) {
    const local = ingredientEdits[ingredient.id];
    if (!local) return;

    setSaving(true);

    try {
      const { error } = await supabase
        .from("ingredients")
        .update({
          name: local.name.trim(),
          unit: local.unit.trim() || "g",
          package_amount: Number(local.package_amount || 0),
          package_cost: Number(local.package_cost || 0),
        })
        .eq("id", ingredient.id);

      if (error) throw error;

      await loadCostingData();
    } catch (error) {
      alert(error.message || "Failed to save ingredient.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteIngredient(ingredient) {
    const confirmed = window.confirm(
      `Delete ${ingredient.name}? This will also delete related recipe costing items.`
    );

    if (!confirmed) return;

    setSaving(true);

    try {
      const { error } = await supabase.from("ingredients").delete().eq("id", ingredient.id);

      if (error) throw error;

      await loadCostingData();
    } catch (error) {
      alert(error.message || "Failed to delete ingredient.");
    } finally {
      setSaving(false);
    }
  }

async function addRecipeItem(event) {
  event.preventDefault();

  const flavorId = recipeForm.flavor_id || flavors[0]?.id || "";
  const sizeGrams = Number(recipeForm.size_grams || 60);
  const ingredientId = recipeForm.ingredient_id || ingredients[0]?.id || "";

  const validFlavor = flavors.find((flavor) => flavor.id === flavorId);
  const validIngredient = ingredients.find((ingredient) => ingredient.id === ingredientId);

  if (!validFlavor) {
    alert("Please select a valid flavor.");
    return;
  }

  if (!validIngredient) {
    alert("Please select a valid ingredient. Click Refresh if needed.");
    return;
  }

  if (!recipeForm.quantity_used || Number(recipeForm.quantity_used) <= 0) {
    alert("Please enter Qty used.");
    return;
  }

  setSaving(true);

  try {
    const { error } = await supabase.from("recipe_items").insert({
      flavor_id: validFlavor.id,
      size_grams: sizeGrams,
      ingredient_id: validIngredient.id,
      quantity_used: Number(recipeForm.quantity_used || 0),
    });

    if (error) throw error;

    setRecipeForm({
      flavor_id: validFlavor.id,
      size_grams: sizeGrams,
      ingredient_id: validIngredient.id,
      quantity_used: "",
    });

    await loadCostingData();
  } catch (error) {
    alert(
      error.message ||
        "Failed to add recipe item. If this ingredient already exists for this flavor/size, delete the old row first."
    );
  } finally {
    setSaving(false);
  }
}
  async function deleteRecipeItem(item) {
    setSaving(true);

    try {
      const { error } = await supabase.from("recipe_items").delete().eq("id", item.id);

      if (error) throw error;

      await loadCostingData();
    } catch (error) {
      alert(error.message || "Failed to delete recipe item.");
    } finally {
      setSaving(false);
    }
  }

  async function addExpense(event) {
    event.preventDefault();

    if (!expenseForm.name.trim()) return;

    setSaving(true);

    try {
      const { error } = await supabase.from("business_expenses").insert({
        expense_date: expenseForm.expense_date || localDateString(),
        name: expenseForm.name.trim(),
        amount: Number(expenseForm.amount || 0),
        notes: expenseForm.notes.trim() || null,
      });

      if (error) throw error;

      setExpenseForm({
        expense_date: batchDate || localDateString(),
        name: "",
        amount: "",
        notes: "",
      });

      await loadCostingData();
    } catch (error) {
      alert(error.message || "Failed to add expense.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteExpense(expense) {
    setSaving(true);

    try {
      const { error } = await supabase.from("business_expenses").delete().eq("id", expense.id);

      if (error) throw error;

      await loadCostingData();
    } catch (error) {
      alert(error.message || "Failed to delete expense.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="card costing-card">
        <div className="costing-loading">
          <RefreshCw className="spin-slow" size={24} />
          Loading costing data...
        </div>
      </section>
    );
  }

  return (
    <div className="costing-shell">
      <section className="costing-stats-grid">
        <CostingStatCard
          icon={Banknote}
          label="Total Sales"
          value={peso(costingSummary.totalSales)}
          detail={batchDate ? `Batch ${batchDate}` : "All dates"}
        />

        <CostingStatCard
          icon={Package}
          label="Estimated Product Cost"
          value={peso(costingSummary.estimatedProductCost)}
          detail={
            costingSummary.missingRecipeLines > 0
              ? `${costingSummary.missingRecipeLines} order lines missing recipe`
              : "Based on recipe costing"
          }
          tone={costingSummary.missingRecipeLines > 0 ? "warning" : ""}
        />

        <CostingStatCard
          icon={Calculator}
          label="Gross Profit"
          value={peso(costingSummary.grossProfit)}
          detail="Sales minus product cost"
          tone={costingSummary.grossProfit >= 0 ? "good" : "bad"}
        />

        <CostingStatCard
          icon={ReceiptText}
          label="Net Profit"
          value={peso(costingSummary.netProfit)}
          detail={`Expenses ${peso(costingSummary.totalExpenses)}`}
          tone={costingSummary.netProfit >= 0 ? "good" : "bad"}
        />
      </section>

      <section className="card costing-card">
        <div className="panel-title-row">
          <div>
            <p className="eyebrow">Ingredients</p>
            <h2>Ingredient Cost List</h2>
          </div>

          <button className="secondary-btn small" type="button" onClick={loadCostingData}>
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>

        <form className="costing-form ingredient-form" onSubmit={addIngredient}>
          <label>
            Ingredient
            <input
              value={ingredientForm.name}
              onChange={(event) =>
                setIngredientForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="Example: Butter"
            />
          </label>

          <label>
            Unit
            <select
              value={ingredientForm.unit}
              onChange={(event) =>
                setIngredientForm((current) => ({
                  ...current,
                  unit: event.target.value,
                }))
              }
            >
              <option value="g">g</option>
              <option value="ml">ml</option>
              <option value="pc">pc</option>
              <option value="pack">pack</option>
            </select>
          </label>

          <label>
            Package amount
            <input
              type="number"
              min="0"
              step="0.01"
              value={ingredientForm.package_amount}
              onChange={(event) =>
                setIngredientForm((current) => ({
                  ...current,
                  package_amount: event.target.value,
                }))
              }
              placeholder="Example: 225"
            />
          </label>

          <label>
            Package cost
            <input
              type="number"
              min="0"
              step="0.01"
              value={ingredientForm.package_cost}
              onChange={(event) =>
                setIngredientForm((current) => ({
                  ...current,
                  package_cost: event.target.value,
                }))
              }
              placeholder="Example: 120"
            />
          </label>

          <button className="primary-btn" disabled={saving}>
            <Plus size={16} />
            Add
          </button>
        </form>

        {ingredients.length === 0 ? (
          <div className="empty-state">No ingredients yet. Add butter, flour, sugar, chocolate, packaging, etc.</div>
        ) : (
          <div className="ingredient-list">
            {ingredients.map((ingredient) => {
              const local = ingredientEdits[ingredient.id] || {};
              const costPerUnit = getIngredientCostPerUnit({
                package_amount: local.package_amount,
                package_cost: local.package_cost,
              });

              return (
                <div className="ingredient-row" key={ingredient.id}>
                  <label>
                    <span>Ingredient</span>
                    <input
                      value={local.name || ""}
                      onChange={(event) =>
                        setIngredientEdits((current) => ({
                          ...current,
                          [ingredient.id]: {
                            ...current[ingredient.id],
                            name: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>

                  <label>
                    <span>Unit</span>
                    <select
                      value={local.unit || "g"}
                      onChange={(event) =>
                        setIngredientEdits((current) => ({
                          ...current,
                          [ingredient.id]: {
                            ...current[ingredient.id],
                            unit: event.target.value,
                          },
                        }))
                      }
                    >
                      <option value="g">g</option>
                      <option value="ml">ml</option>
                      <option value="pc">pc</option>
                      <option value="pack">pack</option>
                    </select>
                  </label>

                  <label>
                    <span>Amount</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={local.package_amount ?? ""}
                      onChange={(event) =>
                        setIngredientEdits((current) => ({
                          ...current,
                          [ingredient.id]: {
                            ...current[ingredient.id],
                            package_amount: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>

                  <label>
                    <span>Cost</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={local.package_cost ?? ""}
                      onChange={(event) =>
                        setIngredientEdits((current) => ({
                          ...current,
                          [ingredient.id]: {
                            ...current[ingredient.id],
                            package_cost: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>

                  <div className="cost-per-unit">
                    <span>Cost / {local.unit || "unit"}</span>
                    <strong>{peso(costPerUnit)}</strong>
                  </div>

                  <div className="costing-actions">
                    <button className="icon-btn" type="button" onClick={() => saveIngredient(ingredient)}>
                      <Save size={16} />
                    </button>

                    <button className="icon-btn danger" type="button" onClick={() => deleteIngredient(ingredient)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card costing-card">
        <div className="panel-title-row">
          <div>
            <p className="eyebrow">Recipe costing</p>
            <h2>Cost per Cookie Flavor</h2>
          </div>
        </div>

        <form className="costing-form recipe-form" onSubmit={addRecipeItem}>
          <label>
            Flavor
            <select
              value={recipeForm.flavor_id || flavors[0]?.id || ""}
              onChange={(event) =>
                setRecipeForm((current) => ({
                  ...current,
                  flavor_id: event.target.value,
                }))
              }
            >
              {flavors.map((flavor) => (
                <option key={flavor.id} value={flavor.id}>
                  {flavor.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Size
            <select
              value={recipeForm.size_grams}
              onChange={(event) =>
                setRecipeForm((current) => ({
                  ...current,
                  size_grams: Number(event.target.value),
                }))
              }
            >
              <option value={60}>60g</option>
              <option value={100}>100g</option>
            </select>
          </label>

          <label>
            Ingredient
            <select
              value={recipeForm.ingredient_id || ingredients[0]?.id || ""}
              onChange={(event) =>
                setRecipeForm((current) => ({
                  ...current,
                  ingredient_id: event.target.value,
                }))
              }
            >
              {ingredients.map((ingredient) => (
                <option key={ingredient.id} value={ingredient.id}>
                  {ingredient.name} / {ingredient.unit}
                </option>
              ))}
            </select>
          </label>

          <label>
            Qty used
            <input
              type="number"
              min="0"
              step="0.01"
              value={recipeForm.quantity_used}
              onChange={(event) =>
                setRecipeForm((current) => ({
                  ...current,
                  quantity_used: event.target.value,
                }))
              }
              placeholder="Example: 15"
            />
          </label>

          <button className="primary-btn" disabled={saving || !flavors.length || !ingredients.length}>
            <Plus size={16} />
            Add recipe cost
          </button>
        </form>

        {recipeItems.length === 0 ? (
          <div className="empty-state">No recipe costing yet. Add ingredients used per flavor and size.</div>
        ) : (
          <div className="recipe-items-list">
            {recipeItems.map((item) => {
              const ingredient = ingredients.find((row) => row.id === item.ingredient_id);
              const costPerUnit = ingredient ? getIngredientCostPerUnit(ingredient) : 0;
              const lineCost = Number(item.quantity_used || 0) * costPerUnit;

              return (
                <div className="recipe-item-row" key={item.id}>
                  <div>
                    <strong>
                      {getFlavorName(flavors, item.flavor_id)} {item.size_grams}g
                    </strong>
                    <p>
                      {getIngredientName(ingredients, item.ingredient_id)} · {item.quantity_used}{" "}
                      {getIngredientUnit(ingredients, item.ingredient_id)}
                    </p>
                  </div>

                  <div className="recipe-line-cost">
                    <span>Ingredient cost</span>
                    <strong>{peso(lineCost)}</strong>
                  </div>

                  <button className="icon-btn danger" type="button" onClick={() => deleteRecipeItem(item)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="profit-table">
          <div className="profit-head">
            <span>Flavor</span>
            <span>Size</span>
            <span>Selling</span>
            <span>Cost</span>
            <span>Gross profit</span>
            <span>Margin</span>
          </div>

          {recipeCostList.map((row) => (
            <div className="profit-row" key={`${row.flavor.id}-${row.size}`}>
              <span>{row.flavor.name}</span>
              <span>{row.size}g</span>
              <span>{peso(row.sellingPrice)}</span>
              <span>{peso(row.cost)}</span>
              <strong className={row.profit >= 0 ? "good" : "bad"}>{peso(row.profit)}</strong>
              <span>{row.margin.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card costing-card">
        <div className="panel-title-row">
          <div>
            <p className="eyebrow">Expenses</p>
            <h2>Business Expenses</h2>
          </div>
        </div>

        <form className="costing-form expense-form" onSubmit={addExpense}>
          <label>
            Date
            <input
              type="date"
              value={expenseForm.expense_date}
              onChange={(event) =>
                setExpenseForm((current) => ({
                  ...current,
                  expense_date: event.target.value,
                }))
              }
            />
          </label>

          <label>
            Expense
            <input
              value={expenseForm.name}
              onChange={(event) =>
                setExpenseForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="Example: Packaging / Gas / Sticker"
            />
          </label>

          <label>
            Amount
            <input
              type="number"
              min="0"
              step="0.01"
              value={expenseForm.amount}
              onChange={(event) =>
                setExpenseForm((current) => ({
                  ...current,
                  amount: event.target.value,
                }))
              }
              placeholder="0"
            />
          </label>

          <label>
            Notes
            <input
              value={expenseForm.notes}
              onChange={(event) =>
                setExpenseForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              placeholder="Optional"
            />
          </label>

          <button className="primary-btn" disabled={saving}>
            <Plus size={16} />
            Add expense
          </button>
        </form>

        {costingSummary.filteredExpenses.length === 0 ? (
          <div className="empty-state">No expenses for this filter yet.</div>
        ) : (
          <div className="expenses-list">
            {costingSummary.filteredExpenses.map((expense) => (
              <div className="expense-row" key={expense.id}>
                <div>
                  <strong>{expense.name}</strong>
                  <p>
                    {expense.expense_date}
                    {expense.notes ? ` · ${expense.notes}` : ""}
                  </p>
                </div>

                <strong>{peso(expense.amount)}</strong>

                <button className="icon-btn danger" type="button" onClick={() => deleteExpense(expense)}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}