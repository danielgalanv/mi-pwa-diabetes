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

  const mealBolus = carbs / profile.icr;
  const correctionBolus = (glucose - profile.target) / profile.isf;

  let totalDose = mealBolus + correctionBolus - iob;

  if (totalDose < 0) {
    totalDose = 0;
  }

  const roundedDose = roundToStep(totalDose, profile.step || 0.5);

  const exceedsMax =
    profile.maxDose && roundedDose > Number(profile.maxDose);

  result.classList.remove("hidden");

  result.innerHTML = `
    <p>Dosis estimada:</p>
    <strong>${roundedDose.toFixed(1)} U</strong>

    <hr>

    <p><b>Bolo comida:</b> ${mealBolus.toFixed(2)} U</p>
    <p><b>Bolo corrección:</b> ${correctionBolus.toFixed(2)} U</p>
    <p><b>Insulina activa restada:</b> ${iob.toFixed(2)} U</p>

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
  const res = await fetch(`${NIGHTSCOUT_URL}/api/v1/entries.json?count=1`);

  if (!res.ok) {
    throw new Error(`Error ${res.status}`);
  }

  const data = await res.json();

  if (!data.length) {
    throw new Error("Sin datos");
  }

  return data[0];
}

async function updateNightscout() {
  try {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "Actualizando...";

    const entry = await fetchNightscout();

    const glucose = entry.sgv;
    const trend = entry.direction;

    const glucoseInput = document.getElementById("glucose");

    // Solo rellena si está vacío
    if (!glucoseInput.value) {
      glucoseInput.value = glucose;
    }

    nsGlucose.textContent = glucose;
    nsTrend.textContent = TREND_MAP[trend] || "?";
    nsUpdated.textContent = `Actualizado ${formatTime(entry.date)}`;

    nsGlucose.className = getColorClass(glucose);
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