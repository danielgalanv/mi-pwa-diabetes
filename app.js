const tabs = document.querySelectorAll(".tab");
const contents = document.querySelectorAll(".tab-content");

const warning = document.getElementById("warning");
const result = document.getElementById("result");

const calculateBtn = document.getElementById("calculateBtn");
const saveProfileBtn = document.getElementById("saveProfileBtn");
const profileSaved = document.getElementById("profileSaved");

const STORAGE_KEY = "fiasp_user_profile";

function getProfile() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
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
}

function initializeApp() {
  loadProfileIntoForm();

  const profile = getProfile();

  if (!isProfileComplete(profile)) {
    warning.classList.remove("hidden");
    openTab("perfil");
  } else {
    warning.classList.add("hidden");
    openTab("calculo");
  }
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
    maxDose: Number(document.getElementById("profileMaxDose").value) || null
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

initializeApp();