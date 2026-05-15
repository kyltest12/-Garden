const plants = [ //Растения
  {
    title: "Базилик",
    image: "Базилик",
    buyPrice: 2,
    harvestPrice: 5,
    timeToGrow: 3
  },
  {
    title: "Клубника",
    image: "Клубника",
    buyPrice: 50,
    harvestPrice: 65,
    timeToGrow: 8
  },
  {
    title: "Морковь",
    image: "Морковь",
    buyPrice: 400,
    harvestPrice: 420,
    timeToGrow: 10
  },
  {
    title: "Горошек",
    image: "Горошек",
    buyPrice: 600,
    harvestPrice: 700,
    timeToGrow: 15
  },
  {
    title: "Картофель",
    image: "Картофель",
    buyPrice: 800,
    harvestPrice: 1050,
    timeToGrow: 20
  },
  {
    title: "Баклажан",
    image: "Баклажан",
    buyPrice: 1300,
    harvestPrice: 1700,
    timeToGrow: 35
  },
  {
    title: "Болгарский перец",
    image: "Болгарский перец",
    buyPrice: 2500,
    harvestPrice: 2800,
    timeToGrow: 50
  },
  {
    title: "Капуста",
    image: "Капуста",
    buyPrice: 2900,
    harvestPrice: 3100,
    timeToGrow: 90
  },
  {
    title: "Кукуруза",
    image: "Кукуруза",
    buyPrice: 3250,
    harvestPrice: 3500,
    timeToGrow: 150
  },
  {
    title: "Тыква",
    image: "Тыква",
    buyPrice: 4000,
    harvestPrice: 4750,
    timeToGrow: 240
  },
  {
    title: "Перец",
    image: "Перец",
    buyPrice: 6000,
    harvestPrice: 7000,
    timeToGrow: 360
  },
  {
    title: "Редька",
    image: "Редька",
    buyPrice: 15000,
    harvestPrice: 17000,
    timeToGrow: 480
  }
];

const FIELD_SIZE = 5;
const START_SIZE = 3;
const PLOT_COUNT = FIELD_SIZE * FIELD_SIZE;
const UNLOCK_PRICE = 50;
const RADISH_INDEX = plants.findIndex((plant) => plant.title === "Редька");
const SAVE_STATE_KEY = "garden-state";
const SOUND_STATE_KEY = "garden-sound-muted";
const AUTH_TOKEN_KEY = "garden-auth-token";
const API_BASE = "/api";
const SHOP_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const SHOP_SLOT_COUNT = 6;
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

const SEED_SHOP_WEIGHTS = [ //Дроп
  { plantIndex: 0, weight: 70, minStock: 2, maxStock: 9 },
  { plantIndex: 1, weight: 55, minStock: 2, maxStock: 6 },
  { plantIndex: 2, weight: 42, minStock: 2, maxStock: 5 },
  { plantIndex: 3, weight: 34, minStock: 2, maxStock: 4 },
  { plantIndex: 4, weight: 28, minStock: 2, maxStock: 3 },
  { plantIndex: 5, weight: 20, minStock: 2, maxStock: 5 },
  { plantIndex: 6, weight: 14, minStock: 2, maxStock: 4 },
  { plantIndex: 7, weight: 10, minStock: 1, maxStock: 3 },
  { plantIndex: 8, weight: 7, minStock: 1, maxStock: 3 },
  { plantIndex: 9, weight: 4, minStock: 1, maxStock: 2 },
  { plantIndex: 10, weight: 2, minStock: 1, maxStock: 1 },
  { plantIndex: 11, weight: 1, minStock: 1, maxStock: 1 }
];

const START_UNLOCKED_PLOTS = Array.from(
  { length: PLOT_COUNT },
  (_, index) => index
).filter((index) => {
  const row = Math.floor(index / FIELD_SIZE);
  const col = index % FIELD_SIZE;
  return row < START_SIZE && col < START_SIZE;
});

const defaultState = {
  gold: 2,
  selectedPlant: 0,
  garden: [],
  unlockedPlots: START_UNLOCKED_PLOTS,
  seedShop: {
    items: [],
    nextRefreshAt: 0
  },
  stats: {
    totalHarvests: 0,
    totalEarned: 0,
    plantsPlanted: 0,
    plantsHarvested: 0,
    grownPlantIndexes: []
  }
};

const SOUND_LIBRARY = { //звуки
  plant: [
    { frequency: 220, duration: 0.08, type: "triangle", volume: 0.08 },
    { frequency: 330, duration: 0.1, type: "triangle", volume: 0.07, delay: 0.06 }
  ],
  harvest: [
    { frequency: 520, duration: 0.08, type: "sine", volume: 0.08 },
    { frequency: 760, duration: 0.1, type: "sine", volume: 0.06, delay: 0.06 }
  ],
  harvestAll: [
    { frequency: 420, duration: 0.07, type: "sine", volume: 0.07 },
    { frequency: 620, duration: 0.08, type: "sine", volume: 0.07, delay: 0.05 },
    { frequency: 860, duration: 0.1, type: "sine", volume: 0.06, delay: 0.1 }
  ],
  unlock: [
    { frequency: 260, duration: 0.1, type: "square", volume: 0.05 },
    { frequency: 520, duration: 0.12, type: "triangle", volume: 0.07, delay: 0.08 }
  ],
  shopRefresh: [
    { frequency: 392, duration: 0.08, type: "triangle", volume: 0.06 },
    { frequency: 494, duration: 0.08, type: "triangle", volume: 0.06, delay: 0.07 },
    { frequency: 659, duration: 0.12, type: "triangle", volume: 0.06, delay: 0.14 }
  ],
  reset: [
    { frequency: 220, duration: 0.14, type: "sawtooth", volume: 0.05 },
    { frequency: 140, duration: 0.12, type: "sawtooth", volume: 0.04, delay: 0.1 }
  ],
  unmute: [
    { frequency: 500, duration: 0.08, type: "sine", volume: 0.06 },
    { frequency: 700, duration: 0.1, type: "sine", volume: 0.06, delay: 0.06 }
  ],
  mute: [
    { frequency: 240, duration: 0.08, type: "sine", volume: 0.05 }
  ]
};

const state = loadState();
const session = {
  token: localStorage.getItem(AUTH_TOKEN_KEY) || "",
  user: null,
  heartbeatTimer: null,
  saveTimer: null
};
const audio = {
  context: null,
  isMuted: localStorage.getItem(SOUND_STATE_KEY) === "true"
};

const elements = {
  achievements: document.querySelector("#achievements"),
  appShell: document.querySelector("#appShell"),
  authMessage: document.querySelector("#authMessage"),
  authScreen: document.querySelector("#authScreen"),
  count: document.querySelector("#count"),
  garden: document.querySelector("#garden"),
  gold: document.querySelector("#gold"),
  harvestAll: document.querySelector("#harvestAll"),
  loginForm: document.querySelector("#loginForm"),
  loginName: document.querySelector("#loginName"),
  loginPassword: document.querySelector("#loginPassword"),
  logoutButton: document.querySelector("#logoutButton"),
  message: document.querySelector("#message"),
  plants: document.querySelector("#plants"),
  plantsPanel: document.querySelector("#plantsPanel"),
  registerForm: document.querySelector("#registerForm"),
  registerName: document.querySelector("#registerName"),
  registerNickname: document.querySelector("#registerNickname"),
  registerPassword: document.querySelector("#registerPassword"),
  resetGame: document.querySelector("#resetGame"),
  showLogin: document.querySelector("#showLogin"),
  showRegister: document.querySelector("#showRegister"),
  shopForm: document.querySelector("#shopForm"),
  shopTimer: document.querySelector("#shopTimer"),
  soundToggle: document.querySelector("#soundToggle"),
  togglePlants: document.querySelector("#togglePlants"),
  total: document.querySelector("#total"),
  userNickname: document.querySelector("#userNickname")
};

const achievements = [ //Достижения
  {
    id: "first-harvest",
    title: "Первый урожай",
    description: "Собрать 1 растение.",
    isUnlocked: () => state.stats.totalHarvests >= 1,
    progress: () => `${Math.min(state.stats.totalHarvests, 1)}/1`
  },
  {
    id: "ten-harvests",
    title: "Рабочий день",
    description: "Собрать 10 растений.",
    isUnlocked: () => state.stats.totalHarvests >= 10,
    progress: () => `${Math.min(state.stats.totalHarvests, 10)}/10`
  },
  {
    id: "earn-500",
    title: "Крепкая касса",
    description: "Заработать $500 на урожае.",
    isUnlocked: () => state.stats.totalEarned >= 500,
    progress: () => `$${Math.min(state.stats.totalEarned, 500)}/$500`
  },
  {
    id: "all-plots",
    title: "Полный огород",
    description: "Открыть все грядки.",
    isUnlocked: () => state.unlockedPlots.length >= PLOT_COUNT,
    progress: () => `${Math.min(state.unlockedPlots.length, PLOT_COUNT)}/${PLOT_COUNT}`
  },
  {
    id: "radish",
    title: "Тянеп потянем",
    description: "Вырастить и собрать редьку.",
    isUnlocked: () => state.stats.grownPlantIndexes.includes(RADISH_INDEX),
    progress: () => state.stats.grownPlantIndexes.includes(RADISH_INDEX) ? "1/1" : "0/1"
  }
];

init();

async function init() {
  bindEvents();
  setInterval(renderGarden, 1000);
  setInterval(updateSeedShop, 1000);

  if (session.token) {
    await restoreSession();
    return;
  }

  showAuthScreen();
}

function bindEvents() {
  elements.loginForm.addEventListener("submit", loginUser);
  elements.registerForm.addEventListener("submit", registerUser);
  elements.showLogin.addEventListener("click", () => showAuthForm("login"));
  elements.showRegister.addEventListener("click", () => showAuthForm("register"));
  elements.logoutButton.addEventListener("click", logoutUser);
  elements.shopForm.addEventListener("submit", plantSelectedSeeds);
  elements.count.addEventListener("input", renderTotal);
  elements.togglePlants.addEventListener("click", togglePlantsPanel);
  elements.harvestAll.addEventListener("click", harvestAll);
  elements.resetGame.addEventListener("click", resetGame);
  elements.soundToggle.addEventListener("click", toggleSound);
}

async function restoreSession() {
  try {
    const data = await apiRequest("/me");
    session.user = data.user;
    applyRemoteSave(data.save);
    showGameScreen();
    startHeartbeat();
    render();
  } catch {
    logoutUser("Сессия устарела. Войди снова.");
  }
}

async function loginUser(event) {
  event.preventDefault();
  setAuthMessage("Входим...");

  try {
    const data = await apiRequest("/login", {
      method: "POST",
      body: {
        login: elements.loginName.value,
        password: elements.loginPassword.value
      },
      skipAuth: true
    });
    completeAuth(data);
  } catch (error) {
    setAuthMessage(error.message);
  }
}

async function registerUser(event) {
  event.preventDefault();
  setAuthMessage("Создаём аккаунт...");

  try {
    const data = await apiRequest("/register", {
      method: "POST",
      body: {
        login: elements.registerName.value,
        password: elements.registerPassword.value,
        nickname: elements.registerNickname.value,
        save: createSavePayload()
      },
      skipAuth: true
    });
    completeAuth(data);
  } catch (error) {
    setAuthMessage(error.message);
  }
}

function completeAuth(data) {
  session.token = data.token;
  session.user = data.user;
  localStorage.setItem(AUTH_TOKEN_KEY, session.token);
  applyRemoteSave(data.save);
  setAuthMessage("");
  showGameScreen();
  startHeartbeat();
  render();
}

function logoutUser(message = "") {
  session.token = "";
  session.user = null;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  stopHeartbeat();
  showAuthScreen();
  setAuthMessage(message);
}

function showAuthForm(formName) {
  const isLogin = formName === "login";
  elements.loginForm.classList.toggle("is-hidden", !isLogin);
  elements.registerForm.classList.toggle("is-hidden", isLogin);
  elements.showLogin.classList.toggle("is-active", isLogin);
  elements.showRegister.classList.toggle("is-active", !isLogin);
  setAuthMessage("");
}

function showAuthScreen() {
  elements.authScreen.classList.remove("is-hidden");
  elements.appShell.classList.add("is-hidden");
}

function showGameScreen() {
  elements.authScreen.classList.add("is-hidden");
  elements.appShell.classList.remove("is-hidden");
}

function setAuthMessage(text) {
  elements.authMessage.textContent = text;
}

function render() {
  elements.gold.textContent = state.gold;
  elements.userNickname.textContent = session.user?.nickname || "-";
  renderTotal();
  renderPlants();
  renderShopTimer();
  renderSoundToggle();
  renderGarden();
  renderAchievements();
}

function renderPlants() {
  ensureSelectedPlantAvailable();

  elements.plants.innerHTML = state.seedShop.items.map((shopItem) => {
    const plant = plants[shopItem.plantIndex];
    const isRare = plant.buyPrice >= 4000;
    const isDisabled = shopItem.stock <= 0;

    return `
      <label class="plant-option ${isRare ? "is-rare" : ""}">
        <input type="radio" name="plant" value="${shopItem.plantIndex}" ${shopItem.plantIndex === state.selectedPlant ? "checked" : ""} ${isDisabled ? "disabled" : ""}>
        <img src="assets/${plant.image}.png" alt="${plant.title}">
        <p class="plant-name">${plant.title}</p>
        <p class="plant-meta">Цена: $${plant.buyPrice}</p>
        <p class="plant-meta">Урожай: $${plant.harvestPrice}</p>
        <p class="plant-meta">Рост: ${formatGrowTime(plant.timeToGrow)}</p>
        <p class="plant-stock">${isDisabled ? "Нет в наличии" : `В наличии: ${shopItem.stock}`}</p>
      </label>
    `;
  }).join("");

  elements.plants.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => {
      state.selectedPlant = Number(input.value);
      saveState();
      renderTotal();
    });
  });
}

function renderTotal() {
  const plant = plants[state.selectedPlant];
  const shopItem = getShopItem(state.selectedPlant);
  elements.total.textContent = shopItem && shopItem.stock > 0 ? plant.buyPrice * getCount() : 0;
}

function renderGarden() {
  elements.harvestAll.disabled = getReadyItems().length === 0;
  elements.garden.className = "garden-grid";
  elements.garden.innerHTML = Array.from(
    { length: PLOT_COUNT },
    (_, plotIndex) => renderPlot(plotIndex)
  ).join("");

  elements.garden.querySelectorAll(".harvest").forEach((button) => {
    button.addEventListener("click", () => harvest(button.dataset.id));
  });

  elements.garden.querySelectorAll(".unlock").forEach((button) => {
    button.addEventListener("click", () => unlockPlot(Number(button.dataset.plot)));
  });
}

function renderPlot(plotIndex) { //открытие грядок
  const item = state.garden.find((gardenItem) => gardenItem.plotIndex === plotIndex);

  if (!state.unlockedPlots.includes(plotIndex)) {
    return `
      <article class="garden-cell locked">
        <p class="plot-title">Закрыто</p>
        <p>$${UNLOCK_PRICE}</p>
        <button class="unlock" data-plot="${plotIndex}">Открыть</button>
      </article>
    `;
  }

  if (!item) {
    return `
      <article class="garden-cell empty-plot">
        <p class="plot-title">Свободно</p>
      </article>
    `;
  }

  const plant = plants[item.plantIndex];
  const remaining = item.readyAt - Date.now();
  const isReady = remaining <= 0;
  const progress = getGrowthProgress(item);
  const status = isReady ? "Можно собрать" : `Осталось ${formatTime(remaining)}`;

  return `
    <article class="garden-cell garden-plant">
      <img src="assets/${plant.image}.png" alt="${plant.title}">
      <p><strong>${plant.title}</strong></p>
      <div class="progress" aria-label="Рост ${progress}%">
        <div class="progress-fill" style="width: ${progress}%"></div>
      </div>
      <p class="progress-label">${progress}%</p>
      <p>${status}</p>
      <button class="harvest" data-id="${item.id}" ${isReady ? "" : "disabled"}>Собрать</button>
    </article>
  `;
}

function renderAchievements() { //достижения
  elements.achievements.innerHTML = achievements.map((achievement) => {
    const isUnlocked = achievement.isUnlocked();

    return `
      <article class="achievement ${isUnlocked ? "is-unlocked" : ""}">
        <h3>${isUnlocked ? "Открыто: " : ""}${achievement.title}</h3>
        <p>${achievement.description}</p>
        <p>${achievement.progress()}</p>
      </article>
    `;
  }).join("");
}

function renderShopTimer() {
  const remaining = Math.max(0, state.seedShop.nextRefreshAt - Date.now());
  elements.shopTimer.textContent = formatTime(remaining);
}

function renderSoundToggle() {
  elements.soundToggle.textContent = audio.isMuted ? "Звук: выкл" : "Звук: вкл";
  elements.soundToggle.classList.toggle("is-muted", audio.isMuted);
  elements.soundToggle.setAttribute("aria-pressed", String(!audio.isMuted));
}

function plantSelectedSeeds(event) {
  event.preventDefault();

  const count = getCount();
  const plant = plants[state.selectedPlant];
  const shopItem = getShopItem(state.selectedPlant);
  const total = plant.buyPrice * count;
  const emptyPlots = getEmptyUnlockedPlots();

  if (!shopItem || shopItem.stock <= 0) {
    setMessage("Этого семени сейчас нет в магазине");
    return;
  }

  if (count > shopItem.stock) {
    setMessage(`В магазине осталось только ${shopItem.stock} шт.`);
    return;
  }

  if (state.gold < total) {
    setMessage("Денег не хватает");
    return;
  }

  if (count > emptyPlots.length) {
    setMessage("Нет свободных грядок");
    return;
  }

  const readyAt = Date.now() + plant.timeToGrow * 60 * 1000;
  for (let i = 0; i < count; i += 1) {
    state.garden.push({
      id: crypto.randomUUID(),
      plantIndex: state.selectedPlant,
      plotIndex: emptyPlots[i],
      readyAt
    });
  }

  state.gold -= total;
  shopItem.stock -= count;
  state.stats.plantsPlanted += count;
  setMessage("Посажено");
  playSound("plant");
  saveState();
  queueRemoteSave();
  render();
}

function harvest(id) {
  const index = state.garden.findIndex((item) => item.id === id);
  if (index === -1) {
    return;
  }

  const item = state.garden[index];
  if (item.readyAt > Date.now()) {
    setMessage("Урожай пока нельзя собрать");
    return;
  }

  const earned = plants[item.plantIndex].harvestPrice;
  state.gold += earned;
  recordHarvest([item], earned);
  state.garden.splice(index, 1);
  setMessage("Урожай собран");
  playSound("harvest");
  saveState();
  queueRemoteSave();
  render();
}

function harvestAll() { //уведоимления
  const readyItems = getReadyItems();
  if (readyItems.length === 0) {
    setMessage("Готового урожая нет");
    return;
  }

  const readyIds = new Set(readyItems.map((item) => item.id));
  const earned = readyItems.reduce((sum, item) => sum + plants[item.plantIndex].harvestPrice, 0);
  state.gold += earned;
  recordHarvest(readyItems, earned);
  state.garden = state.garden.filter((item) => !readyIds.has(item.id));
  setMessage(`Собрано: ${readyItems.length}, заработано $${earned}`);
  playSound("harvestAll");
  saveState();
  queueRemoteSave();
  render();
}

function unlockPlot(plotIndex) {
  if (state.unlockedPlots.includes(plotIndex)) {
    return;
  }

  if (state.gold < UNLOCK_PRICE) {
    setMessage("Денег не хватает");
    return;
  }

  state.gold -= UNLOCK_PRICE;
  state.unlockedPlots.push(plotIndex);
  setMessage("Грядка открыта");
  playSound("unlock");
  saveState();
  queueRemoteSave();
  render();
}

function resetGame() { //Сброс
  if (!confirm("Начать игру заново? Текущий сад и баланс будут сброшены.")) {
    return;
  }

  const freshState = normalizeState(structuredClone(defaultState));
  Object.keys(state).forEach((key) => {
    delete state[key];
  });
  Object.assign(state, freshState);
  elements.count.value = 1;
  setMessage("Игра сброшена");
  playSound("reset");
  saveState();
  queueRemoteSave();
  render();
}

function togglePlantsPanel() {
  const isCollapsed = elements.plantsPanel.classList.toggle("is-collapsed");
  elements.togglePlants.textContent = isCollapsed ? "Показать растения" : "Свернуть растения";
  elements.togglePlants.setAttribute("aria-expanded", String(!isCollapsed));
}

function recordHarvest(items, earned) {
  state.stats.totalHarvests += items.length;
  state.stats.totalEarned += earned;
  state.stats.plantsHarvested += items.length;

  const grownPlantIndexes = new Set(state.stats.grownPlantIndexes);
  items.forEach((item) => grownPlantIndexes.add(item.plantIndex));
  state.stats.grownPlantIndexes = [...grownPlantIndexes];
}

function updateSeedShop() {
  if (Date.now() < state.seedShop.nextRefreshAt) {
    renderShopTimer();
    return;
  }

  state.seedShop = createSeedShop();
  ensureSelectedPlantAvailable();
  setMessage("Магазин семян обновился");
  playSound("shopRefresh");
  saveState();
  queueRemoteSave();
  render();
}

function createSeedShop(now = Date.now()) {
  const items = [
    createSeedShopItem(0),
    createSeedShopItem(1)
  ];
  const selectedPlantIndexes = new Set(items.map((item) => item.plantIndex));

  while (items.length < SHOP_SLOT_COUNT && selectedPlantIndexes.size < plants.length) {
    const entry = rollSeedShopEntry(selectedPlantIndexes);
    selectedPlantIndexes.add(entry.plantIndex);
    items.push(createSeedShopItem(entry.plantIndex));
  }

  return {
    items: items.sort((left, right) => plants[left.plantIndex].buyPrice - plants[right.plantIndex].buyPrice),
    nextRefreshAt: now + SHOP_REFRESH_INTERVAL_MS
  };
}

function createSeedShopItem(plantIndex) {
  const entry = SEED_SHOP_WEIGHTS.find((item) => item.plantIndex === plantIndex);
  const minStock = entry?.minStock ?? 1;
  const maxStock = entry?.maxStock ?? 1;

  return {
    plantIndex,
    stock: getRandomInteger(minStock, maxStock)
  };
}

function rollSeedShopEntry(excludedPlantIndexes) {
  const entries = SEED_SHOP_WEIGHTS.filter((entry) => !excludedPlantIndexes.has(entry.plantIndex));
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry;
    }
  }

  return entries[entries.length - 1];
}

function normalizeSeedShopItems(items) {
  const usedPlantIndexes = new Set();

  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .filter((item) => item && Number.isInteger(item.plantIndex) && plants[item.plantIndex])
    .map((item) => ({
      plantIndex: item.plantIndex,
      stock: Math.max(0, Number(item.stock) || 0)
    }))
    .filter((item) => {
      if (usedPlantIndexes.has(item.plantIndex)) {
        return false;
      }

      usedPlantIndexes.add(item.plantIndex);
      return true;
    })
    .sort((left, right) => plants[left.plantIndex].buyPrice - plants[right.plantIndex].buyPrice);
}

function ensureSelectedPlantAvailable() {
  const shopItem = getShopItem(state.selectedPlant);
  if (shopItem && shopItem.stock > 0) {
    return;
  }

  state.selectedPlant = getFirstAvailableShopPlant(state.seedShop.items);
}

function getFirstAvailableShopPlant(items) {
  return items.find((item) => item.stock > 0)?.plantIndex ?? defaultState.selectedPlant;
}

function getShopItem(plantIndex) {
  return state.seedShop.items.find((item) => item.plantIndex === plantIndex);
}

function applyRemoteSave(save) {
  const normalizedSave = normalizeState({
    ...structuredClone(defaultState),
    ...(save && typeof save === "object" ? save : {})
  });

  Object.keys(state).forEach((key) => {
    delete state[key];
  });
  Object.assign(state, normalizedSave);
  saveState();
}

function createSavePayload() {
  return {
    gold: state.gold,
    selectedPlant: state.selectedPlant,
    garden: state.garden,
    unlockedPlots: state.unlockedPlots,
    seedShop: state.seedShop,
    stats: state.stats
  };
}

function queueRemoteSave() {
  if (!session.token) {
    return;
  }

  clearTimeout(session.saveTimer);
  session.saveTimer = setTimeout(() => {
    saveRemoteState().catch((error) => setMessage(error.message));
  }, 300);
}

async function saveRemoteState() {
  await apiRequest("/save", {
    method: "POST",
    body: { save: createSavePayload() }
  });
}

function startHeartbeat() {
  stopHeartbeat();
  session.heartbeatTimer = setInterval(() => {
    apiRequest("/heartbeat", { method: "POST", body: {} }).catch(() => {});
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
  clearInterval(session.heartbeatTimer);
  clearTimeout(session.saveTimer);
  session.heartbeatTimer = null;
  session.saveTimer = null;
}

async function apiRequest(path, options = {}) {
  const headers = {
    "Content-Type": "application/json"
  };

  if (!options.skipAuth && session.token) {
    headers.Authorization = `Bearer ${session.token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Ошибка соединения с сервером");
  }

  return data;
}

function toggleSound() {
  const nextMutedState = !audio.isMuted;
  if (nextMutedState) {
    playSound("mute");
  }

  audio.isMuted = nextMutedState;
  localStorage.setItem(SOUND_STATE_KEY, String(audio.isMuted));
  renderSoundToggle();

  if (!audio.isMuted) {
    playSound("unmute");
  }
}

function playSound(name) {
  if (audio.isMuted) {
    return;
  }

  const context = getAudioContext();
  if (!context) {
    return;
  }

  if (context.state === "suspended") {
    context.resume().catch(() => {});
  }

  (SOUND_LIBRARY[name] ?? SOUND_LIBRARY.plant).forEach((note) => playTone(context, note));
}

function getAudioContext() {
  if (audio.context) {
    return audio.context;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return null;
  }

  audio.context = new AudioContextClass();
  return audio.context;
}

function playTone(context, note) {
  const startTime = context.currentTime + (note.delay ?? 0);
  const endTime = startTime + note.duration;
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = note.type;
  oscillator.frequency.setValueAtTime(note.frequency, startTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(note.volume, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(endTime + 0.02);
}

function loadState() {
  const saved = localStorage.getItem(SAVE_STATE_KEY);
  if (!saved) {
    return normalizeState(structuredClone(defaultState));
  }

  try {
    return normalizeState({ ...structuredClone(defaultState), ...JSON.parse(saved) });
  } catch {
    return normalizeState(structuredClone(defaultState));
  }
}

function normalizeState(savedState) {
  const normalized = {
    ...structuredClone(defaultState),
    ...savedState
  };

  normalized.selectedPlant = Number.isInteger(normalized.selectedPlant) && plants[normalized.selectedPlant]
    ? normalized.selectedPlant
    : defaultState.selectedPlant;

  normalized.unlockedPlots = [...new Set([
    ...START_UNLOCKED_PLOTS,
    ...(Array.isArray(normalized.unlockedPlots) ? normalized.unlockedPlots : [])
  ])].filter((plotIndex) => Number.isInteger(plotIndex) && plotIndex >= 0 && plotIndex < PLOT_COUNT);

  normalized.stats = {
    ...structuredClone(defaultState.stats),
    ...(normalized.stats && typeof normalized.stats === "object" ? normalized.stats : {})
  };
  normalized.stats.totalHarvests = Math.max(0, Number(normalized.stats.totalHarvests) || 0);
  normalized.stats.totalEarned = Math.max(0, Number(normalized.stats.totalEarned) || 0);
  normalized.stats.plantsPlanted = Math.max(0, Number(normalized.stats.plantsPlanted) || 0);
  normalized.stats.plantsHarvested = Math.max(0, Number(normalized.stats.plantsHarvested) || 0);
  normalized.stats.grownPlantIndexes = [...new Set(
    Array.isArray(normalized.stats.grownPlantIndexes) ? normalized.stats.grownPlantIndexes : []
  )].filter((plantIndex) => Number.isInteger(plantIndex) && plants[plantIndex]);

  normalized.seedShop = {
    ...structuredClone(defaultState.seedShop),
    ...(normalized.seedShop && typeof normalized.seedShop === "object" ? normalized.seedShop : {})
  };
  normalized.seedShop.nextRefreshAt = Math.max(0, Number(normalized.seedShop.nextRefreshAt) || 0);
  normalized.seedShop.items = normalizeSeedShopItems(normalized.seedShop.items);

  if (normalized.seedShop.items.length === 0 || normalized.seedShop.nextRefreshAt <= Date.now()) {
    normalized.seedShop = createSeedShop();
  }

  if (!normalized.seedShop.items.some((item) => item.plantIndex === normalized.selectedPlant && item.stock > 0)) {
    normalized.selectedPlant = getFirstAvailableShopPlant(normalized.seedShop.items);
  }

  const usedPlots = new Set();
  normalized.garden = normalized.garden
    .filter((item) => item && Number.isInteger(item.plantIndex) && plants[item.plantIndex])
    .slice(0, PLOT_COUNT)
    .map((item) => {
      let plotIndex = Number.isInteger(item.plotIndex)
        ? item.plotIndex
        : getFirstFreePlot(usedPlots, normalized.unlockedPlots);

      if (plotIndex === -1 || usedPlots.has(plotIndex)) {
        plotIndex = getFirstFreePlot(usedPlots, Array.from({ length: PLOT_COUNT }, (_, index) => index));
      }

      if (!normalized.unlockedPlots.includes(plotIndex)) {
        normalized.unlockedPlots.push(plotIndex);
      }

      usedPlots.add(plotIndex);

      return {
        ...item,
        id: item.id || crypto.randomUUID(),
        plotIndex
      };
    });

  return normalized;
}

function saveState() {
  localStorage.setItem(SAVE_STATE_KEY, JSON.stringify(state));
}

function getEmptyUnlockedPlots() {
  const occupiedPlots = new Set(state.garden.map((item) => item.plotIndex));
  return state.unlockedPlots.filter((plotIndex) => !occupiedPlots.has(plotIndex));
}

function getReadyItems() {
  const now = Date.now();
  return state.garden.filter((item) => item.readyAt <= now);
}

function getGrowthProgress(item) {
  const plant = plants[item.plantIndex];
  const growTimeMs = plant.timeToGrow * 60 * 1000;
  const plantedAt = item.readyAt - growTimeMs;
  const elapsed = Date.now() - plantedAt;
  return Math.min(100, Math.max(0, Math.floor((elapsed / growTimeMs) * 100)));
}

function getFirstFreePlot(usedPlots, plotOptions) {
  return plotOptions.find((plotIndex) => !usedPlots.has(plotIndex)) ?? -1;
}

function getCount() {
  return Math.max(1, Number(elements.count.value) || 1);
}

function getRandomInteger(min, max) { //случайность
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatTime(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours} ч ${minutes} мин`;
  }

  if (minutes > 0) {
    return `${minutes} мин ${String(seconds).padStart(2, "0")} сек`;
  }

  return `${seconds} сек`;
}

function formatGrowTime(minutesTotal) {
  const hours = Math.floor(minutesTotal / 60);
  const minutes = minutesTotal % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours} ч ${minutes} мин`;
  }

  if (hours > 0) {
    return `${hours} ч`;
  }

  return `${minutes} мин`;
}

function setMessage(text) {
  elements.message.textContent = text;
}
