// Learn mode — a Duolingo-style roadmap of bite-sized checkers lessons.
// Reuses RED/BLACK, inBounds, getDirs, getMoves, getJumps from game.js —
// those already accept an explicit board argument, so they work unmodified
// against this module's own local lesson board.

const LEARN_PROGRESS_KEY = 'checkers-learn-progress-v1';

const LESSONS = [
    {
        id: 'board',
        title: 'The Board',
        blurb: 'Know your squares',
        icon: '◆',
        instructions: 'Checkers is only ever played on the dark squares. Click any dark square to see how the board works.',
        setup: [],
        task: { type: 'click-dark' },
    },
    {
        id: 'move',
        title: 'Moving Pieces',
        blurb: 'One step forward',
        icon: '●',
        instructions: 'Regular pieces ("men") move one square diagonally forward. Click the red piece, then click a highlighted square to move it.',
        setup: [{ r: 4, c: 3, color: RED }],
        task: { type: 'move' },
    },
    {
        id: 'capture',
        title: 'Capturing',
        blurb: 'Jump the enemy',
        icon: '✖',
        instructions: 'Jump diagonally over an adjacent enemy piece into the empty square beyond it to capture it. Click the red piece, then jump.',
        setup: [{ r: 4, c: 3, color: RED }, { r: 3, c: 4, color: BLACK }],
        task: { type: 'move' },
    },
    {
        id: 'mandatory',
        title: 'Mandatory Jumps',
        blurb: 'No skipping captures',
        icon: '❗',
        instructions: 'If any of your pieces can jump, you must jump — even if a different piece has an ordinary move available. Try clicking the piece on the right first.',
        setup: [
            { r: 4, c: 1, color: RED },
            { r: 3, c: 2, color: BLACK },
            { r: 4, c: 6, color: RED },
        ],
        task: { type: 'mandatory-jump' },
    },
    {
        id: 'multi-jump',
        title: 'Multi-Jumps',
        blurb: 'Chain your captures',
        icon: '↯',
        instructions: 'If another capture is immediately available after you land, you must keep jumping with that same piece. Capture both black pieces in one turn.',
        setup: [
            { r: 6, c: 1, color: RED },
            { r: 5, c: 2, color: BLACK },
            { r: 3, c: 4, color: BLACK },
        ],
        task: { type: 'multi-jump', captures: 2 },
    },
    {
        id: 'king',
        title: 'Kings',
        blurb: 'Reach the far row',
        icon: '♛',
        instructions: 'A piece that reaches the far back row is crowned king, and can then move diagonally forward or backward. Move the red piece to the top row.',
        setup: [{ r: 1, c: 2, color: RED }],
        task: { type: 'king' },
    },
    {
        id: 'win',
        title: 'Winning',
        blurb: 'Seal the game',
        icon: '🏆',
        instructions: 'You win by capturing every enemy piece, or by leaving your opponent with no legal move. Finish this one off.',
        setup: [{ r: 4, c: 3, color: RED }, { r: 3, c: 4, color: BLACK }],
        task: { type: 'win' },
    },
];

let completedLessons = new Set(loadProgress());
let currentLesson    = null;

let lboard        = [];
let lselected      = null;
let lvalidMoves    = [];
let lMustJump      = [];
let lessonCaptures = 0;
let lessonDone     = false;

let lNextPieceId   = 0;
const lPieceElements = new Map();

function loadProgress() {
    try {
        return JSON.parse(localStorage.getItem(LEARN_PROGRESS_KEY) || '[]');
    } catch {
        return [];
    }
}

function saveProgress() {
    localStorage.setItem(LEARN_PROGRESS_KEY, JSON.stringify([...completedLessons]));
}

// ── Roadmap ──────────────────────────────────────────────────────────────

function isUnlocked(index) {
    if (index === 0) return true;
    return completedLessons.has(LESSONS[index - 1].id);
}

function renderRoadmap() {
    const path = document.getElementById('roadmap-path');
    path.innerHTML = '';

    LESSONS.forEach((lesson, i) => {
        if (i > 0) {
            const connector = document.createElement('div');
            connector.className = 'roadmap-connector';
            path.appendChild(connector);
        }

        const unlocked  = isUnlocked(i);
        const completed = completedLessons.has(lesson.id);
        const isNext    = unlocked && !completed;

        const row = document.createElement('div');
        const align = i % 3 === 0 ? 'align-center' : (i % 3 === 1 ? 'align-left' : 'align-right');
        row.className = `roadmap-node-row ${align}`;

        const wrap = document.createElement('div');
        wrap.className = 'roadmap-node-wrap';

        const btn = document.createElement('button');
        btn.className = 'roadmap-node ' + (completed ? 'completed' : (unlocked ? 'available' : 'locked'));
        btn.textContent = completed ? '✓' : lesson.icon;
        btn.disabled = !unlocked;
        if (unlocked) btn.addEventListener('click', () => startLesson(lesson.id));

        if (isNext) {
            const tag = document.createElement('div');
            tag.className = 'roadmap-start-tag';
            tag.textContent = 'START';
            btn.appendChild(tag);
        }

        const label = document.createElement('div');
        label.className = 'roadmap-node-label' + (unlocked ? '' : ' locked');
        label.textContent = lesson.title;

        wrap.appendChild(btn);
        wrap.appendChild(label);
        row.appendChild(wrap);
        path.appendChild(row);
    });

    const doneCount = completedLessons.size;
    document.getElementById('roadmap-progress-label').textContent = `${doneCount} / ${LESSONS.length} complete`;
    const pct = (doneCount / LESSONS.length) * 100;
    gsap.to('#roadmap-progress-fill', { width: `${pct}%`, duration: 0.5, ease: 'power2.out' });
}

function showRoadmap() {
    document.getElementById('roadmap-view').classList.remove('hidden');
    document.getElementById('lesson-view').classList.add('hidden');
    renderRoadmap();
}

// ── Lesson lifecycle ────────────────────────────────────────────────────

function startLesson(id) {
    currentLesson = LESSONS.find(l => l.id === id);
    lboard = Array.from({ length: 8 }, () => Array(8).fill(null));
    for (const p of currentLesson.setup) {
        lboard[p.r][p.c] = { id: lNextPieceId++, color: p.color, king: false };
    }
    lselected      = null;
    lvalidMoves    = [];
    lessonCaptures = 0;
    lessonDone     = false;
    lMustJump      = computeLocalJumps(RED, lboard);

    lPieceElements.clear();
    document.getElementById('lesson-pieces-layer').innerHTML = '';
    document.getElementById('lesson-success').classList.add('hidden');

    document.getElementById('lesson-title').textContent = currentLesson.title;
    document.getElementById('lesson-instructions').textContent = currentLesson.instructions;
    setLessonMessage('');

    document.getElementById('roadmap-view').classList.add('hidden');
    document.getElementById('lesson-view').classList.remove('hidden');

    renderLessonBoard();
}

function resetLessonBoard() {
    startLesson(currentLesson.id);
}

function setLessonMessage(msg) {
    document.getElementById('lesson-message').textContent = msg;
}

// ── Local rules helpers (board passed explicitly to game.js's pure fns) ──

function computeLocalJumps(color, brd) {
    const result = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = brd[r][c];
            if (p && p.color === color && getJumps(r, c, brd).length > 0) {
                result.push({ row: r, col: c });
            }
        }
    }
    return result;
}

function getLessonMovesForPiece(r, c) {
    if (lMustJump.length > 0) {
        const must = lMustJump.some(m => m.row === r && m.col === c);
        return must ? getJumps(r, c, lboard) : [];
    }
    return getMoves(r, c, lboard);
}

function applyLessonMove(fromR, fromC, toR, toC, jumpedPos) {
    const piece = lboard[fromR][fromC];
    lboard[fromR][fromC] = null;
    lboard[toR][toC] = piece;
    if (jumpedPos) lboard[jumpedPos.row][jumpedPos.col] = null;
    if (!piece.king) {
        if (piece.color === RED   && toR === 0) piece.king = true;
        if (piece.color === BLACK && toR === 7) piece.king = true;
    }
}

function countLocal(color) {
    let n = 0;
    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
            if (lboard[r][c]?.color === color) n++;
    return n;
}

// ── Interaction ──────────────────────────────────────────────────────────

function onLessonSquareClick(r, c) {
    if (lessonDone) return;

    if (currentLesson.task.type === 'click-dark') {
        if ((r + c) % 2 === 1) completeLesson();
        return;
    }

    if (lselected) {
        const move = lvalidMoves.find(m => m.row === r && m.col === c);
        if (move) {
            executeLessonMove(lselected.row, lselected.col, move);
            return;
        }
    }

    const p = lboard[r][c];
    if (p && p.color === RED) {
        const moves = getLessonMovesForPiece(r, c);
        if (moves.length === 0) {
            setLessonMessage(lMustJump.length > 0
                ? "That piece can't move — a jump is mandatory this turn!"
                : 'That piece has no legal move.');
            return;
        }
        lselected   = { row: r, col: c };
        lvalidMoves = moves;
        setLessonMessage('');
        renderLessonBoard();
        return;
    }

    lselected   = null;
    lvalidMoves = [];
    renderLessonBoard();
}

function executeLessonMove(fromR, fromC, move) {
    applyLessonMove(fromR, fromC, move.row, move.col, move.jumped);
    if (move.jumped) lessonCaptures++;

    if (move.jumped) {
        const further = getJumps(move.row, move.col, lboard);
        if (further.length > 0) {
            lselected   = { row: move.row, col: move.col };
            lvalidMoves = further;
            lMustJump   = [{ row: move.row, col: move.col }];
            setLessonMessage('Jump again!');
            renderLessonBoard();
            return;
        }
    }

    lselected   = null;
    lvalidMoves = [];
    lMustJump   = [];
    renderLessonBoard();
    finishLessonAttempt();
}

function finishLessonAttempt() {
    if (evaluateLessonTask()) {
        completeLesson();
    } else {
        setLessonMessage('Not quite — let’s try that again.');
        setTimeout(resetLessonBoard, 900);
    }
}

function evaluateLessonTask() {
    switch (currentLesson.task.type) {
        case 'move':            return true;
        case 'mandatory-jump':  return lessonCaptures > 0;
        case 'multi-jump':      return lessonCaptures >= currentLesson.task.captures;
        case 'king':            return lboard.some(row => row.some(p => p && p.color === RED && p.king));
        case 'win':              return countLocal(BLACK) === 0;
        default:                 return true;
    }
}

function completeLesson() {
    lessonDone = true;
    completedLessons.add(currentLesson.id);
    saveProgress();

    const panel = document.getElementById('lesson-success');
    panel.classList.remove('hidden');
    gsap.fromTo(panel, { opacity: 0 }, { opacity: 1, duration: 0.25 });
    gsap.fromTo('.lesson-success-badge',
        { scale: 0.5, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.7)' });
}

// ── Render ───────────────────────────────────────────────────────────────

function renderLessonBoard() {
    const boardEl = document.getElementById('lesson-board');
    boardEl.innerHTML = '';

    const validSet = new Set(lvalidMoves.map(m => `${m.row},${m.col}`));
    const isBoardLesson = currentLesson.task.type === 'click-dark';

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const sq = document.createElement('div');
            sq.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');

            if ((r + c) % 2 === 1) {
                const isValid = validSet.has(`${r},${c}`);
                if (isValid) sq.classList.add('valid-move');
                if (isBoardLesson || isValid) {
                    sq.addEventListener('click', () => onLessonSquareClick(r, c));
                }
            }

            boardEl.appendChild(sq);
        }
    }

    renderLessonPieces();
}

function renderLessonPieces() {
    const layer = document.getElementById('lesson-pieces-layer');
    const mustSet = new Set(lMustJump.map(m => `${m.row},${m.col}`));
    const seen = new Set();

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = lboard[r][c];
            if (!piece) continue;
            seen.add(piece.id);

            let el = lPieceElements.get(piece.id);
            const targetLeft = `${c * 12.5}%`;
            const targetTop  = `${r * 12.5}%`;

            if (!el) {
                el = document.createElement('div');
                el.className = 'piece';
                el.style.left = targetLeft;
                el.style.top  = targetTop;
                el.appendChild(document.createElement('div'));
                layer.appendChild(el);
                lPieceElements.set(piece.id, el);
            } else {
                gsap.to(el, { left: targetLeft, top: targetTop, duration: 0.28, ease: 'power2.out' });
            }
            el.onclick = () => onLessonSquareClick(r, c);

            const circle = el.firstChild;
            circle.className = `piece-circle ${piece.color}`;
            if (piece.king) circle.classList.add('king');
            if (lselected && lselected.row === r && lselected.col === c) circle.classList.add('selected');
            if (mustSet.has(`${r},${c}`) && !lselected) circle.classList.add('must-jump');
        }
    }

    for (const [id, el] of lPieceElements) {
        if (seen.has(id)) continue;
        lPieceElements.delete(id);
        gsap.to(el.firstChild, { opacity: 0, scale: 0.3, duration: 0.3, onComplete: () => el.remove() });
    }
}

// ── Wiring ───────────────────────────────────────────────────────────────

document.getElementById('btn-learn').addEventListener('click', () => {
    document.getElementById('btn-learn').classList.add('active');
    document.getElementById('btn-2p').classList.remove('active');
    document.getElementById('btn-ai').classList.remove('active');
    document.getElementById('difficulty-wrap').classList.add('hidden');
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('learn-screen').classList.remove('hidden');
    showRoadmap();
});

document.getElementById('lesson-back-btn').addEventListener('click', showRoadmap);
document.getElementById('lesson-replay-btn').addEventListener('click', resetLessonBoard);
document.getElementById('lesson-continue-btn').addEventListener('click', () => {
    const idx = LESSONS.findIndex(l => l.id === currentLesson.id);
    const next = LESSONS[idx + 1];
    if (next) {
        startLesson(next.id);
    } else {
        showRoadmap();
    }
});
