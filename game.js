// Checkers — standard American rules
// Board: row 0 = top (Black's back row), row 7 = bottom (Red's back row)
// Red moves up (decreasing row), Black moves down (increasing row)
// Mandatory jump rule enforced

const RED   = 'red';
const BLACK = 'black';

let board      = [];   // 8×8 array of null | { id, color, king }
let turn       = RED;
let selected   = null; // { row, col } of selected piece
let validMoves = [];   // [{ row, col, jumps: [{row,col}] }]
let mustJump   = [];   // all pieces that must jump this turn
let gameOver   = false;

// Piece identity — lets render() reuse the same DOM node for a piece across
// moves (keyed by id) instead of rebuilding it, so moves can glide via CSS
// transition rather than jumping.
let nextPieceId    = 0;
const pieceElements = new Map(); // id -> DOM element

// AI state
let aiMode     = false;
let difficulty = 5;
let aiThinking = false;

// ── Init ──────────────────────────────────────────────────────────────────

function initBoard() {
    board = Array.from({ length: 8 }, () => Array(8).fill(null));
    // Black on rows 0-2, dark squares only
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 === 1) board[r][c] = { id: nextPieceId++, color: BLACK, king: false };
        }
    }
    // Red on rows 5-7, dark squares only
    for (let r = 5; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 === 1) board[r][c] = { id: nextPieceId++, color: RED, king: false };
        }
    }
    pieceElements.clear();
    document.getElementById('pieces-layer').innerHTML = '';
    turn       = RED;
    selected   = null;
    validMoves = [];
    gameOver   = false;
    aiThinking = false;
    mustJump   = computeAllJumps(turn);
    render();
    updateUI();
    setMessage('');
}

// ── Utility ────────────────────────────────────────────────────────────────

function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

function deepCopyBoard(brd) {
    return brd.map(row => row.map(cell => cell ? { color: cell.color, king: cell.king } : null));
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

function getJumps(r, c, brd) {
    const b = brd || board;
    const p = b[r][c];
    if (!p) return [];
    const dirs = getDirs(p);
    const jumps = [];
    for (const [dr, dc] of dirs) {
        const mr = r + dr, mc = c + dc;
        const lr = r + dr * 2, lc = c + dc * 2;
        if (!inBounds(mr, mc) || !inBounds(lr, lc)) continue;
        const mid = b[mr][mc];
        if (mid && mid.color !== p.color && !b[lr][lc]) {
            jumps.push({ row: lr, col: lc, jumped: { row: mr, col: mc } });
        }
    }
    return jumps;
}

function getMoves(r, c, brd) {
    const b = brd || board;
    const p = b[r][c];
    if (!p) return [];
    const dirs = getDirs(p);
    const moves = [];
    for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc;
        if (inBounds(nr, nc) && !b[nr][nc]) {
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

function getValidMovesForPiece(r, c) {
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
    if (!piece.king) {
        if (piece.color === RED   && toR === 0) piece.king = true;
        if (piece.color === BLACK && toR === 7) piece.king = true;
    }
}

// ── Interaction ────────────────────────────────────────────────────────────

function onSquareClick(r, c) {
    if (gameOver) return;
    if (aiThinking) return;
    if (aiMode && turn === BLACK) return;

    // Click a valid landing square
    if (selected) {
        const move = validMoves.find(m => m.row === r && m.col === c);
        if (move) {
            executeInteractiveMove(selected.row, selected.col, move);
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

function executeInteractiveMove(fromR, fromC, move) {
    applyMove(fromR, fromC, move.row, move.col, move.jumped);

    // Check for multi-jump continuation
    if (move.jumped) {
        const further = getJumps(move.row, move.col);
        if (further.length > 0) {
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

    endPlayerTurn();
}

function endPlayerTurn() {
    selected   = null;
    validMoves = [];
    turn = turn === RED ? BLACK : RED;
    mustJump = computeAllJumps(turn);

    render();
    updateUI();
    checkWin();

    if (!gameOver && aiMode && turn === BLACK) {
        triggerAI();
    }
}

function checkWin() {
    const redCount   = countPieces(RED);
    const blackCount = countPieces(BLACK);

    if (redCount === 0)   { endGame(BLACK); return; }
    if (blackCount === 0) { endGame(RED);   return; }

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
    let name;
    if (aiMode && winner === BLACK) {
        name = 'AI';
    } else {
        name = winner === RED ? 'Red' : 'Black';
    }
    document.getElementById('win-title').textContent = `${name} Wins!`;
    document.getElementById('win-sub').textContent =
        winner === RED ? 'Black has no moves left.' : 'Red has no moves left.';
    document.getElementById('win-overlay').classList.remove('hidden');
}

// ── AI — board generation ───────────────────────────────────────────────────

function generateAllMoves(color, brd) {
    const jumpChains = [];

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = brd[r][c];
            if (!p || p.color !== color) continue;
            const chains = buildJumpChains(r, c, r, c, brd, []);
            jumpChains.push(...chains);
        }
    }

    if (jumpChains.length > 0) return jumpChains;

    // No jumps — collect simple moves
    const simpleMoves = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = brd[r][c];
            if (!p || p.color !== color) continue;
            for (const mv of getMoves(r, c, brd)) {
                simpleMoves.push({ fromR: r, fromC: c, toR: mv.row, toC: mv.col, captures: [] });
            }
        }
    }
    return simpleMoves;
}

function buildJumpChains(origR, origC, r, c, brd, capturedSoFar) {
    const p = brd[r][c];
    if (!p) return [];
    const dirs = getDirs(p);
    const results = [];

    for (const [dr, dc] of dirs) {
        const mr = r + dr, mc = c + dc;
        const lr = r + dr * 2, lc = c + dc * 2;
        if (!inBounds(mr, mc) || !inBounds(lr, lc)) continue;
        const mid = brd[mr][mc];
        if (!mid || mid.color === p.color) continue;
        if (brd[lr][lc] !== null) continue;
        // Ensure we don't re-capture already captured pieces
        if (capturedSoFar.some(cap => cap.r === mr && cap.c === mc)) continue;

        const newCaptures = [...capturedSoFar, { r: mr, c: mc }];
        const tmpBrd = deepCopyBoard(brd);
        tmpBrd[lr][lc] = tmpBrd[r][c];
        tmpBrd[r][c] = null;
        tmpBrd[mr][mc] = null;

        // Kinging check — stop chain if piece just kinged
        const justKinged =
            (p.color === RED   && lr === 0 && !p.king) ||
            (p.color === BLACK && lr === 7 && !p.king);

        if (justKinged) {
            tmpBrd[lr][lc].king = true;
            results.push({ fromR: origR, fromC: origC, toR: lr, toC: lc, captures: newCaptures });
            continue;
        }

        const deeper = buildJumpChains(origR, origC, lr, lc, tmpBrd, newCaptures);
        if (deeper.length > 0) {
            results.push(...deeper);
        } else {
            results.push({ fromR: origR, fromC: origC, toR: lr, toC: lc, captures: newCaptures });
        }
    }

    return results;
}

function applyAIMoveToBoard(brd, move) {
    const newBrd = deepCopyBoard(brd);
    const piece = newBrd[move.fromR][move.fromC];
    newBrd[move.toR][move.toC] = piece;
    newBrd[move.fromR][move.fromC] = null;
    for (const cap of move.captures) {
        newBrd[cap.r][cap.c] = null;
    }
    if (!piece.king) {
        if (piece.color === RED   && move.toR === 0) piece.king = true;
        if (piece.color === BLACK && move.toR === 7) piece.king = true;
    }
    return newBrd;
}

// ── AI — evaluation ─────────────────────────────────────────────────────────

function evaluateBoard(brd) {
    let score = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = brd[r][c];
            if (!p) continue;
            const centerBonus = (c >= 2 && c <= 5) ? 5 : 0;
            if (p.color === BLACK) {
                score += p.king ? 200 : 100;
                score += r * 4;              // advancement (row 7 = deep in enemy territory)
                score += centerBonus;
                if (r === 0) score += 12;    // back row protection
            } else {
                score -= p.king ? 200 : 100;
                score -= (7 - r) * 4;        // advancement (row 0 = deep)
                score -= centerBonus;
                if (r === 7) score -= 12;    // back row protection
            }
        }
    }
    return score;
}

// ── AI — minimax ────────────────────────────────────────────────────────────

function difficultyToDepth(d) {
    if (d <= 2) return 1;
    if (d <= 4) return 2;
    if (d <= 6) return 3;
    if (d <= 8) return 4;
    return 5;
}

function minimaxAB(brd, depth, alpha, beta, maximizing) {
    const color = maximizing ? BLACK : RED;
    const moves = generateAllMoves(color, brd);

    if (depth === 0 || moves.length === 0) {
        if (moves.length === 0) return maximizing ? -9999 : 9999;
        return evaluateBoard(brd);
    }

    if (maximizing) {
        let best = -Infinity;
        for (const mv of moves) {
            const newBrd = applyAIMoveToBoard(brd, mv);
            const val = minimaxAB(newBrd, depth - 1, alpha, beta, false);
            if (val > best) best = val;
            if (best > alpha) alpha = best;
            if (alpha >= beta) break;
        }
        return best;
    } else {
        let best = Infinity;
        for (const mv of moves) {
            const newBrd = applyAIMoveToBoard(brd, mv);
            const val = minimaxAB(newBrd, depth - 1, alpha, beta, true);
            if (val < best) best = val;
            if (best < beta) beta = best;
            if (alpha >= beta) break;
        }
        return best;
    }
}

// Box-Muller Gaussian noise
function gaussianNoise(scale) {
    const u1 = Math.random(), u2 = Math.random();
    return scale * Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
}

function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function getAIMove() {
    const moves = generateAllMoves(BLACK, board);
    if (moves.length === 0) return null;

    // Pure random on lowest difficulty
    if (difficulty <= 2) {
        return moves[Math.floor(Math.random() * moves.length)];
    }

    const depth = difficultyToDepth(difficulty);
    const noiseScale = Math.max(0, (6 - difficulty)) * 18;

    // Shuffle for variety on lower difficulties
    const orderedMoves = difficulty <= 6 ? shuffleArray([...moves]) : moves;

    let bestMove = null;
    let bestScore = -Infinity;

    for (const mv of orderedMoves) {
        const newBrd = applyAIMoveToBoard(board, mv);
        let score = minimaxAB(newBrd, depth - 1, -Infinity, Infinity, false);
        score += gaussianNoise(noiseScale);
        if (score > bestScore) {
            bestScore = score;
            bestMove = mv;
        }
    }

    return bestMove;
}

// ── AI — trigger ────────────────────────────────────────────────────────────

function triggerAI() {
    aiThinking = true;
    setMessage('AI is thinking…');
    document.getElementById('board').style.pointerEvents = 'none';

    setTimeout(() => {
        const move = getAIMove();

        if (move) {
            // Apply move to global board
            const piece = board[move.fromR][move.fromC];
            board[move.fromR][move.fromC] = null;
            for (const cap of move.captures) {
                board[cap.r][cap.c] = null;
            }
            board[move.toR][move.toC] = piece;
            if (!piece.king) {
                if (piece.color === RED   && move.toR === 0) piece.king = true;
                if (piece.color === BLACK && move.toR === 7) piece.king = true;
            }
        }

        turn     = RED;
        mustJump = computeAllJumps(turn);
        aiThinking = false;
        document.getElementById('board').style.pointerEvents = '';
        setMessage('');
        render();
        updateUI();
        checkWin();
    }, 300);
}

// ── Render ─────────────────────────────────────────────────────────────────

function render() {
    renderSquares();
    renderPieces();
}

function renderSquares() {
    const boardEl = document.getElementById('board');
    boardEl.innerHTML = '';

    const validSet = new Set(validMoves.map(m => `${m.row},${m.col}`));

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const sq = document.createElement('div');
            sq.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');

            if ((r + c) % 2 === 1 && validSet.has(`${r},${c}`)) {
                sq.classList.add('valid-move');
                sq.addEventListener('click', () => onSquareClick(r, c));
            }

            boardEl.appendChild(sq);
        }
    }
}

function renderPieces() {
    const layer = document.getElementById('pieces-layer');
    const mustSet = new Set(mustJump.map(m => `${m.row},${m.col}`));
    const seen = new Set();

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (!piece) continue;
            seen.add(piece.id);

            let el = pieceElements.get(piece.id);
            if (!el) {
                el = document.createElement('div');
                el.className = 'piece';
                el.style.left = `${c * 12.5}%`;
                el.style.top  = `${r * 12.5}%`;
                el.appendChild(document.createElement('div')); // piece-circle
                layer.appendChild(el);
                pieceElements.set(piece.id, el);
            } else {
                // Same DOM node, new position — CSS transition glides it over.
                el.style.left = `${c * 12.5}%`;
                el.style.top  = `${r * 12.5}%`;
            }
            el.onclick = () => onSquareClick(r, c);

            const circle = el.firstChild;
            circle.className = `piece-circle ${piece.color}`;
            if (piece.king) circle.classList.add('king');
            if (selected && selected.row === r && selected.col === c) {
                circle.classList.add('selected');
            }
            if (mustSet.has(`${r},${c}`) && !selected) {
                circle.classList.add('must-jump');
            }
        }
    }

    // Remove pieces that were captured — fade out, then drop the node.
    for (const [id, el] of pieceElements) {
        if (seen.has(id)) continue;
        pieceElements.delete(id);
        el.firstChild.classList.add('captured');
        setTimeout(() => el.remove(), 300);
    }
}

function updateUI() {
    const isAITurn = aiMode && turn === BLACK;

    if (isAITurn) {
        document.getElementById('turn-label').textContent = "AI's Turn";
    } else {
        document.getElementById('turn-label').textContent =
            turn === RED ? "Red's Turn" : "Black's Turn";
    }

    document.getElementById('red-count').textContent   = countPieces(RED);
    document.getElementById('black-count').textContent = countPieces(BLACK);

    document.getElementById('player-red').classList.toggle('active',   turn === RED);
    document.getElementById('player-black').classList.toggle('active', turn === BLACK);
}

function setMessage(msg) {
    document.getElementById('message-box').textContent = msg;
}

// ── Mode bar event listeners ────────────────────────────────────────────────

document.getElementById('btn-2p').addEventListener('click', () => {
    aiMode = false;
    document.getElementById('btn-2p').classList.add('active');
    document.getElementById('btn-ai').classList.remove('active');
    document.getElementById('difficulty-wrap').classList.add('hidden');
    document.getElementById('black-name').textContent = 'Black';
    initBoard();
});

document.getElementById('btn-ai').addEventListener('click', () => {
    aiMode = true;
    document.getElementById('btn-ai').classList.add('active');
    document.getElementById('btn-2p').classList.remove('active');
    document.getElementById('difficulty-wrap').classList.remove('hidden');
    document.getElementById('black-name').textContent = 'AI';
    initBoard();
});

document.getElementById('difficulty-slider').addEventListener('input', function () {
    difficulty = parseInt(this.value, 10);
    document.getElementById('diff-val').textContent = difficulty;
});

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
