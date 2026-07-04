/**
 * solver/solvePuzzle.ts
 *
 * countSolutions 위에 얹은 편의 래퍼.
 * 베타 사이트의 "정답 확인 / 고유 해답 검증" 등에서 쓴다.
 */
import { isComplete } from "../core/rules.js";
import { countSolutions } from "./countSolutions.js";
import { boardFromGivens, makeContext } from "./context.js";
import { propagate } from "./constraintPropagation.js";
/**
 * 추측(분기) 없이 제약 전파만으로 끝까지 풀리는가?
 *
 * 전파는 "강제된 칸"만 채우는 건전한 추론이므로, 전파만으로 완성되면
 * 그 완성 보드는 유일 해답이다(따라서 propagationSolves ⟹ 고유 해답).
 * 사람이 추론만으로 풀 수 있는 퍼즐인지 판단하는 데 쓴다.
 */
export function propagationSolves(puzzle) {
    const ctx = makeContext(puzzle);
    const board = boardFromGivens(puzzle.size, puzzle.givens);
    if (propagate(board, ctx) === "contradiction")
        return false;
    return isComplete(board);
}
export function solvePuzzle(puzzle) {
    const res = countSolutions(puzzle, 2);
    return {
        solvable: res.count >= 1,
        unique: res.count === 1,
        ...(res.firstSolution !== undefined ? { solution: res.firstSolution } : {}),
        branchCount: res.branchCount,
        backtrackCount: res.backtrackCount,
    };
}
