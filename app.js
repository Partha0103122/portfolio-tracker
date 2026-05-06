const BASELINE_DATE = "2026-05-01";
const STORAGE_KEY = "loan-tracker-data-v1";
const PAYMENT_KEY = "loan-tracker-part-payments-v1";

const defaultLoans = [
  { loanType: "ICICI - Home Loan", account: "LBHYD00004374392", loanAmount: 5027941, principal: 2893622, annualRate: 8, emi: 44000, emiDay: 1 },
  { loanType: "ICICI - Top Up", account: "TBHYD00006250389", loanAmount: 1500000, principal: 1139726, annualRate: 8.05, emi: 18359, emiDay: 5 },
  { loanType: "ICICI - Top Up", account: "HPHYD00046139420", loanAmount: 500000, principal: 366248, annualRate: 8.9, emi: 6323, emiDay: 10 },
  { loanType: "ICICI - Personal Loan", account: "LBHYD00046933749", loanAmount: 2000000, principal: 1046189, annualRate: 10.25, emi: 37505, emiDay: 1 },
  { loanType: "ICICI - Personal Loan", account: "HPHYD00049513511", loanAmount: 500000, principal: 388831, annualRate: 10.35, emi: 8437, emiDay: 10 },
  { loanType: "ICICI - Two Wheeler Loan", account: "UTHYD00049743468", loanAmount: 116770, principal: 35984, annualRate: 18, emi: 4218, emiDay: 10 },
  { loanType: "ICICI - Bajaj Finance Loan", account: "P400SAT16174885", loanAmount: 466097, principal: 367985, annualRate: 14.5, emi: 13407, emiDay: 2 },
  { loanType: "ICICI CC - PLCC", account: "ICICI Amazon Credit Card", loanAmount: 400000, principal: 135749, annualRate: 14.5, emi: 19393, emiDay: 5 },
  { loanType: "HDFC CC - Instaloan", account: "HDFC Rupay", loanAmount: 370000, principal: 291624, annualRate: 11.88, emi: 8208, emiDay: 1 },
  { loanType: "SBI - Personal Loan", account: "4362184714-6", loanAmount: 200000, principal: 115109, annualRate: 14.6, emi: 6894, emiDay: 1 }
];

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const monthName = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

let loans = loadJson(STORAGE_KEY, defaultLoans);
let partPayments = loadJson(PAYMENT_KEY, {});

const els = {
  asOfDate: document.querySelector("#asOfDate"),
  search: document.querySelector("#searchLoans"),
  commonPayment: document.querySelector("#commonPartPayment"),
  applyCommonPayment: document.querySelector("#applyCommonPayment"),
  clearPartPayments: document.querySelector("#clearPartPayments"),
  sort: document.querySelector("#sortLoans"),
  loanRows: document.querySelector("#loanRows"),
  rawRows: document.querySelector("#rawRows"),
  reset: document.querySelector("#resetData"),
  totalOutstanding: document.querySelector("#totalOutstanding"),
  totalEmi: document.querySelector("#totalEmi"),
  monthlyInterest: document.querySelector("#monthlyInterest"),
  totalSaving: document.querySelector("#totalSaving"),
  focusInsight: document.querySelector("#focusInsight"),
  quickWinInsight: document.querySelector("#quickWinInsight"),
  pressureInsight: document.querySelector("#pressureInsight")
};

els.asOfDate.value = toInputDate(new Date());
render();

els.asOfDate.addEventListener("change", render);
els.search.addEventListener("input", render);
els.sort.addEventListener("change", render);
els.applyCommonPayment.addEventListener("click", () => {
  const amount = toNumber(els.commonPayment.value);
  loans.forEach((loan, index) => {
    partPayments[getLoanId(loan, index)] = amount;
  });
  saveJson(PAYMENT_KEY, partPayments);
  render();
});
els.clearPartPayments.addEventListener("click", () => {
  partPayments = {};
  els.commonPayment.value = "";
  saveJson(PAYMENT_KEY, partPayments);
  render();
});
els.reset.addEventListener("click", () => {
  loans = structuredClone(defaultLoans);
  partPayments = {};
  saveJson(STORAGE_KEY, loans);
  saveJson(PAYMENT_KEY, partPayments);
  render();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js"));
}

function render() {
  const asOf = parseDate(els.asOfDate.value || toInputDate(new Date()));
  const rows = loans.map((loan, index) => buildLoanView(loan, index, asOf));
  const query = els.search.value.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    const text = `${row.loan.loanType} ${row.loan.account}`.toLowerCase();
    return !query || text.includes(query);
  });

  filtered.sort(sorter(els.sort.value));
  renderLoanRows(filtered);
  renderRawRows();
  renderSummary(rows);
  renderInsights(rows);
}

function buildLoanView(loan, index, asOf) {
  const currentPrincipal = projectPrincipal(loan, asOf);
  const calculatedRemaining = remainingEmis(currentPrincipal, loan.annualRate, loan.emi);
  const baseRemaining = remainingEmis(loan.principal, loan.annualRate, loan.emi);
  const paidSinceBaseline = countPaidDueDates(loan.emiDay, parseDate(BASELINE_DATE), asOf);
  const remainingByRoundedSchedule = Math.max(0, baseRemaining - paidSinceBaseline);
  const remaining = Math.min(calculatedRemaining, remainingByRoundedSchedule || calculatedRemaining);
  const closeDate = getFutureDueDate(asOf, loan.emiDay, remaining);
  const monthlyInterest = currentPrincipal * monthlyRate(loan.annualRate);
  const payment = Math.min(toNumber(partPayments[getLoanId(loan, index)]), currentPrincipal);
  const afterPaymentPrincipal = Math.max(0, currentPrincipal - payment);
  const afterPaymentEmis = remainingEmis(afterPaymentPrincipal, loan.annualRate, loan.emi);
  const afterPaymentCloseDate = getFutureDueDate(asOf, loan.emiDay, afterPaymentEmis);
  const emisCut = Math.max(0, remaining - afterPaymentEmis);
  const interestWithoutPayment = totalInterestToClose(currentPrincipal, loan.annualRate, loan.emi);
  const interestWithPayment = totalInterestToClose(afterPaymentPrincipal, loan.annualRate, loan.emi);
  const interestSaved = Math.max(0, interestWithoutPayment - interestWithPayment);

  return {
    id: getLoanId(loan, index),
    loan,
    index,
    currentPrincipal,
    remaining,
    closeDate,
    monthlyInterest,
    payment,
    afterPaymentEmis,
    afterPaymentCloseDate,
    emisCut,
    interestSaved
  };
}

function renderLoanRows(rows) {
  els.loanRows.innerHTML = "";
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div class="loan-title">
          <strong>${escapeHtml(row.loan.loanType)}</strong>
          <span>${escapeHtml(row.loan.account)}</span>
        </div>
      </td>
      <td>${money.format(row.currentPrincipal)}</td>
      <td>${money.format(row.loan.emi)}</td>
      <td><span class="pill ${row.remaining <= 12 ? "warn" : ""}">${row.remaining}</span></td>
      <td>${row.closeDate ? monthName.format(row.closeDate) : "Closed"}</td>
      <td>${money.format(row.monthlyInterest)}</td>
      <td><input class="part-input" data-payment="${row.id}" type="number" min="0" step="1000" value="${row.payment || ""}" aria-label="Part payment for ${escapeHtml(row.loan.loanType)}"></td>
      <td>${row.emisCut}</td>
      <td>${row.payment > 0 ? (row.afterPaymentCloseDate ? monthName.format(row.afterPaymentCloseDate) : "Closed") : "-"}</td>
      <td>${money.format(row.interestSaved)}</td>
    `;
    els.loanRows.appendChild(tr);
  });

  document.querySelectorAll("[data-payment]").forEach((input) => {
    input.addEventListener("change", (event) => {
      partPayments[event.target.dataset.payment] = toNumber(event.target.value);
      saveJson(PAYMENT_KEY, partPayments);
      render();
    });
  });
}

function renderRawRows() {
  els.rawRows.innerHTML = "";
  loans.forEach((loan, index) => {
    const tr = document.createElement("tr");
    const fields = [
      ["loanType", "text"],
      ["account", "text"],
      ["loanAmount", "number"],
      ["principal", "number"],
      ["annualRate", "number"],
      ["emi", "number"],
      ["emiDay", "number"]
    ];
    fields.forEach(([field, type]) => {
      const td = document.createElement("td");
      const input = document.createElement("input");
      input.type = type;
      input.value = loan[field];
      input.min = field === "emiDay" ? "1" : "0";
      input.max = field === "emiDay" ? "28" : "";
      input.step = field === "annualRate" ? "0.01" : "1";
      input.addEventListener("change", () => {
        loans[index][field] = type === "number" ? toNumber(input.value) : input.value;
        saveJson(STORAGE_KEY, loans);
        render();
      });
      td.appendChild(input);
      tr.appendChild(td);
    });
    els.rawRows.appendChild(tr);
  });
}

function renderSummary(rows) {
  const openRows = rows.filter((row) => row.remaining > 0);
  const totalOutstanding = sum(openRows, "currentPrincipal");
  const totalEmi = openRows.reduce((total, row) => total + row.loan.emi, 0);
  const monthlyInterest = sum(openRows, "monthlyInterest");
  const totalSaving = sum(openRows, "interestSaved");

  els.totalOutstanding.textContent = money.format(totalOutstanding);
  els.totalEmi.textContent = money.format(totalEmi);
  els.monthlyInterest.textContent = money.format(monthlyInterest);
  els.totalSaving.textContent = money.format(totalSaving);
}

function renderInsights(rows) {
  const openRows = rows.filter((row) => row.remaining > 0);
  const highestInterest = maxBy(openRows, (row) => row.monthlyInterest);
  const bestSaving = maxBy(openRows, (row) => row.interestSaved);
  const closingSoon = openRows.filter((row) => row.remaining <= 12).sort((a, b) => a.remaining - b.remaining);

  els.focusInsight.textContent = highestInterest
    ? `${highestInterest.loan.loanType} is currently consuming the most interest at ${money.format(highestInterest.monthlyInterest)} per month.`
    : "All loans are closed for the selected date.";
  els.quickWinInsight.textContent = bestSaving && bestSaving.payment > 0
    ? `${bestSaving.loan.loanType} gives the highest saving for your entered payment: ${money.format(bestSaving.interestSaved)} and ${bestSaving.emisCut} EMI(s) reduced.`
    : "Enter part-payment amounts to compare EMI reduction and interest saving.";
  els.pressureInsight.textContent = closingSoon.length
    ? `${closingSoon.length} loan(s) are within 12 EMIs of closure. The nearest is ${closingSoon[0].loan.loanType}.`
    : "No loan is within the final 12 EMIs yet for the selected date.";
}

function projectPrincipal(loan, asOf) {
  let principal = loan.principal;
  const paid = countPaidDueDates(loan.emiDay, parseDate(BASELINE_DATE), asOf);
  const rate = monthlyRate(loan.annualRate);
  for (let i = 0; i < paid; i += 1) {
    const interest = principal * rate;
    principal = Math.max(0, principal + interest - loan.emi);
    if (principal === 0) break;
  }
  return principal;
}

function countPaidDueDates(emiDay, baseline, asOf) {
  if (asOf <= baseline) return 0;
  let count = 0;
  let cursor = new Date(baseline.getFullYear(), baseline.getMonth(), 1);
  const end = new Date(asOf.getFullYear(), asOf.getMonth(), 1);

  while (cursor <= end) {
    const due = new Date(cursor.getFullYear(), cursor.getMonth(), safeDay(emiDay, cursor));
    if (due > baseline && due <= asOf) count += 1;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return count;
}

function remainingEmis(principal, annualRate, emi) {
  if (principal <= 0) return 0;
  const rate = monthlyRate(annualRate);
  if (rate === 0) return Math.ceil(principal / emi);
  if (emi <= principal * rate) return Number.POSITIVE_INFINITY;
  return Math.ceil(-Math.log(1 - (rate * principal) / emi) / Math.log(1 + rate));
}

function totalInterestToClose(principal, annualRate, emi) {
  let balance = principal;
  let interestTotal = 0;
  const rate = monthlyRate(annualRate);
  let guard = 0;

  while (balance > 0 && guard < 600) {
    const interest = balance * rate;
    interestTotal += interest;
    balance = Math.max(0, balance + interest - emi);
    guard += 1;
  }
  return interestTotal;
}

function getFutureDueDate(fromDate, emiDay, remaining) {
  if (!remaining || remaining === Number.POSITIVE_INFINITY) return null;
  let found = 0;
  let cursor = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);

  while (found < remaining) {
    const due = new Date(cursor.getFullYear(), cursor.getMonth(), safeDay(emiDay, cursor));
    if (due > fromDate) found += 1;
    if (found === remaining) return due;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return null;
}

function safeDay(day, date) {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return Math.min(Math.max(1, Number(day) || 1), lastDay);
}

function monthlyRate(annualRate) {
  return (Number(annualRate) || 0) / 12 / 100;
}

function sorter(value) {
  const sorters = {
    interestDesc: (a, b) => b.monthlyInterest - a.monthlyInterest,
    savingDesc: (a, b) => b.interestSaved - a.interestSaved,
    closeAsc: (a, b) => (a.closeDate?.getTime() || Infinity) - (b.closeDate?.getTime() || Infinity),
    emiDesc: (a, b) => b.loan.emi - a.loan.emi,
    balanceDesc: (a, b) => b.currentPrincipal - a.currentPrincipal
  };
  return sorters[value] || sorters.interestDesc;
}

function getLoanId(loan, index) {
  return `${index}-${loan.account}`;
}

function parseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toNumber(value) {
  return Number(String(value).replace(/,/g, "")) || 0;
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + row[key], 0);
}

function maxBy(rows, getValue) {
  return rows.reduce((best, row) => (!best || getValue(row) > getValue(best) ? row : best), null);
}

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
