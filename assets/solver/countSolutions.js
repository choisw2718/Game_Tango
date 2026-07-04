/**
 * solver/countSolutions.ts
 *
 * 퍼즐의 해답 개수를 센다. 고유 해답 판정의 핵심.
 *
 * 성능을 위해 limit(기본 2)까지만 센다.
 *   count 0 → 풀 수 없음
 *   count 1 → 고유 해답
 *   count 2 → "2개 이상 발견" (정확히 2라는 뜻이 아니라 고유가 아니라는 뜻)
 */
import { cloneDraft, isComplete } from "../core/rules.js";
import { makeContext, boardFromGivens } from "./context.js";
import { propagate } from "./constraintPropagation.js";
import { chooseNextCell } from "./chooseNextCell.js";
function search(board, ctx, state, limit) {
    if (propagate(board, ctx) === "contradiction") {
        state.backtrack++;
        return;
    }
    if (isComplete(board)) {
        state.count++;
        if (state.first === undefined) {
            state.first = board.map((row) => row.slice());
        }
        return;
    }
    const pick = chooseNextCell(board, ctx);
    if (pick === null)
        return; // 도달하지 않음(완성은 위에서 처리)
    if (pick.values.length === 0) {
        state.backtrack++;
        return;
    }
    for (const v of pick.values) {
        const child = cloneDraft(board);
        child[pick.row][pick.col] = v;
        state.branch++;
        search(child, ctx, state, limit);
        if (state.count >= limit)
            return;
    }
}
export function countSolutions(puzzle, limit = 2) {
    const ctx = makeContext(puzzle);
    const state = {
        count: 0,
        first: undefined,
        branch: 0,
        backtrack: 0,
    };
    const board = boardFromGivens(puzzle.size, puzzle.givens);
    search(board, ctx, state, limit);
    const count = Math.min(state.count, limit);
    return {
        count,
        ...(state.first !== undefined ? { firstSolution: state.first } : {}),
        branchCount: state.branch,
        backtrackCount: state.backtrack,
    };
}
