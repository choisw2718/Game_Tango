import { cloneBoard, normalizeConstraint, } from "../core/rules.js";
import { validateBoard } from "../core/validateBoard.js";
import { getNextHint } from "../game/hintEngine.js";
import { canUndo, createUndoHistory, popUndoSnapshot, recordUndoSnapshot, resetUndoHistory, } from "../game/undoHistory.js";
import { clampStage, createDraftBoard, formatElapsedTime, loadStageList, loadStageMenu, loadStagePuzzle, nextUnlockedStage, stageProgressKey, } from "./puzzleData.js";
import { createAccount, createLinkCode, ensureAnonymousSession, getSolvedCountLeaderboard, getMyAccount, getProgress, redeemLinkCode, recordStageSolve, saveProgress, } from "./supabaseClient.js";
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
const TUTORIAL_STORAGE_KEY = "tango:tutorial-seen:v3";
const TOTAL_PLAY_SECONDS_KEY = "tango:total-play-seconds";
const CLOUD_PROGRESS_VERSION = 2;
const NICKNAME_TAKEN_MESSAGE = "Nickname is already taken.";
const LEADERBOARD_LIMIT = 50;
const VALUE_TO_CLASS = {
    A: "filled",
    B: "hollow",
};
const VALUE_TO_LABEL = {
    A: "black",
    B: "white",
};
const state = {
    view: "account",
    account: null,
    guestMode: false,
    menu: [],
    selectedSize: 6,
    selectedDifficulty: "easy",
    stages: [],
    unlockedStage: 1,
    puzzle: null,
    board: [],
    undoHistory: createUndoHistory(),
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
    progress: createEmptyProgress(),
    progressLoaded: false,
    progressSaveTimeoutId: null,
    progressSaveInFlight: false,
    progressSavePending: false,
    leaderboard: [],
    leaderboardLoading: false,
};
const accountBar = requireElement("#accountBar");
const accountLabel = requireElement("#accountLabel");
const accountNickname = requireElement("#accountNickname");
const createLinkCodeButton = requireElement("#createLinkCodeButton");
const linkCodeText = requireElement("#linkCodeText");
const accountScreen = requireElement("#accountScreen");
const createAccountForm = requireElement("#createAccountForm");
const createNicknameInput = requireElement("#createNicknameInput");
const createAccountButton = requireElement("#createAccountButton");
const linkAccountForm = requireElement("#linkAccountForm");
const linkNicknameInput = requireElement("#linkNicknameInput");
const linkCodeInput = requireElement("#linkCodeInput");
const linkAccountButton = requireElement("#linkAccountButton");
const guestPlayButton = requireElement("#guestPlayButton");
const accountStatus = requireElement("#accountStatus");
const accountAlertModal = requireElement("#accountAlertModal");
const accountAlertCloseButton = requireElement("#accountAlertCloseButton");
const accountAlertTitle = requireElement("#accountAlertTitle");
const accountAlertMessage = requireElement("#accountAlertMessage");
const menuButton = requireElement("#menuButton");
const profileButton = requireElement("#profileButton");
const leaderboardButton = requireElement("#leaderboardButton");
const tutorialButton = requireElement("#tutorialButton");
const tutorialModal = requireElement("#tutorialModal");
const tutorialCloseButton = requireElement("#tutorialCloseButton");
const tutorialPrevButton = requireElement("#tutorialPrevButton");
const tutorialNextButton = requireElement("#tutorialNextButton");
const tutorialStartButton = requireElement("#tutorialStartButton");
const menuScreen = requireElement("#menuScreen");
const choiceGrid = requireElement("#choiceGrid");
const menuStatus = requireElement("#menuStatus");
const profileScreen = requireElement("#profileScreen");
const profileName = requireElement("#profileName");
const profileMode = requireElement("#profileMode");
const profileTotalTime = requireElement("#profileTotalTime");
const profileClearedStages = requireElement("#profileClearedStages");
const profileStatus = requireElement("#profileStatus");
const profilePlayButton = requireElement("#profilePlayButton");
const leaderboardScreen = requireElement("#leaderboardScreen");
const leaderboardRefreshButton = requireElement("#leaderboardRefreshButton");
const leaderboardMyCard = requireElement("#leaderboardMyCard");
const leaderboardMyRank = requireElement("#leaderboardMyRank");
const leaderboardMyCopy = requireElement("#leaderboardMyCopy");
const leaderboardList = requireElement("#leaderboardList");
const leaderboardStatus = requireElement("#leaderboardStatus");
const stageScreen = requireElement("#stageScreen");
const selectedPackTitle = requireElement("#selectedPackTitle");
const selectedPackMeta = requireElement("#selectedPackMeta");
const backToMenuButton = requireElement("#backToMenuButton");
const stageGrid = requireElement("#stageGrid");
const stageStatus = requireElement("#stageStatus");
const gameScreen = requireElement("#gameScreen");
const backToStagesButton = requireElement("#backToStagesButton");
const nextStageButton = requireElement("#nextStageButton");
const undoButton = requireElement("#undoButton");
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
const completionModal = requireElement("#completionModal");
const completionConfetti = requireElement("#completionConfetti");
const completionElapsedText = requireElement("#completionElapsedText");
const completionRankText = requireElement("#completionRankText");
const completionStageText = requireElement("#completionStageText");
const completionCloseButton = requireElement("#completionCloseButton");
const completionStageListButton = requireElement("#completionStageListButton");
const completionNextStageButton = requireElement("#completionNextStageButton");
let tutorialPreviouslyFocused = null;
let tutorialPageIndex = 0;
let accountAlertPreviouslyFocused = null;
let completionPreviouslyFocused = null;
let completionEffectCleanupId = null;
let completionRankingRequestId = 0;
let leaderboardRequestId = 0;
const CONFETTI_COLORS = ["#0f8f65", "#0f7c55", "#f0ca2e", "#c2475a", "#1d6fd8", "#151a17"];
const CONFETTI_COUNT = 64;
createAccountForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void handleCreateAccount();
});
linkAccountForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void handleRedeemLinkCode();
});
createLinkCodeButton.addEventListener("click", () => {
    void handleCreateLinkCode();
});
guestPlayButton.addEventListener("click", () => {
    void handleGuestPlay();
});
menuButton.addEventListener("click", () => {
    showMenuScreen();
});
profileButton.addEventListener("click", () => {
    showProfileScreen();
});
leaderboardButton.addEventListener("click", () => {
    showLeaderboardScreen();
});
leaderboardRefreshButton.addEventListener("click", () => {
    void loadLeaderboard();
});
tutorialButton.addEventListener("click", () => {
    showTutorial();
});
profilePlayButton.addEventListener("click", () => {
    showMenuScreen();
});
tutorialCloseButton.addEventListener("click", () => {
    hideTutorial();
});
tutorialPrevButton.addEventListener("click", () => {
    setTutorialPage(tutorialPageIndex - 1, true);
});
tutorialNextButton.addEventListener("click", () => {
    setTutorialPage(tutorialPageIndex + 1, true);
});
tutorialStartButton.addEventListener("click", () => {
    hideTutorial();
});
tutorialModal.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof Element && target.hasAttribute("data-tutorial-close")) {
        hideTutorial();
    }
});
accountAlertCloseButton.addEventListener("click", () => {
    hideAccountAlert();
});
accountAlertModal.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof Element && target.hasAttribute("data-account-alert-close")) {
        hideAccountAlert();
    }
});
document.addEventListener("keydown", (event) => {
    if (isUndoShortcut(event) &&
        !isEditableElement(document.activeElement) &&
        !hasOpenModal()) {
        if (undoLastMove()) {
            event.preventDefault();
        }
        return;
    }
    if (event.key !== "Escape") {
        return;
    }
    if (!accountAlertModal.classList.contains("is-hidden")) {
        event.preventDefault();
        hideAccountAlert();
        return;
    }
    if (!tutorialModal.classList.contains("is-hidden")) {
        event.preventDefault();
        hideTutorial();
        return;
    }
    if (!completionModal.classList.contains("is-hidden")) {
        event.preventDefault();
        hideCompletionDialog();
    }
});
completionModal.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof Element && target.hasAttribute("data-completion-close")) {
        hideCompletionDialog();
    }
});
completionCloseButton.addEventListener("click", () => {
    hideCompletionDialog();
});
completionStageListButton.addEventListener("click", () => {
    hideCompletionDialog(false);
    showStageScreen();
});
completionNextStageButton.addEventListener("click", () => {
    if (!state.puzzle || state.loading || !state.solved) {
        return;
    }
    const nextStage = state.puzzle.stage + 1;
    if (nextStage <= state.unlockedStage && nextStage <= state.stages.length) {
        hideCompletionDialog(false);
        void loadStage(nextStage);
    }
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
undoButton.addEventListener("click", () => {
    undoLastMove();
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
    recordUndoSnapshot(state.undoHistory, state.board);
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
    updateControls();
    if (hasCurrentCellValue(focusKey) &&
        hasNewViolationForCell(beforeResult.violations, result.violations, focusKey)) {
        registerPendingWrongCell(focusKey);
        scheduleValidationStatus(row, col);
    }
});
showTutorialOnFirstVisit();
void initialize();
function showTutorialOnFirstVisit() {
    if (!hasSeenTutorial()) {
        showTutorial();
    }
}
function showTutorial() {
    tutorialPreviouslyFocused =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setTutorialPage(0, false);
    tutorialModal.classList.remove("is-hidden");
    tutorialModal.setAttribute("aria-hidden", "false");
    syncModalOpenState();
    tutorialNextButton.focus();
}
function hideTutorial() {
    if (tutorialModal.classList.contains("is-hidden")) {
        return;
    }
    markTutorialSeen();
    tutorialModal.classList.add("is-hidden");
    tutorialModal.setAttribute("aria-hidden", "true");
    syncModalOpenState();
    tutorialPreviouslyFocused?.focus();
    tutorialPreviouslyFocused = null;
}
function showAccountAlert() {
    accountAlertPreviouslyFocused =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    accountAlertTitle.textContent = NICKNAME_TAKEN_MESSAGE;
    accountAlertMessage.textContent = "Please choose another nickname.";
    accountAlertModal.classList.remove("is-hidden");
    accountAlertModal.setAttribute("aria-hidden", "false");
    syncModalOpenState();
    accountAlertCloseButton.focus();
}
function hideAccountAlert() {
    if (accountAlertModal.classList.contains("is-hidden")) {
        return;
    }
    accountAlertModal.classList.add("is-hidden");
    accountAlertModal.setAttribute("aria-hidden", "true");
    syncModalOpenState();
    accountAlertPreviouslyFocused?.focus();
    accountAlertPreviouslyFocused = null;
}
function showCompletionDialog(puzzle, elapsed, elapsedSeconds) {
    completionPreviouslyFocused =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    completionRankingRequestId += 1;
    const rankingRequestId = completionRankingRequestId;
    completionElapsedText.textContent = `풀이 시간 ${elapsed}`;
    completionRankText.textContent = state.account
        ? "순위 계산 중..."
        : "닉네임 계정으로 플레이하면 전체 순위를 기록할 수 있습니다.";
    const canGoNext = puzzle.stage < state.unlockedStage && puzzle.stage < state.stages.length;
    completionStageText.textContent =
        puzzle.stage >= puzzle.totalStages
            ? "마지막 Stage를 완료했습니다."
            : `Stage ${puzzle.stage}를 완료했습니다. 다음 Stage로 진행할 수 있습니다.`;
    completionNextStageButton.classList.toggle("is-hidden", !canGoNext);
    completionNextStageButton.disabled = !canGoNext;
    completionModal.classList.remove("is-hidden");
    completionModal.setAttribute("aria-hidden", "false");
    syncModalOpenState();
    playCompletionEffects();
    window.requestAnimationFrame(() => {
        if (!completionModal.classList.contains("is-hidden")) {
            (canGoNext ? completionNextStageButton : completionStageListButton).focus();
        }
    });
    if (state.account) {
        void updateCompletionRanking(puzzle, elapsedSeconds, rankingRequestId);
    }
}
async function updateCompletionRanking(puzzle, elapsedSeconds, requestId) {
    try {
        const ranking = await recordStageSolve({
            puzzleId: puzzle.id,
            size: puzzle.size,
            difficulty: puzzle.gameDifficultyKey,
            stage: puzzle.stage,
            elapsedSeconds: Math.max(1, Math.trunc(elapsedSeconds)),
        });
        state.leaderboard = [];
        if (requestId !== completionRankingRequestId) {
            return;
        }
        completionRankText.textContent = formatSolveRanking(ranking);
    }
    catch (error) {
        console.error("Failed to record solve ranking", error);
        if (requestId === completionRankingRequestId) {
            completionRankText.textContent = "순위를 불러오지 못했습니다.";
        }
    }
}
function formatSolveRanking(ranking) {
    const rank = normalizePositiveInteger(ranking.solve_rank, 1);
    const total = normalizePositiveInteger(ranking.solver_count, rank);
    const bestSeconds = normalizeSecondsValue(ranking.best_seconds);
    if (ranking.improved) {
        return `이 문제를 푼 ${total}명 중 ${rank}번째로 빠릅니다.`;
    }
    return `내 최고 기록 ${formatElapsedTime(bestSeconds)} 기준, ${total}명 중 ${rank}번째입니다.`;
}
function hideCompletionDialog(restoreFocus = true) {
    if (completionModal.classList.contains("is-hidden")) {
        return;
    }
    completionModal.classList.add("is-hidden");
    completionModal.setAttribute("aria-hidden", "true");
    clearCompletionEffects();
    syncModalOpenState();
    if (restoreFocus) {
        completionPreviouslyFocused?.focus();
    }
    completionPreviouslyFocused = null;
}
function playCompletionEffects() {
    triggerSuccessHaptic();
    launchConfetti();
    completionModal.classList.remove("is-celebrating");
    window.requestAnimationFrame(() => {
        if (!completionModal.classList.contains("is-hidden")) {
            completionModal.classList.add("is-celebrating");
        }
    });
}
function triggerSuccessHaptic() {
    const vibrationNavigator = navigator;
    if (typeof vibrationNavigator.vibrate !== "function") {
        return;
    }
    try {
        vibrationNavigator.vibrate([35, 35, 70]);
    }
    catch {
        // Unsupported browsers and device settings can block vibration.
    }
}
function launchConfetti() {
    clearCompletionEffects();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
    }
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < CONFETTI_COUNT; index += 1) {
        const piece = document.createElement("span");
        const width = 6 + Math.round(Math.random() * 7);
        const height = 8 + Math.round(Math.random() * 12);
        piece.className = Math.random() > 0.72 ? "confetti-piece is-round" : "confetti-piece";
        piece.style.setProperty("--x", String(3 + Math.random() * 94));
        piece.style.setProperty("--drift", `${Math.round((Math.random() - 0.5) * 260)}px`);
        piece.style.setProperty("--delay", `${Math.random() * 0.22}s`);
        piece.style.setProperty("--duration", `${1.05 + Math.random() * 0.8}s`);
        piece.style.setProperty("--rotate", `${Math.round(260 + Math.random() * 620)}deg`);
        piece.style.setProperty("--piece-width", `${width}px`);
        piece.style.setProperty("--piece-height", `${height}px`);
        const pieceColor = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)] ?? "#0f8f65";
        piece.style.setProperty("--piece-color", pieceColor);
        fragment.append(piece);
    }
    completionConfetti.append(fragment);
    completionEffectCleanupId = window.setTimeout(clearCompletionEffects, 2400);
}
function clearCompletionEffects() {
    if (completionEffectCleanupId !== null) {
        window.clearTimeout(completionEffectCleanupId);
        completionEffectCleanupId = null;
    }
    completionConfetti.innerHTML = "";
    completionModal.classList.remove("is-celebrating");
}
function syncModalOpenState() {
    const hasOpenModal = !accountAlertModal.classList.contains("is-hidden") ||
        !tutorialModal.classList.contains("is-hidden") ||
        !completionModal.classList.contains("is-hidden");
    document.body.classList.toggle("modal-open", hasOpenModal);
}
function hasSeenTutorial() {
    try {
        return window.localStorage.getItem(TUTORIAL_STORAGE_KEY) === "true";
    }
    catch {
        return false;
    }
}
function markTutorialSeen() {
    try {
        window.localStorage.setItem(TUTORIAL_STORAGE_KEY, "true");
    }
    catch {
        // localStorage can be unavailable in strict privacy modes.
    }
}
function setTutorialPage(pageIndex, shouldFocusAction) {
    const pages = Array.from(document.querySelectorAll(".tutorial-page"));
    if (pages.length === 0) {
        return;
    }
    tutorialPageIndex = Math.max(0, Math.min(pageIndex, pages.length - 1));
    const isFirstPage = tutorialPageIndex === 0;
    const isLastPage = tutorialPageIndex === pages.length - 1;
    for (const [index, page] of pages.entries()) {
        const isActive = index === tutorialPageIndex;
        page.classList.toggle("is-hidden", !isActive);
        page.setAttribute("aria-hidden", String(!isActive));
    }
    tutorialPrevButton.classList.toggle("is-hidden", isFirstPage);
    tutorialPrevButton.disabled = isFirstPage;
    tutorialNextButton.classList.toggle("is-hidden", isLastPage);
    tutorialNextButton.disabled = isLastPage;
    tutorialStartButton.classList.toggle("is-hidden", !isLastPage);
    if (shouldFocusAction) {
        (isLastPage ? tutorialStartButton : tutorialNextButton).focus();
    }
}
async function initialize() {
    setView("account");
    setLoading(true);
    setAccountBusy(true);
    accountStatus.textContent = "Supabase 익명 로그인과 닉네임 계정을 확인하는 중입니다.";
    try {
        await ensureAnonymousSession();
        if (state.guestMode) {
            return;
        }
        state.account = await getMyAccount();
        if (state.guestMode) {
            return;
        }
        renderAccountState();
        if (!state.account) {
            accountStatus.textContent =
                "이 기기는 아직 닉네임 계정에 연결되어 있지 않습니다.";
            return;
        }
        await loadAccountProgress();
        await loadGameMenu();
    }
    catch (error) {
        if (state.guestMode) {
            return;
        }
        accountStatus.textContent = getErrorMessage(error, "Supabase 계정 정보를 불러오지 못했습니다.");
    }
    finally {
        renderAccountState();
        setAccountBusy(false);
        setLoading(false);
    }
}
async function loadGameMenu() {
    setView("menu");
    menuStatus.textContent = "게임 목록을 불러오는 중입니다.";
    state.menu = await loadStageMenu();
    renderMenuChoices();
    renderProfileStats();
    menuStatus.textContent = hasAnyPlayablePack()
        ? "원하는 카드를 누르면 Stage 목록으로 이동합니다."
        : "사용 가능한 DB 문제가 없습니다.";
}
async function handleCreateAccount() {
    const nickname = createNicknameInput.value.trim();
    if (!nickname) {
        accountStatus.textContent = "닉네임을 입력하세요.";
        return;
    }
    setAccountBusy(true);
    setLoading(true);
    accountStatus.textContent = "닉네임 계정을 만드는 중입니다.";
    try {
        state.account = await createAccount(nickname);
        state.guestMode = false;
        createNicknameInput.value = "";
        renderAccountState();
        await loadAccountProgress();
        await loadGameMenu();
    }
    catch (error) {
        const message = getErrorMessage(error, "닉네임 계정을 만들지 못했습니다.");
        accountStatus.textContent = message;
        if (isNicknameTakenMessage(message)) {
            showAccountAlert();
        }
    }
    finally {
        setAccountBusy(false);
        setLoading(false);
        renderAccountState();
    }
}
async function handleRedeemLinkCode() {
    const nickname = linkNicknameInput.value.trim();
    const code = linkCodeInput.value.trim();
    if (!nickname || !code) {
        accountStatus.textContent = "닉네임과 6자리 연결 코드를 입력하세요.";
        return;
    }
    setAccountBusy(true);
    setLoading(true);
    accountStatus.textContent = "기존 닉네임 계정에 연결하는 중입니다.";
    try {
        const account = await redeemLinkCode(nickname, code);
        if (!account) {
            accountStatus.textContent = "닉네임이나 연결 코드가 올바르지 않습니다.";
            return;
        }
        state.account = account;
        state.guestMode = false;
        linkNicknameInput.value = "";
        linkCodeInput.value = "";
        renderAccountState();
        await loadAccountProgress();
        await loadGameMenu();
    }
    catch (error) {
        accountStatus.textContent = getErrorMessage(error, "기존 계정에 연결하지 못했습니다.");
    }
    finally {
        setAccountBusy(false);
        setLoading(false);
        renderAccountState();
    }
}
async function handleCreateLinkCode() {
    if (!state.account) {
        return;
    }
    createLinkCodeButton.disabled = true;
    linkCodeText.classList.remove("is-hidden");
    linkCodeText.textContent = "코드 생성 중";
    try {
        const linkCode = await createLinkCode();
        const expiresAt = new Date(linkCode.expires_at);
        const expiresText = Number.isNaN(expiresAt.getTime())
            ? "10분 후 만료"
            : `${expiresAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} 만료`;
        linkCodeText.textContent = `${linkCode.code} (${expiresText})`;
    }
    catch (error) {
        linkCodeText.textContent = getErrorMessage(error, "연결 코드를 만들지 못했습니다.");
    }
    finally {
        updateControls();
    }
}
async function handleGuestPlay() {
    state.account = null;
    state.guestMode = true;
    state.progress = readLocalProgress();
    state.progressLoaded = true;
    renderAccountState();
    setAccountBusy(true);
    setLoading(true);
    accountStatus.textContent = "게스트 모드로 시작합니다. 진행도는 이 브라우저에만 저장됩니다.";
    try {
        await loadGameMenu();
    }
    catch (error) {
        setView("account");
        accountStatus.textContent = getErrorMessage(error, "게임 목록을 불러오지 못했습니다.");
    }
    finally {
        setAccountBusy(false);
        setLoading(false);
        renderAccountState();
    }
}
async function loadAccountProgress() {
    const remoteProgress = normalizeCloudProgress(await getProgress());
    const localProgress = readLocalProgress();
    const merged = mergeProgress(remoteProgress, localProgress);
    state.progress = merged.progress;
    state.progressLoaded = true;
    writeProgressToLocalStorage(state.progress);
    renderProfileStats();
    if (merged.shouldSave) {
        await saveProgress(state.progress);
    }
}
function renderAccountState() {
    const account = state.account;
    const canPlayCurrentSession = canPlay();
    accountBar.classList.toggle("is-hidden", !canPlayCurrentSession);
    accountLabel.textContent = account ? "닉네임" : "모드";
    accountNickname.textContent = account?.account_nickname ?? (state.guestMode ? "게스트" : "");
    createLinkCodeButton.classList.toggle("is-hidden", !account);
    if (!account) {
        linkCodeText.classList.add("is-hidden");
        linkCodeText.textContent = "";
    }
    updateControls();
    renderProfileStats();
}
function setAccountBusy(busy) {
    createNicknameInput.disabled = busy;
    createAccountButton.disabled = busy;
    linkNicknameInput.disabled = busy;
    linkCodeInput.disabled = busy;
    linkAccountButton.disabled = busy;
    createLinkCodeButton.disabled = busy || !state.account;
    guestPlayButton.disabled = state.guestMode;
}
function canPlay() {
    return state.account !== null || state.guestMode;
}
function createEmptyProgress() {
    return {
        version: CLOUD_PROGRESS_VERSION,
        stages: {},
        totalPlaySeconds: 0,
        updatedAt: new Date(0).toISOString(),
    };
}
function readLocalProgress() {
    const progress = createEmptyProgress();
    progress.totalPlaySeconds = readLocalTotalPlaySeconds();
    for (const option of PACK_OPTIONS) {
        const stage = readLocalUnlockedStage(option.size, option.difficulty);
        if (stage > 1) {
            progress.stages[progressStageId(option.size, option.difficulty)] = stage;
        }
    }
    return progress;
}
function normalizeCloudProgress(input) {
    if (!isRecord(input)) {
        return createEmptyProgress();
    }
    const progress = createEmptyProgress();
    const rawStages = isRecord(input.stages) ? input.stages : {};
    progress.totalPlaySeconds = normalizeSecondsValue(input.totalPlaySeconds);
    progress.updatedAt = typeof input.updatedAt === "string" ? input.updatedAt : progress.updatedAt;
    for (const option of PACK_OPTIONS) {
        const key = progressStageId(option.size, option.difficulty);
        const stage = normalizeStageValue(rawStages[key]);
        if (stage > 1) {
            progress.stages[key] = stage;
        }
    }
    return progress;
}
function mergeProgress(remoteProgress, localProgress) {
    const progress = createEmptyProgress();
    let shouldSave = false;
    for (const option of PACK_OPTIONS) {
        const key = progressStageId(option.size, option.difficulty);
        const remoteStage = remoteProgress.stages[key] ?? 1;
        const localStage = localProgress.stages[key] ?? 1;
        const mergedStage = Math.max(remoteStage, localStage);
        if (mergedStage > 1) {
            progress.stages[key] = mergedStage;
        }
        if (mergedStage !== remoteStage) {
            shouldSave = true;
        }
    }
    const mergedTotalPlaySeconds = Math.max(remoteProgress.totalPlaySeconds, localProgress.totalPlaySeconds);
    progress.totalPlaySeconds = mergedTotalPlaySeconds;
    if (mergedTotalPlaySeconds !== remoteProgress.totalPlaySeconds) {
        shouldSave = true;
    }
    progress.updatedAt = shouldSave ? new Date().toISOString() : remoteProgress.updatedAt;
    return { progress, shouldSave };
}
function updateProgressStage(size, difficulty, unlockedStage) {
    const key = progressStageId(size, difficulty);
    const normalizedStage = Math.max(1, Math.trunc(unlockedStage));
    const currentStage = state.progress.stages[key] ?? 1;
    if (normalizedStage <= currentStage) {
        return;
    }
    state.progress.stages[key] = normalizedStage;
    state.progress.updatedAt = new Date().toISOString();
    writeProgressToLocalStorage(state.progress);
    scheduleProgressSave();
}
function scheduleProgressSave() {
    if (!state.account || !state.progressLoaded) {
        return;
    }
    if (state.progressSaveTimeoutId !== null) {
        window.clearTimeout(state.progressSaveTimeoutId);
    }
    state.progressSaveTimeoutId = window.setTimeout(() => {
        state.progressSaveTimeoutId = null;
        void flushProgressSave();
    }, 400);
}
async function flushProgressSave() {
    if (!state.account || !state.progressLoaded) {
        return;
    }
    if (state.progressSaveInFlight) {
        state.progressSavePending = true;
        return;
    }
    state.progressSaveInFlight = true;
    try {
        await saveProgress(state.progress);
    }
    catch (error) {
        console.error("Failed to save Supabase progress", error);
    }
    finally {
        state.progressSaveInFlight = false;
        if (state.progressSavePending) {
            state.progressSavePending = false;
            scheduleProgressSave();
        }
    }
}
function writeProgressToLocalStorage(progress) {
    try {
        for (const option of PACK_OPTIONS) {
            const stage = progress.stages[progressStageId(option.size, option.difficulty)] ?? 1;
            window.localStorage.setItem(stageProgressKey(option.size, option.difficulty), String(stage));
        }
        window.localStorage.setItem(TOTAL_PLAY_SECONDS_KEY, String(progress.totalPlaySeconds));
    }
    catch {
        // localStorage can be unavailable in strict privacy modes.
    }
}
function readLocalTotalPlaySeconds() {
    try {
        return normalizeSecondsValue(window.localStorage.getItem(TOTAL_PLAY_SECONDS_KEY));
    }
    catch {
        return 0;
    }
}
function readLocalUnlockedStage(size, difficulty) {
    try {
        return normalizeStageValue(window.localStorage.getItem(stageProgressKey(size, difficulty)));
    }
    catch {
        return 1;
    }
}
function normalizeStageValue(value) {
    const stage = typeof value === "number" ? value : Number(value);
    return Number.isFinite(stage) && stage > 1 ? Math.trunc(stage) : 1;
}
function normalizeSecondsValue(value) {
    const seconds = typeof value === "number" ? value : Number(value);
    return Number.isFinite(seconds) && seconds > 0 ? Math.trunc(seconds) : 0;
}
function normalizePositiveInteger(value, fallback) {
    const numberValue = typeof value === "number" ? value : Number(value);
    return Number.isFinite(numberValue) && numberValue > 0 ? Math.trunc(numberValue) : fallback;
}
function progressStageId(size, difficulty) {
    return `${size}:${difficulty}`;
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function getErrorMessage(error, fallback) {
    return error instanceof Error ? error.message : fallback;
}
function isNicknameTakenMessage(message) {
    return message.includes(NICKNAME_TAKEN_MESSAGE);
}
async function selectPack(size, difficulty) {
    if (!canPlay()) {
        setView("account");
        return;
    }
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
    if (!canPlay()) {
        setView("account");
        return;
    }
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
    hideCompletionDialog(false);
    clearPendingValidation();
    const emptyBoard = createDraftBoard(state.puzzle);
    if (!boardsEqual(state.board, emptyBoard)) {
        recordUndoSnapshot(state.undoHistory, state.board);
    }
    state.board = emptyBoard;
    state.checkpoint = null;
    clearHint();
    state.violationKeys = new Set();
    resetWrongCellTracking();
    state.solved = false;
    resumeTimer();
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
    hideCompletionDialog(false);
    clearPendingValidation();
    if (!boardsEqual(state.board, state.checkpoint)) {
        recordUndoSnapshot(state.undoHistory, state.board);
    }
    state.board = cloneBoard(state.checkpoint);
    state.solved = false;
    resetWrongCellTracking();
    clearHint();
    updateValidationStatus();
    renderBoard();
    renderStageGrid();
    statusText.textContent = "체크포인트로 되돌렸습니다.";
}
function undoLastMove() {
    if (!state.puzzle || state.loading) {
        return false;
    }
    const previousBoard = popUndoSnapshot(state.undoHistory);
    if (!previousBoard) {
        updateControls();
        return false;
    }
    hideCompletionDialog(false);
    clearPendingValidation();
    state.board = cloneBoard(previousBoard);
    clearHint();
    state.violationKeys = new Set();
    resetWrongCellTracking();
    state.solved = false;
    resumeTimer();
    updateValidationStatus();
    renderBoard();
    renderStageGrid();
    if (!state.solved) {
        statusText.textContent = "실행취소했습니다.";
        updateControls();
    }
    return true;
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
    if (!canPlay()) {
        setView("account");
        return;
    }
    clearCurrentPuzzle();
    setView("menu");
    renderMenuChoices();
    menuStatus.textContent = hasAnyPlayablePack()
        ? "원하는 카드를 누르면 Stage 목록으로 이동합니다."
        : "사용 가능한 DB 문제가 없습니다.";
}
function showProfileScreen() {
    if (!canPlay()) {
        setView("account");
        return;
    }
    clearCurrentPuzzle();
    setView("profile");
    renderProfileStats();
}
function showLeaderboardScreen() {
    if (!canPlay()) {
        setView("account");
        return;
    }
    clearCurrentPuzzle();
    setView("leaderboard");
    renderLeaderboard();
    void loadLeaderboard();
}
async function loadLeaderboard() {
    if (state.leaderboardLoading || !canPlay()) {
        return;
    }
    const requestId = ++leaderboardRequestId;
    state.leaderboardLoading = true;
    leaderboardStatus.textContent = "리더보드를 불러오는 중입니다.";
    updateControls();
    try {
        const entries = await getSolvedCountLeaderboard(LEADERBOARD_LIMIT);
        if (requestId !== leaderboardRequestId) {
            return;
        }
        state.leaderboard = entries;
        renderLeaderboard();
        leaderboardStatus.textContent =
            entries.length > 0
                ? "닉네임 계정으로 완료한 고유 퍼즐만 집계됩니다."
                : "아직 리더보드 기록이 없습니다.";
    }
    catch (error) {
        console.error("Failed to load solved-count leaderboard", error);
        if (requestId === leaderboardRequestId) {
            leaderboardStatus.textContent =
                "리더보드를 불러오지 못했습니다. 잠시 후 다시 시도하세요.";
        }
    }
    finally {
        if (requestId === leaderboardRequestId) {
            state.leaderboardLoading = false;
            updateControls();
        }
    }
}
function showStageScreen() {
    if (!canPlay()) {
        setView("account");
        return;
    }
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
    hideCompletionDialog(false);
    clearPendingValidation();
    stopTimer();
    state.puzzle = null;
    state.board = [];
    resetUndoHistory(state.undoHistory);
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
    accountScreen.classList.toggle("is-hidden", view !== "account");
    menuScreen.classList.toggle("is-hidden", view !== "menu");
    profileScreen.classList.toggle("is-hidden", view !== "profile");
    leaderboardScreen.classList.toggle("is-hidden", view !== "leaderboard");
    stageScreen.classList.toggle("is-hidden", view !== "stages");
    gameScreen.classList.toggle("is-hidden", view !== "puzzle");
    menuButton.classList.toggle("is-active", view === "menu");
    profileButton.classList.toggle("is-active", view === "profile");
    leaderboardButton.classList.toggle("is-active", view === "leaderboard");
    updateControls();
}
function renderProfileStats() {
    const nickname = state.account?.account_nickname ?? (state.guestMode ? "게스트" : "프로필");
    profileName.textContent = nickname;
    profileMode.textContent = state.account ? "닉네임 계정" : state.guestMode ? "게스트 모드" : "";
    profileTotalTime.textContent = formatElapsedTime(state.progress.totalPlaySeconds);
    profileClearedStages.textContent = `${getTotalClearedStageCount()}개`;
    profileStatus.textContent = state.progressLoaded ? "" : "진행도 정보를 불러오는 중입니다.";
}
function renderLeaderboard() {
    leaderboardList.replaceChildren();
    for (const [index, entry] of state.leaderboard.entries()) {
        const rank = normalizePositiveInteger(entry.leaderboard_rank, 1);
        const solvedCount = normalizePositiveInteger(entry.solved_count, 0);
        const row = document.createElement("div");
        row.className = "leaderboard-row";
        row.setAttribute("role", "row");
        if (entry.is_current_user) {
            row.classList.add("is-current-user");
            row.setAttribute("aria-current", "true");
            if (index >= LEADERBOARD_LIMIT) {
                row.classList.add("is-outside-top");
            }
        }
        if (rank <= 3) {
            row.classList.add(`is-rank-${rank}`);
        }
        const rankCell = document.createElement("span");
        rankCell.className = "leaderboard-rank";
        rankCell.setAttribute("role", "cell");
        rankCell.textContent = String(rank);
        const playerCell = document.createElement("span");
        playerCell.className = "leaderboard-player";
        playerCell.setAttribute("role", "cell");
        playerCell.textContent = entry.account_nickname;
        if (entry.is_current_user) {
            const myBadge = document.createElement("span");
            myBadge.className = "leaderboard-me-badge";
            myBadge.textContent = "나";
            playerCell.append(myBadge);
        }
        const countCell = document.createElement("strong");
        countCell.className = "leaderboard-count";
        countCell.setAttribute("role", "cell");
        countCell.textContent = `${solvedCount}개`;
        row.append(rankCell, playerCell, countCell);
        leaderboardList.append(row);
    }
    const myEntry = state.leaderboard.find((entry) => entry.is_current_user);
    leaderboardMyCard.classList.toggle("is-guest", !state.account);
    if (!state.account) {
        leaderboardMyRank.textContent = "게스트 모드";
        leaderboardMyCopy.textContent = "리더보드는 볼 수 있지만 게스트의 완료 기록은 집계되지 않습니다.";
        return;
    }
    if (!myEntry) {
        leaderboardMyRank.textContent = "기록 없음";
        leaderboardMyCopy.textContent = "퍼즐을 하나 완료하면 내 순위가 표시됩니다.";
        return;
    }
    const myRank = normalizePositiveInteger(myEntry.leaderboard_rank, 1);
    const mySolvedCount = normalizePositiveInteger(myEntry.solved_count, 0);
    leaderboardMyRank.textContent = `${myRank}위`;
    leaderboardMyCopy.textContent = `${state.account.account_nickname}님은 고유 퍼즐 ${mySolvedCount}개를 완료했습니다.`;
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
        const newlySolved = !state.solved;
        if (newlySolved) {
            stopTimer();
            state.solved = true;
        }
        const elapsedSeconds = state.elapsedSeconds;
        const elapsed = formatElapsedTime(elapsedSeconds);
        unlockNextStage(puzzle.stage);
        statusText.textContent =
            puzzle.stage >= puzzle.totalStages
                ? `마지막 Stage 완료. ${elapsed}`
                : `완료. ${elapsed}`;
        updateControls();
        renderStageGrid();
        if (newlySolved) {
            showCompletionDialog(puzzle, elapsed, elapsedSeconds);
        }
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
        updateProgressStage(state.selectedSize, state.selectedDifficulty, nextUnlocked);
        renderSelectedPackHeader();
    }
}
function updateControls() {
    menuButton.disabled = state.loading || !canPlay();
    profileButton.disabled = state.loading || !canPlay();
    leaderboardButton.disabled = state.loading || !canPlay();
    leaderboardRefreshButton.disabled = state.loading || state.leaderboardLoading || !canPlay();
    profilePlayButton.disabled = state.loading || !canPlay();
    createLinkCodeButton.disabled = state.loading || !state.account;
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
    undoButton.disabled = state.loading || !state.puzzle || !canUndo(state.undoHistory);
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
    state.elapsedSeconds = 0;
    clearTimerInterval();
    state.timerStartedAtMs = Date.now();
    updateTimerText();
    state.timerIntervalId = window.setInterval(updateElapsedTime, 1000);
}
function resumeTimer() {
    if (state.timerStartedAtMs === null) {
        state.timerStartedAtMs = Date.now() - state.elapsedSeconds * 1000;
    }
    if (state.timerIntervalId === null) {
        state.timerIntervalId = window.setInterval(updateElapsedTime, 1000);
    }
    updateElapsedTime();
}
function stopTimer() {
    const wasRunning = state.timerStartedAtMs !== null;
    updateElapsedTime();
    state.timerStartedAtMs = null;
    clearTimerInterval();
    updateTimerText();
    if (wasRunning) {
        scheduleProgressSave();
    }
}
function clearTimerInterval() {
    if (state.timerIntervalId !== null) {
        window.clearInterval(state.timerIntervalId);
        state.timerIntervalId = null;
    }
}
function updateElapsedTime() {
    if (state.timerStartedAtMs !== null) {
        const nextElapsedSeconds = Math.max(0, Math.floor((Date.now() - state.timerStartedAtMs) / 1000));
        const elapsedDelta = nextElapsedSeconds - state.elapsedSeconds;
        state.elapsedSeconds = nextElapsedSeconds;
        if (elapsedDelta > 0) {
            addTotalPlaySeconds(elapsedDelta);
        }
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
function addTotalPlaySeconds(deltaSeconds) {
    const normalizedDelta = normalizeSecondsValue(deltaSeconds);
    if (normalizedDelta <= 0 || !state.progressLoaded) {
        return;
    }
    state.progress.totalPlaySeconds += normalizedDelta;
    state.progress.updatedAt = new Date().toISOString();
    writeProgressToLocalStorage(state.progress);
    renderProfileStats();
}
function getTotalClearedStageCount() {
    let clearedStages = 0;
    for (const option of PACK_OPTIONS) {
        const stageCount = getPackCount(option.size, option.difficulty);
        if (stageCount <= 0) {
            continue;
        }
        const unlockedStage = getStoredUnlockedStage(option.size, option.difficulty, stageCount);
        clearedStages += Math.min(Math.max(unlockedStage - 1, 0), stageCount);
    }
    return clearedStages;
}
function getUnlockedStage() {
    return getStoredUnlockedStage(state.selectedSize, state.selectedDifficulty, state.stages.length);
}
function getStoredUnlockedStage(size, difficulty, totalStages) {
    const progressStage = state.progressLoaded
        ? state.progress.stages[progressStageId(size, difficulty)] ?? 1
        : readLocalUnlockedStage(size, difficulty);
    return clampStage(progressStage, Math.max(totalStages, 1));
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
function boardsEqual(left, right) {
    if (left.length !== right.length) {
        return false;
    }
    for (let row = 0; row < left.length; row += 1) {
        const leftRow = left[row];
        const rightRow = right[row];
        if (!leftRow || !rightRow || leftRow.length !== rightRow.length) {
            return false;
        }
        for (let col = 0; col < leftRow.length; col += 1) {
            if (leftRow[col] !== rightRow[col]) {
                return false;
            }
        }
    }
    return true;
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
function isUndoShortcut(event) {
    return ((event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "z");
}
function isEditableElement(element) {
    return (element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement ||
        (element instanceof HTMLElement && element.isContentEditable));
}
function hasOpenModal() {
    return (!accountAlertModal.classList.contains("is-hidden") ||
        !tutorialModal.classList.contains("is-hidden") ||
        !completionModal.classList.contains("is-hidden"));
}
function requireElement(selector) {
    const element = document.querySelector(selector);
    if (!element) {
        throw new Error(`Missing required element: ${selector}`);
    }
    return element;
}
