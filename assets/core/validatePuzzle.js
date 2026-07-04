/**
 * core/validatePuzzle.ts
 *
 * 퍼즐 데이터(PuzzleInput)의 "구조적" 유효성을 검사한다.
 * 해답 개수 같은 의미적 검증이 아니라, 데이터가 형식상 올바른지를 본다.
 */
import { inBounds, isAdjacent } from "./rules.js";
export function validatePuzzle(puzzle) {
    const errors = [];
    const { size, givens, constraints } = puzzle;
    if (size !== 6 && size !== 8) {
        errors.push(`보드 크기는 6 또는 8 이어야 합니다. (받은 값: ${size})`);
    }
    // 주어진 칸: 범위 / 중복
    const seenGiven = new Set();
    for (const g of givens) {
        if (!inBounds(size, g.row, g.col)) {
            errors.push(`주어진 칸이 범위를 벗어났습니다: (${g.row}, ${g.col})`);
            continue;
        }
        const k = `${g.row},${g.col}`;
        if (seenGiven.has(k)) {
            errors.push(`주어진 칸이 중복되었습니다: (${g.row}, ${g.col})`);
        }
        seenGiven.add(k);
        if (g.value !== "A" && g.value !== "B") {
            errors.push(`주어진 칸 값이 잘못되었습니다: (${g.row}, ${g.col})`);
        }
    }
    // 제약: 범위 / 인접 / 중복
    const seenConstraint = new Set();
    for (const con of constraints) {
        const { from, to, type } = con;
        if (!inBounds(size, from.row, from.col) || !inBounds(size, to.row, to.col)) {
            errors.push(`제약이 범위를 벗어났습니다: (${from.row},${from.col})-(${to.row},${to.col})`);
            continue;
        }
        if (!isAdjacent(from.row, from.col, to.row, to.col)) {
            errors.push(`제약은 인접한 두 칸을 연결해야 합니다: (${from.row},${from.col})-(${to.row},${to.col})`);
        }
        if (type !== "=" && type !== "x") {
            errors.push(`제약 종류가 잘못되었습니다: ${String(type)}`);
        }
        // 방향 무관 중복 검사
        const a = `${from.row},${from.col}`;
        const b = `${to.row},${to.col}`;
        const k = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (seenConstraint.has(k)) {
            errors.push(`제약이 중복되었습니다: ${k}`);
        }
        seenConstraint.add(k);
    }
    return { ok: errors.length === 0, errors };
}
