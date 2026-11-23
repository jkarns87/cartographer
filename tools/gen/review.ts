import { existsSync } from 'node:fs';
import { isLand } from '../../src/shared/puzzle/grid';
import { clueText } from '../../src/shared/puzzle/templates';
import { LANDMARK_NAMES, SIZE } from '../../src/shared/puzzle/types';
import type { LandmarkId, ScheduleEntry } from '../../src/shared/puzzle/types';
import { PRACTICE_PATH, readSchedule, SCHEDULE_PATH } from './io';

/** Two-letter codes: first letters collide (Windmill/Well/Watchtower, Cave/Camp, Farm/Fort). */
const CODE: Record<LandmarkId, string> = {
  lighthouse: 'Li',
  windmill: 'Wi',
  harbor: 'Ha',
  fort: 'Fo',
  temple: 'Te',
  well: 'We',
  cave: 'Cv',
  shipwreck: 'Sh',
  farm: 'Fa',
  watchtower: 'Wa',
  camp: 'Cp',
  mine: 'Mi',
  ruins: 'Ru',
  beacon: 'Be',
};

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const solutionRows = (entry: ScheduleEntry): string[] => {
  const rows: string[] = [];
  for (let r = 0; r < SIZE; r++) {
    const cells: string[] = [];
    for (let c = 0; c < SIZE; c++) {
      const here = entry.landmarks.find((id) => {
        const cell = entry.solution[id];
        return cell !== undefined && cell.r === r && cell.c === c;
      });
      cells.push(
        here ? CODE[here] : isLand(entry.land, { r, c }) ? '..' : '~~'
      );
    }
    rows.push(`      ${cells.join(' ')}`);
  }
  return rows;
};

const render = (entry: ScheduleEntry): string[] => {
  const when =
    entry.date === null
      ? entry.id
      : `${entry.date} ${WEEKDAY[new Date(`${entry.date}T00:00:00Z`).getUTCDay()] ?? ''}`;
  return [
    `#${entry.number} ${entry.name}  ${entry.difficulty}  ${entry.landmarks.length} landmarks  (${when})`,
    ...entry.clues.map(
      (clue, k) => `  ${String(k + 1).padStart(2)}. ${clueText(clue)}`
    ),
    `      key: ${entry.landmarks.map((id) => `${CODE[id]} ${LANDMARK_NAMES[id]}`).join(', ')}`,
    ...solutionRows(entry),
    '',
  ];
};

// `npm run gen:review | head` closes the pipe early; that is not an error.
process.stdout.on('error', (err: Error) => {
  if ('code' in err && err.code === 'EPIPE') process.exit(0);
  throw err;
});

const lines: string[] = [];
for (const path of [SCHEDULE_PATH, PRACTICE_PATH]) {
  if (!existsSync(path)) {
    lines.push(`(missing ${path}; run npm run gen)`, '');
    continue;
  }
  for (const entry of readSchedule(path).entries) lines.push(...render(entry));
}
process.stdout.write(`${lines.join('\n')}\n`);
