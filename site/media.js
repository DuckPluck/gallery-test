// Each row starts with the primary clip from one selected use folder.
const catalog = [
  [
    ['2_fg_1', '2_rg_1', '2_sg_1', '2_sg_2', '2_tg_2'],
    ['3_fg_3', '3_rg_1', '3_sg_2', '3_tg_4'],
    ['18_fg_1', '18_pg_5', '18_sg_1', '18_tg_4'],
    ['36_fg_1', '36_rg_1', '36_sg_1', '36_sg_2'],
  ],
  [
    ['1_fg_4', '1_dg_3', '1_pg_1', '1_rg_3', '1_sg_1', '1_tg_2'],
    ['9_fg_1', '9_pg_1', '9_rg_1', '9_tg_1'],
    ['21_fg_2', '21_dg_2', '21_pg_1', '21_rg_2'],
    ['54_fg_3', '54_rg_1', '54_sg_3', '54_tg_2'],
  ],
  [
    ['13_fg_1', '13_sg_1', '13_sg_2', '13_tg_2'],
    ['24_fg_4', '24_dg_2', '24_pg_2', '24_sg_1'],
    ['28_fg_4', '28_dg_1', '28_rg_3', '28_tg_1'],
    ['41_fg_1', '41_dg_1', '41_fg_2', '41_rg_1'],
  ],
  [
    ['4_fg_1', '4_dg_3', '4_pg_1', '4_sg_2'],
    ['26_dg_2', '26_rg_2', '26_sg_2', '26_tg_1'],
    ['27_fg_2', '27_dg_1', '27_pg_3', '27_tg_2'],
    ['30_fg_1', '30_dg_2', '30_rg_1', '30_sg_1', '30_tg_2'],
    ['51_fg_1', '51_dg_1', '51_fg_2', '51_pg_1'],
  ],
];

function shuffle(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  return shuffled;
}

const number = index => String(index + 1).padStart(2, '0');
const media = name => ({ src: `./pedfe/${name}.mp4`, poster: `./pedfe/${name}.jpg` });

export const groups = shuffle(catalog).map((videos, groupIndex) => ({
  id: `group-${groupIndex + 1}`,
  label: `Группа ${number(groupIndex)}`,
  videos: shuffle(videos).map(([main, ...related], index) => {
    const id = `clip-${groupIndex + 1}-${index + 1}`;
    return {
      ...media(main),
      id,
      phase: index / videos.length,
      label: `Видео ${number(index)}, группа ${groupIndex + 1}`,
      related: shuffle(related).map((name, relatedIndex) => ({
        ...media(name),
        id: `${id}-related-${relatedIndex + 1}`,
        phase: relatedIndex / related.length,
        label: `Связанное видео ${number(relatedIndex)}`,
      })),
    };
  }),
}));
