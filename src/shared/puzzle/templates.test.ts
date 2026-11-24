import { describe, expect, it } from 'vitest';
import { clueLandmarks } from './predicates';
import { DIR_WORD, SHORE_WORD, clueParts, clueText } from './templates';
import type { CluePart } from './templates';
import { LANDMARKS, LANDMARK_NAMES } from './types';
import type { Clue, Dir } from './types';

/** One clue per sentence shape in the plan's table (positive and negated forms). */
const TABLE: Array<{ clue: Clue; text: string }> = [
  {
    clue: { type: 'shore', a: 'lighthouse', dir: 'N' },
    text: 'The Lighthouse stands on a north-facing shore.',
  },
  { clue: { type: 'inland', a: 'temple' }, text: 'The Temple is inland.' },
  {
    clue: { type: 'due', a: 'windmill', dir: 'E', b: 'well' },
    text: 'The Windmill is due east of the Well.',
  },
  {
    clue: { type: 'somewhere', a: 'farm', dir: 'S', b: 'temple' },
    text: 'The Farm lies somewhere south of the Temple.',
  },
  {
    clue: { type: 'touches', a: 'fort', b: 'windmill' },
    text: 'The Fort touches the Windmill.',
  },
  {
    clue: { type: 'touches', a: 'fort', b: 'windmill', not: true },
    text: 'The Fort does not touch the Windmill.',
  },
  {
    clue: { type: 'shares', a: 'shipwreck', axis: 'column', b: 'lighthouse' },
    text: 'The Shipwreck shares a column with the Lighthouse.',
  },
  {
    clue: {
      type: 'shares',
      a: 'shipwreck',
      axis: 'column',
      b: 'lighthouse',
      not: true,
    },
    text: 'The Shipwreck does not share a column with the Lighthouse.',
  },
  {
    clue: { type: 'shares', a: 'camp', axis: 'row', b: 'beacon' },
    text: 'The Camp shares a row with the Beacon.',
  },
  {
    clue: { type: 'shares', a: 'camp', axis: 'row', b: 'beacon', not: true },
    text: 'The Camp does not share a row with the Beacon.',
  },
  {
    clue: { type: 'between', a: 'well', b: 'mine', c: 'farm' },
    text: 'The Well lies between the Mine and the Farm.',
  },
  {
    clue: { type: 'extreme', a: 'well', dir: 'W' },
    text: 'No landmark stands west of the Well.',
  },
];

describe('direction words', () => {
  it('DIR_WORD', () => {
    expect(DIR_WORD).toEqual({ N: 'north', E: 'east', S: 'south', W: 'west' });
  });

  it('SHORE_WORD', () => {
    expect(SHORE_WORD).toEqual({
      N: 'north-facing',
      E: 'east-facing',
      S: 'south-facing',
      W: 'west-facing',
    });
  });
});

describe('clueText', () => {
  it.each(TABLE)('$text', ({ clue, text }) => {
    expect(clueText(clue)).toBe(text);
  });

  it('not: false renders the positive sentence', () => {
    expect(
      clueText({ type: 'touches', a: 'fort', b: 'windmill', not: false })
    ).toBe('The Fort touches the Windmill.');
    expect(
      clueText({
        type: 'shares',
        a: 'camp',
        axis: 'row',
        b: 'beacon',
        not: false,
      })
    ).toBe('The Camp shares a row with the Beacon.');
  });

  it.each<{
    dir: Dir;
    shore: string;
    due: string;
    somewhere: string;
    extreme: string;
  }>([
    {
      dir: 'N',
      shore: 'The Lighthouse stands on a north-facing shore.',
      due: 'The Windmill is due north of the Well.',
      somewhere: 'The Farm lies somewhere north of the Temple.',
      extreme: 'No landmark stands north of the Well.',
    },
    {
      dir: 'E',
      shore: 'The Lighthouse stands on a east-facing shore.',
      due: 'The Windmill is due east of the Well.',
      somewhere: 'The Farm lies somewhere east of the Temple.',
      extreme: 'No landmark stands east of the Well.',
    },
    {
      dir: 'S',
      shore: 'The Lighthouse stands on a south-facing shore.',
      due: 'The Windmill is due south of the Well.',
      somewhere: 'The Farm lies somewhere south of the Temple.',
      extreme: 'No landmark stands south of the Well.',
    },
    {
      dir: 'W',
      shore: 'The Lighthouse stands on a west-facing shore.',
      due: 'The Windmill is due west of the Well.',
      somewhere: 'The Farm lies somewhere west of the Temple.',
      extreme: 'No landmark stands west of the Well.',
    },
  ])(
    'direction $dir in every directional sentence',
    ({ dir, shore, due, somewhere, extreme }) => {
      expect(clueText({ type: 'shore', a: 'lighthouse', dir })).toBe(shore);
      expect(clueText({ type: 'due', a: 'windmill', dir, b: 'well' })).toBe(
        due
      );
      expect(clueText({ type: 'somewhere', a: 'farm', dir, b: 'temple' })).toBe(
        somewhere
      );
      expect(clueText({ type: 'extreme', a: 'well', dir })).toBe(extreme);
    }
  );

  it.each(LANDMARKS.map((id) => ({ id })))(
    'uses the display name for $id',
    ({ id }) => {
      expect(clueText({ type: 'inland', a: id })).toBe(
        `The ${LANDMARK_NAMES[id]} is inland.`
      );
    }
  );
});

describe('clueParts', () => {
  it('splits a due clue exactly as the plan example', () => {
    expect(
      clueParts({ type: 'due', a: 'windmill', dir: 'E', b: 'well' })
    ).toEqual([
      { text: 'The ' },
      { landmark: 'windmill' },
      { text: ' is due east of the ' },
      { landmark: 'well' },
      { text: '.' },
    ]);
  });

  it.each<{ why: string; clue: Clue; parts: CluePart[] }>([
    {
      why: 'shore',
      clue: { type: 'shore', a: 'lighthouse', dir: 'N' },
      parts: [
        { text: 'The ' },
        { landmark: 'lighthouse' },
        { text: ' stands on a north-facing shore.' },
      ],
    },
    {
      why: 'inland',
      clue: { type: 'inland', a: 'temple' },
      parts: [
        { text: 'The ' },
        { landmark: 'temple' },
        { text: ' is inland.' },
      ],
    },
    {
      why: 'somewhere',
      clue: { type: 'somewhere', a: 'farm', dir: 'S', b: 'temple' },
      parts: [
        { text: 'The ' },
        { landmark: 'farm' },
        { text: ' lies somewhere south of the ' },
        { landmark: 'temple' },
        { text: '.' },
      ],
    },
    {
      why: 'touches',
      clue: { type: 'touches', a: 'fort', b: 'windmill' },
      parts: [
        { text: 'The ' },
        { landmark: 'fort' },
        { text: ' touches the ' },
        { landmark: 'windmill' },
        { text: '.' },
      ],
    },
    {
      why: 'touches, negated',
      clue: { type: 'touches', a: 'fort', b: 'windmill', not: true },
      parts: [
        { text: 'The ' },
        { landmark: 'fort' },
        { text: ' does not touch the ' },
        { landmark: 'windmill' },
        { text: '.' },
      ],
    },
    {
      why: 'shares',
      clue: { type: 'shares', a: 'shipwreck', axis: 'column', b: 'lighthouse' },
      parts: [
        { text: 'The ' },
        { landmark: 'shipwreck' },
        { text: ' shares a column with the ' },
        { landmark: 'lighthouse' },
        { text: '.' },
      ],
    },
    {
      why: 'shares, negated',
      clue: {
        type: 'shares',
        a: 'shipwreck',
        axis: 'row',
        b: 'lighthouse',
        not: true,
      },
      parts: [
        { text: 'The ' },
        { landmark: 'shipwreck' },
        { text: ' does not share a row with the ' },
        { landmark: 'lighthouse' },
        { text: '.' },
      ],
    },
    {
      why: 'between',
      clue: { type: 'between', a: 'well', b: 'mine', c: 'farm' },
      parts: [
        { text: 'The ' },
        { landmark: 'well' },
        { text: ' lies between the ' },
        { landmark: 'mine' },
        { text: ' and the ' },
        { landmark: 'farm' },
        { text: '.' },
      ],
    },
    {
      why: 'extreme (sentence does not start with a landmark)',
      clue: { type: 'extreme', a: 'well', dir: 'W' },
      parts: [
        { text: 'No landmark stands west of the ' },
        { landmark: 'well' },
        { text: '.' },
      ],
    },
  ])('splits $why', ({ clue, parts }) => {
    expect(clueParts(clue)).toEqual(parts);
  });

  it.each(TABLE)(
    'reassembles into clueText and names landmarks in clueLandmarks order: $text',
    ({ clue, text }) => {
      const parts = clueParts(clue);
      const named = parts.flatMap((p) => ('landmark' in p ? [p.landmark] : []));
      expect(named).toEqual(clueLandmarks(clue));
      const joined = parts
        .map((p) => ('landmark' in p ? LANDMARK_NAMES[p.landmark] : p.text))
        .join('');
      expect(joined).toBe(text);
      expect(joined).toBe(clueText(clue));
    }
  );

  it.each(TABLE)(
    'alternates non-empty text and landmark parts: $text',
    ({ clue }) => {
      const parts = clueParts(clue);
      for (const part of parts) {
        if ('text' in part) expect(part.text).not.toBe('');
      }
      for (let i = 1; i < parts.length; i++) {
        const prev = parts[i - 1];
        const cur = parts[i];
        expect(
          prev !== undefined &&
            cur !== undefined &&
            'landmark' in prev !== 'landmark' in cur
        ).toBe(true);
      }
      const last = parts[parts.length - 1];
      expect(
        last !== undefined && 'text' in last && last.text.endsWith('.')
      ).toBe(true);
    }
  );
});
