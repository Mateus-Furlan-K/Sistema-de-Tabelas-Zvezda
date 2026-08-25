const DB_NAME = "FootballTablesDB";
const DB_VERSION = 2;

let dbPromise;

function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains("systems")) {
        const store = db.createObjectStore("systems", { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }

      if (!db.objectStoreNames.contains("teams")) {
        const store = db.createObjectStore("teams", { keyPath: "id" });
        store.createIndex("systemId", "systemId");
      }

      if (!db.objectStoreNames.contains("years")) {
        const store = db.createObjectStore("years", { keyPath: "id" });
        store.createIndex("systemId", "systemId");
      }

      if (!db.objectStoreNames.contains("divisions")) {
        const store = db.createObjectStore("divisions", { keyPath: "id" });
        store.createIndex("systemId", "systemId");
      }

      if (!db.objectStoreNames.contains("appearances")) {
        const store = db.createObjectStore("appearances", { keyPath: "id" });
        store.createIndex("systemId", "systemId");
        store.createIndex("teamId", "teamId");
        store.createIndex("yearId", "yearId");
        store.createIndex("divisionId", "divisionId");
      }

      if (!db.objectStoreNames.contains("groups")) {
        const store = db.createObjectStore("groups", { keyPath: "id" });
        store.createIndex("systemId", "systemId");
        store.createIndex("yearId", "yearId");
        store.createIndex("divisionId", "divisionId");
      }

      if (!db.objectStoreNames.contains("knockouts")) {
        const store = db.createObjectStore("knockouts", { keyPath: "id" });
        store.createIndex("systemId", "systemId");
        store.createIndex("yearId", "yearId");
        store.createIndex("divisionId", "divisionId");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function id(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function transaction(storeNames, mode, callback) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    let result;
    try {
      result = callback(tx);
    } catch (e) {
      reject(e);
      return;
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Transação cancelada."));
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAll(storeName) {
  const db = await openDB();
  const tx = db.transaction(storeName, "readonly");
  return requestToPromise(tx.objectStore(storeName).getAll());
}

async function get(storeName, key) {
  const db = await openDB();
  const tx = db.transaction(storeName, "readonly");
  return requestToPromise(tx.objectStore(storeName).get(key));
}

async function put(storeName, value) {
  const db = await openDB();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).put(value);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
  });
}

async function remove(storeName, key) {
  const db = await openDB();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).delete(key);
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getByIndex(storeName, indexName, value) {
  const db = await openDB();
  const tx = db.transaction(storeName, "readonly");
  const request = tx.objectStore(storeName).index(indexName).getAll(value);
  return requestToPromise(request);
}

async function createSystem(name, description = "") {
  const system = {
    id: id("system"),
    name: name.trim(),
    description: description.trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await put("systems", system);

  const initialYear = new Date().getFullYear();
  await put("years", {
    id: id("year"),
    systemId: system.id,
    year: initialYear,
    createdAt: new Date().toISOString()
  });

  await put("divisions", {
    id: id("division"),
    systemId: system.id,
    name: "1ª Divisão",
    position: 1
  });

  return system;
}

async function touchSystem(systemId) {
  const system = await get("systems", systemId);
  if (!system) return;
  system.updatedAt = new Date().toISOString();
  await put("systems", system);
}

async function deleteSystem(systemId) {
  const [teams, years, divisions, appearances, groups, knockouts] = await Promise.all([
    getByIndex("teams", "systemId", systemId),
    getByIndex("years", "systemId", systemId),
    getByIndex("divisions", "systemId", systemId),
    getByIndex("appearances", "systemId", systemId),
    getByIndex("groups", "systemId", systemId),
    getByIndex("knockouts", "systemId", systemId)
  ]);

  const db = await openDB();

  await new Promise((resolve, reject) => {
    const tx = db.transaction(
      ["systems", "teams", "years", "divisions", "appearances", "groups", "knockouts"],
      "readwrite"
    );

    tx.objectStore("systems").delete(systemId);
    teams.forEach(x => tx.objectStore("teams").delete(x.id));
    years.forEach(x => tx.objectStore("years").delete(x.id));
    divisions.forEach(x => tx.objectStore("divisions").delete(x.id));
    appearances.forEach(x => tx.objectStore("appearances").delete(x.id));
    groups.forEach(x => tx.objectStore("groups").delete(x.id));
    knockouts.forEach(x => tx.objectStore("knockouts").delete(x.id));

    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function exportAllData() {
  const [systems, teams, years, divisions, appearances, groups, knockouts] = await Promise.all([
    getAll("systems"),
    getAll("teams"),
    getAll("years"),
    getAll("divisions"),
    getAll("appearances"),
    getAll("groups"),
    getAll("knockouts")
  ]);

  return {
    format: "football-tables-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { systems, teams, years, divisions, appearances, groups, knockouts }
  };
}

async function exportSystemData(systemId) {
  const system = await get("systems", systemId);
  if (!system) throw new Error("Sistema não encontrado.");

  const [teams, years, divisions, appearances, groups, knockouts] = await Promise.all([
    getByIndex("teams", "systemId", systemId),
    getByIndex("years", "systemId", systemId),
    getByIndex("divisions", "systemId", systemId),
    getByIndex("appearances", "systemId", systemId),
    getByIndex("groups", "systemId", systemId),
    getByIndex("knockouts", "systemId", systemId)
  ]);

  return {
    format: "football-tables-system-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { systems: [system], teams, years, divisions, appearances, groups, knockouts }
  };
}

async function importBackup(payload) {
  if (!payload || !payload.data || !payload.format) {
    throw new Error("Arquivo de backup inválido.");
  }

  const allowed = [
    "football-tables-backup",
    "football-tables-system-backup"
  ];

  if (!allowed.includes(payload.format)) {
    throw new Error("Formato de backup não reconhecido.");
  }

  const data = payload.data;
  const db = await openDB();

  await new Promise((resolve, reject) => {
    const tx = db.transaction(
      ["systems", "teams", "years", "divisions", "appearances", "groups", "knockouts"],
      "readwrite"
    );

    (data.systems || []).forEach(x => tx.objectStore("systems").put(x));
    (data.teams || []).forEach(x => tx.objectStore("teams").put(x));
    (data.years || []).forEach(x => tx.objectStore("years").put(x));
    (data.divisions || []).forEach(x => tx.objectStore("divisions").put(x));
    (data.appearances || []).forEach(x => tx.objectStore("appearances").put(x));
    (data.groups || []).forEach(x => tx.objectStore("groups").put(x));
    (data.knockouts || []).forEach(x => tx.objectStore("knockouts").put(x));

    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

