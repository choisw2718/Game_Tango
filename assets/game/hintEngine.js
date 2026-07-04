import { CELL_VALUES, normalizeConstraint, opposite, } from "../core/rules.js";
export const HINT_FAILURE_REASON = {
    NO_PUZZLE: "NO_PUZZLE",
    NO_LOGICAL_HINT: "NO_LOGICAL_HINT",
};
export function getNextHint({ size, board, constraints = [], solution = null, }) {
    if (!size || !board) {
        return {
            ok: false,
            reason: HINT_FAILURE_REASON.NO_PUZZLE,
            message: "힌트를 만들 퍼즐이 없습니다.",
        };
    }
    const normalizedConstraints = constraints.map(normalizeConstraint);
    const wrongCells = getWrongCells(board, solution);
    if (wrongCells.length > 0) {
        return createWrongAnswerHint(wrongCells);
    }
    return (findVisibleRuleIssue(size, board, normalizedConstraints) ??
        findDirectConstraintHint(board, normalizedConstraints) ??
        findLineTripleHint(size, board) ??
        findLineCountHint(size, board) ??
        findConstraintChainHint(board, normalizedConstraints) ?? {
        ok: false,
        reason: HINT_FAILURE_REASON.NO_LOGICAL_HINT,
        message: "현재 상태에서 바로 적용할 수 있는 단순 논리 힌트를 찾지 못했습니다.",
    });
}
function getWrongCells(board, solution) {
    if (!solution) {
        return [];
    }
    const wrongCells = [];
    for (let row = 0; row < board.length; row += 1) {
        for (let col = 0; col < board.length; col += 1) {
            const value = board[row][col];
            if (value && value !== solution[row][col]) {
                wrongCells.push({ row, col });
            }
        }
    }
    return wrongCells;
}
function createWrongAnswerHint(wrongCells) {
    const target = wrongCells[0];
    const countPrefix = wrongCells.length > 1 ? `틀린 칸이 ${wrongCells.length}개 있습니다. ` : "";
    return {
        ok: true,
        kind: "mistake",
        rule: "wrong-answer",
        target,
        targetCells: [target],
        supportCells: [],
        wrongCellCount: wrongCells.length,
        message: `${countPrefix}${coordLabel(target.row, target.col)}이(가) 정답과 다릅니다. 틀린 보드에서는 논리 힌트를 진행하지 않습니다.`,
    };
}
function findVisibleRuleIssue(size, board, constraints) {
    const limit = size / 2;
    for (let row = 0; row < size; row += 1) {
        const issue = findLineIssue(board[row], "row", row, limit);
        if (issue) {
            return issue;
        }
    }
    for (let col = 0; col < size; col += 1) {
        const line = Array.from({ length: size }, (_, row) => board[row][col]);
        const issue = findLineIssue(line, "col", col, limit);
        if (issue) {
            return issue;
        }
    }
    for (const constraint of constraints) {
        const [fromRow, fromCol] = constraint.from;
        const [toRow, toCol] = constraint.to;
        const fromValue = board[fromRow][fromCol];
        const toValue = board[toRow][toCol];
        if (!fromValue || !toValue) {
            continue;
        }
        if (constraint.type === "=" && fromValue !== toValue) {
            return {
                ok: true,
                kind: "rule-warning",
                rule: "constraint-equal",
                targetCells: [],
                supportCells: [
                    { row: fromRow, col: fromCol },
                    { row: toRow, col: toCol },
                ],
                message: `${coordLabel(fromRow, fromCol)}과 ${coordLabel(toRow, toCol)}은 = 조건이므로 같은 원이어야 합니다.`,
            };
        }
        if (constraint.type === "x" && fromValue === toValue) {
            return {
                ok: true,
                kind: "rule-warning",
                rule: "constraint-different",
                targetCells: [],
                supportCells: [
                    { row: fromRow, col: fromCol },
                    { row: toRow, col: toCol },
                ],
                message: `${coordLabel(fromRow, fromCol)}과 ${coordLabel(toRow, toCol)}은 × 조건이므로 서로 다른 원이어야 합니다.`,
            };
        }
    }
    return null;
}
function findLineIssue(line, axis, index, limit) {
    const counts = countLine(line);
    if (counts.A > limit || counts.B > limit) {
        const value = counts.A > limit ? "A" : "B";
        return {
            ok: true,
            kind: "rule-warning",
            rule: "line-count-overflow",
            targetCells: [],
            supportCells: cellsForValueInLine(line, axis, index, value),
            message: `${lineLabel(axis, index)}에는 ${valueLabel(value)}이 ${limit}개까지만 들어갈 수 있습니다.`,
        };
    }
    for (let position = 0; position <= line.length - 3; position += 1) {
        const first = line[position];
        if (first && first === line[position + 1] && first === line[position + 2]) {
            return {
                ok: true,
                kind: "rule-warning",
                rule: "three-consecutive",
                targetCells: [],
                supportCells: [0, 1, 2].map((offset) => cellForLinePosition(axis, index, position + offset)),
                message: `${lineLabel(axis, index)}에서 ${valueLabel(first)}이 3칸 연속되어 있습니다. 같은 원은 3칸 연속될 수 없습니다.`,
            };
        }
    }
    return null;
}
function findDirectConstraintHint(board, constraints) {
    for (const constraint of constraints) {
        const [fromRow, fromCol] = constraint.from;
        const [toRow, toCol] = constraint.to;
        const fromValue = board[fromRow][fromCol];
        const toValue = board[toRow][toCol];
        if (fromValue && !toValue) {
            const forcedValue = constraint.type === "=" ? fromValue : opposite(fromValue);
            return createPlacementHint({
                rule: constraint.type === "=" ? "direct-equal" : "direct-different",
                target: { row: toRow, col: toCol },
                value: forcedValue,
                supportCells: [{ row: fromRow, col: fromCol }],
                message: constraint.type === "="
                    ? `${coordLabel(fromRow, fromCol)}과 ${coordLabel(toRow, toCol)}은 = 조건입니다. 따라서 ${coordLabel(toRow, toCol)}도 ${valueLabel(forcedValue)}입니다.`
                    : `${coordLabel(fromRow, fromCol)}과 ${coordLabel(toRow, toCol)}은 × 조건입니다. 따라서 ${coordLabel(toRow, toCol)}은 ${coordLabel(fromRow, fromCol)}과 다른 ${valueLabel(forcedValue)}입니다.`,
            });
        }
        if (!fromValue && toValue) {
            const forcedValue = constraint.type === "=" ? toValue : opposite(toValue);
            return createPlacementHint({
                rule: constraint.type === "=" ? "direct-equal" : "direct-different",
                target: { row: fromRow, col: fromCol },
                value: forcedValue,
                supportCells: [{ row: toRow, col: toCol }],
                message: constraint.type === "="
                    ? `${coordLabel(fromRow, fromCol)}과 ${coordLabel(toRow, toCol)}은 = 조건입니다. 따라서 ${coordLabel(fromRow, fromCol)}도 ${valueLabel(forcedValue)}입니다.`
                    : `${coordLabel(fromRow, fromCol)}과 ${coordLabel(toRow, toCol)}은 × 조건입니다. 따라서 ${coordLabel(fromRow, fromCol)}은 ${coordLabel(toRow, toCol)}과 다른 ${valueLabel(forcedValue)}입니다.`,
            });
        }
    }
    return null;
}
function findLineTripleHint(size, board) {
    for (let row = 0; row < size; row += 1) {
        const hint = findTripleHintInLine(board[row], "row", row);
        if (hint) {
            return hint;
        }
    }
    for (let col = 0; col < size; col += 1) {
        const line = Array.from({ length: size }, (_, row) => board[row][col]);
        const hint = findTripleHintInLine(line, "col", col);
        if (hint) {
            return hint;
        }
    }
    return null;
}
function findTripleHintInLine(line, axis, index) {
    for (let position = 0; position <= line.length - 3; position += 1) {
        const cells = [line[position], line[position + 1], line[position + 2]];
        const emptyOffset = cells.findIndex((value) => value === null);
        if (emptyOffset === -1) {
            continue;
        }
        const filled = cells.filter((value) => value !== null);
        if (filled.length !== 2 || filled[0] !== filled[1]) {
            continue;
        }
        const filledValue = filled[0];
        const target = cellForLinePosition(axis, index, position + emptyOffset);
        const supportCells = [0, 1, 2]
            .filter((offset) => offset !== emptyOffset)
            .map((offset) => cellForLinePosition(axis, index, position + offset));
        const forcedValue = opposite(filledValue);
        return createPlacementHint({
            rule: "avoid-three-consecutive",
            target,
            value: forcedValue,
            supportCells,
            message: `${lineLabel(axis, index)}에서 ${valueLabel(filled[0])}이 3칸 연속되면 안 됩니다. 따라서 ${coordLabel(target.row, target.col)}은 ${valueLabel(forcedValue)}입니다.`,
        });
    }
    return null;
}
function findLineCountHint(size, board) {
    const limit = size / 2;
    for (let row = 0; row < size; row += 1) {
        const hint = findCountHintInLine(board[row], "row", row, limit);
        if (hint) {
            return hint;
        }
    }
    for (let col = 0; col < size; col += 1) {
        const line = Array.from({ length: size }, (_, row) => board[row][col]);
        const hint = findCountHintInLine(line, "col", col, limit);
        if (hint) {
            return hint;
        }
    }
    return null;
}
function findCountHintInLine(line, axis, index, limit) {
    const counts = countLine(line);
    const emptyCells = cellsForEmptyInLine(line, axis, index);
    if (emptyCells.length === 0) {
        return null;
    }
    for (const value of CELL_VALUES) {
        const otherValue = opposite(value);
        const currentCount = counts[value];
        if (currentCount === limit) {
            return createPlacementHint({
                rule: "line-count-filled",
                target: emptyCells[0],
                targetCells: emptyCells,
                value: otherValue,
                supportCells: cellsForValueInLine(line, axis, index, value),
                message: `${lineLabel(axis, index)}에는 ${valueLabel(value)}이 이미 ${limit}개 있습니다. 남은 빈칸은 모두 ${valueLabel(otherValue)}입니다.`,
            });
        }
        if (currentCount + emptyCells.length === limit) {
            return createPlacementHint({
                rule: "line-count-needed",
                target: emptyCells[0],
                targetCells: emptyCells,
                value,
                supportCells: cellsForValueInLine(line, axis, index, value),
                message: `${lineLabel(axis, index)}에는 ${valueLabel(value)}이 총 ${limit}개 필요합니다. 남은 빈칸을 모두 ${valueLabel(value)}으로 채워야 개수가 맞습니다.`,
            });
        }
    }
    return null;
}
function findConstraintChainHint(board, constraints) {
    const graph = buildConstraintGraph(constraints);
    for (let row = 0; row < board.length; row += 1) {
        for (let col = 0; col < board.length; col += 1) {
            const startValue = board[row][col];
            if (!startValue) {
                continue;
            }
            const forced = findForcedByConstraintChain(board, graph, { row, col }, startValue);
            if (forced) {
                return forced;
            }
        }
    }
    return null;
}
function findForcedByConstraintChain(board, graph, start, startValue) {
    const queue = [
        { ...start, value: startValue, path: [{ row: start.row, col: start.col }] },
    ];
    const seen = new Map([[cellKey(start), startValue]]);
    while (queue.length > 0) {
        const current = queue.shift();
        const edges = graph.get(cellKey(current)) ?? [];
        for (const edge of edges) {
            const nextValue = edge.same ? current.value : opposite(current.value);
            const nextKey = cellKey(edge.to);
            if (seen.has(nextKey)) {
                continue;
            }
            const path = [...current.path, edge.to];
            const boardValue = board[edge.to.row][edge.to.col];
            if (!boardValue) {
                return createPlacementHint({
                    rule: "constraint-chain",
                    target: edge.to,
                    value: nextValue,
                    supportCells: path.slice(0, -1),
                    message: `${coordLabel(start.row, start.col)}에서 조건들을 따라가면 ${coordLabel(edge.to.row, edge.to.col)}의 값이 강제됩니다. 따라서 ${coordLabel(edge.to.row, edge.to.col)}은 ${valueLabel(nextValue)}입니다.`,
                });
            }
            seen.set(nextKey, nextValue);
            queue.push({ ...edge.to, value: nextValue, path });
        }
    }
    return null;
}
function buildConstraintGraph(constraints) {
    const graph = new Map();
    for (const constraint of constraints) {
        const [fromRow, fromCol] = constraint.from;
        const [toRow, toCol] = constraint.to;
        const from = { row: fromRow, col: fromCol };
        const to = { row: toRow, col: toCol };
        const same = constraint.type === "=";
        addEdge(graph, from, to, same);
        addEdge(graph, to, from, same);
    }
    return graph;
}
function addEdge(graph, from, to, same) {
    const key = cellKey(from);
    const edges = graph.get(key) ?? [];
    edges.push({ to, same });
    graph.set(key, edges);
}
function createPlacementHint({ rule, target, targetCells, value, supportCells, message, }) {
    return {
        ok: true,
        kind: "placement",
        rule,
        target,
        targetCells: targetCells ?? [target],
        supportCells,
        value,
        message,
    };
}
function countLine(line) {
    return line.reduce((counts, value) => {
        if (value === "A") {
            counts.A += 1;
        }
        else if (value === "B") {
            counts.B += 1;
        }
        else {
            counts.empty += 1;
        }
        return counts;
    }, { A: 0, B: 0, empty: 0 });
}
function cellsForValueInLine(line, axis, index, value) {
    return line
        .map((cellValue, position) => {
        return cellValue === value ? cellForLinePosition(axis, index, position) : null;
    })
        .filter((cell) => cell !== null);
}
function cellsForEmptyInLine(line, axis, index) {
    return line
        .map((cellValue, position) => {
        return cellValue === null ? cellForLinePosition(axis, index, position) : null;
    })
        .filter((cell) => cell !== null);
}
function cellForLinePosition(axis, index, position) {
    return axis === "row" ? { row: index, col: position } : { row: position, col: index };
}
function lineLabel(axis, index) {
    return axis === "row" ? `${index + 1}행` : `${index + 1}열`;
}
function coordLabel(row, col) {
    return `${row + 1}행 ${col + 1}열`;
}
function valueLabel(value) {
    return value === "A" ? "검은 꽉찬 원" : "속이 빈 원";
}
function cellKey(cell) {
    return `${cell.row}:${cell.col}`;
}
