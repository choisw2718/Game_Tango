import { cloneBoard } from "../core/rules.js";
const DEFAULT_HISTORY_LIMIT = 200;
export function createUndoHistory() {
    return [];
}
export function recordUndoSnapshot(history, board, limit = DEFAULT_HISTORY_LIMIT) {
    history.push(cloneBoard(board));
    if (history.length > limit) {
        history.shift();
    }
}
export function popUndoSnapshot(history) {
    return history.pop() ?? null;
}
export function resetUndoHistory(history) {
    history.length = 0;
}
export function canUndo(history) {
    return history.length > 0;
}
