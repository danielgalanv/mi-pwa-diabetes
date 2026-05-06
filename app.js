const tabs = document.querySelectorAll(".tab");
const contents = document.querySelectorAll(".tab-content");

const warning = document.getElementById("warning");
const result = document.getElementById("result");

const calculateBtn = document.getElementById("calculateBtn");
const saveProfileBtn = document.getElementById("saveProfileBtn");
const profileSaved = document.getElementById("profileSaved");

const STORAGE_KEY = "fiasp_user_profile";
const PARAMS_STORAGE_KEY = "fiasp_icr_isf_params";
const BOLUS_STORAGE_KEY = "fiasp_bolus_history";

function getProfile() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;

    const parsed = JSON.parse(data);

    // Validación mínima
    if (
      typeof parsed.icr !== "number" ||
      typeof parsed.isf !== "number" ||
      typeof parsed.target !== "number"
    ) {
      return null;
    }

    return parsed;
  } catch (e) {
    console.error("Error leyendo perfil:", e);
    return null;
  }
}

function saveProfile(profile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

function isProfileComplete(profile) {
  return (
    Number(profile.icr) > 0 &&
    Number(profile.isf) > 0 &&
    Number(profile.target) > 0
  );
}

function openTab(tabName) {
  tabs.forEach(tab => {
    tab.classList.toggle("active", tab.dataset.tab === tabName);
  });

  contents.forEach(content => {
    content.classList.toggle("active", content.id === tabName);
  });
}

function roundToStep(value, step) {
  return Math.round(value / step) * step;
}

function loadProfileIntoForm() {
  const profile = getProfile();

  document.getElementById("profileName").value = profile.name || "";
  document.getElementById("profileICR").value = profile.icr || "";
  document.getElementById("profileISF").value = profile.isf || "";
  document.getElementById("profileTarget").value = profile.target || "";
  document.getElementById("profileStep").value = profile.step || "0.5";
  document.getElementById("profileMaxDose").value = profile.maxDose || "";
  document.getElementById("insulinDuration").value = profile.insulinDuration || "4";
}

function initializeApp() {
  const profile = getProfile();

  if (!profile) {
    warning.classList.remove("hidden");
    openTab("perfil");
    return;
  }

  loadProfileIntoForm();
  loadParamsIntoForm();
  updateIOBDisplay();
  warning.classList.add("hidden");
  openTab("calculo");
}

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    openTab(tab.dataset.tab);
  });
});

saveProfileBtn.addEventListener("click", () => {
  const profile = {
    name: document.getElementById("profileName").value.trim(),
    icr: Number(document.getElementById("profileICR").value),
    isf: Number(document.getElementById("profileISF").value),
    target: Number(document.getElementById("profileTarget").value),
    step: Number(document.getElementById("profileStep").value),
    maxDose: Number(document.getElementById("profileMaxDose").value) || null,
    insulinDuration: Number(document.getElementById("insulinDuration")?.value) || 4
    
  };

  if (!isProfileComplete(profile)) {
    alert("Debes introducir ICR, ISF y glucosa objetivo válidos.");
    return;
  }

  saveProfile(profile);

  profileSaved.classList.remove("hidden");
  warning.classList.add("hidden");

  setTimeout(() => {
    profileSaved.classList.add("hidden");
    openTab("calculo");
  }, 800);
});

calculateBtn.addEventListener("click", () => {
  const profile = getProfile();

  if (!isProfileComplete(profile)) {
    warning.classList.remove("hidden");
    openTab("perfil");
    return;
  }

  const glucose = Number(document.getElementById("glucose").value);
  const carbs = Number(document.getElementById("carbs").value);
  const iob = Number(document.getElementById("iob").value) || 0;

  if (glucose <= 0 || carbs < 0 || Number.isNaN(carbs)) {
    alert("Introduce glucosa actual y carbohidratos válidos.");
    return;
  }

  const useTrendAdjustment =
  document.getElementById("useTrendAdjustment")?.checked;

  const trendHorizon =
    Number(document.getElementById("trendHorizon")?.value) || 30;

  const mealBolus = carbs / profile.icr;

  let correctionGlucose = glucose;
  let trendAdjustmentUnits = 0;
  let trendMessage = "";

  if (useTrendAdjustment && latestTrendInfo && latestTrendInfo.valid) {
    const predictedGlucose = predictGlucoseFromTrend(
      glucose,
      latestTrendInfo.rate,
      trendHorizon
    );

    const rawTrendAdjustment =
      (predictedGlucose - glucose) / profile.isf;

    trendAdjustmentUnits = Math.max(
      -MAX_TREND_ADJUSTMENT_UNITS,
      Math.min(MAX_TREND_ADJUSTMENT_UNITS, rawTrendAdjustment)
    );

    correctionGlucose = glucose + trendAdjustmentUnits * profile.isf;

    trendMessage = `
      <p><b>Tendencia usada:</b> ${getTrendText(latestTrendInfo.rate)}
      (${latestTrendInfo.rate.toFixed(2)} mg/dL/min)</p>
      <p><b>Glucosa prevista a ${trendHorizon} min:</b>
      ${Math.round(predictedGlucose)} mg/dL</p>
      <p><b>Ajuste por tendencia aplicado:</b>
      ${trendAdjustmentUnits.toFixed(2)} U</p>
    `;
  } else if (useTrendAdjustment && latestTrendInfo && !latestTrendInfo.valid) {
    trendMessage = `
      <p class="note">
        No se ha usado la tendencia: ${latestTrendInfo.reason}
      </p>
    `;
  }

  const correctionBolus =
    (correctionGlucose - profile.target) / profile.isf;

  let totalDose = mealBolus + correctionBolus - iob;

  if (totalDose < 0) {
    totalDose = 0;
  }

  const roundedDose = roundToStep(totalDose, profile.step || 0.5);

  const exceedsMax =
    profile.maxDose && roundedDose > Number(profile.maxDose);

  result.classList.remove("hidden");

  const insulinEffectAt1hFraction = 0.45;
  const carbEffectAt1hFraction = 0.55;

  const insulinDropAt1h =
    roundedDose * profile.isf * insulinEffectAt1hFraction;

  const carbRiseAt1h =
    carbs > 0 ? (carbs / profile.icr) * profile.isf * carbEffectAt1hFraction : 0;

  const trendEffectAt1h =
    latestTrendInfo && latestTrendInfo.valid
      ? latestTrendInfo.rate * 60
      : 0;

  const estimatedGlucose1h =
    glucose + carbRiseAt1h + trendEffectAt1h - insulinDropAt1h;

  result.innerHTML = `
    <p>Dosis estimada:</p>
    <strong>${roundedDose.toFixed(1)} U</strong>

    <hr>

    <p><b>Bolo comida:</b> ${mealBolus.toFixed(2)} U</p>
    <p><b>Bolo corrección:</b> ${correctionBolus.toFixed(2)} U</p>
    <p><b>Insulina activa restada:</b> ${iob.toFixed(2)} U</p>

    ${trendMessage}

    <hr>

    <p><b>Estimación de glucosa a 1 hora:</b></p>
    <strong>${Math.round(estimatedGlucose1h)} mg/dL</strong>

    <p class="note">
      Esta predicción combina tendencia reciente, absorción parcial de carbohidratos
      y efecto parcial estimado de Fiasp. Úsala solo como referencia.
    </p>

    ${
      exceedsMax
        ? `<p class="note"><b>Atención:</b> la dosis supera la dosis máxima configurada en el perfil.</p>`
        : ""
    }

    <p class="note">
      Resultado orientativo. Usa siempre los parámetros indicados por el equipo sanitario.
    </p>
  `;
});


/* =========================
   NIGHTSCOUT INTEGRACIÓN
========================= */

const NIGHTSCOUT_URL = "https://nightscout.intelligentcontrol.net";

const NIGHTSCOUT_HISTORY_COUNT = 36; // unas 3 horas si hay dato cada 5 min
const NIGHTSCOUT_MAX_AGE_MINUTES = 30;
const MAX_TREND_ADJUSTMENT_UNITS = 1.5;

let latestNightscoutEntries = [];
let latestTrendInfo = null;

const nsGlucose = document.getElementById("nsGlucose");
const nsTrend = document.getElementById("nsTrend");
const nsUpdated = document.getElementById("nsUpdated");
const refreshBtn = document.getElementById("refreshNightscoutBtn");

const TREND_MAP = {
  DoubleUp: "↑↑",
  SingleUp: "↑",
  FortyFiveUp: "↗",
  Flat: "→",
  FortyFiveDown: "↘",
  SingleDown: "↓",
  DoubleDown: "↓↓",
  "NOT COMPUTABLE": "?",
  "RATE OUT OF RANGE": "?"
};

function getColorClass(glucose) {
  if (!glucose) return "ns-unknown";

  if (glucose < 70 || glucose > 180) return "ns-danger";
  if (glucose < 80 || glucose > 140) return "ns-warning";

  return "ns-ok";
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit"
  });
}


function getSavedParams() {
  return JSON.parse(localStorage.getItem(PARAMS_STORAGE_KEY)) || {};
}

function saveParams(params) {
  localStorage.setItem(PARAMS_STORAGE_KEY, JSON.stringify(params));
}

function loadParamsIntoForm() {
  const params = getSavedParams();

  document.getElementById("dailyBasal").value = params.dailyBasal || "";
  document.getElementById("breakfastBolus").value = params.breakfastBolus || "";
  document.getElementById("lunchBolus").value = params.lunchBolus || "";
  document.getElementById("dinnerBolus").value = params.dinnerBolus || "";
  document.getElementById("otherBolus").value = params.otherBolus || "";

  if (params.tdd && params.icr && params.isf) {
    showParamsResult(params);
  }
}

function showParamsResult(params) {
  const paramsResult = document.getElementById("paramsResult");
  const useParamsBtn = document.getElementById("useParamsBtn");

  paramsResult.classList.remove("hidden");
  useParamsBtn.classList.remove("hidden");

  paramsResult.innerHTML = `
    <p><b>Dosis total diaria estimada:</b> ${params.tdd.toFixed(1)} U</p>
    <p><b>ICR estimado:</b> 1 U por cada ${params.icr.toFixed(1)} g de hidratos</p>
    <p><b>ISF estimado:</b> 1 U baja aproximadamente ${params.isf.toFixed(1)} mg/dL</p>

    <p class="note">
      Guarda estos valores en el perfil solo si tienen sentido para tu caso y han sido validados clínicamente.
    </p>
  `;
}


async function fetchNightscout() {
  const res = await fetch(
    `${NIGHTSCOUT_URL}/api/v1/entries.json?count=${NIGHTSCOUT_HISTORY_COUNT}`
  );

  if (!res.ok) {
    throw new Error(`Error ${res.status}`);
  }

  const data = await res.json();

  if (!data.length) {
    throw new Error("Sin datos");
  }

  return data;
}

function minutesBetweenDates(a, b) {
  return Math.abs(new Date(a) - new Date(b)) / (1000 * 60);
}

function getEntryGlucose(entry) {
  return Number(entry.sgv || entry.glucose);
}

function calculateTrendInfo(entries) {
  if (!entries || entries.length < 2) return null;

  const sorted = [...entries].sort((a, b) => a.date - b.date);
  const latest = sorted[sorted.length - 1];

  const latestTime = new Date(latest.date);
  const ageMinutes = (new Date() - latestTime) / (1000 * 60);

  if (ageMinutes > NIGHTSCOUT_MAX_AGE_MINUTES) {
    return {
      valid: false,
      reason: `Datos antiguos: ${Math.round(ageMinutes)} min desde la última lectura.`,
      ageMinutes
    };
  }

  const windowEntries = sorted.filter(entry => {
    return minutesBetweenDates(entry.date, latest.date) <= 30;
  });

  if (windowEntries.length < 2) {
    return {
      valid: false,
      reason: "No hay suficientes datos recientes para calcular tendencia.",
      ageMinutes
    };
  }

  const first = windowEntries[0];
  const last = windowEntries[windowEntries.length - 1];

  const glucoseDelta = getEntryGlucose(last) - getEntryGlucose(first);
  const minutesDelta = (last.date - first.date) / (1000 * 60);

  if (minutesDelta <= 0) {
    return null;
  }

  const rate = glucoseDelta / minutesDelta;

  return {
    valid: true,
    rate,
    ageMinutes,
    currentGlucose: getEntryGlucose(last),
    latestDate: last.date
  };
}

function predictGlucoseFromTrend(currentGlucose, trendRate, horizonMinutes) {
  return currentGlucose + trendRate * horizonMinutes;
}

function getTrendText(rate) {
  if (rate > 2) return "subida rápida";
  if (rate > 1) return "subiendo";
  if (rate < -2) return "bajada rápida";
  if (rate < -1) return "bajando";
  return "estable";
}

function updateTrendBox() {
  const trendBox = document.getElementById("trendBox");
  const horizonSelect = document.getElementById("trendHorizon");

  if (!trendBox || !latestTrendInfo) return;

  if (!latestTrendInfo.valid) {
    trendBox.classList.remove("hidden");
    trendBox.innerHTML = `
      <strong>Tendencia no usada</strong>
      <p>${latestTrendInfo.reason}</p>
    `;
    return;
  }

  const horizon = Number(horizonSelect?.value) || 30;
  const predicted = predictGlucoseFromTrend(
    latestTrendInfo.currentGlucose,
    latestTrendInfo.rate,
    horizon
  );

  trendBox.classList.remove("hidden");
  trendBox.innerHTML = `
    <strong>Tendencia Nightscout:</strong> ${getTrendText(latestTrendInfo.rate)}
    <p>Velocidad: ${latestTrendInfo.rate.toFixed(2)} mg/dL/min</p>
    <p>Predicción a ${horizon} min: <b>${Math.round(predicted)} mg/dL</b></p>
  `;
}

function drawNightscoutChart(entries) {
  const canvas = document.getElementById("nightscoutChart");
  if (!canvas || !entries || entries.length < 2) return;

  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const padding = 34;

  ctx.clearRect(0, 0, width, height);

  const sorted = [...entries].sort((a, b) => a.date - b.date);
  const values = sorted.map(getEntryGlucose);
  const minValue = Math.min(...values, 70) - 10;
  const maxValue = Math.max(...values, 180) + 10;

  const minTime = sorted[0].date;
  const maxTime = sorted[sorted.length - 1].date;

  function xFor(entry) {
    return padding + ((entry.date - minTime) / (maxTime - minTime)) * (width - padding * 2);
  }

  function yFor(value) {
    return height - padding - ((value - minValue) / (maxValue - minValue)) * (height - padding * 2);
  }

  ctx.lineWidth = 1;
  ctx.strokeStyle = "#d1d5db";

  [70, 180].forEach(limit => {
    const y = yFor(limit);
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();

    ctx.fillStyle = "#6b7280";
    ctx.fillText(`${limit}`, 6, y + 4);
  });

  ctx.lineWidth = 3;
  ctx.strokeStyle = "#087f8c";
  ctx.beginPath();

  sorted.forEach((entry, index) => {
    const x = xFor(entry);
    const y = yFor(getEntryGlucose(entry));

    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();

  const last = sorted[sorted.length - 1];
  ctx.fillStyle = "#087f8c";
  ctx.beginPath();
  ctx.arc(xFor(last), yFor(getEntryGlucose(last)), 5, 0, Math.PI * 2);
  ctx.fill();
}


async function updateNightscout() {
  try {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "Actualizando...";

    const entries = await fetchNightscout();

    latestNightscoutEntries = entries;
    latestTrendInfo = calculateTrendInfo(entries);

    const entry = entries[0];

    const glucose = entry.sgv;
    const trend = entry.direction;

    const glucoseInput = document.getElementById("glucose");
    if (glucoseInput && !glucoseInput.value) {
      glucoseInput.value = glucose;
    }

    nsGlucose.textContent = glucose;
    nsTrend.textContent = TREND_MAP[trend] || "?";
    nsUpdated.textContent = `Actualizado ${formatTime(entry.date)}`;

    nsGlucose.className = getColorClass(glucose);

    updateTrendBox();
    drawNightscoutChart(entries);

  } catch (e) {
    console.error(e);

    nsGlucose.textContent = "--";
    nsTrend.textContent = "!";
    nsUpdated.textContent = "Error al obtener datos";

    nsGlucose.className = "ns-unknown";
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "Actualizar datos";
  }
}

if (refreshBtn) {
  refreshBtn.addEventListener("click", updateNightscout);
  setInterval(updateNightscout, 60000);
  updateNightscout();
}

const calculateParamsBtn = document.getElementById("calculateParamsBtn");
const useParamsBtn = document.getElementById("useParamsBtn");

if (calculateParamsBtn) {
  calculateParamsBtn.addEventListener("click", () => {
    const dailyBasal = Number(document.getElementById("dailyBasal").value) || 0;
    const breakfastBolus = Number(document.getElementById("breakfastBolus").value) || 0;
    const lunchBolus = Number(document.getElementById("lunchBolus").value) || 0;
    const dinnerBolus = Number(document.getElementById("dinnerBolus").value) || 0;
    const otherBolus = Number(document.getElementById("otherBolus").value) || 0;

    const tdd =
      dailyBasal +
      breakfastBolus +
      lunchBolus +
      dinnerBolus +
      otherBolus;

    if (tdd <= 0) {
      alert("Introduce al menos una dosis diaria válida.");
      return;
    }

    const params = {
      dailyBasal,
      breakfastBolus,
      lunchBolus,
      dinnerBolus,
      otherBolus,
      tdd,
      icr: 500 / tdd,
      isf: 1800 / tdd
    };

    saveParams(params);
    showParamsResult(params);
  });
}

if (useParamsBtn) {
  useParamsBtn.addEventListener("click", () => {
    const params = getSavedParams();

    if (!params.icr || !params.isf) {
      alert("Primero calcula ICR e ISF.");
      return;
    }

    const profile = getProfile();

    const updatedProfile = {
      ...profile,
      icr: Number(params.icr.toFixed(1)),
      isf: Number(params.isf.toFixed(1))
    };

    saveProfile(updatedProfile);
    loadProfileIntoForm();

    alert("ICR e ISF copiados al perfil.");
    openTab("perfil");
  });
}

function getBoluses() {
  return JSON.parse(localStorage.getItem(BOLUS_STORAGE_KEY)) || [];
}

function saveBoluses(boluses) {
  localStorage.setItem(BOLUS_STORAGE_KEY, JSON.stringify(boluses));
}

function calculateBolusIOB(units, bolusTime, durationHours) {
  const now = new Date();
  const bolusDate = new Date(bolusTime);

  const elapsedMs = now - bolusDate;
  const elapsedHours = elapsedMs / (1000 * 60 * 60);

  if (elapsedHours < 0) return 0;
  if (elapsedHours >= durationHours) return 0;

  const remainingFraction = 1 - elapsedHours / durationHours;

  return units * remainingFraction;
}

function calculateTotalIOB() {
  const profile = getProfile();
  const durationHours = Number(profile.insulinDuration) || 4;
  const boluses = getBoluses();

  return boluses.reduce((total, bolus) => {
    return total + calculateBolusIOB(bolus.units, bolus.time, durationHours);
  }, 0);
}

function cleanExpiredBoluses() {
  const profile = getProfile();
  const durationHours = Number(profile.insulinDuration) || 4;

  const activeBoluses = getBoluses().filter(bolus => {
    return calculateBolusIOB(bolus.units, bolus.time, durationHours) > 0;
  });

  saveBoluses(activeBoluses);
}

function updateIOBDisplay() {
  cleanExpiredBoluses();

  const profile = getProfile();
  const durationHours = Number(profile.insulinDuration) || 4;
  const boluses = getBoluses();
  const totalIOB = calculateTotalIOB();

  const iobInput = document.getElementById("iob");
  const iobResult = document.getElementById("iobResult");
  const bolusList = document.getElementById("bolusList");

  if (iobInput) {
    iobInput.value = totalIOB.toFixed(1);
  }

  if (iobResult) {
    iobResult.classList.remove("hidden");
    iobResult.innerHTML = `
      <p>Insulina activa estimada:</p>
      <strong>${totalIOB.toFixed(1)} U</strong>
      <p class="note">Duración configurada: ${durationHours} horas.</p>
    `;
  }

  if (bolusList) {
    if (!boluses.length) {
      bolusList.innerHTML = `<p class="note">No hay bolos activos registrados.</p>`;
      return;
    }

    bolusList.innerHTML = boluses
      .map(bolus => {
        const remaining = calculateBolusIOB(bolus.units, bolus.time, durationHours);
        const date = new Date(bolus.time);

        return `
          <div class="bolus-item">
            <strong>${bolus.units.toFixed(1)} U</strong>
            <p>${date.toLocaleString("es-ES")}</p>
            <p>IOB restante: ${remaining.toFixed(1)} U</p>
          </div>
        `;
      })
      .join("");
  }
}

const addBolusBtn = document.getElementById("addBolusBtn");
const clearBolusesBtn = document.getElementById("clearBolusesBtn");
const openIobTabBtn = document.getElementById("openIobTabBtn");

if (addBolusBtn) {
  addBolusBtn.addEventListener("click", () => {
    const units = Number(document.getElementById("bolusUnits").value);
    const time = document.getElementById("bolusTime").value;
    const duration = Number(document.getElementById("insulinDuration").value) || 4;

    if (units <= 0 || !time) {
      alert("Introduce unidades y fecha/hora del bolo.");
      return;
    }

    const profile = getProfile();
    saveProfile({
      ...profile,
      insulinDuration: duration
    });

    const boluses = getBoluses();

    boluses.push({
      units,
      time
    });

    saveBoluses(boluses);

    document.getElementById("bolusUnits").value = "";
    document.getElementById("bolusTime").value = "";

    updateIOBDisplay();
  });
}

if (clearBolusesBtn) {
  clearBolusesBtn.addEventListener("click", () => {
    if (!confirm("¿Borrar todos los bolos registrados?")) return;

    saveBoluses([]);
    updateIOBDisplay();
  });
}

if (openIobTabBtn) {
  openIobTabBtn.addEventListener("click", () => {
    openTab("iob");
  });
}

setInterval(updateIOBDisplay, 60000);

initializeApp();