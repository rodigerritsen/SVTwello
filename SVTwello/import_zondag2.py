from pathlib import Path
import json
from openpyxl import load_workbook

BASE = Path(__file__).resolve().parent
EXCEL_PATH = BASE / 'zondag2.xlsx'


def parse_bool(value):
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    return str(value).strip().lower() in {'ja', 'yes', 'true', '1', 'x'}


def normalize_foot(value):
    if value is None:
        return 'rechts'
    text = str(value).strip().lower()
    if text in {'links', 'linker', 'left'}:
        return 'links'
    return 'rechts'


def load_sheet_rows(sheet_name):
    wb = load_workbook(EXCEL_PATH, data_only=True)
    ws = wb[sheet_name]
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []
    headers = [str(h).strip() if h is not None else '' for h in rows[0]]
    data = []
    for row in rows[1:]:
        if not any(v is not None and str(v).strip() != '' for v in row):
            continue
        item = {}
        for idx, header in enumerate(headers):
            value = row[idx] if idx < len(row) else None
            item[header] = value
        data.append(item)
    return data


def build_players_json():
    spelers_rows = load_sheet_rows('spelers')
    staf_rows = load_sheet_rows('staf')

    spelers = []
    for row in spelers_rows:
        naam = row.get('naam')
        if not naam:
            continue
        spelers.append({
            'rugnummer': row.get('rugnummer'),
            'naam': naam,
            'positie': row.get('positie') or '',
            'voet': normalize_foot(row.get('voet')),
            'gastspeler': parse_bool(row.get('gastspeler')),
        })

    staf = []
    for row in staf_rows:
        naam = row.get('naam')
        if not naam:
            continue
        staf.append({
            'naam': naam,
            'rol': row.get('rol') or '',
        })

    payload = {
        'spelers': spelers,
        'staf': staf,
    }
    (BASE / 'spelers.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Wrote {len(spelers)} players and {len(staf)} staff members to spelers.json')


def build_matches_json():
    wedstrijden_rows = load_sheet_rows('wedstrijden')
    invoer_rows = load_sheet_rows('wedstrijdinvoer')

    by_match = {}
    for row in invoer_rows:
        match_id = row.get('wedstrijd_id')
        if not match_id:
            continue
        entry = by_match.setdefault(match_id, {'doelpunten': [], 'kaarten': []})

        speler_naam = row.get('speler_naam') or ''
        doelpunten = row.get('doelpunten')
        assists = row.get('assists')
        geel = row.get('geel')
        rood = row.get('rood')

        if doelpunten not in (None, '', 0):
            count = int(doelpunten)
            for _ in range(count):
                event = {'speler': speler_naam}
                if assists not in (None, '', 0):
                    event['assist'] = ''
                entry['doelpunten'].append(event)

        if geel not in (None, '', 0):
            entry['kaarten'].append({'speler': speler_naam, 'type': 'geel'})
        if rood not in (None, '', 0):
            entry['kaarten'].append({'speler': speler_naam, 'type': 'rood'})

    wedstrijden = []
    for row in wedstrijden_rows:
        match_id = row.get('wedstrijd_id')
        if not match_id:
            continue
        data = by_match.get(match_id, {})
        wedstrijden.append({
            'id': match_id,
            'datum': row.get('datum'),
            'tijd': row.get('tijd'),
            'thuis': row.get('thuis'),
            'uit': row.get('uit'),
            'uitslag': row.get('uitslag') or '',
            'competitie': row.get('competitie') or 'Competitie',
            'doelpunten': data.get('doelpunten', []),
            'kaarten': data.get('kaarten', []),
        })

    payload = {
        'team': 'SV Twello 2',
        'seizoen': '2026/2027',
        'wedstrijden': wedstrijden,
    }
    (BASE / 'wedstrijden.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Wrote {len(wedstrijden)} matches to wedstrijden.json')


if __name__ == '__main__':
    build_players_json()
    build_matches_json()
