/* =====================================================
   STARTDATA
===================================================== */

const defaultData = {
    players: [],
    matches: [],
    standings: [],
    staff: [],
    trainings: []
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
        return a.name.localeCompare(b.name);
    });

    const table = document.getElementById('playersTable');
    if (!players.length) {
        table.innerHTML = '<tr><td colspan="5"><div class="empty">Geen spelers gevonden.</div></td></tr>';
        return;
    }

    table.innerHTML = players.map(player => renderPlayerRow(player)).join('');
}

function renderPlayerRow(player) {
    const age = player.birthdate ? escapeHTML(calculateAge(player.birthdate) + ' jaar') : '–';
    const guest = player.guest ? ' <span class="badge guest">Gastspeler</span>' : '';

    return '<tr>'
        + '<td>' + escapeHTML(player.number || '—') + '</td>'
        + '<td>' + escapeHTML(player.name) + guest + '</td>'
        + '<td>' + escapeHTML(player.position || '—') + '</td>'
        + '<td>' + age + '</td>'
        + '<td>' + escapeHTML(player.foot || 'rechts') + '</td>'
        + '</tr>';
}

function renderStaff() {
    const container = document.getElementById('staffList');
    if (!container) return;
    if (!data.staff.length) {
        container.innerHTML = '<div class="empty">Geen stafleden gevonden.</div>';
        return;
    }

    container.innerHTML = '<div class="table-wrapper"><table><tbody>'
        + data.staff.map(member => {
            const age = member.geboortedatum ? ' (' + escapeHTML(calculateAge(member.geboortedatum) + ' jaar') + ')' : '';
            const role = member.rol ? ' — ' + escapeHTML(member.rol) : '';
            return '<tr><td>' + escapeHTML(member.naam) + role + age + '</td></tr>';
        }).join('')
        + '</tbody></table></div>';
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

    const players = [...data.players].sort((a, b) => a.name.localeCompare(b.name));
    const goals = players.map(player => [player.name, player.goals || 0]);
    const assists = players.map(player => [player.name, player.assists || 0]);
    const yellow = players.map(player => [player.name, player.yellow || 0]);
    const red = players.map(player => [player.name, player.red || 0]);

    container.innerHTML = `
        <div class="card">
            <div class="card-header"><h3>Doelpunten</h3></div>
            <div class="card-body">
                ${renderStatisticsTable(['Speler', 'Aantal doelpunten'], goals)}
            </div>
        </div>

        <div class="card">
            <div class="card-header"><h3>Assists</h3></div>
            <div class="card-body">
                ${renderStatisticsTable(['Speler', 'Aantal assists'], assists)}
            </div>
        </div>

        <div class="card">
            <div class="card-header"><h3>Gele kaarten</h3></div>
            <div class="card-body">
                ${renderStatisticsTable(['Speler', 'Aantal gele kaarten'], yellow)}
            </div>
        </div>

        <div class="card">
            <div class="card-header"><h3>Rode kaarten</h3></div>
            <div class="card-body">
                ${renderStatisticsTable(['Speler', 'Aantal rode kaarten'], red)}
            </div>
        </div>`;

    populatePlayerComparisonOptions();
    renderPlayerComparison();
}

function renderStatisticsTable(headers, rows) {
    if (!rows.length) {
        return '<div class="empty">Geen gegevens beschikbaar.</div>';
    }

    return '<div class="table-wrapper"><table><thead><tr>'
        + headers.map(header => '<th>' + escapeHTML(header) + '</th>').join('')
        + '</tr></thead><tbody>'
        + rows.map(row => '<tr>' + row.map(cell => '<td>' + escapeHTML(cell) + '</td>').join('') + '</tr>').join('')
        + '</tbody></table></div>';
}

function getGoalsByMatch(matches) {
    return [...matches]
        .filter(match => Array.isArray(match.events) && match.events.length)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(match => ({ label: formatDate(match.date), value: match.events.length }));
}

function getAttendanceSummary() {
    return data.players.map(player => {
        const training = Number(player.training || 0);
        const trainingTotal = Number(player.trainingTotal || 0);
        const matchAttendance = Number(player.attendance || 0);
        const matchTotal = Number(player.attendanceTotal || 0);

        const values = [];
        if (trainingTotal > 0) values.push(training / trainingTotal);
        if (matchTotal > 0) values.push(matchAttendance / matchTotal);

        const percent = values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) : 0;

        return {
            name: player.name,
            training,
            trainingTotal,
            matchAttendance,
            matchTotal,
            percent
        };
    });
}

function renderAttendance() {
    const table = document.getElementById('attendanceTable');
    if (table) {
        const rows = getAttendanceSummary().map(player => renderAttendanceRow(player));
        table.innerHTML = rows.length
            ? rows.join('')
            : '<tr><td colspan="4"><div class="empty">Geen spelers gevonden.</div></td></tr>';
    }

    renderCalendar();
}

function renderAttendanceRow(player) {
    return '<tr>'
        + '<td>' + escapeHTML(player.name) + '</td>'
        + '<td>' + escapeHTML(player.training) + ' / ' + escapeHTML(player.trainingTotal || '–') + '</td>'
        + '<td>' + escapeHTML(player.matchAttendance) + ' / ' + escapeHTML(player.matchTotal || '–') + '</td>'
        + '<td><strong>' + escapeHTML(player.percent) + '%</strong></td>'
        + '</tr>';
}

function weekdayToNumber(weekday) {
    const map = {
        sunday: 0,
        monday: 1,
        tuesday: 2,
        wednesday: 3,
        thursday: 4,
        friday: 5,
        saturday: 6,
        zondag: 0,
        maandag: 1,
        dinsdag: 2,
        woensdag: 3,
        donderdag: 4,
        vrijdag: 5,
        zaterdag: 6,
        zo: 0,
        ma: 1,
        di: 2,
        wo: 3,
        do: 4,
        vr: 5,
        za: 6
    };
    return map[String(weekday || '').toLowerCase()] ?? null;
}

function getRecurringTrainingEvents(training, count = 4) {
    const weekdayIndex = weekdayToNumber(training.weekday);
    if (weekdayIndex === null) {
        return [];
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextDate = new Date(today);
    const diff = (weekdayIndex + 7 - nextDate.getDay()) % 7;
    nextDate.setDate(nextDate.getDate() + diff);

    const events = [];
    for (let i = 0; i < count; i += 1) {
        const eventDate = new Date(nextDate);
        eventDate.setDate(nextDate.getDate() + i * 7);
        events.push({
            type: 'training',
            date: eventDate.toISOString().split('T')[0],
            time: training.time,
            title: training.title,
            location: training.location,
            recurring: true
        });
    }
    return events;
}

function getCalendarEvents() {
    const trainingEvents = (data.trainings || []).flatMap(training => {
        if (training.date) {
            return [{
                type: 'training',
                date: training.date,
                time: training.time,
                title: training.title,
                location: training.location
            }];
        }
        return getRecurringTrainingEvents(training);
    });

    const matchEvents = data.matches.map(match => ({
        type: 'match',
        date: match.date,
        time: match.time,
        title: match.opponent,
        location: match.location,
        score: match.score
    }));

    return [...trainingEvents, ...matchEvents].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

function renderCalendar() {
    const container = document.getElementById('calendarList');
    if (!container) return;

    const events = getCalendarEvents();
    if (!events.length) {
        container.innerHTML = '<div class="empty">Geen kalenderitems gevonden.</div>';
        return;
    }

    container.innerHTML = events.map(event => {
        const title = event.type === 'training'
            ? event.title + (event.recurring ? ' (wekelijkse training)' : '')
            : 'Wedstrijd tegen ' + event.title;
        const details = event.type === 'training'
            ? 'Training • ' + escapeHTML(event.location)
            : 'Wedstrijd • ' + escapeHTML(event.location) + ' • ' + escapeHTML(event.score || 'score nog onbekend');

        return '<div class="calendar-event">'
            + '<div class="calendar-date"><strong>' + formatDate(event.date) + '</strong> ' + escapeHTML(event.time || '') + '</div>'
            + '<div class="calendar-title">' + escapeHTML(title) + '</div>'
            + '<div class="calendar-meta">' + details + '</div>'
            + '</div>';
    }).join('');
}

function setupAttendanceControls() {
    const button = document.getElementById('saveTrainingBtn');
    if (!button) return;

    button.addEventListener('click', () => {
        const title = document.getElementById('trainingTitle')?.value.trim();
        const location = document.getElementById('trainingLocation')?.value.trim();
        const date = document.getElementById('trainingDate')?.value;
        const time = document.getElementById('trainingTime')?.value;

        if (!title || !date || !time) {
            showToast('Vul titel, datum en tijd in.');
            return;
        }

        data.trainings = data.trainings || [];
        data.trainings.push({
            id: Date.now(),
            title,
            location: location || 'Teamtraining',
            date,
            time
        });

        document.getElementById('trainingTitle').value = '';
        document.getElementById('trainingLocation').value = '';
        document.getElementById('trainingDate').value = '';
        document.getElementById('trainingTime').value = '';

        saveData();
    });
}

function getCardsTrend(matches) {
    return [...matches]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(match => {
            const yellow = (match.cards || []).filter(card => card.type === 'geel').length;
            const red = (match.cards || []).filter(card => card.type === 'rood').length;
            return { label: formatDate(match.date), yellow, red };
        });
}

function getAssistsByPeriod(matches) {
    const periods = { '0-45': 0, '46-90': 0, '90+': 0 };
    matches.forEach(match => {
        (match.events || []).forEach(event => {
            if (!event.assist) return;
            const minute = Number(event.minute) || 0;
            if (minute <= 45) periods['0-45']++;
            else if (minute <= 90) periods['46-90']++;
            else periods['90+']++;
        });
    });
    return periods;
}

function renderStatBar(label, value, maxValue = 10, color = 'var(--green)') {
    const width = maxValue > 0 ? Math.min(100, Math.round((value / maxValue) * 100)) : 0;
    return '<div class="chart-bar">'
        + '<div class="chart-label">' + escapeHTML(label) + '</div>'
        + '<div class="chart-track"><div class="chart-fill" style="width:' + width + '%;background:' + color + '"></div></div>'
        + '<div class="chart-value">' + escapeHTML(value) + '</div>'
        + '</div>';
}

function populatePlayerComparisonOptions() {
    const selectA = document.getElementById('comparePlayerA');
    const selectB = document.getElementById('comparePlayerB');
    if (!selectA || !selectB) return;

    const players = [...data.players].sort((a, b) => a.name.localeCompare(b.name));
    const options = players.map(player => '<option value="' + escapeHTML(player.name) + '">' + escapeHTML(player.name) + '</option>').join('');

    selectA.innerHTML = '<option value="">Kies speler A</option>' + options;
    selectB.innerHTML = '<option value="">Kies speler B</option>' + options;

    selectA.addEventListener('change', renderPlayerComparison);
    selectB.addEventListener('change', renderPlayerComparison);
}

function renderPlayerComparison() {
    const selectA = document.getElementById('comparePlayerA');
    const selectB = document.getElementById('comparePlayerB');
    const result = document.getElementById('comparisonResult');
    if (!selectA || !selectB || !result) return;

    const playerA = data.players.find(player => player.name === selectA.value);
    const playerB = data.players.find(player => player.name === selectB.value);

    if (!playerA || !playerB) {
        result.innerHTML = '<div class="empty">Kies twee spelers om te vergelijken.</div>';
        return;
    }

    result.innerHTML = '<div class="comparison-grid">'
        + '<div class="comparison-card">'
        + '<strong>' + escapeHTML(playerA.name) + '</strong>'
        + '<p>Doelpunten: ' + escapeHTML(playerA.goals || 0) + '</p>'
        + '<p>Assists: ' + escapeHTML(playerA.assists || 0) + '</p>'
        + '<p>Gele kaarten: ' + escapeHTML(playerA.yellow || 0) + '</p>'
        + '<p>Rode kaarten: ' + escapeHTML(playerA.red || 0) + '</p>'
        + '</div>'
        + '<div class="comparison-card">'
        + '<strong>' + escapeHTML(playerB.name) + '</strong>'
        + '<p>Doelpunten: ' + escapeHTML(playerB.goals || 0) + '</p>'
        + '<p>Assists: ' + escapeHTML(playerB.assists || 0) + '</p>'
        + '<p>Gele kaarten: ' + escapeHTML(playerB.yellow || 0) + '</p>'
        + '<p>Rode kaarten: ' + escapeHTML(playerB.red || 0) + '</p>'
        + '</div>'
        + '</div>';
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

function calculateAge(dateString) {
    const birth = new Date(dateString + 'T00:00:00');
    if (Number.isNaN(birth.getTime())) return '–';
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    const dayDiff = today.getDate() - birth.getDate();
    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
        age -= 1;
    }
    return age;
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
    renderAttendance();
    renderStatistics();
}

function buildPlayersFromMatchData(spelersData, wedstrijdenData) {
    const spelerLijst = Array.isArray(spelersData)
        ? spelersData
        : (spelersData?.spelers || spelersData?.players || []);

    const players = spelerLijst.map(s => ({
        number: s.rugnummer ?? s.number ?? s.nr ?? '',
        name: s.naam || s.name || '',
        position: s.positie || s.position || '',
        foot: s.voet || s.foot || 'rechts',
        birthdate: s.geboortedatum || s.birthdate || '',
        guest: Boolean(s.gastspeler ?? s.guest),
        training: s.training ?? 0,
        trainingTotal: s.trainingTotaal ?? s.trainingTotal ?? 0,
        attendance: s.wedstrijden ?? s.attendance ?? 0,
        attendanceTotal: s.wedstrijdenTotaal ?? s.attendanceTotal ?? 0,
        minutes: s.minuten ?? s.minutes ?? 0,
        maxMinutes: s.minutenMax ?? s.maxMinutes ?? 0,
        goals: s.doelpunten ?? s.goals ?? 0,
        assists: s.assists ?? 0,
        yellow: s.geelKaarten ?? s.yellow ?? 0,
        red: s.roodKaarten ?? s.red ?? 0
    }));

    const playersByName = new Map();
    players.forEach(player => {
        if (player.name) {
            playersByName.set(player.name.toLowerCase(), player);
        }
    });

    const matchList = Array.isArray(wedstrijdenData)
        ? wedstrijdenData
        : (wedstrijdenData?.wedstrijden || wedstrijdenData?.matches || []);

    matchList.forEach(match => {
        (match.doelpunten || match.events || []).forEach(event => {
            const scorerName = String(event.speler || event.scorer || event.player || '').trim();
            const assistName = String(event.assist || event.assistPlayer || event.assistName || '').trim();
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
    fetch('speler-van-het-jaar.json').then(r => r.json()).catch(() => null),
    fetch('trainings.json').then(r => r.json()).catch(() => null)
]).then(([wedstrijden, spelers, svhj, trainings]) => {
    const matchList = Array.isArray(wedstrijden)
        ? wedstrijden
        : (wedstrijden?.wedstrijden || []);

    if (matchList.length) {
        data.matches = matchList.map(w => {
            const isThuis = w.thuis === 'SV Twello 2';
            const events = (w.doelpunten || w.events || []).map(event => ({
                scorer: event.speler || event.scorer || event.player || '',
                assist: event.assist || event.assistPlayer || event.assistName || '',
                minute: event.minuut || event.minute || ''
            }));
            const cards = (w.kaarten || w.cards || []).map(card => ({
                player: card.speler || card.player || '',
                type: String(card.type || '').toLowerCase()
            }));

            return {
                id: w.id,
                date: w.datum || w.date,
                time: w.tijd || w.time,
                opponent: isThuis ? (w.uit || w.opponent) : (w.thuis || w.opponent),
                location: isThuis ? 'Thuis' : 'Uit',
                competition: w.competitie || w.competition || 'Competitie',
                score: w.uitslag || w.score || '',
                events,
                cards
            };
        });
    }

    const spelerLijst = Array.isArray(spelers)
        ? spelers
        : (spelers?.spelers || spelers?.players || []);

    if (spelerLijst.length || matchList.length) {
        data.players = buildPlayersFromMatchData(spelers, wedstrijden);
    }

    data.staff = Array.isArray(spelers?.staf)
        ? spelers.staf
        : (Array.isArray(spelers?.staff) ? spelers.staff : []);
    data.trainings = trainings?.trainings || [];
    if (svhj?.winnaars) {
        renderSpelerVanHetJaar(svhj.winnaars);
    }
    setupAttendanceControls();
    renderAll();
}).catch(() => {
    setupAttendanceControls();
    renderAll();
});
