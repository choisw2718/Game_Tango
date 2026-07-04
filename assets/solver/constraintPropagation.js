/**
 * solver/constraintPropagation.ts
 *
 * brute force 전에 "확정 가능한 칸"을 먼저 채우는 제약 전파.
 * 세 가지 결정적 추론을 고정점까지 반복한다.
 *
 *   1) `=`/`x` 제약 전이
 *   2) 3연속 회피 (창 안에 같은 기호 2개 + 빈칸 1개 → 빈칸은 반대 기호)
 *   3) 줄 포화 (한 기호가 이미 size/2개 → 남은 빈칸은 모두 반대 기호)
 *
 * 전파 중 모순이 확인되면 즉시 "contradiction" 을 반환한다.
 */
import { canPlace, hasViolation, opposite } from "../core/rules.js";
/**
 * (row,col)을 value 로 확정한다.
 * - 이미 같은 값이면 noop
 * - 이미 반대 값이면 contradiction
 * - 빈칸이지만 value 를 규칙상 둘 수 없으면 contradiction
 */
export function force(board, ctx, row, col, value) {
    const cur = board[row][col];
    if (cur === value)
        return "noop";
    if (cur !== null)
        return "contradiction";
    if (!canPlace(board, row, col, value, ctx.size, ctx.index))
        return "contradiction";
    board[row][col] = value;
    return "changed";
}
/** 길이 3 창에서 "같은 둘 + 빈칸 하나" 패턴이면 빈칸을 반대 기호로 강제. */
function applyTripleWindow(board, ctx, cells) {
    let nullPos = -1;
    let nullCount = 0;
    const vals = [];
    for (let i = 0; i < 3; i++) {
        const [r, c] = cells[i];
        const v = board[r][c];
        vals.push(v);
        if (v === null) {
            nullCount++;
            nullPos = i;
        }
    }
    if (nullCount !== 1)
        return "noop";
    const others = [0, 1, 2].filter((i) => i !== nullPos).map((i) => vals[i]);
    if (others[0] !== others[1])
        return "noop";
    const [fr, fc] = cells[nullPos];
    return force(board, ctx, fr, fc, opposite(others[0]));
}
/** 한 줄에서 한 기호가 이미 size/2개면 남은 빈칸을 반대 기호로 강제. */
function applyLineSaturation(board, ctx, kind, i) {
    const { size, half } = ctx;
    let a = 0;
    let b = 0;
    const at = (j) => kind === "row" ? [i, j] : [j, i];
    for (let j = 0; j < size; j++) {
        const [r, c] = at(j);
        const v = board[r][c];
        if (v === "A")
            a++;
        else if (v === "B")
            b++;
    }
    if (a > half || b > half)
        return "contradiction";
    let forced = null;
    if (a === half && b < half)
        forced = "B";
    else if (b === half && a < half)
        forced = "A";
    if (forced === null)
        return "noop";
    let result = "noop";
    for (let j = 0; j < size; j++) {
        const [r, c] = at(j);
        if (board[r][c] === null) {
            const res = force(board, ctx, r, c, forced);
            if (res === "contradiction")
                return "contradiction";
            if (res === "changed")
                result = "changed";
        }
    }
    return result;
}
export function propagate(board, ctx) {
    const { size, constraints } = ctx;
    let changed = true;
    while (changed) {
        changed = false;
        // (1) 제약 전이
        for (const con of constraints) {
            const a = board[con.from.row][con.from.col];
            const b = board[con.to.row][con.to.col];
            if (a !== null && b === null) {
                const forced = con.type === "=" ? a : opposite(a);
                const res = force(board, ctx, con.to.row, con.to.col, forced);
                if (res === "contradiction")
                    return "contradiction";
                if (res === "changed")
                    changed = true;
            }
            else if (b !== null && a === null) {
                const forced = con.type === "=" ? b : opposite(b);
                const res = force(board, ctx, con.from.row, con.from.col, forced);
                if (res === "contradiction")
                    return "contradiction";
                if (res === "changed")
                    changed = true;
            }
        }
        // (2) 3연속 회피
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (c + 2 < size) {
                    const res = applyTripleWindow(board, ctx, [
                        [r, c],
                        [r, c + 1],
                        [r, c + 2],
                    ]);
                    if (res === "contradiction")
                        return "contradiction";
                    if (res === "changed")
                        changed = true;
                }
                if (r + 2 < size) {
                    const res = applyTripleWindow(board, ctx, [
                        [r, c],
                        [r + 1, c],
                        [r + 2, c],
                    ]);
                    if (res === "contradiction")
                        return "contradiction";
                    if (res === "changed")
                        changed = true;
                }
            }
        }
        // (3) 줄 포화
        for (let i = 0; i < size; i++) {
            let res = applyLineSaturation(board, ctx, "row", i);
            if (res === "contradiction")
                return "contradiction";
            if (res === "changed")
                changed = true;
            res = applyLineSaturation(board, ctx, "col", i);
            if (res === "contradiction")
                return "contradiction";
            if (res === "changed")
                changed = true;
        }
    }
    // 안전망: 전파가 놓쳤을 수 있는 위반을 한 번 더 확인.
    if (hasViolation(board, constraints, size))
        return "contradiction";
    return "stable";
}
