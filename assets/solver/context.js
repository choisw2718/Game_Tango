/**
 * solver/context.ts
 *
 * solver 가 탐색 동안 반복해서 쓰는 파생 데이터를 한 번만 만들어 들고 다닌다.
 */
import { buildConstraintIndex, emptyDraft, halfOf, } from "../core/rules.js";
export function makeContext(puzzle) {
    return {
        size: puzzle.size,
        half: halfOf(puzzle.size),
        constraints: puzzle.constraints,
        index: buildConstraintIndex(puzzle.constraints),
    };
}
/** 주어진 칸을 채운 초기 DraftBoard 를 만든다. */
export function boardFromGivens(size, givens) {
    const board = emptyDraft(size);
    for (const g of givens) {
        board[g.row][g.col] = g.value;
    }
    return board;
}
