// Checkers — standard American rules
// Board: row 0 = top (Black's back row), row 7 = bottom (Red's back row)
// Red moves up (decreasing row), Black moves down (increasing row)
// Mandatory jump rule enforced

const RED   = 'red';
const BLACK = 'black';

let board   = [];   // 8×8 array of null | { color, king }
let turn    = RED;
let selected = null;  // { row, col } of selected piece
let validMoves = [];  // [{ row, col, jumps: [{row,col}] }]
let mustJump = [];    // all pieces that must jump this turn
let gameOver = false;

// ── Init ──────────────────────────────────────────────────────────────────

function initBoard() {
    board = Array.from({ length: 8 }, () => Array(8).fill(null));
    // Black on rows 0-2, dark squares only
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 === 1) board[r][c] = { color: BLACK, king: false };
        }
    }
    // Red on rows 5-7, dark squares only
    for (let r = 5; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 === 1) board[r][c] = { color: RED, king: false };
        }
    }
    turn     = RED;
    selected = null;
    validMoves = [];
    gameOver = false;
    mustJump = computeAllJumps(turn);
    render();
    updateUI();
    setMessage('');
}

// ── Move logic ─────────────────────────────────────────────────────────────

function computeAllJumps(color) {
    // Returns list of { row, col } that have at least one jump available
    const result = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (p && p.color === color && getJumps(r, c).length > 0) {
                result.push({ row: r, col: c });
            }
        }
    }
    return result;
}

function getJumps(r, c) {
    const p = board[r][c];
    if (!p) return [];
    const dirs = getDirs(p);
    const jumps = [];
    for (const [dr, dc] of dirs) {
        const mr = r + dr, mc = c + dc;   // midpoint (enemy)
        const lr = r + dr*2, lc = c + dc*2; // landing
        if (!inBounds(mr, mc) || !inBounds(lr, lc)) continue;
        const mid = board[mr][mc];
        if (mid && mid.color !== p.color && !board[lr][lc]) {
            jumps.push({ row: lr, col: lc, jumped: { row: mr, col: mc } });
        }
    }
    return jumps;
}

function getMoves(r, c) {
    // Returns simple (non-jump) moves only
    const p = board[r][c];
    if (!p) return [];
    const dirs = getDirs(p);
    const moves = [];
    for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc;
        if (inBounds(nr, nc) && !board[nr][nc]) {
            moves.push({ row: nr, col: nc, jumped: null });
        }
    }
    return moves;
}

function getDirs(p) {
    const fwd = p.color === RED ? -1 : 1;
    if (p.king) return [[-1,-1],[-1,1],[1,-1],[1,1]];
    return [[fwd,-1],[fwd,1]];
}

function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

function getValidMovesForPiece(r, c) {
    // If any piece must jump, this piece must jump (or it has no valid moves)
    if (mustJump.length > 0) {
        const must = mustJump.some(m => m.row === r && m.col === c);
        return must ? getJumps(r, c) : [];
    }
    return getMoves(r, c);
}

function applyMove(fromR, fromC, toR, toC, jumpedPos) {
    const piece = board[fromR][fromC];
    board[fromR][fromC] = null;
    board[toR][toC] = piece;

    if (jumpedPos) board[jumpedPos.row][jumpedPos.col] = null;

    // Kinging
    if (!piece.king) {
        if (piece.color === RED   && toR === 0) piece.king = true;
        if (piece.color === BLACK && toR === 7) piece.king = true;
    }
}

// ── Interaction ────────────────────────────────────────────────────────────

function onSquareClick(r, c) {
    if (gameOver) return;

    // Click a valid landing square
    if (selected) {
        const move = validMoves.find(m => m.row === r && m.col === c);
        if (move) {
            executeMove(selected.row, selected.col, move);
            return;
        }
    }

    // Click a piece of the current player
    const p = board[r][c];
    if (p && p.color === turn) {
        const moves = getValidMovesForPiece(r, c);
        if (moves.length === 0) {
            setMessage(mustJump.length > 0 ? 'You must jump with a highlighted piece!' : 'That piece has no moves.');
            return;
        }
        selected   = { row: r, col: c };
        validMoves = moves;
        setMessage('');
        render();
        return;
    }

    // Click elsewhere — deselect
    selected   = null;
    validMoves = [];
    render();
}

function executeMove(fromR, fromC, move) {
    applyMove(fromR, fromC, move.row, move.col, move.jumped);

    // Check for multi-jump continuation
    if (move.jumped) {
        const further = getJumps(move.row, move.col);
        if (further.length > 0) {
            // Piece was kinged mid-jump — stop chain (standard rule)
            const justKinged =
                (board[move.row][move.col].color === RED   && move.row === 0) ||
                (board[move.row][move.col].color === BLACK && move.row === 7);

            if (!justKinged) {
                selected   = { row: move.row, col: move.col };
                validMoves = further;
                mustJump   = [{ row: move.row, col: move.col }];
                render();
                updateUI();
                setMessage('Jump again!');
                return;
            }
        }
    }

    // End of turn
    selected   = null;
    validMoves = [];
    turn = turn === RED ? BLACK : RED;
    mustJump = computeAllJumps(turn);

    render();
    updateUI();
    checkWin();
}

function checkWin() {
    const redCount   = countPieces(RED);
    const blackCount = countPieces(BLACK);

    if (redCount === 0) { endGame(BLACK); return; }
    if (blackCount === 0) { endGame(RED); return; }

    // No legal moves = loss
    const hasMoves = hasAnyMove(turn);
    if (!hasMoves) endGame(turn === RED ? BLACK : RED);
}

function hasAnyMove(color) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (!p || p.color !== color) continue;
            if (getJumps(r, c).length > 0 || getMoves(r, c).length > 0) return true;
        }
    }
    return false;
}

function countPieces(color) {
    let n = 0;
    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
            if (board[r][c]?.color === color) n++;
    return n;
}

function endGame(winner) {
    gameOver = true;
    const name = winner === RED ? 'Red' : 'Black';
    document.getElementById('win-title').textContent = `${name} Wins!`;
    document.getElementById('win-sub').textContent =
        winner === RED ? 'Black has no moves left.' : 'Red has no moves left.';
    document.getElementById('win-overlay').classList.remove('hidden');
}

// ── Render ─────────────────────────────────────────────────────────────────

function render() {
    const boardEl = document.getElementById('board');
    boardEl.innerHTML = '';

    const validSet = new Set(validMoves.map(m => `${m.row},${m.col}`));
    const mustSet  = new Set(mustJump.map(m => `${m.row},${m.col}`));

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const sq = document.createElement('div');
            sq.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');

            if ((r + c) % 2 === 1 && validSet.has(`${r},${c}`)) {
                sq.classList.add('valid-move');
                sq.addEventListener('click', () => onSquareClick(r, c));
            }

            const piece = board[r][c];
            if (piece) {
                const el = document.createElement('div');
                el.className = `piece ${piece.color}`;
                if (piece.king) el.classList.add('king');
                if (selected && selected.row === r && selected.col === c) {
                    el.classList.add('selected');
                }
                if (mustSet.has(`${r},${c}`) && !selected) {
                    el.classList.add('must-jump');
                }
                el.addEventListener('click', () => onSquareClick(r, c));
                sq.appendChild(el);
            }

            boardEl.appendChild(sq);
        }
    }
}

function updateUI() {
    document.getElementById('turn-label').textContent =
        turn === RED ? "Red's Turn" : "Black's Turn";

    document.getElementById('red-count').textContent   = countPieces(RED);
    document.getElementById('black-count').textContent = countPieces(BLACK);

    document.getElementById('player-red').classList.toggle('active',   turn === RED);
    document.getElementById('player-black').classList.toggle('active', turn === BLACK);
}

function setMessage(msg) {
    document.getElementById('message-box').textContent = msg;
}

// ── Buttons ────────────────────────────────────────────────────────────────

document.getElementById('new-game-btn').addEventListener('click', () => {
    document.getElementById('win-overlay').classList.add('hidden');
    initBoard();
});

document.getElementById('play-again-btn').addEventListener('click', () => {
    document.getElementById('win-overlay').classList.add('hidden');
    initBoard();
});

// ── Start ──────────────────────────────────────────────────────────────────
initBoard();
