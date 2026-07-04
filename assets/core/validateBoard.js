/**
 * core/validateBoard.ts
 *
 * 플레이어가 입력 중인 보드(DraftBoard)를 퍼즐 규칙에 비추어 검증한다.
 * 베타 사이트와 실제 게임의 "규칙 위반 표시 / 완료 판정"에서 재사용한다.
 */
import { collectViolations, isComplete } from "./rules.js";
/**
 * 주어진(given) 칸이 보드에서 다른 값으로 바뀌지 않았는지 확인한다.
 * 정상적인 UI 라면 given 칸은 잠겨 있어야 하지만, 방어적으로 검사한다.
 */
function findGivenConflicts(board, givens) {
    const conflicts = [];
    for (const g of givens) {
        const current = board[g.row]?.[g.col];
        if (current !== null && current !== undefined && current !== g.value) {
            conflicts.push(g);
        }
    }
    return conflicts;
}
export function validateBoard(board, puzzle) {
    const violations = collectViolations(board, puzzle.constraints, puzzle.size);
    const givenConflicts = findGivenConflicts(board, puzzle.givens);
    const complete = isComplete(board);
    const ok = violations.length === 0 && givenConflicts.length === 0;
    const solved = ok && complete;
    return { ok, complete, solved, violations, givenConflicts };
}
