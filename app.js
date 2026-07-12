const symptoms = [
  "Fever",
  "Cough",
  "Cold",
  "Sore throat",
  "Headache",
  "Body ache",
  "Acidity",
  "Vomiting",
  "Loose motions",
  "Abdominal pain",
  "Dizziness",
  "Breathlessness",
  "Burning micturition",
  "Back pain",
  "Rash",
  "Fatigue",
];

const tests = ["CBC", "CRP", "ESR", "LFT", "KFT", "HbA1c", "TSH", "Urine routine", "Chest X-ray", "Dengue NS1"];

const medicineLibrary = [
  { name: "Azee 500 Tablet", meta: "Azithromycin 500 mg - oral", rank: "High match" },
  { name: "Dolo 650 Tablet", meta: "Paracetamol 650 mg - oral", rank: "Common" },
  { name: "Pan 40 Tablet", meta: "Pantoprazole 40 mg - oral", rank: "Common" },
  { name: "Montek LC Tablet", meta: "Montelukast + Levocetirizine - oral", rank: "Seasonal" },
  { name: "Augmentin 625 Duo Tablet", meta: "Amoxicillin + Clavulanate - oral", rank: "Guarded" },
  { name: "Budecort 0.5 Respules", meta: "Budesonide - inhalation", rank: "Route detected" },
  { name: "Deriphyllin Injection", meta: "Etofylline + Theophylline - injection", rank: "Route detected" },
  { name: "Ondem MD 4 Tablet", meta: "Ondansetron 4 mg - oral", rank: "Common" },
  { name: "Cetzine Tablet", meta: "Cetirizine 10 mg - oral", rank: "Common" },
  { name: "ORS Sachet", meta: "Oral rehydration salts", rank: "Supportive" },
];

const state = {
  symptoms: [],
  medicines: [],
  tests: [],
  activeMedicineId: null,
};

const els = {
  clock: document.querySelector("#clock"),
  symptomSearch: document.querySelector("#symptomSearch"),
  symptomChips: document.querySelector("#symptomChips"),
  selectedSymptoms: document.querySelector("#selectedSymptoms"),
  addSymptomButton: document.querySelector("#addSymptomButton"),
  findingsToggle: document.querySelector("#findingsToggle"),
  findingsBody: document.querySelector("#findingsBody"),
  medicineSearch: document.querySelector("#medicineSearch"),
  medicineDropdown: document.querySelector("#medicineDropdown"),
  addMedicineButton: document.querySelector("#addMedicineButton"),
  medicineRows: document.querySelector("#medicineRows"),
  emptyInspector: document.querySelector("#emptyInspector"),
  inspectorFields: document.querySelector("#inspectorFields"),
  selectedMedicineName: document.querySelector("#selectedMedicineName"),
  doseInput: document.querySelector("#doseInput"),
  frequencyInput: document.querySelector("#frequencyInput"),
  durationInput: document.querySelector("#durationInput"),
  medicineNotes: document.querySelector("#medicineNotes"),
  testChips: document.querySelector("#testChips"),
  selectedTests: document.querySelector("#selectedTests"),
  preview: document.querySelector("#preview"),
  toast: document.querySelector("#toast"),
};

const formFields = [
  "patientName",
  "patientAge",
  "patientGender",
  "patientPhone",
  "bp",
  "pulse",
  "temp",
  "spo2",
  "findingsNotes",
  "preferredLab",
].map((id) => document.querySelector(`#${id}`));

function updateClock() {
  els.clock.textContent = new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function createButton(className, text, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = text;
  button.addEventListener("click", onClick);
  return button;
}

function addSymptom(value) {
  const clean = value.trim();
  if (!clean || state.symptoms.some((item) => item.toLowerCase() === clean.toLowerCase())) return;
  state.symptoms.push(clean);
  els.symptomSearch.value = "";
  renderSymptoms();
  renderPreview();
}

function removeSymptom(value) {
  state.symptoms = state.symptoms.filter((item) => item !== value);
  renderSymptoms();
  renderPreview();
}

function renderSymptoms() {
  const query = els.symptomSearch.value.trim().toLowerCase();
  const filtered = symptoms.filter((item) => item.toLowerCase().includes(query)).slice(0, 10);

  els.symptomChips.replaceChildren(
    ...filtered.map((item) => createButton("chip", item, () => addSymptom(item)))
  );

  els.selectedSymptoms.replaceChildren(
    ...state.symptoms.map((item) => {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = item;
      const remove = createButton("", "x", () => removeSymptom(item));
      tag.append(remove);
      return tag;
    })
  );
}

function getMedicineMatches() {
  const query = els.medicineSearch.value.trim().toLowerCase();
  const matches = medicineLibrary
    .filter((med) => !query || med.name.toLowerCase().includes(query) || med.meta.toLowerCase().includes(query))
    .slice(0, 8);
  return matches;
}

function renderMedicineDropdown() {
  const matches = getMedicineMatches();
  els.medicineDropdown.hidden = matches.length === 0 || document.activeElement !== els.medicineSearch;
  els.medicineDropdown.replaceChildren(
    ...matches.map((med, index) => {
      const option = createButton(`medicine-option${index === 0 ? " active" : ""}`, "", () => addMedicine(med));
      option.innerHTML = `<span><strong>${med.name}</strong><small>${med.meta}</small></span><small>${med.rank}</small>`;
      return option;
    })
  );
}

function addMedicine(med) {
  const source = med || getMedicineMatches()[0];
  if (!source) return;
  const existing = state.medicines.find((item) => item.name === source.name);
  if (existing) {
    state.activeMedicineId = existing.id;
  } else {
    const medicine = {
      id: createId(),
      name: source.name,
      meta: source.meta,
      dose: source.name.includes("Respules") ? "1 respule" : "1 tab",
      frequency: "BD",
      duration: "5 days",
      notes: "After food",
    };
    state.medicines.push(medicine);
    state.activeMedicineId = medicine.id;
  }
  els.medicineSearch.value = "";
  els.medicineDropdown.hidden = true;
  renderMedicines();
  renderInspector();
  renderPreview();
}

function removeMedicine(id) {
  state.medicines = state.medicines.filter((medicine) => medicine.id !== id);
  if (state.activeMedicineId === id) state.activeMedicineId = state.medicines[0]?.id || null;
  renderMedicines();
  renderInspector();
  renderPreview();
}

function createId() {
  if (crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `med-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function activeMedicine() {
  return state.medicines.find((medicine) => medicine.id === state.activeMedicineId);
}

function renderMedicines() {
  if (!state.medicines.length) {
    const empty = document.createElement("div");
    empty.className = "medicine-row";
    empty.innerHTML = `<span class="medicine-name"><strong>No medicines added</strong><small>Search suggestions above and press Enter</small></span><span></span><span></span><span></span><span></span>`;
    els.medicineRows.replaceChildren(empty);
    return;
  }

  els.medicineRows.replaceChildren(
    ...state.medicines.map((medicine) => {
      const row = document.createElement("div");
      row.tabIndex = 0;
      row.role = "button";
      row.className = `medicine-row${medicine.id === state.activeMedicineId ? " active" : ""}`;
      row.innerHTML = `
        <span class="medicine-name"><strong>${medicine.name}</strong><small>${medicine.meta}</small></span>
        <span>${medicine.dose || "-"}</span>
        <span>${medicine.frequency || "-"}</span>
        <span>${medicine.duration || "-"}</span>
      `;
      row.addEventListener("click", () => {
        state.activeMedicineId = medicine.id;
        renderMedicines();
        renderInspector();
      });
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          state.activeMedicineId = medicine.id;
          renderMedicines();
          renderInspector();
        }
      });
      const remove = createButton("remove-row", "x", (event) => {
        event.stopPropagation();
        removeMedicine(medicine.id);
      });
      row.append(remove);
      return row;
    })
  );
}

function renderInspector() {
  const medicine = activeMedicine();
  els.emptyInspector.hidden = Boolean(medicine);
  els.inspectorFields.hidden = !medicine;
  if (!medicine) return;

  els.selectedMedicineName.textContent = medicine.name;
  els.doseInput.value = medicine.dose;
  els.frequencyInput.value = medicine.frequency;
  els.durationInput.value = medicine.duration;
  els.medicineNotes.value = medicine.notes;
}

function updateActiveMedicine(field, value) {
  const medicine = activeMedicine();
  if (!medicine) return;
  medicine[field] = value;
  renderMedicines();
  renderPreview();
}

function toggleTest(value) {
  if (state.tests.includes(value)) {
    state.tests = state.tests.filter((item) => item !== value);
  } else {
    state.tests.push(value);
  }
  renderTests();
  renderPreview();
}

function renderTests() {
  els.testChips.replaceChildren(
    ...tests.map((item) => createButton(`chip${state.tests.includes(item) ? " active" : ""}`, item, () => toggleTest(item)))
  );

  els.selectedTests.replaceChildren(
    ...state.tests.map((item) => {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = item;
      tag.append(createButton("", "x", () => toggleTest(item)));
      return tag;
    })
  );
}

function fieldValue(id, fallback = "-") {
  const value = document.querySelector(`#${id}`).value.trim();
  return value || fallback;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderPreview() {
  const patientLine = [fieldValue("patientName", "Unnamed patient"), fieldValue("patientAge"), fieldValue("patientGender")]
    .filter((item) => item !== "-")
    .join(" - ");
  const vitals = [
    fieldValue("bp") !== "-" ? `BP ${fieldValue("bp")}` : "",
    fieldValue("pulse") !== "-" ? `Pulse ${fieldValue("pulse")}` : "",
    fieldValue("temp") !== "-" ? `Temp ${fieldValue("temp")}` : "",
    fieldValue("spo2") !== "-" ? `SpO2 ${fieldValue("spo2")}` : "",
  ].filter(Boolean);

  els.preview.innerHTML = `
    <h3>AREN Clinic</h3>
    <p>${escapeHtml(patientLine || "Patient details pending")}</p>
    <p>Phone: ${escapeHtml(fieldValue("patientPhone"))}</p>
    <div class="preview-block">
      <strong>Symptoms</strong>
      <p>${escapeHtml(state.symptoms.join(", ") || "Not added")}</p>
    </div>
    <div class="preview-block">
      <strong>Findings</strong>
      <p>${escapeHtml(vitals.join(" - ") || "Vitals not added")}</p>
      <p>${escapeHtml(fieldValue("findingsNotes", "No clinical notes"))}</p>
    </div>
    <div class="preview-block">
      <strong>Rx</strong>
      <ol>
        ${
          state.medicines.length
            ? state.medicines
                .map(
                  (medicine) =>
                    `<li>${escapeHtml(medicine.name)} - ${escapeHtml(medicine.dose)}, ${escapeHtml(medicine.frequency)}, ${escapeHtml(
                      medicine.duration
                    )}. ${escapeHtml(medicine.notes)}</li>`
                )
                .join("")
            : "<li>No medicines added</li>"
        }
      </ol>
    </div>
    <div class="preview-block">
      <strong>Tests</strong>
      <p>${escapeHtml(state.tests.join(", ") || "No tests selected")}</p>
      <p>Preferred lab: ${escapeHtml(fieldValue("preferredLab", "No preference"))}</p>
    </div>
  `;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  window.setTimeout(() => {
    els.toast.hidden = true;
  }, 2200);
}

function wireEvents() {
  els.symptomSearch.addEventListener("input", renderSymptoms);
  els.symptomSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addSymptom(els.symptomSearch.value || symptoms[0]);
    }
  });
  els.addSymptomButton.addEventListener("click", () => addSymptom(els.symptomSearch.value));

  els.findingsToggle.addEventListener("click", () => {
    const open = els.findingsBody.hidden;
    els.findingsBody.hidden = !open;
    els.findingsToggle.setAttribute("aria-expanded", String(open));
    els.findingsToggle.querySelector(".toggle-text").textContent = open ? "Close notes" : "Open notes";
  });

  els.medicineSearch.addEventListener("input", renderMedicineDropdown);
  els.medicineSearch.addEventListener("focus", renderMedicineDropdown);
  els.medicineSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addMedicine();
    }
    if (event.key === "Escape") els.medicineDropdown.hidden = true;
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".medicine-search")) els.medicineDropdown.hidden = true;
  });
  els.addMedicineButton.addEventListener("click", () => addMedicine());

  els.doseInput.addEventListener("input", (event) => updateActiveMedicine("dose", event.target.value));
  els.frequencyInput.addEventListener("change", (event) => updateActiveMedicine("frequency", event.target.value));
  els.durationInput.addEventListener("input", (event) => updateActiveMedicine("duration", event.target.value));
  els.medicineNotes.addEventListener("input", (event) => updateActiveMedicine("notes", event.target.value));

  formFields.forEach((field) => {
    field.addEventListener("input", renderPreview);
    field.addEventListener("change", renderPreview);
  });

  document.querySelector("#printButton").addEventListener("click", () => window.print());
  document.querySelector("#whatsappButton").addEventListener("click", () => showToast("WhatsApp prescription link prepared for the patient."));
  document.querySelector("#completeButton").addEventListener("click", () => showToast("Consult saved and marked complete."));
}

updateClock();
window.setInterval(updateClock, 30000);
wireEvents();
renderSymptoms();
renderTests();
renderMedicines();
renderInspector();
renderPreview();
