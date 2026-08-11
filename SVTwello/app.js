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

    if (!Array.isArray(data.players)) data.players = [];
    if (!Array.isArray(data.matches)) data.matches = [];
    if (!Array.isArray(data.staff)) data.staff = [];
    if (!Array.isArray(data.trainings)) data.trainings = [];
    if (!Array.isArray(data.spelerVanHetJaar)) data.spelerVanHetJaar = [];
}

function saveData() {
    localStorage.setItem('svTwelloZondag2', JSON.stringify(data));
    showToast('Gegevens opgeslagen');
    renderAll();
}

function parseTruthy(value) {
    if (value === null || value === undefined || value === '') return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    return String(value).trim().toLowerCase() in ['ja', 'yes', 'true', '1', 'x', 'y'];
}

function parseNumber(value) {
    if (value === null || value === undefined || value === '') return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function hasExplicitValue(value) {
    return value !== null && value !== undefined && String(value).trim() !== '';
}

function normalizeCellValue(value) {
    if (value instanceof Date) {
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const day = String(value.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    if (value === null || value === undefined) return '';
    return value;
}

function parseDateTime(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'string') {
        const text = value.trim();
        if (!text) return null;
        const direct = new Date(text);
        if (!Number.isNaN(direct.getTime())) return direct;
        const withTime = new Date(text.replace(' ', 'T'));
        if (!Number.isNaN(withTime.getTime())) return withTime;
    }
    return null;
}

function isCompletedEvent(dateValue, timeValue) {
    if (!dateValue && !timeValue) return true;
    const combined = [dateValue, timeValue].filter(Boolean).join(' ');
    if (!combined) return true;
    const parsed = parseDateTime(combined);
    if (!parsed) return true;
    return parsed <= new Date();
}

function getSheetRows(workbook, sheetName) {
    const sheet = workbook?.Sheets?.[sheetName];
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false }).map(row => {
        const normalized = {};
        Object.entries(row).forEach(([key, value]) => {
            normalized[key] = normalizeCellValue(value);
        });
        return normalized;
    });
}

function buildImportDataFromWorkbook(workbook) {
    const spelersRows = getSheetRows(workbook, 'spelers');
    const stafRows = getSheetRows(workbook, 'staf');
    const wedstrijdenRows = getSheetRows(workbook, 'wedstrijden');
    const wedstrijdInvoerRows = getSheetRows(workbook, 'wedstrijdinvoer');
    const trainingsInvoerRows = getSheetRows(workbook, 'trainingsinvoer');
    const spelerVanHetJaarRows = getSheetRows(workbook, 'speler_van_het_jaar');

    const players = spelersRows
        .filter(row => row.naam || row.name)
        .map(row => ({
            number: row.rugnummer ?? row.number ?? '',
            name: row.naam || row.name || '',
            position: row.positie || row.position || '',
            foot: row.voet || row.foot || 'rechts',
            status: row.Status || row.status || '',
            guest: parseTruthy(row.gastspeler ?? row.guest),
            captain: parseTruthy(row.aanvoerder ?? row.captain),
            training: 0,
            trainingTotal: 0,
            attendance: 0,
            attendanceTotal: 0,
            minutes: 0,
            maxMinutes: 0,
            goals: 0,
            assists: 0,
            penalties: 0,
            yellow: 0,
            red: 0,
            late: 0,
            present: 0
        }));

    const playerLookup = new Map();
    players.forEach(player => {
        if (player.name) {
            playerLookup.set(player.name.toLowerCase(), player);
        }
    });

    const statsByPlayer = {};
    const statsPresenceByPlayer = {};
    players.forEach(player => {
        if (!player.name) return;
        const key = player.name.toLowerCase();
        statsByPlayer[key] = {
            goals: 0,
            assists: 0,
            penalties: 0,
            yellow: 0,
            red: 0,
            late: 0,
            present: 0
        };
        statsPresenceByPlayer[key] = {
            goals: false,
            assists: false,
            penalties: false,
            yellow: false,
            red: false,
            late: false,
            present: false
        };
    });

    const completedMatchIds = new Set(
        wedstrijdenRows
            .filter(row => isCompletedEvent(row.datum, row.tijd))
            .map(row => String(row.wedstrijd_id || row.match_id || '').trim())
            .filter(Boolean)
    );

    const byMatch = {};
    wedstrijdInvoerRows.forEach(row => {
        const matchId = String(row.wedstrijd_id || row.match_id || '').trim();
        if (!matchId || !completedMatchIds.has(matchId)) return;

        const entry = byMatch[matchId] || {
            doelpunten: [],
            assists: [],
            penalties: [],
            kaarten: [],
            statussen: [],
            te_laat: []
        };

        const spelerNaam = String(row.speler_naam || row.speler || '').trim();
        const doelpuntenValue = row.doelpunten ?? row.goals ?? '';
        const assistsValue = row.assists ?? row.assist ?? '';
        const penaltyValue = row.penalty ?? row.penalties ?? '';
        const geelValue = row.geel ?? row.yellow ?? '';
        const roodValue = row.rood ?? row.red ?? '';
        const teLaatValue = row['te laat'] ?? row.te_laat ?? '';
        const aanwezigValue = row.aanwezig ?? row.attendance ?? row.present ?? '';
        const doelpunten = parseNumber(doelpuntenValue);
        const assists = parseNumber(assistsValue);
        const penalty = parseNumber(penaltyValue);
        const geel = parseNumber(geelValue);
        const rood = parseNumber(roodValue);
        const teLaat = teLaatValue;
        const status = row.status || '';

        const playerKey = spelerNaam.toLowerCase();
        const stats = statsByPlayer[playerKey] || { goals: 0, assists: 0, penalties: 0, yellow: 0, red: 0, late: 0, present: 0 };
        const presence = statsPresenceByPlayer[playerKey] || {
            goals: false,
            assists: false,
            penalties: false,
            yellow: false,
            red: false,
            late: false,
            present: false
        };
        if (hasExplicitValue(doelpuntenValue)) presence.goals = true;
        if (hasExplicitValue(assistsValue)) presence.assists = true;
        if (hasExplicitValue(penaltyValue)) presence.penalties = true;
        if (hasExplicitValue(geelValue)) presence.yellow = true;
        if (hasExplicitValue(roodValue)) presence.red = true;
        if (hasExplicitValue(teLaatValue)) presence.late = true;
        if (hasExplicitValue(aanwezigValue)) presence.present = true;
        stats.goals += doelpunten;
        stats.assists += assists;
        stats.penalties += penalty;
        stats.yellow += geel;
        stats.red += rood;
        stats.late += parseNumber(teLaat);
        if (parseTruthy(aanwezigValue)) {
            stats.present += 1;
        }
        statsByPlayer[playerKey] = stats;
        statsPresenceByPlayer[playerKey] = presence;

        for (let i = 0; i < doelpunten; i += 1) entry.doelpunten.push({ speler: spelerNaam });
        for (let i = 0; i < assists; i += 1) entry.assists.push({ speler: spelerNaam });
        for (let i = 0; i < penalty; i += 1) entry.penalties.push({ speler: spelerNaam });
        if (geel > 0) entry.kaarten.push({ speler: spelerNaam, type: 'geel' });
        if (rood > 0) entry.kaarten.push({ speler: spelerNaam, type: 'rood' });
        if (teLaat !== '' && teLaat !== 0) entry.te_laat.push({ speler: spelerNaam, waarde: teLaat });
        if (status) entry.statussen.push({ speler: spelerNaam, status });

        byMatch[matchId] = entry;
    });

    const matches = wedstrijdenRows
        .filter(row => String(row.wedstrijd_id || row.match_id || '').trim())
        .map(row => {
            const matchId = String(row.wedstrijd_id || row.match_id || '').trim();
            const data = byMatch[matchId] || {};
            const isThuis = String(row.thuis || '').trim() === 'SV Twello 2';
            const dateValue = row.datum || row.date || '';
            const timeValue = row.tijd || row.time || '';

            return {
                id: matchId,
                date: dateValue,
                time: timeValue,
                opponent: isThuis ? (row.uit || row.opponent || '') : (row.thuis || row.opponent || ''),
                location: isThuis ? 'Thuis' : 'Uit',
                competition: row.competitie || row.competition || 'Competitie',
                score: row.uitslag || row.score || '',
                events: (data.doelpunten || []).map(event => ({
                    scorer: event.speler || '',
                    assist: '',
                    minute: ''
                })),
                assists: data.assists || [],
                penalties: data.penalties || [],
                cards: data.kaarten || []
            };
        });

    players.forEach(player => {
        const key = player.name.toLowerCase();
        const stats = statsByPlayer[key];
        const presence = statsPresenceByPlayer[key];
        if (!stats) return;
        player.goals = Number(stats.goals || 0);
        player.assists = Number(stats.assists || 0);
        player.penalties = Number(stats.penalties || 0);
        player.yellow = Number(stats.yellow || 0);
        player.red = Number(stats.red || 0);
        player.late = Number(stats.late || 0);
        player.present = Number(stats.present || 0);
        player.goalsHasData = Boolean(presence?.goals);
        player.assistsHasData = Boolean(presence?.assists);
        player.penaltiesHasData = Boolean(presence?.penalties);
        player.yellowHasData = Boolean(presence?.yellow);
        player.redHasData = Boolean(presence?.red);
        player.lateHasData = Boolean(presence?.late);
        player.presentHasData = Boolean(presence?.present);
    });

    if (trainingsInvoerRows.length) {
        const trainingHeaders = Object.keys(trainingsInvoerRows[0] || {}).filter(key => !['speler_id', 'speler naam', 'speler_naam'].includes(String(key).toLowerCase()));
        const completedTrainingHeaders = trainingHeaders.filter(header => isCompletedEvent(header));
        trainingsInvoerRows.forEach(row => {
            const playerName = String(row['speler naam'] || row.speler_naam || row.naam || '').trim();
            const player = playerLookup.get(playerName.toLowerCase());
            if (!player) return;

            let attended = 0;
            completedTrainingHeaders.forEach(header => {
                if (parseTruthy(row[header])) attended += 1;
            });

            player.training = attended;
            player.trainingTotal = completedTrainingHeaders.length;
        });
    }

    if (wedstrijdInvoerRows.length) {
        const attendanceTotals = {};
        const attendanceCounts = {};
        wedstrijdInvoerRows.forEach(row => {
            const matchId = String(row.wedstrijd_id || row.match_id || '').trim();
            if (!matchId || !completedMatchIds.has(matchId)) return;
            const playerName = String(row.speler_naam || row.speler || '').trim();
            if (!playerName) return;
            const key = playerName.toLowerCase();
            attendanceTotals[key] = (attendanceTotals[key] || 0) + 1;
            if (parseTruthy(row.aanwezig || row.attendance || row.present)) {
                attendanceCounts[key] = (attendanceCounts[key] || 0) + 1;
            }
        });

        playerLookup.forEach((player, key) => {
            player.attendance = attendanceCounts[key] || 0;
            player.attendanceTotal = attendanceTotals[key] || 0;
        });
    }

    return {
        players,
        matches,
        staff: stafRows.filter(row => row.naam || row.name).map(row => ({
            naam: row.naam || row.name || '',
            rol: row.rol || row.role || ''
        })),
        spelerVanHetJaar: spelerVanHetJaarRows
            .filter(row => row.jaar || row.year || row.naam || row.name)
            .map(row => ({
                jaar: parseNumber(row.jaar || row.year || 0),
                naam: row.naam || row.name || ''
            })),
        team: 'SV Twello 2',
        seizoen: '2026/2027'
    };
}

function hydrateFromImportedData() {
    const stored = localStorage.getItem('svTwelloZondag2');
    let savedTrainings = [];

    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            savedTrainings = Array.isArray(parsed?.trainings) ? parsed.trainings : [];
        } catch {
            savedTrainings = [];
        }
    }

    if (!window.XLSX) {
        data = structuredClone(defaultData);
        data.trainings = savedTrainings;
        setupAttendanceControls();
        renderAll();
        return;
    }

    fetch('zondag2.xlsx')
        .then(response => {
            if (!response.ok) throw new Error('Workbook kon niet worden geladen');
            return response.arrayBuffer();
        })
        .then(buffer => {
            const workbook = XLSX.read(buffer, { type: 'array' });
            const imported = buildImportDataFromWorkbook(workbook);

            data = structuredClone(defaultData);
            data.trainings = savedTrainings;
            const builtPlayers = buildPlayersFromMatchData(imported.players, imported.matches);
            const importedByName = new Map(imported.players.map(player => [String(player.name).toLowerCase(), player]));
            data.players = builtPlayers.map(player => {
                const source = importedByName.get(String(player.name).toLowerCase());
                if (!source) return player;
                return {
                    ...player,
                    goals: Number(source.goals || 0),
                    assists: Number(source.assists || 0),
                    penalties: Number(source.penalties || 0),
                    yellow: Number(source.yellow || 0),
                    red: Number(source.red || 0),
                    late: Number(source.late || 0),
                    present: Number(source.present || 0),
                    goalsHasData: Boolean(source.goalsHasData),
                    assistsHasData: Boolean(source.assistsHasData),
                    penaltiesHasData: Boolean(source.penaltiesHasData),
                    yellowHasData: Boolean(source.yellowHasData),
                    redHasData: Boolean(source.redHasData),
                    lateHasData: Boolean(source.lateHasData),
                    presentHasData: Boolean(source.presentHasData),
                    training: Number(source.training || player.training || 0),
                    trainingTotal: Number(source.trainingTotal || player.trainingTotal || 0),
                    attendance: Number(source.attendance || player.attendance || 0),
                    attendanceTotal: Number(source.attendanceTotal || player.attendanceTotal || 0)
                };
            });
            data.matches = imported.matches;
            data.staff = imported.staff;
            data.spelerVanHetJaar = imported.spelerVanHetJaar;
            data.team = imported.team;
            data.seizoen = imported.seizoen;

            setupAttendanceControls();
            renderAll();
        })
        .catch(() => {
            data = structuredClone(defaultData);
            data.trainings = savedTrainings;
            setupAttendanceControls();
            renderAll();
        });
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
    const guest = player.guest ? ' <span class="badge guest">Gastspeler</span>' : '';
    const captain = player.captain ? ' <span class="badge guest">C</span>' : '';

    return '<tr>'
        + '<td>' + escapeHTML(player.number || '—') + '</td>'
        + '<td>' + escapeHTML(player.name) + guest + captain + '</td>'
        + '<td>' + escapeHTML(player.position || '—') + '</td>'
        + '<td>' + escapeHTML(player.status || '—') + '</td>'
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

    const sections = [];

    const statGroups = [
        { key: 'goals', title: 'Doelpunten', header: 'Aantal doelpunten', field: 'goals' },
        { key: 'assists', title: 'Assists', header: 'Aantal assists', field: 'assists' },
        { key: 'penalties', title: 'Penalties', header: 'Aantal penalties', field: 'penalties' },
        { key: 'yellow', title: 'Gele kaarten', header: 'Aantal gele kaarten', field: 'yellow' },
        { key: 'red', title: 'Rode kaarten', header: 'Aantal rode kaarten', field: 'red' },
        { key: 'late', title: 'Te laat', header: 'Aantal te laat', field: 'late' },
        { key: 'present', title: 'Aanwezig', header: 'Aantal aanwezig', field: 'present' }
    ];

    statGroups.forEach(group => {
        const rows = players
            .map(player => {
                const value = Number(player[group.field] || 0);
                const hasData = Boolean(player[`${group.field}HasData`]);
                return hasData || value > 0 ? [player.name, value] : null;
            })
            .filter(Boolean)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

        if (rows.length) {
            sections.push(renderStatisticsCard(group.title, group.header, rows));
        }
    });

    container.innerHTML = sections.length
        ? sections.join('')
        : '<div class="card"><div class="card-body"><div class="empty">Geen statistische gegevens beschikbaar.</div></div></div>';

    populatePlayerComparisonOptions();
    renderPlayerComparison();
}

function renderStatisticsCard(title, header, rows) {
    return `
        <div class="card">
            <div class="card-header"><h3>${escapeHTML(title)}</h3></div>
            <div class="card-body">
                ${renderStatisticsList(header, rows)}
            </div>
        </div>`;
}

function renderStatisticsList(header, rows) {
    if (!rows.length) {
        return '<div class="empty">Geen gegevens beschikbaar.</div>';
    }

    return '<div class="stat-list">'
        + rows.map((row, index) => {
            const [player, value] = row;
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
            return '<div class="stat-list-item">'
                + '<div class="stat-list-player">'
                + (medal ? '<span class="stat-medal">' + escapeHTML(medal) + '</span>' : '')
                + '<span>' + escapeHTML(player) + '</span>'
                + '</div>'
                + '<div class="stat-list-value">' + escapeHTML(value) + ' ' + escapeHTML(header) + '</div>'
                + '</div>';
        }).join('')
        + '</div>';
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

        const trainingPercent = trainingTotal > 0 ? Math.round((training / trainingTotal) * 100) : 0;
        const matchPercent = matchTotal > 0 ? Math.round((matchAttendance / matchTotal) * 100) : 0;

        return {
            name: player.name,
            training,
            trainingTotal,
            matchAttendance,
            matchTotal,
            trainingPercent,
            matchPercent
        };
    });
}

function renderAttendance() {
    const table = document.getElementById('attendanceTable');
    if (table) {
        const rows = getAttendanceSummary().map(player => renderAttendanceRow(player));
        table.innerHTML = rows.length
            ? rows.join('')
            : '<tr><td colspan="5"><div class="empty">Geen spelers gevonden.</div></td></tr>';
    }

    renderCalendar();
}

function renderAttendanceRow(player) {
    return '<tr>'
        + '<td>' + escapeHTML(player.name) + '</td>'
        + '<td>' + escapeHTML(player.training) + ' / ' + escapeHTML(player.trainingTotal || '–') + '</td>'
        + '<td>' + escapeHTML(player.matchAttendance) + ' / ' + escapeHTML(player.matchTotal || '–') + '</td>'
        + '<td><strong>' + escapeHTML(player.trainingPercent) + '%</strong></td>'
        + '<td><strong>' + escapeHTML(player.matchPercent) + '%</strong></td>'
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

function renderSpelerVanHetJaarPage() {
    const container = document.getElementById('spelerVanHetJaarList');
    if (!container) return;

    const winnaars = Array.isArray(data.spelerVanHetJaar)
        ? data.spelerVanHetJaar
        : [];

    if (!winnaars.length) {
        container.innerHTML = '<div class="empty">Geen winnaars bekend.</div>';
        return;
    }

    container.innerHTML = '<div class="table-wrapper"><table><tbody>'
        + winnaars.slice().sort((a, b) => b.jaar - a.jaar).map(winner => {
            return '<tr><td><strong>' + escapeHTML(winner.jaar) + '</strong></td><td>' + escapeHTML(winner.naam) + '</td></tr>';
        }).join('')
        + '</tbody></table></div>';
}

function renderAll() {
    renderDashboard();
    renderPlayers();
    renderStaff();
    renderMatches();
    renderAttendance();
    renderStatistics();
    renderSpelerVanHetJaar(data.spelerVanHetJaar);
    renderSpelerVanHetJaarPage();
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
        status: s.status || s.Status || '',
        birthdate: s.geboortedatum || s.birthdate || '',
        guest: Boolean(s.gastspeler ?? s.guest),
        captain: Boolean(s.aanvoerder ?? s.captain),
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
                    penalties: 0,
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
                        penalties: 0,
                        yellow: 0,
                        red: 0
                    });
                }
                const assistPlayer = playersByName.get(assistKey);
                assistPlayer.assists = Number(assistPlayer.assists || 0) + 1;
            }
        });

        (match.assists || []).forEach(event => {
            const playerName = String(event.speler || event.player || '').trim();
            if (!playerName) return;
            const key = playerName.toLowerCase();
            if (!playersByName.has(key)) {
                playersByName.set(key, {
                    number: playersByName.size + 1,
                    name: playerName,
                    position: 'Speler',
                    training: 0,
                    trainingTotal: 0,
                    attendance: 0,
                    attendanceTotal: 0,
                    minutes: 0,
                    maxMinutes: 0,
                    goals: 0,
                    assists: 0,
                    penalties: 0,
                    yellow: 0,
                    red: 0
                });
            }
            const player = playersByName.get(key);
            player.assists = Number(player.assists || 0) + 1;
        });

        (match.penalties || []).forEach(event => {
            const playerName = String(event.speler || event.player || '').trim();
            if (!playerName) return;
            const key = playerName.toLowerCase();
            if (!playersByName.has(key)) {
                playersByName.set(key, {
                    number: playersByName.size + 1,
                    name: playerName,
                    position: 'Speler',
                    training: 0,
                    trainingTotal: 0,
                    attendance: 0,
                    attendanceTotal: 0,
                    minutes: 0,
                    maxMinutes: 0,
                    goals: 0,
                    assists: 0,
                    penalties: 0,
                    yellow: 0,
                    red: 0
                });
            }
            const player = playersByName.get(key);
            player.penalties = Number(player.penalties || 0) + 1;
        });
    });

    return Array.from(playersByName.values());
}

loadData();
hydrateFromImportedData();
