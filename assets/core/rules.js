/**
 * core/rules.ts
 *
 * Tango 의 기본 규칙을 순수 함수로 구현한다.
 * solver, generator, 그리고 베타/실제 게임 UI 가 모두 이 함수를 재사용한다.
 * 규칙을 다른 곳에서 다시 구현하지 않는다.
 */
export const CELL_VALUES = ["A", "B"];
export function keyOf(row, col) {
    return `${row}:${col}`;
}
/** 반대 기호를 돌려준다. */
export function opposite(value) {
    return value === "A" ? "B" : "A";
}
/** 보드 크기에서 행/열당 각 기호의 목표 개수(size / 2). */
export function halfOf(size) {
    return size / 2;
}
/** 빈 DraftBoard 를 만든다. */
export function emptyDraft(size) {
    return Array.from({ length: size }, () => Array(size).fill(null));
}
/** DraftBoard 를 깊은 복사한다(작은 보드라 단순 복사로 충분하다). */
export function cloneDraft(board) {
    return board.map((row) => row.slice());
}
export function cloneBoard(board) {
    return board.map((row) => row.slice());
}
export function normalizeCoord(coord) {
    return "row" in coord ? [coord.row, coord.col] : [coord[0], coord[1]];
}
export function normalizeConstraint(constraint) {
    return {
        from: normalizeCoord(constraint.from),
        to: normalizeCoord(constraint.to),
        type: constraint.type,
    };
}
/** 좌표가 보드 안에 있는지. */
export function inBounds(size, row, col) {
    return row >= 0 && row < size && col >= 0 && col < size;
}
/** 두 좌표가 가로 또는 세로로 바로 인접한지. */
export function isAdjacent(ar, ac, br, bc) {
    const dr = Math.abs(ar - br);
    const dc = Math.abs(ac - bc);
    return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
}
function key(row, col) {
    return `${row},${col}`;
}
/** 제약 목록을 칸 단위 인덱스로 변환한다(양방향 등록). */
export function buildConstraintIndex(constraints) {
    const index = new Map();
    const add = (r, c, nr, nc, t) => {
        const k = key(r, c);
        const list = index.get(k);
        const entry = { row: nr, col: nc, type: t };
        if (list)
            list.push(entry);
        else
            index.set(k, [entry]);
    };
    for (const con of constraints) {
        add(con.from.row, con.from.col, con.to.row, con.to.col, con.type);
        add(con.to.row, con.to.col, con.from.row, con.from.col, con.type);
    }
    return index;
}
export function constraintsAt(index, row, col) {
    return index.get(key(row, col)) ?? [];
}
/* ------------------------------------------------------------------ *
 * 칸 단위(증분) 규칙 검사 — solver / generator 의 가지치기에 쓰인다.
 * "board[row][col] 에 value 를 넣어도 괜찮은가?" 를 빠르게 판정.
 * ------------------------------------------------------------------ */
/** value 를 (row,col)에 넣으면 그 행/열에서 value 개수가 size/2 를 초과하는가. */
export function wouldExceedHalf(board, row, col, value, size) {
    const half = halfOf(size);
    let rowCount = 0;
    let colCount = 0;
    for (let i = 0; i < size; i++) {
        const inRow = i === col ? value : board[row][i];
        const inCol = i === row ? value : board[i][col];
        if (inRow === value)
            rowCount++;
        if (inCol === value)
            colCount++;
    }
    return rowCount > half || colCount > half;
}
/** value 를 (row,col)에 넣으면 같은 기호 3연속이 생기는가. */
export function wouldMakeTriple(board, row, col, value, size) {
    const rowVal = (c) => c === col ? value : board[row][c];
    const colVal = (r) => r === row ? value : board[r][col];
    // (row,col)을 가운데/끝에 포함하는 가로 창 3개
    for (const start of [col - 2, col - 1, col]) {
        if (start < 0 || start + 2 >= size)
            continue;
        if (rowVal(start) === value && rowVal(start + 1) === value && rowVal(start + 2) === value)
            return true;
    }
    // 세로 창 3개
    for (const start of [row - 2, row - 1, row]) {
        if (start < 0 || start + 2 >= size)
            continue;
        if (colVal(start) === value && colVal(start + 1) === value && colVal(start + 2) === value)
            return true;
    }
    return false;
}
/** value 를 (row,col)에 넣으면 이미 채워진 이웃과의 `=`/`x` 제약을 어기는가. */
export function wouldBreakConstraint(board, row, col, value, index) {
    for (const n of constraintsAt(index, row, col)) {
        const other = board[n.row][n.col];
        if (other === null)
            continue;
        if (n.type === "=" && other !== value)
            return true;
        if (n.type === "x" && other === value)
            return true;
    }
    return false;
}
/**
 * (row,col)이 빈칸일 때 value 를 넣어도 어떤 규칙도 즉시 위반하지 않는지.
 * solver/generator 의 후보 판정과 강제 추론의 핵심 술어.
 */
export function canPlace(board, row, col, value, size, index) {
    return (!wouldExceedHalf(board, row, col, value, size) &&
        !wouldMakeTriple(board, row, col, value, size) &&
        !wouldBreakConstraint(board, row, col, value, index));
}
/**
 * 보드의 모든 규칙 위반을 모은다.
 * - 채워진 칸만 기준으로 판정하므로 부분 보드에도 안전하다.
 * - 행/열 개수는 "초과"만 위반으로 본다(부분 보드는 아직 모자랄 수 있으므로).
 */
export function collectViolations(board, constraints, size) {
    const violations = [];
    const half = halfOf(size);
    // 행/열 개수 초과
    for (let i = 0; i < size; i++) {
        let rowA = 0;
        let rowB = 0;
        let colA = 0;
        let colB = 0;
        for (let j = 0; j < size; j++) {
            const rv = board[i][j];
            const cv = board[j][i];
            if (rv === "A")
                rowA++;
            else if (rv === "B")
                rowB++;
            if (cv === "A")
                colA++;
            else if (cv === "B")
                colB++;
        }
        if (rowA > half || rowB > half) {
            violations.push({
                kind: "ROW_COUNT",
                cells: Array.from({ length: size }, (_, c) => ({ row: i, col: c })),
                message: `행 ${i}: 한 기호가 ${half}개를 초과했습니다.`,
            });
        }
        if (colA > half || colB > half) {
            violations.push({
                kind: "COL_COUNT",
                cells: Array.from({ length: size }, (_, r) => ({ row: r, col: i })),
                message: `열 ${i}: 한 기호가 ${half}개를 초과했습니다.`,
            });
        }
    }
    // 3연속 (가로/세로)
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            const v = board[r][c];
            if (v === null)
                continue;
            if (c + 2 < size && board[r][c + 1] === v && board[r][c + 2] === v) {
                violations.push({
                    kind: "TRIPLE_ROW",
                    cells: [
                        { row: r, col: c },
                        { row: r, col: c + 1 },
                        { row: r, col: c + 2 },
                    ],
                    message: `행 ${r}, 열 ${c}~${c + 2}: 같은 기호 3연속.`,
                });
            }
            if (r + 2 < size && board[r + 1][c] === v && board[r + 2][c] === v) {
                violations.push({
                    kind: "TRIPLE_COL",
                    cells: [
                        { row: r, col: c },
                        { row: r + 1, col: c },
                        { row: r + 2, col: c },
                    ],
                    message: `열 ${c}, 행 ${r}~${r + 2}: 같은 기호 3연속.`,
                });
            }
        }
    }
    // 제약(양쪽이 채워진 경우만)
    for (const con of constraints) {
        const a = board[con.from.row][con.from.col];
        const b = board[con.to.row][con.to.col];
        if (a === null || b === null)
            continue;
        if (con.type === "=" && a !== b) {
            violations.push({
                kind: "CONSTRAINT_EQUAL",
                cells: [con.from, con.to],
                message: "`=` 조건인데 두 칸이 다릅니다.",
            });
        }
        if (con.type === "x" && a === b) {
            violations.push({
                kind: "CONSTRAINT_DIFFERENT",
                cells: [con.from, con.to],
                message: "`x` 조건인데 두 칸이 같습니다.",
            });
        }
    }
    return violations;
}
/** 빠른 위반 여부(부분 보드의 모순 감지에 사용). */
export function hasViolation(board, constraints, size) {
    return collectViolations(board, constraints, size).length > 0;
}
/** 보드가 빈칸 없이 모두 채워졌는지. */
export function isComplete(board) {
    for (const row of board) {
        for (const cell of row) {
            if (cell === null)
                return false;
        }
    }
    return true;
}
/** 보드가 완성되었고 모든 규칙을 만족하는지(= 풀린 상태). */
export function isSolved(board, puzzle) {
    if (!isComplete(board))
        return false;
    return collectViolations(board, puzzle.constraints, puzzle.size).length === 0;
}
