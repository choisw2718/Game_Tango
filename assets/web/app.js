import { cloneBoard, normalizeConstraint, } from "../core/rules.js";
import { validateBoard } from "../core/validateBoard.js";
import { getNextHint } from "../game/hintEngine.js";
import { clampStage, createDraftBoard, formatElapsedTime, loadStageList, loadStageMenu, loadStagePuzzle, nextUnlockedStage, stageProgressKey, } from "./puzzleData.js";
const PACK_OPTIONS = [
    { size: 6, difficulty: "easy", label: "6x6 쉬움" },
    { size: 6, difficulty: "hard", label: "6x6 어려움" },
    { size: 8, difficulty: "easy", label: "8x8 쉬움" },
    { size: 8, difficulty: "hard", label: "8x8 어려움" },
];
const DIFFICULTY_LABEL = {
    easy: "쉬움",
    hard: "어려움",
};
const VALUE_TO_CLASS = {
    A: "filled",
    B: "hollow",
};
const VALUE_TO_LABEL = {
    A: "black",
    B: "white",
};
const state = {
    view: "menu",
    menu: [],
    selectedSize: 6,
    selectedDifficulty: "easy",
    stages: [],
    unlockedStage: 1,
    puzzle: null,
    board: [],
    checkpoint: null,
    hint: null,
    hintSolution: null,
    violationKeys: new Set(),
    pendingWrongCellOrders: new Map(),
    wrongCellOrders: new Map(),
    nextWrongCellOrder: 1,
    loading: false,
    elapsedSeconds: 0,
    timerStartedAtMs: null,
    timerIntervalId: null,
    validationTimeoutIds: new Map(),
    solved: false,
};
const menuButton = requireElement("#menuButton");
const menuScreen = requireElement("#menuScreen");
const choiceGrid = requireElement("#choiceGrid");
const menuStatus = requireElement("#menuStatus");
const stageScreen = requireElement("#stageScreen");
const selectedPackTitle = requireElement("#selectedPackTitle");
const selectedPackMeta = requireElement("#selectedPackMeta");
const backToMenuButton = requireElement("#backToMenuButton");
const stageGrid = requireElement("#stageGrid");
const stageStatus = requireElement("#stageStatus");
const gameScreen = requireElement("#gameScreen");
const backToStagesButton = requireElement("#backToStagesButton");
const nextStageButton = requireElement("#nextStageButton");
const resetButton = requireElement("#resetButton");
const checkpointSaveButton = requireElement("#checkpointSaveButton");
const checkpointRestoreButton = requireElement("#checkpointRestoreButton");
const hintButton = requireElement("#hintButton");
const statusText = requireElement("#statusText");
const puzzleMeta = requireElement("#puzzleMeta");
const timerText = requireElement("#timerText");
const hintText = requireElement("#hintText");
const boardFrame = requireElement("#boardFrame");
const boardGrid = requireElement("#boardGrid");
const conditionLayer = requireElement("#conditionLayer");
menuButton.addEventListener("click", () => {
    showMenuScreen();
});
backToMenuButton.addEventListener("click", () => {
    showMenuScreen();
});
backToStagesButton.addEventListener("click", () => {
    showStageScreen();
});
choiceGrid.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element) || state.loading) {
        return;
    }
    const button = target.closest(".choice-card");
    if (!button || button.disabled) {
        return;
    }
    const size = Number(button.dataset.size);
    const difficulty = button.dataset.difficulty;
    if ((size === 6 || size === 8) && (difficulty === "easy" || difficulty === "hard")) {
        void selectPack(size, difficulty);
    }
});
stageGrid.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element) || state.loading) {
        return;
    }
    const button = target.closest(".stage-card");
    if (!button || button.disabled) {
        return;
    }
    const stage = Number(button.dataset.stage);
    if (Number.isInteger(stage)) {
        void loadStage(stage);
    }
});
nextStageButton.addEventListener("click", () => {
    if (!state.puzzle || state.loading || !state.solved) {
        return;
    }
    const nextStage = state.puzzle.stage + 1;
    if (nextStage <= state.unlockedStage && nextStage <= state.stages.length) {
        void loadStage(nextStage);
    }
});
resetButton.addEventListener("click", () => {
    clearBoard();
});
checkpointSaveButton.addEventListener("click", () => {
    saveCheckpoint();
});
checkpointRestoreButton.addEventListener("click", () => {
    restoreCheckpoint();
});
hintButton.addEventListener("click", () => {
    void showHint();
});
boardGrid.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !state.puzzle || state.loading || state.solved) {
        return;
    }
    const cell = target.closest(".cell");
    if (!cell || cell.classList.contains("given")) {
        return;
    }
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    if (!Number.isInteger(row) || !Number.isInteger(col)) {
        return;
    }
    const rowCells = state.board[row];
    if (!rowCells || col < 0 || col >= rowCells.length) {
        return;
    }
    const focusKey = cellKey(row, col);
    const beforeResult = validateBoard(state.board, state.puzzle);
    confirmPendingWrongCellsExcept(focusKey);
    rowCells[col] = nextValue(rowCells[col] ?? null);
    clearHint();
    clearPendingValidation(focusKey);
    const result = validateBoard(state.board, state.puzzle);
    const currentViolationKeys = collectViolationKeys(result.violations);
    state.wrongCellOrders.delete(focusKey);
    state.pendingWrongCellOrders.delete(focusKey);
    reconcileWrongCellOrders(currentViolationKeys);
    reconcilePendingWrongCells(currentViolationKeys);
    state.violationKeys = selectFirstWrongCell(currentViolationKeys);
    updateViolationStatusMessage();
    if (result.solved) {
        clearPendingValidation();
        updateValidationStatus();
        renderBoard();
        renderStageGrid();
        return;
    }
    renderBoard();
    renderStageGrid();
    if (hasCurrentCellValue(focusKey) &&
        hasNewViolationForCell(beforeResult.violations, result.violations, focusKey)) {
        registerPendingWrongCell(focusKey);
        scheduleValidationStatus(row, col);
    }
});
void initialize();
async function initialize() {
    setView("menu");
    setLoading(true);
    menuStatus.textContent = "게임 목록을 불러오는 중입니다.";
    try {
        state.menu = await loadStageMenu();
        renderMenuChoices();
        menuStatus.textContent = hasAnyPlayablePack()
            ? "원하는 카드를 누르면 Stage 목록으로 이동합니다."
            : "사용 가능한 DB 문제가 없습니다.";
    }
    catch (error) {
        menuStatus.textContent =
            error instanceof Error ? error.message : "게임 목록을 불러오지 못했습니다.";
    }
    finally {
        setLoading(false);
    }
}
async function selectPack(size, difficulty) {
    state.selectedSize = size;
    state.selectedDifficulty = difficulty;
    state.stages = [];
    state.unlockedStage = 1;
    clearCurrentPuzzle();
    setView("stages");
    setLoading(true);
    renderSelectedPackHeader();
    renderStageGrid();
    stageStatus.textContent = "Stage 목록을 불러오는 중입니다.";
    try {
        state.stages = await loadStageList(size, difficulty);
        state.unlockedStage = getUnlockedStage();
        renderSelectedPackHeader();
        renderStageGrid();
        stageStatus.textContent =
            state.stages.length > 0
                ? "열린 Stage를 선택해 시작하세요."
                : "선택한 크기와 난이도에 사용할 DB 문제가 없습니다.";
    }
    catch (error) {
        state.stages = [];
        renderSelectedPackHeader();
        renderStageGrid();
        stageStatus.textContent =
            error instanceof Error ? error.message : "Stage 목록을 불러오지 못했습니다.";
    }
    finally {
        setLoading(false);
    }
}
async function loadStage(stage) {
    const clampedStage = clampStage(stage, state.stages.length);
    if (clampedStage > state.unlockedStage) {
        stageStatus.textContent = `Stage ${clampedStage}는 이전 Stage를 완료하면 열립니다.`;
        return;
    }
    clearCurrentPuzzle();
    setView("puzzle");
    setLoading(true);
    statusText.textContent = `Stage ${clampedStage}를 불러오는 중입니다.`;
    try {
        const puzzle = await loadStagePuzzle(state.selectedSize, state.selectedDifficulty, clampedStage);
        state.puzzle = puzzle;
        state.board = createDraftBoard(puzzle);
        state.checkpoint = null;
        state.hint = null;
        state.hintSolution = null;
        state.violationKeys = new Set();
        resetWrongCellTracking();
        renderPuzzleMeta();
        updateTimerText();
        renderBoard();
        renderStageGrid();
        startTimer();
        updateValidationStatus();
    }
    catch (error) {
        setView("stages");
        stageStatus.textContent =
            error instanceof Error ? error.message : "Stage 문제를 불러오지 못했습니다.";
    }
    finally {
        setLoading(false);
    }
}
function clearBoard() {
    if (!state.puzzle || state.loading) {
        return;
    }
    clearPendingValidation();
    state.board = createDraftBoard(state.puzzle);
    state.checkpoint = null;
    clearHint();
    state.violationKeys = new Set();
    resetWrongCellTracking();
    state.solved = false;
    state.elapsedSeconds = 0;
    startTimer();
    updateValidationStatus();
    renderBoard();
    renderStageGrid();
    statusText.textContent = "보드를 비웠습니다. 처음 주어진 칸만 남았습니다.";
}
function saveCheckpoint() {
    if (!state.puzzle || state.loading || state.solved) {
        return;
    }
    state.checkpoint = cloneBoard(state.board);
    clearHint();
    renderBoard();
    updateControls();
    statusText.textContent = "현재 보드를 체크포인트로 저장했습니다.";
}
function restoreCheckpoint() {
    if (!state.puzzle || state.loading || !state.checkpoint) {
        return;
    }
    clearPendingValidation();
    state.board = cloneBoard(state.checkpoint);
    state.solved = false;
    resetWrongCellTracking();
    clearHint();
    updateValidationStatus();
    renderBoard();
    renderStageGrid();
    statusText.textContent = "체크포인트로 되돌렸습니다.";
}
async function showHint() {
    if (!state.puzzle || state.loading || state.solved) {
        return;
    }
    hintButton.disabled = true;
    hintText.textContent = "힌트를 찾는 중입니다.";
    const hint = getNextHint({
        size: state.puzzle.size,
        board: state.board,
        constraints: state.puzzle.constraints,
        solution: await getHintSolution(),
    });
    state.hint = hint.ok ? hint : null;
    hintText.textContent = hint.message;
    renderBoard();
    updateControls();
}
function showMenuScreen() {
    clearCurrentPuzzle();
    setView("menu");
    renderMenuChoices();
    menuStatus.textContent = hasAnyPlayablePack()
        ? "원하는 카드를 누르면 Stage 목록으로 이동합니다."
        : "사용 가능한 DB 문제가 없습니다.";
}
function showStageScreen() {
    clearCurrentPuzzle();
    setView("stages");
    renderSelectedPackHeader();
    renderStageGrid();
    stageStatus.textContent =
        state.stages.length > 0
            ? "열린 Stage를 선택해 시작하세요."
            : "먼저 게임 선택 화면에서 크기와 난이도를 고르세요.";
}
function clearCurrentPuzzle() {
    clearPendingValidation();
    stopTimer();
    state.puzzle = null;
    state.board = [];
    state.checkpoint = null;
    state.hint = null;
    state.hintSolution = null;
    state.violationKeys = new Set();
    resetWrongCellTracking();
    state.elapsedSeconds = 0;
    state.solved = false;
    puzzleMeta.textContent = "";
    statusText.textContent = "";
    hintText.textContent = "";
    updateTimerText();
    renderBoard();
    updateControls();
}
function setView(view) {
    state.view = view;
    menuScreen.classList.toggle("is-hidden", view !== "menu");
    stageScreen.classList.toggle("is-hidden", view !== "stages");
    gameScreen.classList.toggle("is-hidden", view !== "puzzle");
    menuButton.classList.toggle("is-active", view === "menu");
    updateControls();
}
function renderMenuChoices() {
    choiceGrid.innerHTML = "";
    for (const option of PACK_OPTIONS) {
        const count = getPackCount(option.size, option.difficulty);
        const unlockedStage = count > 0 ? getStoredUnlockedStage(option.size, option.difficulty, count) : 0;
        const button = document.createElement("button");
        button.className = [
            "choice-card",
            `choice-${option.difficulty}`,
            `choice-size-${option.size}`,
            option.size === state.selectedSize && option.difficulty === state.selectedDifficulty
                ? "is-active"
                : "",
        ]
            .filter(Boolean)
            .join(" ");
        button.type = "button";
        button.dataset.size = String(option.size);
        button.dataset.difficulty = option.difficulty;
        button.disabled = state.loading || count <= 0;
        const completedStages = count > 0 ? Math.max(0, unlockedStage - 1) : 0;
        const progressRatio = count > 0 ? Math.round((completedStages / count) * 100) : 0;
        const modeTitle = option.difficulty === "easy" ? "편하게 풀기" : "도전 모드";
        const modeCopy = option.size === 6 ? "짧고 가볍게 시작" : "더 넓은 보드에 도전";
        const head = document.createElement("span");
        head.className = "choice-head";
        const kicker = document.createElement("span");
        kicker.className = "choice-kicker";
        kicker.textContent = DIFFICULTY_LABEL[option.difficulty];
        head.append(kicker, createChoiceVisual(option.difficulty));
        const title = document.createElement("span");
        title.className = "choice-title";
        title.textContent = `${option.size} x ${option.size}`;
        const subtitle = document.createElement("span");
        subtitle.className = "choice-subtitle";
        subtitle.textContent = `${modeTitle} · ${modeCopy}`;
        const countText = document.createElement("span");
        countText.className = "choice-count";
        countText.textContent = count > 0 ? `${count}개 Stage` : "문제 없음";
        const progressTrack = document.createElement("span");
        progressTrack.className = "choice-progressbar";
        const progressFill = document.createElement("span");
        progressFill.style.width = `${progressRatio}%`;
        progressTrack.append(progressFill);
        const footer = document.createElement("span");
        footer.className = "choice-footer";
        const progress = document.createElement("span");
        progress.className = "choice-progress";
        progress.textContent = count > 0 ? `${completedStages}/${count} 완료` : "DB 데이터 없음";
        const action = document.createElement("span");
        action.className = "choice-action";
        action.textContent = count > 0 ? (unlockedStage > 1 ? "이어하기" : "시작하기") : "선택 불가";
        footer.append(progress, action);
        button.append(head, title, subtitle, countText, progressTrack, footer);
        choiceGrid.append(button);
    }
}
function createChoiceVisual(difficulty) {
    const visual = document.createElement("span");
    visual.className = "choice-visual";
    const pattern = difficulty === "easy"
        ? ["filled", "", "hollow", "filled"]
        : ["hollow", "filled", "filled", "hollow"];
    for (const cellClass of pattern) {
        const cell = document.createElement("span");
        cell.className = ["choice-dot", cellClass].filter(Boolean).join(" ");
        visual.append(cell);
    }
    return visual;
}
function renderSelectedPackHeader() {
    selectedPackTitle.textContent = `${state.selectedSize}x${state.selectedSize} ${DIFFICULTY_LABEL[state.selectedDifficulty]}`;
    selectedPackMeta.textContent =
        state.stages.length > 0
            ? `${state.stages.length}개 Stage 중 Stage ${state.unlockedStage}까지 플레이 가능`
            : "Stage 정보 없음";
}
function renderStageGrid() {
    stageGrid.innerHTML = "";
    for (const stage of state.stages) {
        const locked = stage.stage > state.unlockedStage;
        const cleared = stage.stage < state.unlockedStage;
        const button = document.createElement("button");
        button.className = [
            "stage-card",
            state.puzzle?.stage === stage.stage ? "is-active" : "",
            cleared ? "is-cleared" : "",
            locked ? "is-locked" : "",
        ]
            .filter(Boolean)
            .join(" ");
        button.type = "button";
        button.dataset.stage = String(stage.stage);
        button.disabled = state.loading || locked;
        const title = document.createElement("span");
        title.className = "stage-card-title";
        title.textContent = `Stage ${stage.stage}`;
        const stateText = document.createElement("span");
        stateText.className = "stage-card-state";
        stateText.textContent = locked ? "잠김" : cleared ? "완료" : "시작";
        button.append(title, stateText);
        stageGrid.append(button);
    }
}
function renderPuzzleMeta() {
    const puzzle = state.puzzle;
    if (!puzzle) {
        puzzleMeta.textContent = "";
        return;
    }
    puzzleMeta.textContent = `Stage ${puzzle.stage}`;
}
function renderBoard() {
    const puzzle = state.puzzle;
    if (!puzzle) {
        boardGrid.innerHTML = "";
        conditionLayer.innerHTML = "";
        return;
    }
    const givenKeys = new Set(puzzle.givens.map((given) => cellKey(given.row, given.col)));
    const hintTargetKeys = new Set((state.hint?.targetCells ?? []).map((cell) => cellKey(cell.row, cell.col)));
    const hintMistakeKeys = new Set(state.hint?.kind === "mistake"
        ? (state.hint.targetCells ?? []).map((cell) => cellKey(cell.row, cell.col))
        : []);
    const hintSupportKeys = new Set((state.hint?.supportCells ?? []).map((cell) => cellKey(cell.row, cell.col)));
    boardFrame.style.setProperty("--size", String(puzzle.size));
    boardGrid.innerHTML = "";
    conditionLayer.innerHTML = "";
    for (let row = 0; row < puzzle.size; row += 1) {
        for (let col = 0; col < puzzle.size; col += 1) {
            const value = state.board[row]?.[col] ?? null;
            const key = cellKey(row, col);
            const isGiven = givenKeys.has(key);
            const cell = document.createElement("button");
            cell.className = [
                "cell",
                isGiven ? "given" : "",
                state.violationKeys.has(key) ? "violation" : "",
                hintTargetKeys.has(key) ? "hint-target" : "",
                hintMistakeKeys.has(key) ? "hint-mistake" : "",
                hintSupportKeys.has(key) ? "hint-support" : "",
            ]
                .filter(Boolean)
                .join(" ");
            cell.type = "button";
            cell.dataset.row = String(row);
            cell.dataset.col = String(col);
            cell.setAttribute("aria-label", getCellLabel(row, col, value, isGiven));
            cell.disabled = isGiven;
            if (value) {
                const symbol = document.createElement("span");
                symbol.className = `symbol ${VALUE_TO_CLASS[value]}`;
                symbol.setAttribute("aria-hidden", "true");
                cell.append(symbol);
            }
            boardGrid.append(cell);
        }
    }
    for (const constraint of puzzle.constraints) {
        conditionLayer.append(createConditionElement(constraint, puzzle.size));
    }
}
function createConditionElement(constraint, size) {
    const normalizedConstraint = normalizeConstraint(constraint);
    const [fromRow, fromCol] = normalizedConstraint.from;
    const [toRow, toCol] = normalizedConstraint.to;
    const condition = document.createElement("span");
    condition.className = "condition";
    condition.textContent = normalizedConstraint.type === "x" ? "x" : "=";
    if (fromRow === toRow) {
        condition.style.left = `${(Math.max(fromCol, toCol) / size) * 100}%`;
        condition.style.top = `${((fromRow + 0.5) / size) * 100}%`;
    }
    else {
        condition.style.left = `${((fromCol + 0.5) / size) * 100}%`;
        condition.style.top = `${(Math.max(fromRow, toRow) / size) * 100}%`;
    }
    return condition;
}
function scheduleValidationStatus(row, col) {
    const focusKey = cellKey(row, col);
    clearPendingValidation(focusKey);
    const timeoutId = window.setTimeout(() => {
        state.validationTimeoutIds.delete(focusKey);
        updateValidationStatus({ focusKey });
        renderBoard();
        renderStageGrid();
    }, 1000);
    state.validationTimeoutIds.set(focusKey, timeoutId);
}
function clearPendingValidation(focusKey) {
    if (focusKey) {
        const timeoutId = state.validationTimeoutIds.get(focusKey);
        if (timeoutId !== undefined) {
            window.clearTimeout(timeoutId);
            state.validationTimeoutIds.delete(focusKey);
        }
        return;
    }
    for (const timeoutId of state.validationTimeoutIds.values()) {
        window.clearTimeout(timeoutId);
    }
    state.validationTimeoutIds.clear();
}
function updateValidationStatus(options = {}) {
    const puzzle = state.puzzle;
    if (!puzzle) {
        return;
    }
    const result = validateBoard(state.board, puzzle);
    const violationKeys = collectViolationKeys(result.violations);
    reconcileWrongCellOrders(violationKeys);
    reconcilePendingWrongCells(violationKeys);
    if (result.solved) {
        clearPendingValidation();
        resetWrongCellTracking();
        state.violationKeys = new Set();
        if (!state.solved) {
            stopTimer();
            state.solved = true;
        }
        const elapsed = formatElapsedTime(state.elapsedSeconds);
        unlockNextStage(puzzle.stage);
        statusText.textContent =
            puzzle.stage >= puzzle.totalStages
                ? `마지막 Stage 완료. ${elapsed}`
                : `완료. ${elapsed}`;
        updateControls();
        renderStageGrid();
        return;
    }
    if (options.focusKey) {
        confirmPendingWrongCell(options.focusKey, violationKeys);
    }
    state.violationKeys = selectFirstWrongCell(violationKeys);
    if (result.violations.length > 0) {
        updateViolationStatusMessage();
        updateControls();
        return;
    }
    statusText.textContent = "";
    updateControls();
}
function updateViolationStatusMessage() {
    statusText.textContent =
        state.violationKeys.size > 0 ? "표시된 칸을 다시 확인하세요." : "";
}
function registerPendingWrongCell(key) {
    if (!state.pendingWrongCellOrders.has(key)) {
        state.pendingWrongCellOrders.set(key, state.nextWrongCellOrder);
        state.nextWrongCellOrder += 1;
    }
}
function confirmPendingWrongCell(key, currentViolationKeys) {
    const order = state.pendingWrongCellOrders.get(key);
    state.pendingWrongCellOrders.delete(key);
    clearPendingValidation(key);
    if (order === undefined) {
        return;
    }
    if ((currentViolationKeys === undefined || currentViolationKeys.has(key)) && hasCurrentCellValue(key)) {
        state.wrongCellOrders.set(key, order);
    }
    else {
        state.wrongCellOrders.delete(key);
    }
}
function confirmPendingWrongCellsExcept(focusKey) {
    for (const key of Array.from(state.pendingWrongCellOrders.keys())) {
        if (key !== focusKey) {
            confirmPendingWrongCell(key);
        }
    }
}
function reconcileWrongCellOrders(currentViolationKeys) {
    for (const key of state.wrongCellOrders.keys()) {
        if (!currentViolationKeys.has(key) || !hasCurrentCellValue(key)) {
            state.wrongCellOrders.delete(key);
        }
    }
}
function reconcilePendingWrongCells(currentViolationKeys) {
    for (const key of state.pendingWrongCellOrders.keys()) {
        if (!currentViolationKeys.has(key) || !hasCurrentCellValue(key)) {
            state.pendingWrongCellOrders.delete(key);
            clearPendingValidation(key);
        }
    }
}
function selectFirstWrongCell(currentViolationKeys) {
    let firstKey = null;
    let firstOrder = Number.POSITIVE_INFINITY;
    for (const [key, order] of state.wrongCellOrders) {
        if (currentViolationKeys.has(key) && order < firstOrder) {
            firstKey = key;
            firstOrder = order;
        }
    }
    return firstKey ? new Set([firstKey]) : new Set();
}
function resetWrongCellTracking() {
    state.pendingWrongCellOrders.clear();
    state.wrongCellOrders.clear();
    state.nextWrongCellOrder = 1;
}
function hasNewViolationForCell(beforeViolations, afterViolations, focusKey) {
    const beforeSignatures = new Set(beforeViolations.map(getViolationSignature));
    return afterViolations.some((violation) => {
        return (!beforeSignatures.has(getViolationSignature(violation)) &&
            violation.cells.some((cell) => cellKey(cell.row, cell.col) === focusKey));
    });
}
function getViolationSignature(violation) {
    const cells = violation.cells
        .map((cell) => cellKey(cell.row, cell.col))
        .sort()
        .join("|");
    return `${violation.kind}:${cells}`;
}
function hasCurrentCellValue(key) {
    const [rowText, colText] = key.split(":");
    const row = Number(rowText);
    const col = Number(colText);
    return state.board[row]?.[col] !== null && state.board[row]?.[col] !== undefined;
}
function unlockNextStage(stage) {
    if (!state.puzzle) {
        return;
    }
    const nextUnlocked = nextUnlockedStage(stage, state.puzzle.totalStages, state.unlockedStage);
    if (nextUnlocked > state.unlockedStage) {
        state.unlockedStage = nextUnlocked;
        localStorage.setItem(progressKey(), String(nextUnlocked));
        renderSelectedPackHeader();
    }
}
function updateControls() {
    menuButton.disabled = state.loading;
    backToMenuButton.disabled = state.loading;
    backToStagesButton.disabled = state.loading || state.stages.length === 0;
    checkpointSaveButton.disabled = state.loading || !state.puzzle || state.solved;
    checkpointRestoreButton.disabled =
        state.loading || !state.puzzle || !state.checkpoint;
    checkpointSaveButton.textContent = state.checkpoint
        ? "체크포인트 덮어쓰기"
        : "체크포인트 저장";
    hintButton.disabled = state.loading || !state.puzzle || state.solved;
    nextStageButton.disabled =
        state.loading ||
            !state.puzzle ||
            !state.solved ||
            state.puzzle.stage >= state.unlockedStage ||
            state.puzzle.stage >= state.stages.length;
    resetButton.disabled = state.loading || !state.puzzle;
}
function clearHint() {
    state.hint = null;
    hintText.textContent = "";
}
async function getHintSolution() {
    if (!state.puzzle) {
        return null;
    }
    if (state.hintSolution) {
        return state.hintSolution;
    }
    const { solvePuzzle } = await import("../solver/solvePuzzle.js");
    const result = solvePuzzle(state.puzzle);
    state.hintSolution = result.solution ?? null;
    return state.hintSolution;
}
function startTimer() {
    clearTimerInterval();
    state.timerStartedAtMs = Date.now();
    updateTimerText();
    state.timerIntervalId = window.setInterval(updateElapsedTime, 1000);
}
function stopTimer() {
    updateElapsedTime();
    state.timerStartedAtMs = null;
    clearTimerInterval();
    updateTimerText();
}
function clearTimerInterval() {
    if (state.timerIntervalId !== null) {
        window.clearInterval(state.timerIntervalId);
        state.timerIntervalId = null;
    }
}
function updateElapsedTime() {
    if (state.timerStartedAtMs !== null) {
        state.elapsedSeconds = Math.floor((Date.now() - state.timerStartedAtMs) / 1000);
    }
    updateTimerText();
}
function updateTimerText() {
    timerText.textContent = `풀이 시간 ${formatElapsedTime(state.elapsedSeconds)}`;
}
function setLoading(loading) {
    state.loading = loading;
    renderMenuChoices();
    renderStageGrid();
    updateControls();
}
function getUnlockedStage() {
    return getStoredUnlockedStage(state.selectedSize, state.selectedDifficulty, state.stages.length);
}
function getStoredUnlockedStage(size, difficulty, totalStages) {
    const stored = Number(localStorage.getItem(stageProgressKey(size, difficulty)) ?? "1");
    return clampStage(stored, Math.max(totalStages, 1));
}
function progressKey() {
    return stageProgressKey(state.selectedSize, state.selectedDifficulty);
}
function getPackCount(size, difficulty) {
    const group = state.menu.find((item) => item.size === size);
    const option = group?.difficulties.find((item) => item.key === difficulty);
    return option?.count ?? 0;
}
function hasAnyPlayablePack() {
    return PACK_OPTIONS.some((option) => getPackCount(option.size, option.difficulty) > 0);
}
function collectViolationKeys(violations) {
    const keys = new Set();
    for (const violation of violations) {
        for (const cell of violation.cells) {
            keys.add(cellKey(cell.row, cell.col));
        }
    }
    return keys;
}
function nextValue(value) {
    if (value === null) {
        return "A";
    }
    if (value === "A") {
        return "B";
    }
    return null;
}
function cellKey(row, col) {
    return `${row}:${col}`;
}
function getCellLabel(row, col, value, isGiven) {
    const stateLabel = value ? VALUE_TO_LABEL[value] : "empty";
    return `Row ${row + 1}, column ${col + 1}, ${isGiven ? "fixed " : ""}${stateLabel}`;
}
function requireElement(selector) {
    const element = document.querySelector(selector);
    if (!element) {
        throw new Error(`Missing required element: ${selector}`);
    }
    return element;
}
