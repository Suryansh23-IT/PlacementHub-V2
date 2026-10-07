import json
import re
from pathlib import Path
import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data' / 'source' / 'placement_report_2025.pdf'
OUTPUT = ROOT / 'data' / 'historical-2025-26.json'
BRANCHES = ['Biomedical', 'Biotechnology', 'Chemical', 'Civil', 'CSE', 'Electrical', 'ECE', 'IT', 'Mechanical', 'Metallurgical', 'Mining']
CENTERS = [285.6, 295.7, 305.7, 315.8, 325.9, 335.3, 346, 356.1, 365.6, 375.7, 386.3, 396.4]
BOUNDS = [280] + [(CENTERS[index] + CENTERS[index + 1]) / 2 for index in range(11)] + [405]
ALIASES = {
    'ge healthcare': 'ge-healthcare', 'amazon': 'amazon', 'swiggy': 'swiggy', 'decision tree analytics': 'decision-tree-analytics',
    "dr. reddy's laboratories": 'dr-reddys-laboratories', 'dr. reddy laboratories': 'dr-reddys-laboratories',
    'quantiphi analytics': 'quantiphi', 'quantiphi (phase 2)': 'quantiphi', 'fractal analytics': 'fractal-analytics', 'fractal.ai': 'fractal-analytics',
}

def normalize_company(value):
    lowered = value.lower().strip()
    if lowered in ALIASES:
        return ALIASES[lowered]
    lowered = re.sub(r'\b(private|pvt|limited|ltd|incorporated|inc|corporation|corp)\b', '', lowered)
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', lowered)).strip('-')

def family(sector):
    text = sector.lower()
    if any(token in text for token in ['core', 'engineering', 'r&d', 'design', 'geologist', 'get', 'technical trainee']): return 'CORE'
    if any(token in text for token in ['analyst', 'analytics', 'data', 'finance', 'financial', 'consulting', 'management trainee', 'bda']): return 'CONSULTING_FINANCE' if any(token in text for token in ['finance', 'financial', 'consulting']) else 'ANALYST_DATA'
    if 'education' in text: return 'EDUCATION_MISC'
    return 'SDE' if any(token in text for token in ['sde', 'software', 'se', 'sdet', 'it-', 'ai-ml', 'product management']) else 'EDUCATION_MISC'

def outcome(raw):
    text = raw.lower()
    if 'ppo' in text and ('6 month' in text or 'intern' in text): return 'INTERNSHIP_AND_PPO'
    if 'fte' in text and ('6 month' in text or 'intern' in text): return 'INTERNSHIP_AND_PPO'
    if 'ppo' in text: return 'PPO'
    if 'fte' in text: return 'FULL_TIME'
    return None

def date_fields(raw, row):
    ranges = {7: ('2025-08-10', '2025-08-11'), 139: ('2025-12-19', '2026-01-09'), 186: ('2026-03-10', '2026-03-11'), 200: ('2026-04-23', '2026-04-24')}
    if row in ranges: return raw, *ranges[row]
    if raw in ('', '-'): return None, None, None
    for fmt in ('%d-%m-%Y', '%d-%m-%y'):
        try:
            from datetime import datetime
            parsed = datetime.strptime(raw, fmt).date().isoformat()
            return raw, parsed, None
        except ValueError: pass
    return raw, None, None

def cell(words, start, end): return ' '.join(word['text'] for word in words if start <= word['x0'] < end)
rows = []
with pdfplumber.open(SOURCE) as pdf:
    for page in pdf.pages:
        grouped = {}
        for word in page.extract_words(): grouped.setdefault(round(word['top']), []).append(word)
        for words in grouped.values():
            words = sorted(words, key=lambda word: word['x0'])
            if not words or not (10 <= words[0]['x0'] <= 18 and re.fullmatch(r'\d+', words[0]['text'])): continue
            source_row = int(words[0]['text'])
            if not 1 <= source_row <= 217: continue
            values = []
            for start, end in zip(BOUNDS, BOUNDS[1:]):
                raw = cell(words, start, end)
                values.append(0 if source_row == 75 or raw in ('', '-') else int(raw))
            raw_date, start_date, end_date = date_fields(cell(words, 238, 280), source_row)
            raw_mode = cell(words, 206, 238)
            process_mode = {'Online': 'ONLINE', 'Offline': 'OFFLINE', 'Hybride': 'HYBRID', 'Hybrid': 'HYBRID'}.get(raw_mode)
            raw_offer = cell(words, 90, 152)
            company = cell(words, 25, 96)
            sector = cell(words, 150, 206)
            raw_ctc = cell(words, 523, 541)
            try: ctc = float(raw_ctc) if raw_ctc not in ('', '-', '0') else None
            except ValueError: ctc = None
            raw_branch_offers = dict(zip(BRANCHES, values[1:]))
            rows.append({'sourceRow': source_row, 'companyName': company, 'normalizedCompanyKey': normalize_company(company), 'rawOfferType': raw_offer, 'outcomeType': outcome(raw_offer), 'originalSector': sector, 'roleFamily': family(sector), 'processMode': process_mode, 'rawProcessMode': raw_mode, 'placementSource': 'OFF_CAMPUS' if source_row >= 208 else 'ON_CAMPUS', 'sourceProcessDate': raw_date, 'startDate': start_date, 'endDate': end_date, 'ctcLpa': ctc, 'rawBranchOffers': raw_branch_offers})
rows.sort(key=lambda row: row['sourceRow'])
data = json.loads(OUTPUT.read_text(encoding='utf-8'))
data['processes'] = rows
data['reconciliation'] = {'rawBranchOffers': {branch: sum(row['rawBranchOffers'][branch] for row in rows) for branch in BRANCHES}, 'canonicalBranchOffers': {'Biomedical': 9, 'Biotechnology': 24, 'Chemical': 63, 'Civil': 62, 'CSE': 85, 'Electrical': 96, 'ECE': 57, 'IT': 88, 'Mechanical': 88, 'Metallurgical': 74, 'Mining': 59}, 'deltaCanonicalMinusRaw': {'Biomedical': -2, 'Biotechnology': 0, 'Chemical': 0, 'Civil': 0, 'CSE': 0, 'Electrical': 0, 'ECE': 0, 'IT': 2, 'Mechanical': 0, 'Metallurgical': 0, 'Mining': 0}, 'note': 'Raw source rows are preserved. The source does not identify which two offers require the approved Biomedical-to-IT reconstruction adjustment.'}
OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
