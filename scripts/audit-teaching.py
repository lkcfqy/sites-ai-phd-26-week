#!/usr/bin/env python3
"""Check curriculum/design contracts and pin per-lesson evidence; no ability certification.

Run from the project: python3 scripts/audit-teaching.py
This tool performs structural, source/hash, budget and dependency checks. Scientific
claims, pedagogical sufficiency and real learner/research ability require review.
It never treats public quizzes, checklists or executing a reference as mastery.
"""
import argparse
import ast
import datetime
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKAGES = {'numpy': 'numpy', 'pandas': 'pandas', 'matplotlib': 'matplotlib',
            'sklearn': 'scikit-learn', 'torch': 'torch'}
FORMULA_NOTES = re.compile(r'(符号约定|符号与维度|符号与条件|变量与条件|维度与条件)：')


def digest(value):
    raw = value.encode() if isinstance(value, str) else json.dumps(value, ensure_ascii=False, sort_keys=True).encode()
    return hashlib.sha256(raw).hexdigest()


def read_optional(name):
    path = ROOT / 'verification' / name
    return json.loads(path.read_text()) if path.exists() else {}


def audit():
    curriculum_path = ROOT / 'data/curriculum.json'
    design_path = ROOT / 'data/learning-design.json'
    weeks = json.loads(curriculum_path.read_text())
    design = json.loads(design_path.read_text())
    lessons = [lesson for week in weeks for lesson in week['lessons']]
    by_id = {lesson['id']: lesson for lesson in lessons}
    order = {lesson['id']: (week['number'], lesson['day']) for week in weeks for lesson in week['lessons']}
    solutions = read_optional('solutions-validation.json')
    executed = {item['id']: item for item in solutions.get('results', [])}
    baseline = read_optional('questions-v1.json')
    saved_quizzes = {lesson['id']: lesson['questions'] for lesson in baseline.get('lessons', [])}
    failures = []
    per_lesson = []

    def require(condition, message):
        if not condition:
            failures.append(message)

    require(len(weeks) == 26 and [week['number'] for week in weeks] == list(range(1, 27)), 'Expected weeks 1..26')
    require(len(lessons) == 170 and len(by_id) == 170, 'Expected 170 unique lesson IDs')
    require(set(design['lessons']) == set(by_id), 'Design IDs must match curriculum IDs')
    if baseline:
        require([lesson['id'] for lesson in lessons] == baseline['lessonIds'], 'Stable ID/order differs from question-v1 snapshot')
    for track in ['vision', 'timeseries', 'language']:
        path = [lesson for lesson in lessons if lesson['track'] in ['common', track]]
        require(len(path) == 130, f'{track}: expected 130-lesson path')
    for week in weeks:
        tracks = ['vision', 'timeseries', 'language'] if 13 <= week['number'] <= 16 else ['common']
        require(len(week['lessons']) == 5 * len(tracks), f'Week {week["number"]}: wrong lesson count')
        for track in tracks:
            require(sorted(l['day'] for l in week['lessons'] if l['track'] == track) == list(range(1, 6)), f'Week {week["number"]} {track}: main days must be 1..5')
        require(all(week['challenge'].get(key) for key in ['brief', 'deliverables', 'rubric']), f'Week {week["number"]}: project evidence missing')
    for hours in ['4', '5']:
        require(sum(design['dailyBudgets'][hours].values()) == int(hours) * 60, f'Global {hours}-hour budget')
        require(sum(design['projectBudgets'][hours].values()) == int(hours) * 60, f'Project {hours}-hour budget')
        require(design['weeklyHours'][hours] == int(hours) * 6, f'Weekly {hours}-hour budget')
    require(design['weeklyHours']['restDay'] == 7, 'Seventh day must retain rest')

    for lesson in lessons:
        lid = lesson['id']
        before = len(failures)
        meta = design['lessons'][lid]
        text = '\n'.join(c['body'] for c in lesson['concepts'])
        chinese = len(re.findall(r'[\u4e00-\u9fff]', text))
        require(chinese >= 350, f'{lid}: explanation below contract minimum')
        require(3 <= len(lesson['concepts']) <= 4, f'{lid}: concept section count')
        require(len(lesson['objectives']) == 3, f'{lid}: expected 3 observable goals')
        require(len(lesson['quiz']) == 3, f'{lid}: expected 3 concept questions')
        require(all(len(q['options']) == 4 and isinstance(q['answer'], int) and 0 <= q['answer'] < 4 and q['explanation'] for q in lesson['quiz']), f'{lid}: question/options/answer/explanation contract')
        require(len(lesson['practice']['hints']) >= 2 and len(lesson['practice']['checks']) >= 2 and bool(lesson['practice']['solution']), f'{lid}: task hints/solution/evidence missing')
        if lid in saved_quizzes:
            require(lesson['quiz'] == saved_quizzes[lid], f'{lid}: quiz semantics changed without version migration')
        require([item['objective'] for item in meta['evidence']] == lesson['objectives'], f'{lid}: stale goal mapping')
        require(meta['lessonQuizIndexes'] == [0, 1, 2], f'{lid}: whole-lesson conceptual question list')
        for item in meta['evidence']:
            indices = item['conceptQuizIndexes']
            require(len(set(indices)) == len(indices) and all(isinstance(i, int) and 0 <= i < 3 for i in indices), f'{lid}: invalid objective question index')
            require(bool(item['practiceEvidence']) and bool(item['assessment']) and bool(item['automaticBoundary']), f'{lid}: objective evidence boundary missing')
            if item['objective'].startswith('独立交付：'):
                require(indices == [], f'{lid}: public questions must not certify independent deliverable')
        for hours in ['4', '5']:
            budget = meta['budgets'][hours]
            require(sum(budget.values()) == int(hours) * 60 and all(v > 0 for v in budget.values()), f'{lid}: {hours}-hour lesson budget')
            require(budget['lecture'] == lesson['minutes'], f'{lid}: lecture duration differs from curriculum')
        prerequisites = meta['prerequisites']
        require(bool(meta['readiness']) and bool(meta['knowledgePoints']) and bool(meta['recovery']['action']) and bool(meta['advance']['gate']), f'{lid}: readiness/recovery/advance incomplete')
        for prior in prerequisites:
            require(prior in by_id and order.get(prior, (99, 99)) < order[lid], f'{lid}: missing/future prerequisite {prior}')
            if prior in by_id and lesson['track'] != 'common':
                require(by_id[prior]['track'] in ['common', lesson['track']], f'{lid}: prerequisite crosses optional tracks')
        for track, prior_ids in meta.get('prerequisitesByTrack', {}).items():
            require(track in ['vision', 'timeseries', 'language'], f'{lid}: invalid conditional track')
            for prior in prior_ids:
                require(prior in by_id and order.get(prior, (99, 99)) < order[lid] and by_id[prior]['track'] == track, f'{lid}: invalid conditional prerequisite {prior}')
        formula = lesson.get('formula')
        if formula:
            require(bool(FORMULA_NOTES.search(text)), f'{lid}: explicit formula lacks variable/dimension/condition note')
        require(all(ref['url'].startswith('https://') for ref in lesson['references']), f'{lid}: reference URL must use HTTPS')
        blocks = re.findall(r'```python\s*\n(.*?)```', lesson['practice']['solution'], re.S)
        mode = meta['practiceMode']
        require(mode in ['computational', 'mixed', 'manual_review'], f'{lid}: unknown practice mode')
        require(bool(blocks) == (mode != 'manual_review'), f'{lid}: required practice computation/reference mode mismatch')
        require(meta['referenceImplementation'] == bool(blocks), f'{lid}: reference flag mismatch')
        imports = set()
        for kind, block in [('example', lesson['code'])] + [(f'solution-{i+1}', b) for i, b in enumerate(blocks)]:
            try:
                tree = ast.parse(block)
            except SyntaxError as error:
                failures.append(f'{lid} {kind}: {error}')
                continue
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    imports.update(alias.name.split('.')[0] for alias in node.names)
                elif isinstance(node, ast.ImportFrom):
                    imports.add((node.module or '').split('.')[0])
        missing = sorted(PACKAGES[name] for name in imports if name in PACKAGES and PACKAGES[name] not in lesson['requirements'])
        require(not missing, f'{lid}: undeclared example/solution imports {missing}')
        run_evidence = []
        for index, block in enumerate(blocks):
            key = f'{lid}-solution-{index+1}'
            recorded = executed.get(key, {})
            match = recorded.get('sha256') == digest(block)
            run_evidence.append({'id': key, 'sha256': digest(block), 'report': 'verification/solutions-validation.json', 'sourceMatches': match,
                                 'status': 'executed_pass' if match and recorded.get('passed') else 'unverified_current_source'})
        per_lesson.append({'id': lid, 'title': lesson['title'], 'sourceSha256': digest(lesson), 'designSha256': digest(meta),
                           'knowledgePoints': meta['knowledgePoints'], 'prerequisites': prerequisites,
                           'readiness': meta['readiness'], 'goalsAndEvidence': meta['evidence'],
                           'practiceMode': mode, 'formula': formula, 'explanationChineseCharacters': chinese,
                           'referenceURLs': [r['url'] for r in lesson['references']],
                           'staticStatus': 'passed' if len(failures) == before else 'failed', 'solutionExecution': run_evidence,
                           'abilityStatus': 'external_review_required',
                           'reviewScope': '源内容目标/先修/练习/概念题关系审读；自动检查仅核对合同、哈希及结构，不能证明全部科学或教学质量'})
    # Prior-only edges already prohibit cycles; retain an explicit DFS for maintenance.
    active, done = set(), set()
    def visit(lid):
        if lid in active:
            failures.append(f'Prerequisite cycle at {lid}')
            return
        if lid in done:
            return
        active.add(lid)
        for prior in design['lessons'][lid]['prerequisites']:
            if prior in by_id:
                visit(prior)
        active.remove(lid)
        done.add(lid)
    for lid in by_id:
        visit(lid)
    report = {'verifiedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'scope': 'structure + budget + source/quiz compatibility + imports + execution evidence hash',
              'limitations': ['AST cannot prove scientific correctness, all dynamic dependencies, pedagogical sufficiency or learner mastery.',
                              'Manual literature/protocol/defense outputs are external acceptance, never execution passes.',
                              'Example runtime is owned by check-curriculum.py; this audit does not execute code or replace its report.'],
              'curriculumSha256': digest(curriculum_path.read_text()), 'designSha256': digest(design_path.read_text()),
              'weeks': len(weeks), 'lessons': len(lessons), 'questions': sum(len(l['quiz']) for l in lessons),
              'formulaNotes': sum(bool(l.get('formula')) for l in lessons), 'practiceModes': dict(Counter(m['practiceMode'] for m in design['lessons'].values())),
              'currentSolutionPasses': sum(e['status'] == 'executed_pass' for l in per_lesson for e in l['solutionExecution']),
              'passed': not failures, 'failures': failures, 'lessonsEvidence': per_lesson}
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report', type=Path, default=ROOT / 'verification/teaching-audit.json')
    args = parser.parse_args()
    report = audit()
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key: value for key, value in report.items() if key != 'lessonsEvidence'}, ensure_ascii=False, indent=2))
    raise SystemExit(0 if report['passed'] else 1)
