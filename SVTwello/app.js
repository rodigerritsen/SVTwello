/* =====================================================
   STARTDATA
===================================================== */

const defaultData = {
    players: [],
    matches: [],
    standings: [],
    staff: []
};

let data;

function loadData() {
    const saved = localStorage.getItem('svTwelloZondag2');

    if (saved) {
        try {
            data = JSON.parse(saved);
        } catch {
            data = structuredClone(defaultData);
        }
    } else {
        data = structuredClone(defaultData);
    }
}

function saveData() {
    localStorage.setItem('svTwelloZondag2', JSON.stringify(data));
    showToast('Gegevens opgeslagen');
    renderAll();
}

/* =====================================================
   NAVIGATIE
===================================================== */

document.querySelectorAll('.nav-btn').forEach(button => {
    button.addEventListener('click', () => {
        showPage(button.dataset.page);
    });
});

function showPage(pageName) {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(button => button.classList.remove('active'));

    const page = document.getElementById(pageName);
    if (page) page.classList.add('active');

    const nav = document.querySelector('.nav-btn[data-page="' + pageName + '"]');
    if (nav) nav.classList.add('active');
}

function getPercentage(player) {
    if (!player.maxMinutes || player.maxMinutes <= 0) {
        return 0;
    }

    return Math.min(100, Math.round((player.minutes / player.maxMinutes) * 100));
}

/* =====================================================
   DASHBOARD
===================================================== */

function renderDashboard() {
    document.getElementById('statPlayers').textContent = data.players.length;
    document.getElementById('statMatches').textContent = data.matches.length;

    const goals = data.players.reduce((sum, player) => sum + Number(player.goals || 0), 0);
    document.getElementById('statGoals').textContent = goals;

    let percentage = 0;
    if (data.players.length) {
        percentage = data.players.reduce((sum, player) => sum + getPercentage(player), 0) / data.players.length;
    }
    document.getElementById('statPercentage').textContent = Math.round(percentage) + '%';

    const played = data.matches.filter(m => m.score).slice(-4).reverse();
    const upcoming = data.matches.filter(m => !m.score).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
    const dashboardMatches = played.length ? played : upcoming;

    document.getElementById('dashboardMatches').innerHTML = dashboardMatches.length
        ? dashboardMatches.map(matchHTML).join('')
        : '<div class="empty">Geen wedstrijden gevonden.</div>';

    const top = [...data.players].sort((a, b) => Number(b.goals) - Number(a.goals)).slice(0, 5);
    document.getElementById('topScorers').innerHTML = top.map((player, index) =>
        '<div style="display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--border);">'
        + '<strong>' + (index + 1) + '. ' + escapeHTML(player.name) + '</strong>'
        + '<span class="badge green">' + player.goals + ' goals</span>'
        + '</div>'
    ).join('');
}

/* =====================================================
   SPELERS
===================================================== */

function renderPlayers() {
    const search = document.getElementById('playerSearch').value.toLowerCase();
    const position = document.getElementById('positionFilter').value;
    const sort = document.getElementById('sortPlayers').value;

    let players = data.players.filter(player => {
        const matchesSearch = player.name.toLowerCase().includes(search);
        const matchesPosition = position === 'all' || player.position === position;
        return matchesSearch && matchesPosition;
    });

    players.sort((a, b) => {
        if (sort === 'number') {
            return Number(a.number) - Number(b.number);
        }
        return Number(b[sort] || 0) - Number(a[sort] || 0);
    });

    const table = document.getElementById('playersTable');
    if (!players.length) {
        table.innerHTML = '<tr><td colspan="6"><div class="empty">Geen spelers gevonden.</div></td></tr>';
        return;
    }

    table.innerHTML = players.map(player => renderPlayerRow(player)).join('');
}

function renderPlayerRow(player) {
    let badges = '';
    if (player.guest) {
        badges += '<span class="badge guest">Gastspeler</span>';
    }
    if (player.yellow) {
        badges += '<span class="badge yellow">🟨 ' + player.yellow + '</span>';
    }
    if (player.red) {
        badges += '<span class="badge red">🟥 ' + player.red + '</span>';
    }
    if (!player.yellow && !player.red) {
        badges += '—';
    }

    return '<tr>'
        + '<td><div class="player"><div class="number">' + escapeHTML(player.number) + '</div><div><div class="player-name">'
        + escapeHTML(player.name) + badges + '</div><span class="player-position">' + escapeHTML(player.position) + '</span></div></div></td>'
        + '<td>' + escapeHTML(player.position || '—') + '</td>'
        + '<td>' + escapeHTML(player.minutes) + '</td>'
        + '<td><strong>' + escapeHTML(player.goals) + '</strong></td>'
        + '<td>' + escapeHTML(player.assists) + '</td>'
        + '<td>' + badges + '</td>'
        + '</tr>';
}

function renderStaff() {
    const container = document.getElementById('staffList');
    if (!container) return;
    if (!data.staff.length) {
        container.innerHTML = '<div class="empty">Geen stafleden gevonden.</div>';
        return;
    }
    container.innerHTML = data.staff.map(member =>
        '<div class="staff-item"><div><div class="staff-name">' + escapeHTML(member.naam) + '</div>'
        + '<div class="staff-role">' + escapeHTML(member.rol) + '</div></div></div>'
    ).join('');
}

/* =====================================================
   WEDSTRIJDEN
===================================================== */

function renderMatches() {
    const filter = document.getElementById('matchFilter').value;
    const today = new Date().toISOString().split('T')[0];

    let matches = [...data.matches];
    if (filter === 'played') {
        matches = matches.filter(match => match.score);
    }
    if (filter === 'upcoming') {
        matches = matches.filter(match => match.date >= today && !match.score);
    }

    matches.sort((a, b) => a.date.localeCompare(b.date));
    const list = document.getElementById('matchesList');
    list.innerHTML = matches.length
        ? matches.map(matchHTML).join('')
        : '<div class="empty">Geen wedstrijden gevonden.</div>';
}

function matchHTML(match) {
    const initials = (match.opponent || '').split(' ').map(word => word[0] || '').join('').substring(0, 3).toUpperCase();
    let scoreClass = '';

    if (match.score) {
        const numbers = match.score.match(/\d+/g);
        if (numbers && numbers.length >= 2) {
            const home = Number(numbers[0]);
            const away = Number(numbers[1]);
            if (match.location === 'Thuis') {
                if (home > away) scoreClass = 'win';
                if (home < away) scoreClass = 'loss';
                if (home === away) scoreClass = 'draw';
            } else {
                if (home > away) scoreClass = 'loss';
                if (home < away) scoreClass = 'win';
                if (home === away) scoreClass = 'draw';
            }
        }
    }

    const eventsHtml = (match.events || []).map(event => {
        const assistText = event.assist ? ' • assist: ' + escapeHTML(event.assist) : '';
        const minuteText = event.minute ? ' • ' + escapeHTML(event.minute) + "'" : '';
        return '<div class="match-event">⚽ ' + escapeHTML(event.scorer) + assistText + minuteText + '</div>';
    }).join('');

    return '<div class="match">'
        + '<div class="match-date">' + formatDate(match.date) + '<small>' + escapeHTML(match.time || '') + '</small></div>'
        + '<div class="opponent-info">'
        + '<div class="opponent"><div class="opponent-logo">' + escapeHTML(initials) + '</div><div><strong>' + escapeHTML(match.opponent) + '</strong><span>' + escapeHTML(match.location) + ' • ' + escapeHTML(match.competition) + '</span></div></div>'
        + (eventsHtml ? '<div class="match-events">' + eventsHtml + '</div>' : '')
        + '</div>'
        + '<div class="score ' + scoreClass + '">' + escapeHTML(match.score || 'vs') + '</div>'
        + '</div>';
}

/* =====================================================
   STATISTIEKEN
===================================================== */

function renderStatistics() {
    const container = document.getElementById('statisticsContent');
    if (!container) return;

    const categories = [
        { title: 'Topscorers', key: 'goals', label: 'doelpunt(en)' },
        { title: 'Assists', key: 'assists', label: 'assist(s)' },
        { title: 'Gele kaarten', key: 'yellow', label: 'gele kaart' },
        { title: 'Rode kaarten', key: 'red', label: 'rode kaart' }
    ];

    container.innerHTML = categories.map(category => {
        const ranked = [...data.players]
            .filter(player => Number(player[category.key] || 0) > 0)
            .sort((a, b) => Number(b[category.key] || 0) - Number(a[category.key] || 0))
            .slice(0, 8);

        if (!ranked.length) {
            return '<div class="card stats-page-card"><div class="card-header"><h3>' + escapeHTML(category.title) + '</h3></div><div class="card-body"><div class="empty">Nog geen gegevens.</div></div></div>';
        }

        return '<div class="card stats-page-card"><div class="card-header"><h3>' + escapeHTML(category.title) + '</h3></div><div class="card-body"><div class="stats-list">'
            + ranked.map((player, index) => '<div class="stats-row"><strong>' + (index + 1) + '. ' + escapeHTML(player.name) + '</strong><span class="stats-value-pill">' + escapeHTML(player[category.key]) + ' ' + escapeHTML(category.label) + '</span></div>').join('')
            + '</div></div></div>';
    }).join('');
}

function renderSpelerVanHetJaar(winnaars) {
    const container = document.getElementById('spelerVanHetJaar');
    if (!container) return;

    container.innerHTML = [...winnaars]
        .sort((a, b) => b.jaar - a.jaar)
        .map(winner =>
            '<div style="background:var(--green-light);border-radius:12px;padding:16px;text-align:center;">'
            + '<div style="font-size:28px;font-weight:900;color:var(--green);line-height:1;">' + escapeHTML(winner.jaar) + '</div>'
            + '<div style="font-weight:700;margin-top:6px;font-size:15px;">' + escapeHTML(winner.naam) + '</div>'
            + '</div>'
        ).join('');
}

function formatDate(date) {
    if (!date) return '—';
    return new Date(date + 'T12:00:00').toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric' });
}

function escapeHTML(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2200);
}

function renderAll() {
    renderDashboard();
    renderPlayers();
    renderStaff();
    renderMatches();
    renderStatistics();
}

function buildPlayersFromMatchData(spelersData, wedstrijdenData) {
    const players = (spelersData?.spelers || []).map(s => ({
        number: s.rugnummer,
        name: s.naam,
        position: s.positie,
        guest: Boolean(s.gastspeler),
        training: s.training ?? 0,
        trainingTotal: s.trainingTotaal ?? 0,
        attendance: s.wedstrijden ?? 0,
        attendanceTotal: s.wedstrijdenTotaal ?? 0,
        minutes: s.minuten ?? 0,
        maxMinutes: s.minutenMax ?? 0,
        goals: s.doelpunten ?? 0,
        assists: s.assists ?? 0,
        yellow: s.geelKaarten ?? 0,
        red: s.roodKaarten ?? 0
    }));

    const playersByName = new Map();
    players.forEach(player => playersByName.set(player.name.toLowerCase(), player));

    (wedstrijdenData?.wedstrijden || []).forEach(match => {
        (match.doelpunten || []).forEach(event => {
            const scorerName = String(event.speler || event.scorer || '').trim();
            const assistName = String(event.assist || event.assistPlayer || '').trim();
            if (!scorerName) return;

            const scorerKey = scorerName.toLowerCase();
            if (!playersByName.has(scorerKey)) {
                playersByName.set(scorerKey, {
                    number: playersByName.size + 1,
                    name: scorerName,
                    position: 'Speler',
                    training: 0,
                    trainingTotal: 0,
                    attendance: 0,
                    attendanceTotal: 0,
                    minutes: 0,
                    maxMinutes: 0,
                    goals: 0,
                    assists: 0,
                    yellow: 0,
                    red: 0
                });
            }
            const scorer = playersByName.get(scorerKey);
            scorer.goals = Number(scorer.goals || 0) + 1;

            if (assistName) {
                const assistKey = assistName.toLowerCase();
                if (!playersByName.has(assistKey)) {
                    playersByName.set(assistKey, {
                        number: playersByName.size + 1,
                        name: assistName,
                        position: 'Speler',
                        training: 0,
                        trainingTotal: 0,
                        attendance: 0,
                        attendanceTotal: 0,
                        minutes: 0,
                        maxMinutes: 0,
                        goals: 0,
                        assists: 0,
                        yellow: 0,
                        red: 0
                    });
                }
                const assistPlayer = playersByName.get(assistKey);
                assistPlayer.assists = Number(assistPlayer.assists || 0) + 1;
            }
        });
    });

    return Array.from(playersByName.values());
}

loadData();

Promise.all([
    fetch('wedstrijden.json').then(r => r.json()).catch(() => null),
    fetch('spelers.json').then(r => r.json()).catch(() => null),
    fetch('speler-van-het-jaar.json').then(r => r.json()).catch(() => null)
]).then(([wedstrijden, spelers, svhj]) => {
    if (wedstrijden?.wedstrijden) {
        data.matches = wedstrijden.wedstrijden.map(w => {
            const isThuis = w.thuis === 'SV Twello 2';
            const events = (w.doelpunten || []).map(event => ({
                scorer: event.speler || event.scorer || '',
                assist: event.assist || event.assistPlayer || '',
                minute: event.minuut || event.minute || ''
            }));

            return {
                id: w.id,
                date: w.datum,
                time: w.tijd,
                opponent: isThuis ? w.uit : w.thuis,
                location: isThuis ? 'Thuis' : 'Uit',
                competition: w.competitie || 'Competitie',
                score: w.uitslag || '',
                events
            };
        });
    }

    if (spelers?.spelers?.length || wedstrijden?.wedstrijden) {
        data.players = buildPlayersFromMatchData(spelers, wedstrijden);
    }

    data.staff = spelers?.staf || [];
    if (svhj?.winnaars) {
        renderSpelerVanHetJaar(svhj.winnaars);
    }
    renderAll();
}).catch(() => renderAll());
