

const systemsGrid = document.getElementById("systemsGrid");
const systemCount = document.getElementById("systemCount");
const modal = document.getElementById("systemModal");
const nameInput = document.getElementById("systemNameInput");
const descriptionInput = document.getElementById("systemDescriptionInput");
const saveBtn = document.getElementById("saveSystemBtn");
const modalTitle = document.getElementById("systemModalTitle");
const importFile = document.getElementById("importFile");
const toast = document.getElementById("toast");

let editingId = null;
let systems = [];
let teams = [];
let years = [];
let divisions = [];

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2500);
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function load() {
  [systems, teams, years, divisions] = await Promise.all([
    getAll("systems"),
    getAll("teams"),
    getAll("years"),
    getAll("divisions")
  ]);
  render();
}

function render() {
  systems.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  systemCount.textContent = `${systems.length} sistema${systems.length === 1 ? "" : "s"}`;

  if (!systems.length) {
    systemsGrid.innerHTML = `
      <div class="empty-systems">
        <strong>Nenhum sistema criado ainda.</strong><br>
        Clique em “Criar sistema” para começar.
      </div>`;
    return;
  }

  systemsGrid.innerHTML = systems.map(system => {
    const teamCount = teams.filter(t => t.systemId === system.id).length;
    const yearList = years.filter(y => y.systemId === system.id).map(y => y.year).sort((a,b)=>a-b);
    const divisionCount = divisions.filter(d => d.systemId === system.id).length;
    const range = yearList.length ? `${yearList[0]}–${yearList[yearList.length - 1]}` : "—";

    return `
      <article class="system-card">
        <div class="system-card-top">
          <div class="system-icon">⚽</div>
        </div>
        <h3>${escapeHTML(system.name)}</h3>
        <p class="description">${escapeHTML(system.description || "Sem descrição.")}</p>
        <div class="system-stats">
          <div class="system-stat"><strong>${teamCount}</strong><span>EQUIPES</span></div>
          <div class="system-stat"><strong>${divisionCount}</strong><span>DIVISÕES</span></div>
          <div class="system-stat"><strong>${range}</strong><span>ANOS</span></div>
        </div>
        <div class="system-actions">
          <button class="open-system" data-open="${system.id}">Abrir</button>
          <button class="edit-system" data-edit="${system.id}">Editar</button>
          <button class="delete-system" data-delete="${system.id}">Excluir</button>
        </div>
      </article>`;
  }).join("");

  systemsGrid.querySelectorAll("[data-open]").forEach(btn => {
    btn.addEventListener("click", () => {
      location.href = `system.html?id=${encodeURIComponent(btn.dataset.open)}`;
    });
  });

  systemsGrid.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", () => openModal(btn.dataset.edit));
  });

  systemsGrid.querySelectorAll("[data-delete]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const system = systems.find(s => s.id === btn.dataset.delete);
      if (!system) return;
      if (!confirm(`Excluir "${system.name}" e todos os dados dele? Esta ação não pode ser desfeita.`)) return;
      await deleteSystem(system.id);
      showToast("Sistema excluído.");
      await load();
    });
  });
}

function openModal(id = null) {
  editingId = id;
  const system = systems.find(s => s.id === id);

  modalTitle.textContent = system ? "Editar sistema" : "Novo sistema";
  saveBtn.textContent = system ? "Salvar alterações" : "Criar";
  nameInput.value = system?.name || "";
  descriptionInput.value = system?.description || "";
  modal.classList.remove("hidden");
  nameInput.focus();
}

function closeModal() {
  modal.classList.add("hidden");
  editingId = null;
  nameInput.value = "";
  descriptionInput.value = "";
}

document.getElementById("newSystemBtn").addEventListener("click", () => openModal());
document.getElementById("heroNewSystemBtn").addEventListener("click", () => openModal());
document.getElementById("closeSystemModal").addEventListener("click", closeModal);
document.getElementById("cancelSystemBtn").addEventListener("click", closeModal);

modal.addEventListener("click", e => {
  if (e.target === modal) closeModal();
});

saveBtn.addEventListener("click", async () => {
  const name = nameInput.value.trim();
  if (!name) {
    alert("Digite um nome para o sistema.");
    return;
  }

  if (editingId) {
    const system = systems.find(s => s.id === editingId);
    system.name = name;
    system.description = descriptionInput.value.trim();
    system.updatedAt = new Date().toISOString();
    await put("systems", system);
    showToast("Sistema atualizado.");
  } else {
    await createSystem(name, descriptionInput.value);
    showToast("Sistema criado.");
  }

  closeModal();
  await load();
});

document.getElementById("exportBtn").addEventListener("click", async () => {
  const backup = await exportAllData();
  downloadJSON(backup, `football-tables-backup-${dateStamp()}.json`);
  showToast("Backup exportado.");
});

document.getElementById("importBtn").addEventListener("click", () => importFile.click());

importFile.addEventListener("change", async () => {
  const file = importFile.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const backup = JSON.parse(text);

    if (!confirm("Importar este backup? Registros com os mesmos IDs serão substituídos.")) {
      importFile.value = "";
      return;
    }

    await importBackup(backup);
    showToast("Backup importado.");
    await load();
  } catch (error) {
    console.error(error);
    alert(`Não foi possível importar o backup: ${error.message}`);
  } finally {
    importFile.value = "";
  }
});

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

load().catch(error => {
  console.error(error);
  alert("Não foi possível abrir o banco de dados do navegador. Verifique se o navegador permite IndexedDB para este arquivo ou abra o projeto por um servidor local.");
});
