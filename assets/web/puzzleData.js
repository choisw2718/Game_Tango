export const GAME_DIFFICULTIES = [
    { key: "easy", label: "쉬움" },
    { key: "hard", label: "어려움" },
];
export async function loadStageMenu() {
    const payload = await loadJson(getStaticStageMenuUrl());
    if (!payload.ok) {
        throw new Error(payload.message);
    }
    return payload.groups;
}
export async function loadStageList(size, difficulty) {
    const payload = await loadJson(getStaticStageListUrl(size, difficulty));
    if (!payload.ok) {
        throw new Error(payload.message);
    }
    return payload.stages;
}
export async function loadStagePuzzle(size, difficulty, stage) {
    const payload = await loadJson(getStaticStagePuzzleUrl(size, difficulty, stage));
    if (!payload.ok) {
        throw new Error(payload.message);
    }
    return payload.puzzle;
}
export function getStaticStageMenuUrl() {
    return "data/stages/menu.json";
}
export function getStaticStageListUrl(size, difficulty) {
    return `data/stages/${size}-${difficulty}.json`;
}
export function getStaticStagePuzzleUrl(size, difficulty, stage) {
    return `data/stages/${size}-${difficulty}/${stage}.json`;
}
export function createDraftBoard(puzzle) {
    const board = Array.from({ length: puzzle.size }, () => {
        return Array.from({ length: puzzle.size }, () => null);
    });
    for (const given of puzzle.givens) {
        board[given.row][given.col] = given.value;
    }
    return board;
}
export function stageProgressKey(size, difficulty) {
    return `tango:stage-progress:${size}:${difficulty}`;
}
export function clampStage(stage, totalStages) {
    if (!Number.isFinite(stage) || totalStages <= 0) {
        return 1;
    }
    return Math.max(1, Math.min(Math.trunc(stage), totalStages));
}
export function nextUnlockedStage(completedStage, totalStages, currentUnlockedStage) {
    const nextStage = clampStage(completedStage + 1, totalStages);
    return Math.max(clampStage(currentUnlockedStage, totalStages), nextStage);
}
export function formatElapsedTime(totalSeconds) {
    const seconds = Math.max(0, Math.trunc(totalSeconds));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const restSeconds = seconds % 60;
    if (hours > 0) {
        return `${hours}:${pad2(minutes)}:${pad2(restSeconds)}`;
    }
    return `${minutes}:${pad2(restSeconds)}`;
}
function pad2(value) {
    return String(value).padStart(2, "0");
}
async function loadJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
    }
    return (await response.json());
}
