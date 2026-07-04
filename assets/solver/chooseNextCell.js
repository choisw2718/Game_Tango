/**
 * solver/chooseNextCell.ts
 *
 * 분기할 빈칸을 고른다. MRV(Minimum Remaining Values) 휴리스틱:
 * 가능한 값이 가장 적은 빈칸부터 채워 탐색 폭을 줄인다.
 * 선택은 좌표 순서로 결정적이라 같은 입력에 같은 첫 해답을 보장한다.
 */
import { canPlace } from "../core/rules.js";
/** (row,col)에 둘 수 있는 후보 값(빈칸 가정). */
export function candidateValues(board, ctx, row, col) {
    const out = [];
    if (canPlace(board, row, col, "A", ctx.size, ctx.index))
        out.push("A");
    if (canPlace(board, row, col, "B", ctx.size, ctx.index))
        out.push("B");
    return out;
}
/**
 * 분기할 빈칸을 고른다.
 * - 빈칸이 없으면 null (완성됨)
 * - 후보가 0개인 칸을 만나면 즉시 그 칸을 반환(= 막다른 길)
 * - 그 외에는 후보 수가 가장 적은 칸을 반환
 */
export function chooseNextCell(board, ctx) {
    const { size } = ctx;
    let best = null;
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (board[r][c] !== null)
                continue;
            const values = candidateValues(board, ctx, r, c);
            if (values.length === 0)
                return { row: r, col: c, values };
            if (best === null || values.length < best.values.length) {
                best = { row: r, col: c, values };
            }
        }
    }
    return best;
}
