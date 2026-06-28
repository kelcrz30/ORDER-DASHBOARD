export function peso(value = 0) {
  const number = Number(value || 0);
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(number);
}

export function localDateString(date = new Date()) {
  const safeDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return safeDate.toISOString().slice(0, 10);
}
